const assert = require('node:assert');
const { v4: uuid } = require('uuid');
const db = require('../db');
const AdaptiveScalingEngine = require('../scalingEngine');
const benchmarkEngine = require('../benchmarkEngine');

console.log('🧪 Running Streamless Automated System Tests...\n');

let testsPassed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// ── Test 1: Idempotency Protection ───────────────────────────────────────────
runTest('Idempotency Key Prevents Duplicate Submissions', () => {
  const idempotencyKey = `idem_${Date.now()}_${Math.random()}`;
  const first = db.createJob({
    fileName: 'idempotent_video.mp4',
    fileSize: 1024000,
    mimeType: 'video/mp4',
    idempotencyKey,
  });

  assert.strictEqual(first.isDuplicate, false, 'First submission must not be duplicate');
  assert.ok(first.job.id, 'Job should receive an ID');

  const second = db.createJob({
    fileName: 'idempotent_video.mp4',
    fileSize: 1024000,
    mimeType: 'video/mp4',
    idempotencyKey,
  });

  assert.strictEqual(second.isDuplicate, true, 'Second submission with same key must be flagged duplicate');
  assert.strictEqual(second.job.id, first.job.id, 'Duplicate submission must return original job record');
});

// ── Test 2: Persistent Storage & Updates ─────────────────────────────────────
runTest('SQLite Job Persistence and State Updates', () => {
  const jobId = uuid();
  const created = db.createJob({
    id: jobId,
    fileName: 'persist_test.mp4',
    fileSize: 5000000,
    mimeType: 'video/mp4',
  });

  const retrieved = db.getJobById(jobId);
  assert.ok(retrieved, 'Job must be retrievable from SQLite database');
  assert.strictEqual(retrieved.status, 'queued');

  db.updateJob(jobId, {
    status: 'processing',
    startedAt: new Date().toISOString(),
    attemptCount: 1,
  });

  const updated = db.getJobById(jobId);
  assert.strictEqual(updated.status, 'processing');
  assert.ok(updated.startedAt, 'startedAt timestamp must be persisted');
});

// ── Test 3: Crash Recovery for Interrupted Jobs ──────────────────────────────
runTest('Server Startup Recovers In-Flight Interrupted Jobs', () => {
  const interruptedId = uuid();
  db.createJob({
    id: interruptedId,
    fileName: 'crashed_midway.mp4',
    fileSize: 3000000,
    mimeType: 'video/mp4',
  });

  db.updateJob(interruptedId, {
    status: 'processing',
    startedAt: new Date().toISOString(),
  });

  // Run crash recovery
  const recoveredIds = db.recoverInterruptedJobs();
  assert.ok(recoveredIds.includes(interruptedId), 'Interrupted job must be in recovered list');

  const recoveredJob = db.getJobById(interruptedId);
  assert.strictEqual(recoveredJob.status, 'queued', 'Interrupted job must be safely requeued');
  assert.ok(recoveredJob.error.includes('Interrupted'), 'Error field must document server restart recovery');

  const events = db.getJobEvents(interruptedId);
  const recoveryEvent = events.find(e => e.eventType === 'RECOVERED_AFTER_RESTART');
  assert.ok(recoveryEvent, 'Lifecycle history must record RECOVERED_AFTER_RESTART event');
});

// ── Test 4: Adaptive Scaling Decisions & Flapping Prevention ──────────────────
runTest('Adaptive Auto-Scaling Engine Workload Decisions and Limits', () => {
  const engine = new AdaptiveScalingEngine({
    mode: 'auto',
    minWorkers: 2,
    maxWorkers: 6,
    initialCapacity: 2,
    scaleUpQueueThreshold: 3,
    scaleUpWaitTimeThresholdMs: 2000,
    scaleUpCooldownMs: 2000,
    scaleDownIdleThresholdMs: 3000,
  });

  assert.strictEqual(engine.getCurrentCapacity(), 2, 'Initial capacity should be minWorkers (2)');

  // 1. High queue backlog triggers scale up
  const decision1 = engine.evaluate({ queuedCount: 5, activeCount: 2, avgWaitTimeMs: 1000 });
  assert.strictEqual(decision1.action, 'SCALE_UP', 'Should scale up on high queue depth');
  assert.strictEqual(engine.getCurrentCapacity(), 4, 'Should increase capacity by step (+2)');

  // 2. Immediate subsequent spike triggers cooldown (anti-flapping)
  const decision2 = engine.evaluate({ queuedCount: 6, activeCount: 4, avgWaitTimeMs: 1500 });
  assert.strictEqual(decision2.action, 'COOLDOWN', 'Should hold capacity during cooldown period');
  assert.strictEqual(engine.getCurrentCapacity(), 4, 'Capacity must remain steady during cooldown');

  // 3. Test maximum boundary limit
  engine.lastScaleUpTime = 0; // expire cooldown artificially
  const decision3 = engine.evaluate({ queuedCount: 10, activeCount: 4, avgWaitTimeMs: 3000 });
  assert.strictEqual(decision3.action, 'SCALE_UP');
  assert.strictEqual(engine.getCurrentCapacity(), 6, 'Capacity should hit maxWorkers (6)');

  // Further backlog cannot exceed maxWorkers
  engine.lastScaleUpTime = 0;
  const decision4 = engine.evaluate({ queuedCount: 20, activeCount: 6, avgWaitTimeMs: 5000 });
  assert.strictEqual(decision4.action, 'MAINTAIN');
  assert.strictEqual(engine.getCurrentCapacity(), 6, 'Capacity must not exceed configured maxWorkers');
});

// ── Test 5: Dead-Letter Queue (DLQ) Lifecycle and Retries ────────────────────
runTest('Dead-Letter Queue Transitions and Manual Retry Restoration', () => {
  const dlqJobId = uuid();
  db.createJob({
    id: dlqJobId,
    fileName: 'poison_pill_asset.mp4',
    fileSize: 4000000,
    mimeType: 'video/mp4',
    maxRetries: 3,
  });

  // Move to DLQ
  db.moveToDlq(dlqJobId, 'Exhausted maximum retries (3/3)', 'Transcoding timeout error');

  const dlqList = db.listDlq();
  const dlqEntry = dlqList.find(d => d.id === dlqJobId);
  assert.ok(dlqEntry, 'Job must exist in Dead-Letter Queue view');
  assert.strictEqual(dlqEntry.status, 'dlq');
  assert.strictEqual(dlqEntry.failureReason, 'Exhausted maximum retries (3/3)');

  // Manual retry from DLQ
  const restored = db.retryDlqJob(dlqJobId);
  assert.strictEqual(restored.status, 'queued', 'Restored job must be queued');
  assert.strictEqual(restored.retryCount, 0, 'Retry counter must be reset');

  // Verify removed from DLQ
  const dlqAfter = db.listDlq();
  assert.ok(!dlqAfter.some(d => d.id === dlqJobId), 'Restored job must be removed from DLQ table');
});

// ── Test 6: Deterministic Benchmarking & Comparison Metrics ───────────────────
runTest('Benchmark Determinism, Metrics Calculation & Comparative Deltas', () => {
  // Deterministic workload reproducibility test
  const wl1 = benchmarkEngine.generateDeterministicWorkload(5, 'moderate', 12345);
  const wl2 = benchmarkEngine.generateDeterministicWorkload(5, 'moderate', 12345);
  assert.deepStrictEqual(wl1, wl2, 'Identical seed and profile must generate identical workload items');

  // Metrics calculation test
  const fakeJobs = [
    {
      id: '1',
      status: 'completed',
      createdAt: '2026-10-23T00:00:00.000Z',
      startedAt: '2026-10-23T00:00:01.000Z',
      completedAt: '2026-10-23T00:00:03.000Z',
      retryCount: 0,
    },
    {
      id: '2',
      status: 'completed',
      createdAt: '2026-10-23T00:00:00.000Z',
      startedAt: '2026-10-23T00:00:02.000Z',
      completedAt: '2026-10-23T00:00:05.000Z',
      retryCount: 1,
    },
  ];

  const metrics = benchmarkEngine.calculateMetrics({
    jobs: fakeJobs,
    startTimeMs: 1000,
    endTimeMs: 6000,
    peakQueue: 2,
    timeline: [],
  });

  assert.strictEqual(metrics.totalJobs, 2);
  assert.strictEqual(metrics.successfulJobs, 2);
  assert.strictEqual(metrics.totalRetries, 1);
  assert.strictEqual(metrics.avgLatencyMs, 4000); // (3000 + 5000) / 2
  assert.strictEqual(metrics.throughputJps, 0.4); // 2 jobs in 5s = 0.4 jps

  // Comparison test
  const runA = {
    id: 'a',
    name: 'Low Fixed Concurrency',
    config: { mode: 'manual', workerCount: 2 },
    metrics: { throughputJps: 0.5, avgLatencyMs: 4000, p95LatencyMs: 5000, totalCompletionTimeMs: 10000 },
  };
  const runB = {
    id: 'b',
    name: 'Adaptive Scaling',
    config: { mode: 'auto', minWorkers: 2, maxWorkers: 6 },
    metrics: { throughputJps: 1.0, avgLatencyMs: 2000, p95LatencyMs: 2500, totalCompletionTimeMs: 5000 },
  };

  const comp = benchmarkEngine.compareBenchmarks(runA, runB);
  assert.strictEqual(comp.deltas.throughput.percent, 100); // 0.5 -> 1.0 = +100%
  assert.strictEqual(comp.deltas.avgLatency.percent, -50); // 4000 -> 2000 = -50%
  assert.ok(comp.explanation.length > 50, 'Must generate automated academic viva explanation');
});

console.log(`\n🎉 All ${testsPassed} automated tests passed successfully!`);
