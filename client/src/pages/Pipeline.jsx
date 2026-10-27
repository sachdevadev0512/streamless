import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import {
  Upload, Play, RotateCcw, CheckCircle, XCircle, Loader, Clock, FileVideo, ChevronRight,
  Database, ShieldCheck, AlertOctagon, History, ExternalLink, RefreshCw, Key, Info, Layers
} from 'lucide-react'

const STAGE_LABELS = {
  validate: 'Validation (validateMedia)',
  metadata: 'Metadata Extraction (extractMetadata)',
  process:  'Media Transcoding (processMedia)',
  save:     'State Store (saveResults)',
  notify:   'Notification (generateNotification)',
}

const STAGE_ORDER = ['validate', 'metadata', 'process', 'save', 'notify']

function StageIndicator({ stage, data }) {
  if (!data) return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/5 text-gray-500 text-xs">
      <Clock size={13} /> <span>{STAGE_LABELS[stage]}</span> <span className="ml-auto text-[10px] uppercase">Pending</span>
    </div>
  )
  const status = data.status
  const icon = status === 'completed' ? <CheckCircle size={14} className="text-green-400" />
    : status === 'failed' ? <XCircle size={14} className="text-red-400" />
    : <Loader size={14} className="animate-spin text-yellow-400" />
  const bg = status === 'completed' ? 'bg-green-500/10 border-green-500/20 text-green-300'
    : status === 'failed' ? 'bg-red-500/10 border-red-500/20 text-red-300'
    : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'

  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs ${bg}`}>
      {icon}
      <span className="font-medium">{STAGE_LABELS[stage]}</span>
      <span className="ml-auto text-[11px] font-mono text-gray-400">
        {data.duration ? `${data.duration}ms` : 'Running…'}
      </span>
    </div>
  )
}

function JobCard({ job, onRetry, onSelect, selected }) {
  const statusColors = {
    queued: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
    processing: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20 animate-pulse',
    completed: 'text-green-400 bg-green-500/10 border-green-500/20',
    failed: 'text-red-400 bg-red-500/10 border-red-500/20',
    retrying: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    dlq: 'text-red-300 bg-red-900/30 border-red-500/40',
  }
  return (
    <button
      onClick={() => onSelect(job.id)}
      className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 ${
        selected ? 'border-red-500/50 bg-red-500/10 shadow-md shadow-red-900/20' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-white truncate max-w-[190px]">{job.fileName}</span>
        <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border ${statusColors[job.status] || 'text-gray-400'}`}>
          {job.status}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-gray-500">
        <span>{(job.fileSize / 1024).toFixed(0)} KB</span>
        <span className="truncate max-w-[100px]">{job.mimeType}</span>
        {job.attemptCount > 1 && (
          <span className="text-orange-400 ml-auto font-mono">Attempt {job.attemptCount}</span>
        )}
      </div>
      {job.status === 'failed' && (
        <button
          onClick={(e) => { e.stopPropagation(); onRetry(job.id) }}
          className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-red-400 hover:text-red-300"
        >
          <RotateCcw size={11} /> Retry Job
        </button>
      )}
    </button>
  )
}

export default function Pipeline() {
  const [activeTab, setActiveTab] = useState('pipeline') // 'pipeline' | 'dlq'
  const [jobs, setJobs] = useState([])
  const [dlqJobs, setDlqJobs] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)
  const [jobEvents, setJobEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [idempotencyMsg, setIdempotencyMsg] = useState(null)
  const fileRef = useRef(null)

  const loadData = async () => {
    try {
      const [allJobs, dlq] = await Promise.all([
        api.getJobs().catch(() => []),
        api.getDlq().catch(() => []),
      ])
      setJobs(allJobs)
      setDlqJobs(dlq)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadData()
    const id = setInterval(loadData, 2000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setSelectedJob(null)
      setJobEvents([])
      return
    }
    const pollJob = async () => {
      try {
        const j = await api.getJob(selectedId)
        setSelectedJob(j)
      } catch (e) {
        console.error(e)
      }
    }
    pollJob()
    const id = setInterval(pollJob, 1000)
    return () => clearInterval(id)
  }, [selectedId])

  // Load lifecycle events whenever selectedJob changes
  useEffect(() => {
    if (!selectedId) return
    setEventsLoading(true)
    api.getJobEvents(selectedId)
      .then(res => setJobEvents(res.events || []))
      .catch(() => setJobEvents([]))
      .finally(() => setEventsLoading(false))
  }, [selectedId, selectedJob?.status])

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    try {
      const res = await api.createJob(file, idempotencyKey || null)
      if (res.duplicateDetected) {
        setIdempotencyMsg({ type: 'warning', text: `Duplicate detected! Reusing existing job ID: ${res.id.slice(0, 8)}` })
      } else {
        setIdempotencyMsg(null)
      }
      setSelectedId(res.id)
      fileRef.current.value = ''
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleQuickStart = async (customOptions = {}) => {
    try {
      const payload = {
        fileName: customOptions.fileName || `demo_video_${Date.now()}.mp4`,
        fileSize: customOptions.fileSize || 25000000,
        mimeType: customOptions.mimeType || 'video/mp4',
      }
      const res = await api.createSyntheticJob(payload, idempotencyKey || null)
      if (res.duplicateDetected) {
        setIdempotencyMsg({ type: 'warning', text: `Idempotency matched! Duplicate prevented: Job ${res.id.slice(0, 8)}` })
      } else {
        setIdempotencyMsg(null)
      }
      setSelectedId(res.id)
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleRetry = async (id) => {
    await api.retryJob(id)
    setSelectedId(id)
    loadData()
  }

  const handleDlqRetry = async (id) => {
    try {
      await api.retryDlqJob(id)
      loadData()
      setSelectedId(id)
      setActiveTab('pipeline')
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">Media Processing Pipeline</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
              <Database size={11} /> SQLite Persistent Store
            </span>
          </div>
          <p className="text-gray-400 mt-1 text-sm">
            Reliable event-driven execution with automatic retries, idempotency protection, and persistent dead-letter queue.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 rounded-xl bg-black/40 border border-white/10 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'pipeline'
                ? 'bg-red-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Layers size={14} /> Active Pipeline ({jobs.length})
          </button>
          <button
            onClick={() => setActiveTab('dlq')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'dlq'
                ? 'bg-red-900/60 text-red-200 border border-red-500/40'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <AlertOctagon size={14} className={dlqJobs.length > 0 ? 'text-red-400' : ''} />
            Dead-Letter Queue ({dlqJobs.length})
          </button>
        </div>
      </div>

      {/* Workflow Diagram Banner */}
      <div className="glass rounded-xl p-5 border border-white/5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Event-Driven Serverless Ingestion Workflow</h2>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {['S3 Upload Trigger', 'Validate Header', 'Metadata Extraction', 'Transcoding (Simulated)', 'DynamoDB Commit', 'SNS Fan-Out'].map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-shrink-0">
              <div className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-red-600/20 to-red-900/10 border border-red-500/20 font-medium text-red-300">
                {s}
              </div>
              {i < 5 && <ChevronRight size={13} className="text-red-500/40" />}
            </div>
          ))}
        </div>
      </div>

      {activeTab === 'pipeline' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column — Job Submission & Ingestion List */}
          <div className="space-y-4">
            {/* Submission Card */}
            <div className="glass rounded-xl p-5 border border-white/5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-200 flex items-center justify-between">
                <span>Submit Media Job</span>
                <span className="text-[10px] text-gray-500 font-mono">POST /api/jobs</span>
              </h2>

              {/* Idempotency Key Option */}
              <div>
                <label className="text-[11px] text-gray-400 flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1"><Key size={11} className="text-red-400" /> Idempotency Key (Optional):</span>
                  <button
                    type="button"
                    onClick={() => setIdempotencyKey(`key_${Date.now()}`)}
                    className="text-[10px] text-red-400 hover:underline"
                  >
                    Generate Random
                  </button>
                </label>
                <input
                  type="text"
                  placeholder="e.g. req_abc123 (prevents duplicate work)"
                  value={idempotencyKey}
                  onChange={(e) => setIdempotencyKey(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-red-500"
                />
              </div>

              {idempotencyMsg && (
                <div className="p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs flex items-center gap-2">
                  <ShieldCheck size={14} className="flex-shrink-0" />
                  <span>{idempotencyMsg.text}</span>
                </div>
              )}

              {/* File upload input */}
              <label className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-white/10 hover:border-red-500/40 cursor-pointer transition">
                <Upload size={16} className="text-gray-400" />
                <span className="text-xs text-gray-400">Select local media file…</span>
                <input ref={fileRef} type="file" className="hidden" />
              </label>

              <div className="flex gap-2">
                <button
                  onClick={handleUpload}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition"
                >
                  <Upload size={13} /> Upload & Process
                </button>
                <button
                  onClick={() => handleQuickStart()}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition border border-white/10"
                >
                  <Play size={13} /> Quick Demo
                </button>
              </div>

              {/* Error Simulation Helpers for Viva Defense */}
              <div className="pt-2 border-t border-white/5">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Viva Demo Scenarios:</span>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <button
                    onClick={() => handleQuickStart({ fileName: `unsupported_${Date.now()}.exe`, mimeType: 'application/x-msdownload' })}
                    className="p-1.5 rounded text-[10px] text-red-300 bg-red-950/30 hover:bg-red-900/40 border border-red-500/20 text-left"
                    title="Triggers permanent validation failure"
                  >
                    ⚡ Bad Type (Permanent)
                  </button>
                  <button
                    onClick={() => handleQuickStart({ fileName: `corrupted_frame_${Date.now()}.mp4`, mimeType: 'video/mp4' })}
                    className="p-1.5 rounded text-[10px] text-orange-300 bg-orange-950/30 hover:bg-orange-900/40 border border-orange-500/20 text-left"
                    title="Triggers transient timeout and bounded retries"
                  >
                    ⚡ Timeout (Retries)
                  </button>
                </div>
              </div>
            </div>

            {/* Persistent Job History List */}
            <div className="glass rounded-xl p-4 border border-white/5 space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-400 pb-2 border-b border-white/5 font-mono">
                <span>Persisted Jobs ({jobs.length})</span>
                <button onClick={loadData} className="hover:text-white transition">
                  <RefreshCw size={12} />
                </button>
              </div>
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {jobs.length === 0 ? (
                  <p className="text-gray-500 text-xs text-center py-8">No jobs persisted in database yet.</p>
                ) : (
                  jobs.map((j) => (
                    <JobCard
                      key={j.id}
                      job={j}
                      onRetry={handleRetry}
                      onSelect={setSelectedId}
                      selected={selectedId === j.id}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column — Job Details Inspector & Lifecycle Timeline */}
          <div className="lg:col-span-2">
            {!selectedJob ? (
              <div className="glass rounded-xl p-16 border border-white/5 text-center">
                <FileVideo size={48} className="mx-auto mb-4 text-gray-600" />
                <h3 className="text-white font-medium text-sm">No Job Selected</h3>
                <p className="text-gray-500 text-xs mt-1">Select any persisted job from the list or submit a new asset to inspect its live execution state.</p>
              </div>
            ) : (
              <div className="glass rounded-xl p-6 border border-white/5 space-y-6">
                {/* Job Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-white/5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">{selectedJob.fileName}</h2>
                      <span className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full ${
                        selectedJob.status === 'completed' ? 'text-green-400 bg-green-500/10 border border-green-500/30' :
                        selectedJob.status === 'failed' ? 'text-red-400 bg-red-500/10 border border-red-500/30' :
                        selectedJob.status === 'dlq' ? 'text-red-300 bg-red-900/40 border border-red-500/50' :
                        selectedJob.status === 'retrying' ? 'text-orange-400 bg-orange-500/10 border border-orange-500/30' :
                        'text-yellow-400 bg-yellow-500/10 border border-yellow-500/30'
                      }`}>
                        {selectedJob.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 font-mono mt-1">
                      <span>ID: <strong className="text-gray-400">{selectedJob.id}</strong></span>
                      <span>·</span>
                      <span>{selectedJob.mimeType}</span>
                      <span>·</span>
                      <span>{(selectedJob.fileSize / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>

                  {selectedJob.status === 'failed' && (
                    <button
                      onClick={() => handleRetry(selectedJob.id)}
                      className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition flex items-center gap-1.5 self-start md:self-auto"
                    >
                      <RotateCcw size={12} /> Retry Execution
                    </button>
                  )}
                </div>

                {/* Metadata & Attempt Counters */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <span className="text-gray-500 block">Processing Attempts:</span>
                    <span className="text-sm font-bold text-white font-mono mt-0.5">
                      {selectedJob.attemptCount} <span className="text-[10px] text-gray-500 font-normal">/ {selectedJob.maxRetries} max</span>
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <span className="text-gray-500 block">Execution Latency:</span>
                    <span className="text-sm font-bold text-purple-400 font-mono mt-0.5">
                      {selectedJob.durationMs ? `${selectedJob.durationMs}ms` : '—'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <span className="text-gray-500 block">Idempotency Key:</span>
                    <span className="text-xs font-mono text-gray-300 mt-0.5 truncate block" title={selectedJob.idempotencyKey || 'None'}>
                      {selectedJob.idempotencyKey || 'None'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <span className="text-gray-500 block">Created At:</span>
                    <span className="text-xs font-mono text-gray-300 mt-0.5 block">
                      {new Date(selectedJob.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {/* Pipeline Stage Indicators */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Function Execution Progress</h3>
                  <div className="space-y-2">
                    {STAGE_ORDER.map((s) => (
                      <StageIndicator key={s} stage={s} data={selectedJob.stages?.[s]} />
                    ))}
                  </div>
                </div>

                {/* Extracted Output Metadata */}
                {selectedJob.outputMetadata && Object.keys(selectedJob.outputMetadata).length > 0 && (
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-xs space-y-2">
                    <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-green-400" /> DynamoDB Committed Metadata Record
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 font-mono text-[11px]">
                      {Object.entries(selectedJob.outputMetadata).map(([k, v]) => {
                        if (typeof v === 'object' && v !== null) return null
                        return (
                          <div key={k} className="p-2 rounded bg-black/30 border border-white/5">
                            <span className="text-gray-500 block">{k}:</span>
                            <span className="text-gray-200">{String(v)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {selectedJob.error && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <AlertOctagon size={14} className="text-red-400" /> Error Details ({selectedJob.errorType || 'unknown'} failure)
                    </div>
                    <p className="font-mono">{selectedJob.error}</p>
                  </div>
                )}

                {/* Full Lifecycle Event Timeline (Audit Trail) */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <History size={14} className="text-red-400" /> Job Lifecycle Event Audit Log
                  </h3>
                  {eventsLoading ? (
                    <div className="text-xs text-gray-500">Loading timeline...</div>
                  ) : jobEvents.length === 0 ? (
                    <div className="text-xs text-gray-500">No events logged yet.</div>
                  ) : (
                    <div className="space-y-2 relative border-l border-white/10 ml-3 pl-4">
                      {jobEvents.map((evt) => (
                        <div key={evt.id} className="relative text-xs">
                          <span className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-[#0a0a1a] ${
                            evt.eventType === 'COMPLETED' ? 'bg-green-500' :
                            evt.eventType.includes('FAILED') || evt.eventType.includes('DLQ') ? 'bg-red-500' :
                            evt.eventType.includes('RETRY') ? 'bg-orange-500' :
                            'bg-blue-500'
                          }`} />
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-gray-200">{evt.eventType}</span>
                            <span className="text-[10px] text-gray-500 font-mono">
                              {new Date(evt.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          {evt.details && Object.keys(evt.details).length > 0 && (
                            <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                              {JSON.stringify(evt.details)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Dead-Letter Queue (DLQ) View ────────────────────────────────────── */
        <div className="space-y-6">
          <div className="glass rounded-xl p-6 border border-red-500/20 bg-red-950/10">
            <div className="flex items-center gap-3 mb-2">
              <AlertOctagon size={22} className="text-red-400" />
              <h2 className="text-lg font-bold text-white">Dead-Letter Queue (DLQ) State Store</h2>
            </div>
            <p className="text-xs text-gray-400">
              In real cloud architectures (e.g., Amazon SQS DLQ), messages that repeatedly exhaust execution retries or fail validation are isolated
              to prevent poison-pill blocking. Below are all failed jobs permanently captured in SQLite with full failure provenance.
            </p>
          </div>

          <div className="glass rounded-xl p-5 border border-white/5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400 font-mono">
                    <th className="py-3 px-3">Job ID</th>
                    <th className="py-3 px-3">File Asset</th>
                    <th className="py-3 px-3">Moved to DLQ At</th>
                    <th className="py-3 px-3">Total Attempts</th>
                    <th className="py-3 px-3">Failure Reason</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {dlqJobs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-500">
                        <CheckCircle size={32} className="mx-auto mb-2 text-green-500/50" />
                        Dead-Letter Queue is empty. No poison pill or exhausted jobs detected.
                      </td>
                    </tr>
                  ) : (
                    dlqJobs.map((item) => (
                      <tr key={item.id} className="hover:bg-white/[0.02] transition">
                        <td className="py-3 px-3 font-mono text-gray-400">{item.id.slice(0, 8)}…</td>
                        <td className="py-3 px-3 font-semibold text-white">{item.fileName}</td>
                        <td className="py-3 px-3 font-mono text-gray-500 whitespace-nowrap">
                          {new Date(item.movedToDlqAt || item.updatedAt).toLocaleTimeString()}
                        </td>
                        <td className="py-3 px-3 font-mono text-orange-400">{item.attemptsMade || item.attemptCount} / {item.maxRetries}</td>
                        <td className="py-3 px-3 text-red-300 max-w-sm truncate" title={item.failureReason || item.error}>
                          {item.failureReason || item.error}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleDlqRetry(item.id)}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition flex items-center gap-1.5 ml-auto"
                          >
                            <RotateCcw size={12} /> Retry from DLQ
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
