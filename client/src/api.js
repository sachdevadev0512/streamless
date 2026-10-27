const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  getMetrics:    ()          => request('/metrics'),
  getJobs:       ()          => request('/jobs'),
  getJob:        (id)        => request(`/jobs/${id}`),
  getJobEvents:  (id)        => request(`/jobs/${id}/events`),
  getFunctions:  ()          => request('/functions'),
  getLogs:       (limit = 50)=> request(`/logs?limit=${limit}`),

  createJob: (file, idempotencyKey = null) => {
    const form = new FormData();
    form.append('file', file);
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    return fetch(`${BASE}/jobs`, { method: 'POST', headers, body: form }).then(r => r.json());
  },

  createSyntheticJob: (data, idempotencyKey = null) => {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    return request('/jobs/synthetic', { method: 'POST', headers, body: JSON.stringify(data) });
  },

  retryJob:       (id)          => request(`/jobs/${id}/retry`, { method: 'POST' }),
  invokeFunction: (name)        => request(`/functions/${name}/invoke`, { method: 'POST' }),
  simulateTraffic:(count)       => request('/simulate-traffic', { method: 'POST', body: JSON.stringify({ count }) }),

  // ── Auto-Scaling Endpoints ───────────────────────────────────────────────
  getScalingStatus: ()          => request('/scaling/status'),
  updateScalingConfig: (config) => request('/scaling/config', { method: 'POST', body: JSON.stringify(config) }),
  getScalingEvents: (limit = 30)=> request(`/scaling/events?limit=${limit}`),

  // ── Dead-Letter Queue Endpoints ──────────────────────────────────────────
  getDlq:          ()           => request('/dlq'),
  retryDlqJob:     (id)         => request(`/dlq/${id}/retry`, { method: 'POST' }),

  // ── Benchmarking Endpoints ───────────────────────────────────────────────
  runBenchmark:    (config)     => request('/benchmarks/run', { method: 'POST', body: JSON.stringify(config) }),
  getBenchmarks:   ()           => request('/benchmarks'),
  getBenchmark:    (id)         => request(`/benchmarks/${id}`),
  compareBenchmarks: (runAId, runBId) => request('/benchmarks/compare', { method: 'POST', body: JSON.stringify({ runAId, runBId }) }),
  deleteBenchmark: (id)         => request(`/benchmarks/${id}`, { method: 'DELETE' }),
};
