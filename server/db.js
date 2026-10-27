const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');

// Ensure data directory exists (on Vercel serverless, only /tmp is writable)
const isVercel = Boolean(process.env.VERCEL);
const dataDir = isVercel ? path.join('/tmp', 'streamless-data') : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'streamless.db');

// Initialize SQLite database using standard Node.js node:sqlite (DatabaseSync)
// Supported in Node 22.5+
let db;
try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(dbPath);
} catch (err) {
  // Fallback to sqlite3 if node:sqlite is unavailable in older Node runtimes
  console.warn('[DB] node:sqlite DatabaseSync not found, falling back to sqlite3:', err.message);
  const sqlite3 = require('sqlite3').verbose();
  const rawDb = new sqlite3.Database(dbPath);
  // Provide synchronous-like wrapper for sqlite3 if fallback is needed
  throw new Error('Please run on Node.js 22.5+ with built-in node:sqlite: ' + err.message);
}

// Enable WAL mode for high concurrency
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ── Schema Initialization ──────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    status TEXT NOT NULL, -- 'queued', 'processing', 'completed', 'failed', 'retrying', 'dlq'
    stages_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL,
    duration_ms INTEGER DEFAULT 0,
    attempt_count INTEGER DEFAULT 1,
    max_retries INTEGER DEFAULT 3,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    error_type TEXT, -- 'transient' vs 'permanent'
    output_metadata_json TEXT DEFAULT '{}',
    benchmark_id TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
  CREATE INDEX IF NOT EXISTS idx_jobs_idempotency ON jobs(idempotency_key);

  CREATE TABLE IF NOT EXISTS job_events (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,
    details_json TEXT DEFAULT '{}',
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);

  CREATE TABLE IF NOT EXISTS dlq (
    job_id TEXT PRIMARY KEY,
    moved_to_dlq_at TEXT NOT NULL,
    failure_reason TEXT NOT NULL,
    attempts_made INTEGER NOT NULL,
    last_error TEXT,
    can_retry INTEGER DEFAULT 1,
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scaling_events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    action TEXT NOT NULL, -- 'SCALE_UP', 'SCALE_DOWN', 'MAINTAIN'
    previous_capacity INTEGER NOT NULL,
    new_capacity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    queue_depth INTEGER NOT NULL,
    active_workers INTEGER NOT NULL,
    metric_values_json TEXT DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_scaling_timestamp ON scaling_events(timestamp);

  CREATE TABLE IF NOT EXISTS benchmarks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL, -- 'running', 'completed', 'failed'
    config_json TEXT NOT NULL,
    metrics_json TEXT DEFAULT '{}',
    summary_text TEXT
  );
`);

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseJobRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    status: row.status,
    stages: row.stages_json ? JSON.parse(row.stages_json) : {},
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
    durationMs: row.duration_ms,
    attemptCount: row.attempt_count,
    maxRetries: row.max_retries,
    retryCount: row.retry_count,
    error: row.error_message,
    errorType: row.error_type,
    outputMetadata: row.output_metadata_json ? JSON.parse(row.output_metadata_json) : {},
    benchmarkId: row.benchmark_id,
  };
}

// ── Job Operations ───────────────────────────────────────────────────────────

const insertJobStmt = db.prepare(`
  INSERT INTO jobs (
    id, idempotency_key, file_name, file_size, mime_type, status,
    stages_json, created_at, started_at, completed_at, updated_at,
    duration_ms, attempt_count, max_retries, retry_count,
    error_message, error_type, output_metadata_json, benchmark_id
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?
  )
`);

const insertEventStmt = db.prepare(`
  INSERT INTO job_events (id, job_id, timestamp, event_type, details_json)
  VALUES (?, ?, ?, ?, ?)
`);

function addJobEvent(jobId, eventType, details = {}) {
  const eventId = uuid();
  const timestamp = new Date().toISOString();
  insertEventStmt.run(eventId, jobId, timestamp, eventType, JSON.stringify(details));
  return { id: eventId, jobId, timestamp, eventType, details };
}

function createJob(jobData) {
  const id = jobData.id || uuid();
  const now = new Date().toISOString();
  const idempotencyKey = jobData.idempotencyKey || null;

  // Idempotency check: if key already exists, return existing job
  if (idempotencyKey) {
    const existing = getJobByIdempotencyKey(idempotencyKey);
    if (existing) {
      return { job: existing, isDuplicate: true };
    }
  }

  const job = {
    id,
    idempotencyKey,
    fileName: jobData.fileName,
    fileSize: jobData.fileSize || 0,
    mimeType: jobData.mimeType || 'application/octet-stream',
    status: jobData.status || 'queued',
    stages: jobData.stages || {},
    createdAt: now,
    startedAt: null,
    completedAt: null,
    updatedAt: now,
    durationMs: 0,
    attemptCount: 1,
    maxRetries: jobData.maxRetries !== undefined ? jobData.maxRetries : 3,
    retryCount: 0,
    error: null,
    errorType: null,
    outputMetadata: jobData.outputMetadata || {},
    benchmarkId: jobData.benchmarkId || null,
  };

  insertJobStmt.run(
    job.id,
    job.idempotencyKey,
    job.fileName,
    job.fileSize,
    job.mimeType,
    job.status,
    JSON.stringify(job.stages),
    job.createdAt,
    job.startedAt,
    job.completedAt,
    job.updatedAt,
    job.durationMs,
    job.attemptCount,
    job.maxRetries,
    job.retryCount,
    job.error,
    job.errorType,
    JSON.stringify(job.outputMetadata),
    job.benchmarkId
  );

  addJobEvent(job.id, 'SUBMITTED', {
    fileName: job.fileName,
    fileSize: job.fileSize,
    mimeType: job.mimeType,
    idempotencyKey: job.idempotencyKey,
  });

  return { job, isDuplicate: false };
}

const getJobByIdStmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
function getJobById(id) {
  const row = getJobByIdStmt.get(id);
  return parseJobRow(row);
}

const getJobByIdempotencyStmt = db.prepare('SELECT * FROM jobs WHERE idempotency_key = ?');
function getJobByIdempotencyKey(key) {
  if (!key) return null;
  const row = getJobByIdempotencyStmt.get(key);
  return parseJobRow(row);
}

function updateJob(id, updates) {
  const current = getJobById(id);
  if (!current) return null;

  const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };

  const updateStmt = db.prepare(`
    UPDATE jobs SET
      status = ?,
      stages_json = ?,
      started_at = ?,
      completed_at = ?,
      updated_at = ?,
      duration_ms = ?,
      attempt_count = ?,
      retry_count = ?,
      error_message = ?,
      error_type = ?,
      output_metadata_json = ?
    WHERE id = ?
  `);

  updateStmt.run(
    updated.status,
    JSON.stringify(updated.stages || {}),
    updated.startedAt || null,
    updated.completedAt || null,
    updated.updatedAt,
    updated.durationMs || 0,
    updated.attemptCount || 1,
    updated.retryCount || 0,
    updated.error || null,
    updated.errorType || null,
    JSON.stringify(updated.outputMetadata || {}),
    id
  );

  return updated;
}

function listJobs({ limit = 100, status = null, benchmarkId = null } = {}) {
  let query = 'SELECT * FROM jobs';
  const params = [];
  const where = [];

  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (benchmarkId !== undefined) {
    if (benchmarkId === null) {
      // Exclude benchmark background jobs from standard user list if requested
      where.push("(benchmark_id IS NULL OR benchmark_id = '')");
    } else {
      where.push('benchmark_id = ?');
      params.push(benchmarkId);
    }
  }

  if (where.length > 0) {
    query += ' WHERE ' + where.join(' AND ');
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(query);
  const rows = stmt.all(...params);
  return rows.map(parseJobRow);
}

const getJobEventsStmt = db.prepare('SELECT * FROM job_events WHERE job_id = ? ORDER BY timestamp ASC');
function getJobEvents(jobId) {
  const rows = getJobEventsStmt.all(jobId);
  return rows.map(r => ({
    id: r.id,
    jobId: r.job_id,
    timestamp: r.timestamp,
    eventType: r.event_type,
    details: r.details_json ? JSON.parse(r.details_json) : {},
  }));
}

// ── Dead-Letter Queue (DLQ) Operations ───────────────────────────────────────

const insertDlqStmt = db.prepare(`
  INSERT OR REPLACE INTO dlq (job_id, moved_to_dlq_at, failure_reason, attempts_made, last_error, can_retry)
  VALUES (?, ?, ?, ?, ?, 1)
`);

function moveToDlq(jobId, failureReason, lastError) {
  const job = getJobById(jobId);
  if (!job) return null;

  const now = new Date().toISOString();
  updateJob(jobId, {
    status: 'dlq',
    error: lastError || failureReason,
    errorType: 'exhausted_retries',
    completedAt: now,
  });

  insertDlqStmt.run(jobId, now, failureReason, job.attemptCount, lastError || failureReason);
  addJobEvent(jobId, 'MOVED_TO_DLQ', {
    failureReason,
    lastError,
    totalAttempts: job.attemptCount,
  });

  return getJobById(jobId);
}

function listDlq() {
  const stmt = db.prepare(`
    SELECT j.*, d.moved_to_dlq_at, d.failure_reason, d.attempts_made, d.last_error
    FROM dlq d
    JOIN jobs j ON d.job_id = j.id
    ORDER BY d.moved_to_dlq_at DESC
  `);
  const rows = stmt.all();
  return rows.map(r => ({
    ...parseJobRow(r),
    movedToDlqAt: r.moved_to_dlq_at,
    failureReason: r.failure_reason,
    attemptsMade: r.attempts_made,
    lastError: r.last_error,
  }));
}

function retryDlqJob(jobId) {
  const job = getJobById(jobId);
  if (!job) return null;

  // Remove from DLQ table
  db.prepare('DELETE FROM dlq WHERE job_id = ?').run(jobId);

  // Reset job to queued with fresh retry budget
  const updated = updateJob(jobId, {
    status: 'queued',
    stages: {},
    error: null,
    errorType: null,
    retryCount: 0,
    attemptCount: (job.attemptCount || 1) + 1,
    startedAt: null,
    completedAt: null,
  });

  addJobEvent(jobId, 'MANUAL_RETRY_FROM_DLQ', {
    requeuedAt: new Date().toISOString(),
    previousAttempts: job.attemptCount,
  });

  return updated;
}

// ── Startup Crash Recovery ───────────────────────────────────────────────────

function recoverInterruptedJobs() {
  const stmt = db.prepare("SELECT * FROM jobs WHERE status = 'processing' OR status = 'retrying'");
  const rows = stmt.all();
  const recovered = [];

  for (const row of rows) {
    const job = parseJobRow(row);
    const now = new Date().toISOString();
    // Interrupted while processing: requeue safely without data loss
    updateJob(job.id, {
      status: 'queued',
      error: 'Interrupted by server restart - automatically requeued for safe recovery',
      errorType: 'transient',
      attemptCount: job.attemptCount + 1,
    });
    addJobEvent(job.id, 'RECOVERED_AFTER_RESTART', {
      previousStatus: job.status,
      timestamp: now,
    });
    recovered.push(job.id);
  }

  if (recovered.length > 0) {
    console.log(`[DB] Recovered ${recovered.length} interrupted job(s) from previous server run:`, recovered);
  }
  return recovered;
}

// ── Scaling Events ───────────────────────────────────────────────────────────

const insertScalingEventStmt = db.prepare(`
  INSERT INTO scaling_events (id, timestamp, action, previous_capacity, new_capacity, reason, queue_depth, active_workers, metric_values_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function recordScalingEvent(event) {
  const id = uuid();
  const timestamp = new Date().toISOString();
  insertScalingEventStmt.run(
    id,
    timestamp,
    event.action,
    event.previousCapacity,
    event.newCapacity,
    event.reason,
    event.queueDepth,
    event.activeWorkers,
    JSON.stringify(event.metrics || {})
  );
  return { id, timestamp, ...event };
}

function listScalingEvents(limit = 50) {
  const stmt = db.prepare('SELECT * FROM scaling_events ORDER BY timestamp DESC LIMIT ?');
  const rows = stmt.all(limit);
  return rows.map(r => ({
    id: r.id,
    timestamp: r.timestamp,
    action: r.action,
    previousCapacity: r.previous_capacity,
    newCapacity: r.new_capacity,
    reason: r.reason,
    queueDepth: r.queue_depth,
    activeWorkers: r.active_workers,
    metrics: r.metric_values_json ? JSON.parse(r.metric_values_json) : {},
  }));
}

// ── Benchmarks ───────────────────────────────────────────────────────────────

const insertBenchmarkStmt = db.prepare(`
  INSERT INTO benchmarks (id, name, created_at, status, config_json, metrics_json, summary_text)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function saveBenchmark(b) {
  insertBenchmarkStmt.run(
    b.id,
    b.name,
    b.createdAt,
    b.status,
    JSON.stringify(b.config),
    JSON.stringify(b.metrics || {}),
    b.summaryText || ''
  );
  return b;
}

function updateBenchmark(id, updates) {
  const current = getBenchmarkById(id);
  if (!current) return null;
  const updated = { ...current, ...updates };
  db.prepare(`
    UPDATE benchmarks SET
      status = ?,
      metrics_json = ?,
      summary_text = ?
    WHERE id = ?
  `).run(
    updated.status,
    JSON.stringify(updated.metrics || {}),
    updated.summaryText || '',
    id
  );
  return updated;
}

function getBenchmarkById(id) {
  const stmt = db.prepare('SELECT * FROM benchmarks WHERE id = ?');
  const r = stmt.get(id);
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    status: r.status,
    config: JSON.parse(r.config_json),
    metrics: r.metrics_json ? JSON.parse(r.metrics_json) : {},
    summaryText: r.summary_text,
  };
}

function listBenchmarks() {
  const stmt = db.prepare('SELECT * FROM benchmarks ORDER BY created_at DESC');
  const rows = stmt.all();
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    status: r.status,
    config: JSON.parse(r.config_json),
    metrics: r.metrics_json ? JSON.parse(r.metrics_json) : {},
    summaryText: r.summary_text,
  }));
}

function deleteBenchmark(id) {
  // Delete associated jobs
  db.prepare('DELETE FROM jobs WHERE benchmark_id = ?').run(id);
  const res = db.prepare('DELETE FROM benchmarks WHERE id = ?').run(id);
  return res.changes > 0;
}

// Export module
module.exports = {
  db,
  createJob,
  getJobById,
  getJobByIdempotencyKey,
  updateJob,
  listJobs,
  addJobEvent,
  getJobEvents,
  moveToDlq,
  listDlq,
  retryDlqJob,
  recoverInterruptedJobs,
  recordScalingEvent,
  listScalingEvents,
  saveBenchmark,
  updateBenchmark,
  getBenchmarkById,
  listBenchmarks,
  deleteBenchmark,
};
