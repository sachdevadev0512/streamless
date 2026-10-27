const { v4: uuid } = require('uuid');
const {
  saveBenchmark,
  updateBenchmark,
  getBenchmarkById,
  listBenchmarks,
  deleteBenchmark,
} = require('./db');

/**
 * Deterministic pseudo-random number generator (Mulberry32)
 * Ensures reproducible benchmark workloads for rigorous side-by-side comparisons.
 */
function createPrng(seed = 12345) {
  let s = seed >>> 0;
  return function next() {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate synthetic job profiles deterministically based on seed and workload profile.
 */
function generateDeterministicWorkload(jobCount, profile = 'moderate', seed = 42) {
  const prng = createPrng(seed);
  const jobs = [];

  const profiles = {
    light: {
      minSize: 500 * 1024,
      maxSize: 5 * 1024 * 1024,
      types: ['image/jpeg', 'image/png', 'audio/mpeg', 'video/webm'],
      baseDelayMs: 200,
    },
    moderate: {
      minSize: 5 * 1024 * 1024,
      maxSize: 40 * 1024 * 1024,
      types: ['video/mp4', 'video/webm', 'video/quicktime'],
      baseDelayMs: 600,
    },
    heavy: {
      minSize: 40 * 1024 * 1024,
      maxSize: 100 * 1024 * 1024,
      types: ['video/mp4', 'video/quicktime'],
      baseDelayMs: 1200,
    },
  };

  const conf = profiles[profile] || profiles.moderate;

  for (let i = 0; i < jobCount; i++) {
    const typeIdx = Math.floor(prng() * conf.types.length);
    const mimeType = conf.types[typeIdx];
    const size = Math.floor(conf.minSize + prng() * (conf.maxSize - conf.minSize));
    const ext = mimeType.split('/')[1] || 'mp4';

    jobs.push({
      fileName: `bench_${profile}_${i + 1}.${ext}`,
      fileSize: size,
      mimeType,
      simulatedDelayFactor: 0.8 + prng() * 0.4, // 0.8x to 1.2x variation
    });
  }

  return jobs;
}

/**
 * Calculates statistical metrics from an array of completed jobs.
 */
function calculateMetrics({ jobs, startTimeMs, endTimeMs, peakQueue, timeline }) {
  const totalCount = jobs.length;
  const successful = jobs.filter(j => j.status === 'completed');
  const failed = jobs.filter(j => j.status === 'failed' || j.status === 'dlq');
  const totalRetries = jobs.reduce((sum, j) => sum + (j.retryCount || 0), 0);

  const totalTimeMs = Math.max(1, endTimeMs - startTimeMs);
  const throughputJps = parseFloat(((successful.length / totalTimeMs) * 1000).toFixed(2));

  // Compute latencies and queue wait times
  const latencies = [];
  const waitTimes = [];

  for (const j of jobs) {
    if (j.createdAt && j.completedAt) {
      const created = new Date(j.createdAt).getTime();
      const completed = new Date(j.completedAt).getTime();
      latencies.push(Math.max(0, completed - created));
    }
    if (j.createdAt && j.startedAt) {
      const created = new Date(j.createdAt).getTime();
      const started = new Date(j.startedAt).getTime();
      waitTimes.push(Math.max(0, started - created));
    }
  }

  latencies.sort((a, b) => a - b);
  waitTimes.sort((a, b) => a - b);

  const avgLatencyMs = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;

  const medianLatencyMs = latencies.length > 0
    ? latencies[Math.floor(latencies.length * 0.5)]
    : 0;

  const p95LatencyMs = latencies.length > 0
    ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
    : 0;

  const avgQueueWaitMs = waitTimes.length > 0
    ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
    : 0;

  return {
    totalJobs: totalCount,
    successfulJobs: successful.length,
    failedJobs: failed.length,
    totalRetries,
    totalCompletionTimeMs: totalTimeMs,
    throughputJps,
    avgLatencyMs,
    medianLatencyMs,
    p95LatencyMs,
    avgQueueWaitMs,
    peakQueueDepth: peakQueue,
    timeline: timeline || [],
  };
}

/**
 * Compare two benchmark runs and compute quantitative improvements with academic explanations.
 */
function compareBenchmarks(runA, runB) {
  if (!runA || !runB) return null;

  const mA = runA.metrics || {};
  const mB = runB.metrics || {};

  const calcDelta = (valA, valB, lowerIsBetter = false) => {
    if (!valA || valA === 0) return { delta: 0, percent: 0, isBetter: false };
    const diff = valB - valA;
    const percent = parseFloat(((diff / valA) * 100).toFixed(1));
    const isBetter = lowerIsBetter ? diff < 0 : diff > 0;
    return { diff, percent, isBetter };
  };

  const throughputDelta = calcDelta(mA.throughputJps, mB.throughputJps, false);
  const latencyDelta = calcDelta(mA.avgLatencyMs, mB.avgLatencyMs, true);
  const p95Delta = calcDelta(mA.p95LatencyMs, mB.p95LatencyMs, true);
  const timeDelta = calcDelta(mA.totalCompletionTimeMs, mB.totalCompletionTimeMs, true);
  const queueWaitDelta = calcDelta(mA.avgQueueWaitMs, mB.avgQueueWaitMs, true);

  // Generate viva explanation text
  let explanation = '';
  const nameA = runA.name || 'Configuration A';
  const nameB = runB.name || 'Configuration B';

  if (runB.config?.mode === 'auto' && runA.config?.mode === 'manual') {
    explanation = `${nameB} (Adaptive Auto-Scaling) demonstrated elastic concurrency control against ${nameA} (Fixed: ${runA.config.workerCount} workers). By dynamically scaling worker allocation in response to queue depth, queue wait time decreased by ${Math.abs(queueWaitDelta.percent)}% and P95 latency shifted by ${Math.abs(p95Delta.percent)}% (${p95Delta.percent <= 0 ? 'faster' : 'slower'}). This highlights the core serverless trade-off: dynamic elasticity optimizes resource efficiency and limits queue saturation during burst ingestion while eliminating continuous idle capacity.`;
  } else if (throughputDelta.percent > 0) {
    explanation = `${nameB} achieved a ${throughputDelta.percent}% improvement in processing throughput (${mB.throughputJps} vs ${mA.throughputJps} jobs/sec) and a ${Math.abs(timeDelta.percent)}% reduction in total workload execution time compared to ${nameA}. This validates Little's Law in distributed queuing: increasing concurrent capacity under high arrival rates reduces queue dwelling time and accelerates overall pipeline drain.`;
  } else {
    explanation = `Both configurations processed the deterministic workload. ${nameB} achieved ${mB.throughputJps} jobs/sec with ${mB.avgLatencyMs}ms average latency, compared to ${mA.throughputJps} jobs/sec and ${mA.avgLatencyMs}ms for ${nameA}. Concurrency boundaries and queue wait times dictated the resulting latency profiles.`;
  }

  return {
    runA: { id: runA.id, name: runA.name, config: runA.config, metrics: mA },
    runB: { id: runB.id, name: runB.name, config: runB.config, metrics: mB },
    deltas: {
      throughput: throughputDelta,
      avgLatency: latencyDelta,
      p95Latency: p95Delta,
      totalTime: timeDelta,
      queueWait: queueWaitDelta,
    },
    explanation,
    disclaimer: 'Note: Results are measured from local simulated asynchronous pipelines running on the host machine. While architectural queuing dynamics closely mirror AWS Lambda and SQS patterns, host CPU constraints influence absolute durations compared to hyperscale cloud infrastructure.',
  };
}

module.exports = {
  generateDeterministicWorkload,
  calculateMetrics,
  compareBenchmarks,
  saveBenchmark,
  updateBenchmark,
  getBenchmarkById,
  listBenchmarks,
  deleteBenchmark,
};
