const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const path = require('path');
const fs = require('fs');

const db = require('./db');
const AdaptiveScalingEngine = require('./scalingEngine');
const benchmarkEngine = require('./benchmarkEngine');

const app = express();
app.use(cors());
app.use(express.json());

const isVercel = Boolean(process.env.VERCEL);
const uploadDir = isVercel ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// ── Scaling Engine & In-memory Queue State ─────────────────────────────────────

const scalingEngine = new AdaptiveScalingEngine({
  mode: 'auto',
  minWorkers: 2,
  maxWorkers: 10,
  initialCapacity: 2,
  scaleUpQueueThreshold: 3,
  scaleUpWaitTimeThresholdMs: 2500,
});

const state = {
  queue: [],              // queue of job objects waiting for worker slots: { job, enqueuedAt }
  activeCount: 0,         // active worker slots currently executing
  logs: [],               // circular log buffer (500 entries)
  functions: {
    validateMedia:        { invocations: 0, successes: 0, failures: 0, totalDuration: 0, lastRun: null, logs: [] },
    extractMetadata:      { invocations: 0, successes: 0, failures: 0, totalDuration: 0, lastRun: null, logs: [] },
    processMedia:         { invocations: 0, successes: 0, failures: 0, totalDuration: 0, lastRun: null, logs: [] },
    saveResults:          { invocations: 0, successes: 0, failures: 0, totalDuration: 0, lastRun: null, logs: [] },
    generateNotification: { invocations: 0, successes: 0, failures: 0, totalDuration: 0, lastRun: null, logs: [] },
  },
  throughputHistory: [],  // snapshots: { timestamp, completed, queued, active, capacity }
  peakQueueDepth: 0,
  activeBenchmark: null,  // currently running benchmark if any
};

// ── Startup Crash Recovery ───────────────────────────────────────────────────

try {
  const recoveredIds = db.recoverInterruptedJobs();
  if (recoveredIds.length > 0) {
    addLog('warn', 'recovery', `Server startup: recovered ${recoveredIds.length} interrupted job(s) from previous run and requeued safely.`);
    // Enqueue recovered jobs
    for (const id of recoveredIds) {
      const job = db.getJobById(id);
      if (job) {
        state.queue.push({ job, enqueuedAt: Date.now() });
      }
    }
  }
} catch (e) {
  console.error('[Recovery Error]:', e);
}

// ── Logging & Metrics Helpers ────────────────────────────────────────────────

function addLog(level, source, message) {
  const entry = { id: uuid(), timestamp: new Date().toISOString(), level, source, message };
  state.logs.unshift(entry);
  if (state.logs.length > 500) state.logs.length = 500;
  return entry;
}

function recordFnExec(fnName, duration, success, logMsg) {
  const fn = state.functions[fnName];
  if (!fn) return;
  fn.invocations++;
  if (success) fn.successes++;
  else fn.failures++;
  fn.totalDuration += duration;
  fn.lastRun = new Date().toISOString();
  const logEntry = { timestamp: fn.lastRun, duration, success, message: logMsg };
  fn.logs.unshift(logEntry);
  if (fn.logs.length > 50) fn.logs.length = 50;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Allowed media types
const ALLOWED_TYPES = [
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'application/json',
];

// ── Pipeline Stages (Simulated Lambda Functions) ──────────────────────────────

async function runValidateMedia(job) {
  const start = Date.now();
  job.stages.validate = { status: 'running', startedAt: new Date().toISOString() };
  db.updateJob(job.id, { stages: job.stages });
  db.addJobEvent(job.id, 'STAGE_STARTED', { stage: 'validateMedia' });

  await sleep(250 + Math.random() * 350);

  const isValid = ALLOWED_TYPES.includes(job.mimeType) || job.mimeType === 'application/octet-stream';
  const duration = Date.now() - start;

  if (!isValid) {
    const errorMsg = `Unsupported MIME type: ${job.mimeType}`;
    job.stages.validate = { status: 'failed', duration, error: errorMsg };
    db.updateJob(job.id, { stages: job.stages, error: errorMsg, errorType: 'permanent' });
    db.addJobEvent(job.id, 'STAGE_FAILED', { stage: 'validateMedia', error: errorMsg, errorType: 'permanent' });
    recordFnExec('validateMedia', duration, false, `Rejected ${job.fileName}: ${errorMsg}`);
    addLog('error', 'validateMedia', `Validation failed for ${job.fileName}: ${errorMsg}`);
    return { success: false, errorType: 'permanent', error: errorMsg };
  }

  job.stages.validate = { status: 'completed', duration };
  db.updateJob(job.id, { stages: job.stages });
  db.addJobEvent(job.id, 'STAGE_COMPLETED', { stage: 'validateMedia', duration });
  recordFnExec('validateMedia', duration, true, `Validated ${job.fileName} (${job.mimeType})`);
  addLog('info', 'validateMedia', `Validated ${job.fileName} — ${(job.fileSize / 1024).toFixed(1)} KB`);
  return { success: true };
}

async function runExtractMetadata(job) {
  const start = Date.now();
  job.stages.metadata = { status: 'running', startedAt: new Date().toISOString() };
  db.updateJob(job.id, { stages: job.stages });
  db.addJobEvent(job.id, 'STAGE_STARTED', { stage: 'extractMetadata' });

  await sleep(300 + Math.random() * 450);

  const duration = Date.now() - start;
  const metadata = {
    fileName: job.fileName,
    fileSize: job.fileSize,
    mimeType: job.mimeType,
    extractedAt: new Date().toISOString(),
    estimatedDuration: job.mimeType.startsWith('video/') ? `${(Math.random() * 120 + 10).toFixed(0)}s` : 'N/A',
    resolution: job.mimeType.startsWith('video/') || job.mimeType.startsWith('image/') ? '1920x1080' : 'N/A',
    codec: job.mimeType.startsWith('video/') ? 'H.264' : job.mimeType.startsWith('audio/') ? 'AAC' : 'N/A',
  };

  job.stages.metadata = { status: 'completed', duration, result: metadata };
  db.updateJob(job.id, { stages: job.stages, outputMetadata: metadata });
  db.addJobEvent(job.id, 'STAGE_COMPLETED', { stage: 'extractMetadata', duration, metadata });
  recordFnExec('extractMetadata', duration, true, `Extracted metadata for ${job.fileName}`);
  addLog('info', 'extractMetadata', `Metadata extracted for ${job.fileName}`);
  return { success: true };
}

async function runProcessMedia(job) {
  const start = Date.now();
  job.stages.process = { status: 'running', startedAt: new Date().toISOString() };
  db.updateJob(job.id, { stages: job.stages });
  db.addJobEvent(job.id, 'STAGE_STARTED', { stage: 'processMedia' });

  // Processing time (700ms - 1800ms)
  const processingTime = 700 + Math.random() * 1100;
  await sleep(processingTime);

  // Transient failure simulation: ~5% probability, or simulated error on specific filename
  const isForcedError = job.fileName.includes('corrupted') || job.fileName.includes('force_fail');
  const isRandomTransientError = Math.random() < 0.05;
  const duration = Date.now() - start;

  if (isForcedError || isRandomTransientError) {
    const errorMsg = 'Simulated transcoding timeout (transient error)';
    job.stages.process = { status: 'failed', duration, error: errorMsg };
    db.updateJob(job.id, { stages: job.stages, error: errorMsg, errorType: 'transient' });
    db.addJobEvent(job.id, 'STAGE_FAILED', { stage: 'processMedia', error: errorMsg, errorType: 'transient' });
    recordFnExec('processMedia', duration, false, `Processing failed for ${job.fileName}: timeout`);
    addLog('error', 'processMedia', `Transcoding timeout for ${job.fileName}`);
    return { success: false, errorType: 'transient', error: errorMsg };
  }

  const result = {
    outputFormat: 'HLS',
    profiles: ['360p', '720p', '1080p'],
    chunkDuration: '6s',
    note: 'Simulated multi-bitrate transcode — no actual video re-encoding',
  };

  job.stages.process = { status: 'completed', duration, result };
  const currentOutput = job.outputMetadata || {};
  db.updateJob(job.id, { stages: job.stages, outputMetadata: { ...currentOutput, processing: result } });
  db.addJobEvent(job.id, 'STAGE_COMPLETED', { stage: 'processMedia', duration });
  recordFnExec('processMedia', duration, true, `Processed ${job.fileName} in ${duration}ms`);
  addLog('info', 'processMedia', `Media processed: ${job.fileName} (${duration}ms)`);
  return { success: true };
}

async function runSaveResults(job) {
  const start = Date.now();
  job.stages.save = { status: 'running', startedAt: new Date().toISOString() };
  db.updateJob(job.id, { stages: job.stages });
  db.addJobEvent(job.id, 'STAGE_STARTED', { stage: 'saveResults' });

  await sleep(150 + Math.random() * 200);
  const duration = Date.now() - start;

  job.stages.save = { status: 'completed', duration };
  db.updateJob(job.id, { stages: job.stages });
  db.addJobEvent(job.id, 'STAGE_COMPLETED', { stage: 'saveResults', duration });
  recordFnExec('saveResults', duration, true, `Results saved for job ${job.id.slice(0, 8)}`);
  addLog('info', 'saveResults', `Results persisted for ${job.fileName}`);
  return { success: true };
}

async function runGenerateNotification(job) {
  const start = Date.now();
  job.stages.notify = { status: 'running', startedAt: new Date().toISOString() };
  db.updateJob(job.id, { stages: job.stages });
  db.addJobEvent(job.id, 'STAGE_STARTED', { stage: 'generateNotification' });

  await sleep(80 + Math.random() * 150);
  const duration = Date.now() - start;

  job.stages.notify = { status: 'completed', duration };
  db.updateJob(job.id, { stages: job.stages });
  db.addJobEvent(job.id, 'STAGE_COMPLETED', { stage: 'generateNotification', duration });
  recordFnExec('generateNotification', duration, true, `Notification sent for job ${job.id.slice(0, 8)}`);
  addLog('info', 'generateNotification', `Completion notification dispatched for ${job.fileName}`);
  return { success: true };
}

// ── Job Execution & Failure Recovery Manager ─────────────────────────────────

async function processJob(jobItem) {
  const job = jobItem.job;
  state.activeCount++;

  const startedAt = new Date().toISOString();
  db.updateJob(job.id, { status: 'processing', startedAt });
  db.addJobEvent(job.id, 'PROCESSING_STARTED', {
    attemptCount: job.attemptCount,
    activeWorkers: state.activeCount,
  });

  addLog('info', 'pipeline', `Started processing ${job.fileName} (job ${job.id.slice(0, 8)}, attempt ${job.attemptCount})`);

  let failure = null;

  try {
    const v = await runValidateMedia(job);
    if (!v.success) failure = v;
    else {
      const m = await runExtractMetadata(job);
      if (!m.success) failure = m;
      else {
        const p = await runProcessMedia(job);
        if (!p.success) failure = p;
        else {
          const s = await runSaveResults(job);
          if (!s.success) failure = s;
          else {
            const n = await runGenerateNotification(job);
            if (!n.success) failure = n;
          }
        }
      }
    }
  } catch (err) {
    failure = { success: false, errorType: 'transient', error: err.message };
  }

  const completedAt = new Date().toISOString();
  const totalDuration = Date.now() - new Date(startedAt).getTime();

  if (!failure) {
    // ── Success Path ─────────────────────────────────────────────────────────
    db.updateJob(job.id, {
      status: 'completed',
      completedAt,
      durationMs: totalDuration,
      error: null,
      errorType: null,
    });
    db.addJobEvent(job.id, 'COMPLETED', { totalDuration, attemptCount: job.attemptCount });
    scalingEngine.recordJobCompleted();
    addLog('info', 'pipeline', `Job ${job.id.slice(0, 8)} completed successfully in ${totalDuration}ms`);
  } else {
    // ── Failure & Recovery Path ──────────────────────────────────────────────
    const isTransient = failure.errorType === 'transient';
    const canRetry = isTransient && job.retryCount < job.maxRetries;

    if (canRetry) {
      // Bounded retry with backoff delay
      const nextRetryCount = job.retryCount + 1;
      const nextAttemptCount = job.attemptCount + 1;
      const retryDelayMs = 1000 * Math.pow(1.5, nextRetryCount - 1); // 1s, 1.5s, 2.25s

      db.updateJob(job.id, {
        status: 'retrying',
        retryCount: nextRetryCount,
        attemptCount: nextAttemptCount,
        error: failure.error,
        errorType: 'transient',
      });

      db.addJobEvent(job.id, 'RETRY_SCHEDULED', {
        retryCount: nextRetryCount,
        maxRetries: job.maxRetries,
        retryDelayMs,
        reason: failure.error,
      });

      addLog('warn', 'retry', `Job ${job.id.slice(0, 8)} failed transiently (${failure.error}). Scheduling retry ${nextRetryCount}/${job.maxRetries} in ${retryDelayMs}ms.`);

      setTimeout(() => {
        // Fetch fresh job record and re-enqueue
        const freshJob = db.getJobById(job.id);
        if (freshJob && freshJob.status === 'retrying') {
          db.updateJob(freshJob.id, { status: 'queued' });
          enqueueJob(freshJob);
        }
      }, retryDelayMs);

    } else {
      // Exhausted retries OR permanent failure -> Move to DLQ
      const reason = !isTransient
        ? `Permanent validation failure: ${failure.error}`
        : `Exhausted maximum retry attempts (${job.retryCount}/${job.maxRetries}): ${failure.error}`;

      db.moveToDlq(job.id, reason, failure.error);
      addLog('error', 'dlq', `Job ${job.id.slice(0, 8)} moved to Dead-Letter Queue. Reason: ${reason}`);
    }
  }

  state.activeCount--;
  drainQueue();
}

// ── Queue Management & Adaptive Concurrency ──────────────────────────────────

function enqueueJob(job) {
  state.queue.push({ job, enqueuedAt: Date.now() });
  if (state.queue.length > state.peakQueueDepth) {
    state.peakQueueDepth = state.queue.length;
  }
  addLog('info', 'queue', `Job ${job.id.slice(0, 8)} enqueued (${job.fileName})`);
  drainQueue();
}

function calculateAvgWaitTime() {
  if (state.queue.length === 0) return 0;
  const now = Date.now();
  const totalWait = state.queue.reduce((sum, item) => sum + (now - item.enqueuedAt), 0);
  return Math.round(totalWait / state.queue.length);
}

function drainQueue() {
  const currentCapacity = scalingEngine.getCurrentCapacity();
  while (state.queue.length > 0 && state.activeCount < currentCapacity) {
    const jobItem = state.queue.shift();
    processJob(jobItem);
  }

  // Record throughput history snapshot
  const allJobs = db.listJobs({ limit: 1000 });
  state.throughputHistory.push({
    timestamp: new Date().toISOString(),
    completed: allJobs.filter(j => j.status === 'completed').length,
    failed: allJobs.filter(j => j.status === 'failed' || j.status === 'dlq').length,
    queued: state.queue.length,
    active: state.activeCount,
    capacity: currentCapacity,
  });
  if (state.throughputHistory.length > 200) {
    state.throughputHistory.splice(0, state.throughputHistory.length - 200);
  }
}

// Periodic auto-scaling evaluation loop (every 1.5 seconds)
setInterval(() => {
  const avgWaitTimeMs = calculateAvgWaitTime();
  scalingEngine.evaluate({
    queuedCount: state.queue.length,
    activeCount: state.activeCount,
    avgWaitTimeMs,
  });
  drainQueue();
}, 1500);

// ── API Routes ───────────────────────────────────────────────────────────────

// 1. Upload File & Create Job (with Idempotency Support)
app.post('/api/jobs', upload.single('file'), (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || null;

    const { job, isDuplicate } = db.createJob({
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      idempotencyKey,
      maxRetries: 3,
    });

    // Cleanup uploaded temp file
    fs.unlink(file.path, () => {});

    if (isDuplicate) {
      addLog('warn', 'idempotency', `Duplicate job submission ignored (Key: ${idempotencyKey}). Returning existing job ${job.id.slice(0, 8)}.`);
      return res.status(200).json({ ...job, duplicateDetected: true });
    }

    enqueueJob(job);
    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Synthetic Job Generation (with Idempotency Support)
app.post('/api/jobs/synthetic', (req, res) => {
  const { fileName, fileSize, mimeType, maxRetries = 3 } = req.body;
  const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || null;

  const { job, isDuplicate } = db.createJob({
    fileName: fileName || `synthetic_${Date.now()}.mp4`,
    fileSize: fileSize || Math.floor(Math.random() * 50000000) + 100000,
    mimeType: mimeType || 'video/mp4',
    idempotencyKey,
    maxRetries,
  });

  if (isDuplicate) {
    addLog('warn', 'idempotency', `Duplicate synthetic job submission ignored (Key: ${idempotencyKey}).`);
    return res.status(200).json({ ...job, duplicateDetected: true });
  }

  enqueueJob(job);
  res.status(201).json(job);
});

// 3. List Jobs (from SQLite)
app.get('/api/jobs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const status = req.query.status || null;
  const jobs = db.listJobs({ limit, status });
  res.json(jobs);
});

// 4. Single Job Details
app.get('/api/jobs/:id', (req, res) => {
  const job = db.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// 5. Job Lifecycle Event History (Timeline)
app.get('/api/jobs/:id/events', (req, res) => {
  const job = db.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const events = db.getJobEvents(req.params.id);
  res.json({ job, events });
});

// 6. Retry a Failed Job
app.post('/api/jobs/:id/retry', (req, res) => {
  const job = db.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'failed' && job.status !== 'dlq') {
    return res.status(400).json({ error: 'Only failed or DLQ jobs can be retried' });
  }

  if (job.status === 'dlq') {
    const retried = db.retryDlqJob(job.id);
    enqueueJob(retried);
    return res.json(retried);
  }

  const updated = db.updateJob(job.id, {
    status: 'queued',
    stages: {},
    error: null,
    errorType: null,
    retryCount: 0,
    attemptCount: (job.attemptCount || 1) + 1,
  });
  db.addJobEvent(job.id, 'MANUAL_RETRY', { previousAttempts: job.attemptCount });
  enqueueJob(updated);
  res.json(updated);
});

// 7. Dead-Letter Queue (DLQ) Endpoints
app.get('/api/dlq', (req, res) => {
  const dlqItems = db.listDlq();
  res.json(dlqItems);
});

app.post('/api/dlq/:id/retry', (req, res) => {
  const retried = db.retryDlqJob(req.params.id);
  if (!retried) return res.status(404).json({ error: 'Job not found in DLQ' });
  enqueueJob(retried);
  addLog('info', 'dlq', `Job ${retried.id.slice(0, 8)} manually retried from Dead-Letter Queue`);
  res.json(retried);
});

// 8. Auto-Scaling Engine Status & Config
app.get('/api/scaling/status', (req, res) => {
  const status = scalingEngine.getStatus();
  res.json({
    ...status,
    activeWorkers: state.activeCount,
    queuedJobs: state.queue.length,
    avgWaitTimeMs: calculateAvgWaitTime(),
    peakQueueDepth: state.peakQueueDepth,
  });
});

app.post('/api/scaling/config', (req, res) => {
  try {
    const updated = scalingEngine.updateConfig(req.body);
    addLog('info', 'scaling', `Scaling configuration updated: Mode=${updated.mode}, Capacity=${updated.currentCapacity}, Min=${updated.minWorkers}, Max=${updated.maxWorkers}`);
    drainQueue();
    res.json({
      ...updated,
      activeWorkers: state.activeCount,
      queuedJobs: state.queue.length,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/scaling/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const events = db.listScalingEvents(limit);
  res.json(events);
});

// 9. Benchmarking Module Endpoints
app.post('/api/benchmarks/run', async (req, res) => {
  if (state.activeBenchmark && state.activeBenchmark.status === 'running') {
    return res.status(409).json({ error: 'A benchmark is already running. Please wait for it to complete.' });
  }

  const {
    name = `Benchmark Run ${new Date().toLocaleTimeString()}`,
    jobCount = 10,
    mode = 'auto', // 'auto' | 'manual'
    workerCount = 3, // for manual mode
    minWorkers = 2,
    maxWorkers = 8,
    workloadProfile = 'moderate', // 'light' | 'moderate' | 'heavy'
    seed = 42,
  } = req.body;

  const benchmarkId = uuid();
  const config = { jobCount, mode, workerCount, minWorkers, maxWorkers, workloadProfile, seed };
  
  const benchmarkRecord = {
    id: benchmarkId,
    name,
    createdAt: new Date().toISOString(),
    status: 'running',
    config,
    metrics: {},
    summaryText: 'Executing deterministic workload...',
  };

  db.saveBenchmark(benchmarkRecord);
  state.activeBenchmark = benchmarkRecord;

  // Apply benchmark scaling mode
  if (mode === 'manual') {
    scalingEngine.updateConfig({ mode: 'manual', manualCapacity: workerCount, minWorkers: 1, maxWorkers: 50 });
  } else {
    scalingEngine.updateConfig({ mode: 'auto', minWorkers, maxWorkers });
  }

  // Generate deterministic workload
  const workload = benchmarkEngine.generateDeterministicWorkload(jobCount, workloadProfile, seed);
  const createdJobs = [];
  const startTimeMs = Date.now();
  let peakQueue = 0;
  const timeline = [];

  for (const item of workload) {
    const { job } = db.createJob({
      fileName: item.fileName,
      fileSize: item.fileSize,
      mimeType: item.mimeType,
      benchmarkId,
      maxRetries: 2,
    });
    createdJobs.push(job);
    enqueueJob(job);
  }

  // Monitor benchmark execution asynchronously
  const monitorInterval = setInterval(() => {
    const currentQueue = state.queue.length;
    if (currentQueue > peakQueue) peakQueue = currentQueue;

    timeline.push({
      timeMs: Date.now() - startTimeMs,
      capacity: scalingEngine.getCurrentCapacity(),
      active: state.activeCount,
      queued: currentQueue,
    });

    // Check completion: all benchmark jobs finished
    const freshJobs = createdJobs.map(j => db.getJobById(j.id));
    const allDone = freshJobs.every(j => j.status === 'completed' || j.status === 'failed' || j.status === 'dlq');

    if (allDone) {
      clearInterval(monitorInterval);
      const endTimeMs = Date.now();
      const metrics = benchmarkEngine.calculateMetrics({
        jobs: freshJobs,
        startTimeMs,
        endTimeMs,
        peakQueue,
        timeline,
      });

      const summaryText = `Completed ${metrics.successfulJobs}/${metrics.totalJobs} jobs in ${(metrics.totalCompletionTimeMs / 1000).toFixed(2)}s. Throughput: ${metrics.throughputJps} jps, Avg Latency: ${metrics.avgLatencyMs}ms, P95: ${metrics.p95LatencyMs}ms.`;

      db.updateBenchmark(benchmarkId, {
        status: 'completed',
        metrics,
        summaryText,
      });

      state.activeBenchmark = null;
      addLog('info', 'benchmark', `Benchmark '${name}' finished: ${summaryText}`);
    }
  }, 300);

  res.status(202).json({
    message: 'Benchmark started',
    benchmarkId,
    config,
    jobCount: createdJobs.length,
  });
});

app.get('/api/benchmarks', (req, res) => {
  const benchmarks = db.listBenchmarks();
  res.json(benchmarks);
});

app.get('/api/benchmarks/:id', (req, res) => {
  const b = db.getBenchmarkById(req.params.id);
  if (!b) return res.status(404).json({ error: 'Benchmark not found' });
  res.json(b);
});

app.post('/api/benchmarks/compare', (req, res) => {
  const { runAId, runBId } = req.body;
  if (!runAId || !runBId) {
    return res.status(400).json({ error: 'runAId and runBId are required' });
  }

  const runA = db.getBenchmarkById(runAId);
  const runB = db.getBenchmarkById(runBId);

  if (!runA || !runB) {
    return res.status(404).json({ error: 'One or both benchmark runs could not be found' });
  }

  const comparison = benchmarkEngine.compareBenchmarks(runA, runB);
  res.json(comparison);
});

app.delete('/api/benchmarks/:id', (req, res) => {
  const success = db.deleteBenchmark(req.params.id);
  if (!success) return res.status(404).json({ error: 'Benchmark not found' });
  res.json({ success: true, message: 'Benchmark deleted' });
});

// 10. System Metrics Overview
app.get('/api/metrics', (req, res) => {
  const allJobs = db.listJobs({ limit: 1000 });
  const total = allJobs.length;
  const completed = allJobs.filter(j => j.status === 'completed').length;
  const failed = allJobs.filter(j => j.status === 'failed' || j.status === 'dlq').length;
  const processing = state.activeCount;
  const queued = state.queue.length;

  let avgDuration = 0;
  const completedJobs = allJobs.filter(j => j.status === 'completed');
  if (completedJobs.length > 0) {
    const totalDur = completedJobs.reduce((sum, j) => sum + (j.durationMs || 0), 0);
    avgDuration = Math.round(totalDur / completedJobs.length);
  }

  const activeFns = Object.entries(state.functions).filter(
    ([, f]) => f.lastRun && Date.now() - new Date(f.lastRun).getTime() < 30000
  ).length;

  res.json({
    totalEvents: total,
    successful: completed,
    failed,
    processing,
    queued,
    avgProcessingTime: avgDuration,
    activeFunctions: activeFns,
    queueLength: queued,
    scaling: scalingEngine.getStatus(),
    throughputHistory: state.throughputHistory.slice(-50),
  });
});

// 11. Functions Info & Manual Trigger
app.get('/api/functions', (req, res) => {
  const result = Object.entries(state.functions).map(([name, fn]) => ({
    name,
    invocations: fn.invocations,
    successes: fn.successes,
    failures: fn.failures,
    avgDuration: fn.invocations > 0 ? Math.round(fn.totalDuration / fn.invocations) : 0,
    lastRun: fn.lastRun,
    logs: fn.logs.slice(0, 10),
  }));
  res.json(result);
});

app.post('/api/functions/:name/invoke', async (req, res) => {
  const fnName = req.params.name;
  if (!state.functions[fnName]) return res.status(404).json({ error: 'Unknown function' });

  const dummyJob = {
    id: uuid(),
    fileName: `manual_invoke_${Date.now()}.mp4`,
    fileSize: 1024000,
    mimeType: 'video/mp4',
    stages: {},
  };

  const fnMap = {
    validateMedia: runValidateMedia,
    extractMetadata: runExtractMetadata,
    processMedia: runProcessMedia,
    saveResults: runSaveResults,
    generateNotification: runGenerateNotification,
  };

  try {
    const result = await fnMap[fnName](dummyJob);
    res.json({ success: result.success !== false, stages: dummyJob.stages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Simulate Traffic Spike
app.post('/api/simulate-traffic', (req, res) => {
  const { count = 10 } = req.body;
  const clamped = Math.min(Math.max(parseInt(count) || 10, 1), 200);
  const created = [];

  for (let i = 0; i < clamped; i++) {
    const types = ['video/mp4', 'video/webm', 'audio/mpeg', 'image/jpeg'];
    const extensions = ['mp4', 'webm', 'mp3', 'jpg'];
    const idx = Math.floor(Math.random() * types.length);

    const { job } = db.createJob({
      fileName: `traffic_${i + 1}_${Date.now()}.${extensions[idx]}`,
      fileSize: Math.floor(Math.random() * 50000000) + 100000,
      mimeType: types[idx],
      maxRetries: 3,
    });

    created.push(job);
    enqueueJob(job);
  }

  addLog('info', 'traffic-simulator', `Generated ${clamped} synthetic jobs into pipeline`);
  res.json({
    generated: clamped,
    queued: state.queue.length,
    active: state.activeCount,
    currentCapacity: scalingEngine.getCurrentCapacity(),
  });
});

// 13. Logs
app.get('/api/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  res.json(state.logs.slice(0, limit));
});

// 14. Health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: 'SQLite (WAL mode)',
    workers: {
      type: 'Simulated Asynchronous Workers',
      active: state.activeCount,
      capacity: scalingEngine.getCurrentCapacity(),
      mode: scalingEngine.mode,
    },
  });
});

// ── Server Listen (Only when executed directly, not inside Vercel Serverless Function) ──

const PORT = process.env.PORT || 3001;
if (!isVercel && require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  🚀 Streamless API running at http://localhost:${PORT}`);
    console.log(`  📦 Storage: SQLite DB initialized at server/data/streamless.db`);
    console.log(`  ⚡ Scaling: Adaptive Auto-Scaling active (Min: ${scalingEngine.minWorkers}, Max: ${scalingEngine.maxWorkers})\n`);
    addLog('info', 'system', `Server started on port ${PORT} with SQLite persistence and Adaptive Auto-Scaling`);
  });
}

module.exports = app;
