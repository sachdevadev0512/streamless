import { useState, useEffect } from 'react'
import { api } from '../api'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  Gauge, Play, CheckCircle, XCircle, Clock, Zap, Layers, GitCompare,
  TrendingUp, Trash2, ArrowUpRight, ArrowDownRight, Info, ShieldCheck, RefreshCw
} from 'lucide-react'

export default function Benchmarking() {
  const [benchmarks, setBenchmarks] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeRun, setActiveRun] = useState(null)
  const [statusMsg, setStatusMsg] = useState(null)

  // Configuration form state
  const [name, setName] = useState('')
  const [jobCount, setJobCount] = useState(10)
  const [mode, setMode] = useState('auto') // 'auto' | 'manual'
  const [workerCount, setWorkerCount] = useState(2)
  const [minWorkers, setMinWorkers] = useState(2)
  const [maxWorkers, setMaxWorkers] = useState(8)
  const [workloadProfile, setWorkloadProfile] = useState('moderate')
  const [seed, setSeed] = useState(42)

  // Comparison selection
  const [selectedA, setSelectedA] = useState('')
  const [selectedB, setSelectedB] = useState('')
  const [comparison, setComparison] = useState(null)
  const [comparing, setComparing] = useState(false)

  const loadBenchmarks = async () => {
    try {
      const list = await api.getBenchmarks()
      setBenchmarks(list)

      // Auto-select for comparison if available and none selected yet
      if (list.length >= 2 && (!selectedA || !selectedB)) {
        if (!selectedA) setSelectedA(list[1].id)
        if (!selectedB) setSelectedB(list[0].id)
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadBenchmarks()
    const id = setInterval(loadBenchmarks, 3000)
    return () => clearInterval(id)
  }, [])

  const handleStartBenchmark = async (e) => {
    e?.preventDefault()
    setLoading(true)
    setStatusMsg(null)
    const runName = name.trim() || `${mode === 'auto' ? 'Adaptive' : `Fixed (${workerCount}w)`} - ${workloadProfile} [N=${jobCount}]`

    try {
      const res = await api.runBenchmark({
        name: runName,
        jobCount: parseInt(jobCount),
        mode,
        workerCount: parseInt(workerCount),
        minWorkers: parseInt(minWorkers),
        maxWorkers: parseInt(maxWorkers),
        workloadProfile,
        seed: parseInt(seed) || 42,
      })
      setActiveRun(res.benchmarkId)
      setStatusMsg({ type: 'info', text: `Benchmark '${runName}' submitted! Executing deterministic workload...` })
      setName('')

      // Poll until completed
      const poll = setInterval(async () => {
        const item = await api.getBenchmark(res.benchmarkId).catch(() => null)
        if (item && item.status === 'completed') {
          clearInterval(poll)
          setActiveRun(null)
          setLoading(false)
          setStatusMsg({ type: 'success', text: `Benchmark completed! ${item.summaryText}` })
          loadBenchmarks()
        }
      }, 1000)
    } catch (err) {
      setLoading(false)
      setStatusMsg({ type: 'error', text: err.message })
    }
  }

  const handleRunComparison = async () => {
    if (!selectedA || !selectedB) return
    setComparing(true)
    try {
      const comp = await api.compareBenchmarks(selectedA, selectedB)
      setComparison(comp)
    } catch (err) {
      alert(err.message)
    } finally {
      setComparing(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this benchmark record?')) return
    await api.deleteBenchmark(id)
    if (selectedA === id) setSelectedA('')
    if (selectedB === id) setSelectedB('')
    setComparison(null)
    loadBenchmarks()
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-white">Performance Benchmarking & Analytics</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30">
            Viva Evaluator Module
          </span>
        </div>
        <p className="text-gray-400 mt-1 text-sm">
          Run controlled, reproducible workloads through the processing pipeline to measure latency percentiles (P50/P95), throughput (JPS), and compare concurrency architectures.
        </p>
      </div>

      {/* Academic Integrity Disclaimer */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/20 to-blue-950/20 border border-purple-500/20 text-xs text-purple-200 flex items-start gap-3">
        <Info size={18} className="text-purple-400 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="text-purple-300 font-semibold">Scientific Methodology: </strong>
          To ensure valid academic comparison, all benchmark runs use deterministic pseudorandom seeds so that configuration comparisons (e.g. Fixed Low vs Adaptive Scaling) execute against the <strong>identical workload profile</strong>.
          Measurements reflect actual local Node.js asynchronous pipeline execution, clearly illustrating queue saturation and elasticity principles.
        </div>
      </div>

      {/* Benchmark Runner Configuration */}
      <div className="glass rounded-xl p-6 border border-white/5 space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Gauge size={16} className="text-red-400" /> Configure Benchmark Execution
          </h2>
          <span className="text-xs text-gray-500 font-mono">POST /api/benchmarks/run</span>
        </div>

        <form onSubmit={handleStartBenchmark} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Run Name */}
          <div className="space-y-1 lg:col-span-2">
            <label className="text-gray-400 font-medium">Benchmark Label (Optional):</label>
            <input
              type="text"
              placeholder="e.g. Adaptive Scaling Spike Test #1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-gray-200 focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Job Count */}
          <div className="space-y-1">
            <label className="text-gray-400 font-medium">Workload Size (Jobs):</label>
            <select
              value={jobCount}
              onChange={(e) => setJobCount(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-gray-200 focus:outline-none focus:border-red-500"
            >
              <option value="5">5 Synthetic Jobs (Fast)</option>
              <option value="10">10 Synthetic Jobs (Standard)</option>
              <option value="20">20 Synthetic Jobs (Thorough)</option>
              <option value="35">35 Synthetic Jobs (Stress Test)</option>
            </select>
          </div>

          {/* Workload Profile */}
          <div className="space-y-1">
            <label className="text-gray-400 font-medium">Workload Profile:</label>
            <select
              value={workloadProfile}
              onChange={(e) => setWorkloadProfile(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-gray-200 focus:outline-none focus:border-red-500"
            >
              <option value="light">Light Assets (0.5MB - 5MB)</option>
              <option value="moderate">Moderate Media (5MB - 40MB)</option>
              <option value="heavy">Heavy Video (40MB - 100MB)</option>
            </select>
          </div>

          {/* Concurrency Strategy Mode */}
          <div className="space-y-1 lg:col-span-2">
            <label className="text-gray-400 font-medium">Concurrency Strategy:</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('auto')}
                className={`flex-1 py-2 px-3 rounded-lg border font-semibold transition ${
                  mode === 'auto'
                    ? 'bg-red-600/20 border-red-500 text-white'
                    : 'bg-white/5 border-white/10 text-gray-400'
                }`}
              >
                Adaptive Auto-Scaling
              </button>
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`flex-1 py-2 px-3 rounded-lg border font-semibold transition ${
                  mode === 'manual'
                    ? 'bg-yellow-600/20 border-yellow-500 text-white'
                    : 'bg-white/5 border-white/10 text-gray-400'
                }`}
              >
                Fixed Concurrency
              </button>
            </div>
          </div>

          {/* Strategy Specific Settings */}
          {mode === 'auto' ? (
            <div className="space-y-1 lg:col-span-2 flex items-center gap-4">
              <div className="flex-1">
                <span className="text-gray-400 block mb-1">Min Floor: <strong className="text-white">{minWorkers}w</strong></span>
                <input
                  type="range"
                  min="1"
                  max="4"
                  value={minWorkers}
                  onChange={(e) => setMinWorkers(e.target.value)}
                  className="w-full accent-red-600"
                />
              </div>
              <div className="flex-1">
                <span className="text-gray-400 block mb-1">Max Ceiling: <strong className="text-white">{maxWorkers}w</strong></span>
                <input
                  type="range"
                  min="4"
                  max="16"
                  value={maxWorkers}
                  onChange={(e) => setMaxWorkers(e.target.value)}
                  className="w-full accent-red-600"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1 lg:col-span-2">
              <span className="text-gray-400 block mb-1">Static Concurrency Limit: <strong className="text-yellow-400">{workerCount} workers</strong></span>
              <input
                type="range"
                min="1"
                max="10"
                value={workerCount}
                onChange={(e) => setWorkerCount(e.target.value)}
                className="w-full accent-yellow-500"
              />
            </div>
          )}

          {/* Repeatable Seed */}
          <div className="space-y-1">
            <label className="text-gray-400 font-medium">Deterministic Seed:</label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-gray-200 focus:outline-none focus:border-red-500 font-mono"
            />
          </div>

          {/* Submit Button */}
          <div className="flex items-end lg:col-span-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Clock size={14} className="animate-spin" /> Executing Pipeline Benchmark…
                </>
              ) : (
                <>
                  <Play size={14} /> Run Benchmark Suite
                </>
              )}
            </button>
          </div>
        </form>

        {statusMsg && (
          <div className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 ${
            statusMsg.type === 'error' ? 'bg-red-500/10 border border-red-500/30 text-red-300' :
            statusMsg.type === 'success' ? 'bg-green-500/10 border border-green-500/30 text-green-300' :
            'bg-blue-500/10 border border-blue-500/30 text-blue-300'
          }`}>
            <Info size={14} className="flex-shrink-0" />
            <span>{statusMsg.text}</span>
          </div>
        )}
      </div>

      {/* Side-by-Side Comparison Section */}
      <div className="glass rounded-xl p-6 border border-white/5 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <GitCompare size={18} className="text-red-400" /> Side-by-Side Architectural Comparison
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Compare two benchmark configurations to calculate throughput gains and latency reductions.</p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedA}
              onChange={(e) => setSelectedA(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none"
            >
              <option value="">Select Baseline (Run A)</option>
              {benchmarks.map((b) => (
                <option key={b.id} value={b.id}>Baseline: {b.name}</option>
              ))}
            </select>

            <span className="text-gray-500 text-xs font-bold">VS</span>

            <select
              value={selectedB}
              onChange={(e) => setSelectedB(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none"
            >
              <option value="">Select Candidate (Run B)</option>
              {benchmarks.map((b) => (
                <option key={b.id} value={b.id}>Candidate: {b.name}</option>
              ))}
            </select>

            <button
              onClick={handleRunComparison}
              disabled={!selectedA || !selectedB || comparing}
              className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition disabled:opacity-50"
            >
              {comparing ? 'Analyzing...' : 'Compare'}
            </button>
          </div>
        </div>

        {/* Comparison Results Card */}
        {comparison && (
          <div className="space-y-6">
            {/* Quantitative Delta Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Throughput */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-xs text-gray-400 block mb-1">Throughput Gain</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-white">{comparison.runB.metrics.throughputJps} j/s</span>
                  <span className={`text-xs font-semibold flex items-center ${
                    comparison.deltas.throughput.isBetter ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {comparison.deltas.throughput.percent >= 0 ? '+' : ''}{comparison.deltas.throughput.percent}%
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 font-mono">vs {comparison.runA.metrics.throughputJps} j/s</span>
              </div>

              {/* Avg Latency */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-xs text-gray-400 block mb-1">Avg Job Latency</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-purple-400">{comparison.runB.metrics.avgLatencyMs}ms</span>
                  <span className={`text-xs font-semibold flex items-center ${
                    comparison.deltas.avgLatency.isBetter ? 'text-green-400' : 'text-yellow-400'
                  }`}>
                    {comparison.deltas.avgLatency.percent}%
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 font-mono">vs {comparison.runA.metrics.avgLatencyMs}ms</span>
              </div>

              {/* P95 Latency */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-xs text-gray-400 block mb-1">95th Percentile Latency</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-purple-400">{comparison.runB.metrics.p95LatencyMs}ms</span>
                  <span className={`text-xs font-semibold flex items-center ${
                    comparison.deltas.p95Latency.isBetter ? 'text-green-400' : 'text-yellow-400'
                  }`}>
                    {comparison.deltas.p95Latency.percent}%
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 font-mono">vs {comparison.runA.metrics.p95LatencyMs}ms</span>
              </div>

              {/* Total Completion Time */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-xs text-gray-400 block mb-1">Workload Execution Time</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-white">{(comparison.runB.metrics.totalCompletionTimeMs / 1000).toFixed(1)}s</span>
                  <span className={`text-xs font-semibold flex items-center ${
                    comparison.deltas.totalTime.isBetter ? 'text-green-400' : 'text-yellow-400'
                  }`}>
                    {comparison.deltas.totalTime.percent}%
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 font-mono">vs {(comparison.runA.metrics.totalCompletionTimeMs / 1000).toFixed(1)}s</span>
              </div>
            </div>

            {/* Side-by-Side Comparison Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-white/10 rounded-lg overflow-hidden">
                <thead className="bg-white/5 text-gray-400 font-mono">
                  <tr>
                    <th className="py-2.5 px-3">Metric</th>
                    <th className="py-2.5 px-3">{comparison.runA.name} (Baseline)</th>
                    <th className="py-2.5 px-3">{comparison.runB.name} (Candidate)</th>
                    <th className="py-2.5 px-3">Relative Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="py-2.5 px-3 text-gray-400 font-medium">Architecture Mode</td>
                    <td className="py-2.5 px-3 font-mono text-gray-300 uppercase">{comparison.runA.config.mode}</td>
                    <td className="py-2.5 px-3 font-mono text-red-400 uppercase font-bold">{comparison.runB.config.mode}</td>
                    <td className="py-2.5 px-3 text-gray-400">—</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-gray-400 font-medium">Worker Allocation</td>
                    <td className="py-2.5 px-3 font-mono text-gray-300">
                      {comparison.runA.config.mode === 'auto' ? `Min ${comparison.runA.config.minWorkers} / Max ${comparison.runA.config.maxWorkers}` : `${comparison.runA.config.workerCount} fixed`}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-gray-300">
                      {comparison.runB.config.mode === 'auto' ? `Min ${comparison.runB.config.minWorkers} / Max ${comparison.runB.config.maxWorkers}` : `${comparison.runB.config.workerCount} fixed`}
                    </td>
                    <td className="py-2.5 px-3 text-gray-400">Elastic scaling</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-gray-400 font-medium">Throughput (JPS)</td>
                    <td className="py-2.5 px-3 font-mono text-gray-300">{comparison.runA.metrics.throughputJps} j/s</td>
                    <td className="py-2.5 px-3 font-mono text-green-400 font-bold">{comparison.runB.metrics.throughputJps} j/s</td>
                    <td className="py-2.5 px-3 text-green-400 font-bold">+{comparison.deltas.throughput.percent}% improvement</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-gray-400 font-medium">Average Latency</td>
                    <td className="py-2.5 px-3 font-mono text-gray-300">{comparison.runA.metrics.avgLatencyMs}ms</td>
                    <td className="py-2.5 px-3 font-mono text-purple-400">{comparison.runB.metrics.avgLatencyMs}ms</td>
                    <td className="py-2.5 px-3 text-purple-400">{comparison.deltas.avgLatency.percent}% latency shift</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-gray-400 font-medium">P95 Tail Latency</td>
                    <td className="py-2.5 px-3 font-mono text-gray-300">{comparison.runA.metrics.p95LatencyMs}ms</td>
                    <td className="py-2.5 px-3 font-mono text-purple-400">{comparison.runB.metrics.p95LatencyMs}ms</td>
                    <td className="py-2.5 px-3 text-purple-400">{comparison.deltas.p95Latency.percent}% tail latency</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-gray-400 font-medium">Avg Queue Wait</td>
                    <td className="py-2.5 px-3 font-mono text-gray-300">{comparison.runA.metrics.avgQueueWaitMs}ms</td>
                    <td className="py-2.5 px-3 font-mono text-yellow-400">{comparison.runB.metrics.avgQueueWaitMs}ms</td>
                    <td className="py-2.5 px-3 text-yellow-400">{comparison.deltas.queueWait.percent}% wait time</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Automated Academic Viva Interpretation Card */}
            <div className="p-5 rounded-xl bg-gradient-to-r from-red-950/20 to-purple-950/20 border border-red-500/30 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-2">
                <ShieldCheck size={16} /> Automated Academic Analysis (Viva Presentation Talking Point)
              </h3>
              <p className="text-xs text-gray-200 leading-relaxed font-sans">{comparison.explanation}</p>
              <p className="text-[11px] text-gray-500 italic pt-1">{comparison.disclaimer}</p>
            </div>
          </div>
        )}
      </div>

      {/* Historical Benchmark Runs Table */}
      <div className="glass rounded-xl p-5 border border-white/5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Clock size={16} className="text-red-400" /> Historical Benchmark Results ({benchmarks.length})
          </h2>
          <button onClick={loadBenchmarks} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-gray-400 font-mono">
                <th className="py-2.5 px-3">Run Name</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Mode</th>
                <th className="py-2.5 px-3">Throughput</th>
                <th className="py-2.5 px-3">Avg Latency</th>
                <th className="py-2.5 px-3">P95 Latency</th>
                <th className="py-2.5 px-3">Total Time</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {benchmarks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    No benchmark runs recorded yet. Use the configuration form above to execute your first benchmark.
                  </td>
                </tr>
              ) : (
                benchmarks.map((b) => (
                  <tr key={b.id} className="hover:bg-white/[0.02] transition">
                    <td className="py-2.5 px-3 font-semibold text-white">
                      {b.name}
                      <span className="block text-[10px] text-gray-500 font-normal">
                        N={b.config.jobCount} · {b.config.workloadProfile}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-gray-400 whitespace-nowrap">
                      {new Date(b.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        b.config.mode === 'auto' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'
                      }`}>
                        {b.config.mode}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-green-400 font-bold">
                      {b.metrics.throughputJps !== undefined ? `${b.metrics.throughputJps} j/s` : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-purple-400">
                      {b.metrics.avgLatencyMs !== undefined ? `${b.metrics.avgLatencyMs}ms` : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-purple-400 font-bold">
                      {b.metrics.p95LatencyMs !== undefined ? `${b.metrics.p95LatencyMs}ms` : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-gray-300">
                      {b.metrics.totalCompletionTimeMs !== undefined ? `${(b.metrics.totalCompletionTimeMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleDelete(b.id)}
                        className="text-gray-500 hover:text-red-400 transition p-1"
                        title="Delete record"
                      >
                        <Trash2 size={13} />
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
  )
}
