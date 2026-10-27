import { useState, useEffect } from 'react'
import { api } from '../api'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  Rocket, Activity, CheckCircle, XCircle, Clock, Layers, Sliders, Cpu, ShieldAlert,
  ArrowUpRight, ArrowDownRight, PauseCircle, RefreshCw, Info, Zap
} from 'lucide-react'

export default function AutoScaling() {
  const [selected, setSelected] = useState(null)
  const [trafficCount, setTrafficCount] = useState(15)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [scalingStatus, setScalingStatus] = useState(null)
  const [scalingEvents, setScalingEvents] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [history, setHistory] = useState([])

  // Configuration form state
  const [mode, setMode] = useState('auto')
  const [minWorkers, setMinWorkers] = useState(2)
  const [maxWorkers, setMaxWorkers] = useState(10)
  const [manualCapacity, setManualCapacity] = useState(4)
  const [configSaving, setConfigSaving] = useState(false)
  const [configMsg, setConfigMsg] = useState(null)

  const loadData = async () => {
    try {
      const [m, s, evts] = await Promise.all([
        api.getMetrics().catch(() => null),
        api.getScalingStatus().catch(() => null),
        api.getScalingEvents(20).catch(() => []),
      ])
      if (m) {
        setMetrics(m)
        setHistory(m.throughputHistory || [])
      }
      if (s) {
        setScalingStatus(s)
        // sync form defaults on initial load if not dirty
        if (!configSaving) {
          setMode(s.mode || 'auto')
          setMinWorkers(s.minWorkers || 2)
          setMaxWorkers(s.maxWorkers || 10)
          setManualCapacity(s.currentCapacity || 4)
        }
      }
      if (evts) {
        setScalingEvents(evts)
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadData()
    const id = setInterval(loadData, 1500)
    return () => clearInterval(id)
  }, [])

  const handleSaveConfig = async (e) => {
    e?.preventDefault()
    setConfigSaving(true)
    setConfigMsg(null)
    try {
      const payload = mode === 'manual'
        ? { mode: 'manual', manualCapacity }
        : { mode: 'auto', minWorkers, maxWorkers }
      const updated = await api.updateScalingConfig(payload)
      setScalingStatus(updated)
      setConfigMsg({ type: 'success', text: `Config applied: ${updated.mode.toUpperCase()} mode (Capacity: ${updated.currentCapacity})` })
    } catch (err) {
      setConfigMsg({ type: 'error', text: err.message })
    } finally {
      setConfigSaving(false)
      loadData()
    }
  }

  const simulate = async (count) => {
    setSelected(count)
    setRunning(true)
    setResult(null)
    try {
      const r = await api.simulateTraffic(count)
      setResult(r)
      loadData()
    } catch (e) {
      setResult({ error: e.message })
    }
    setRunning(false)
  }

  const chartData = history.map((h, i) => ({
    t: i,
    completed: h.completed,
    failed: h.failed,
    active: h.active,
    queued: h.queued,
    capacity: h.capacity || 2,
  }))

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-white">Adaptive Auto-Scaling Engine</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
            Simulated Workers
          </span>
        </div>
        <p className="text-gray-400 mt-1">
          Workload-responsive concurrency engine with real-time queue monitoring, cooldown bounds, and anti-oscillation protection.
        </p>
      </div>

      {/* Educational Notice Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/20 flex items-start gap-3 text-xs text-blue-200">
        <Info size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="text-blue-300 font-semibold">Simulated Worker Architecture: </strong>
          To ensure 100% free, safe local execution without cloud subscription costs, workers are modeled as managed asynchronous worker slots on the server event loop.
          The engine dynamically resizes the active concurrency pool based on real queue depth and arrival latency.
        </div>
      </div>

      {/* Latest Scaling Decision Banner */}
      {scalingStatus && scalingStatus.lastDecision && (
        <div className="glass rounded-xl p-5 border border-white/10 bg-[#0d0d26]/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              scalingStatus.lastDecision.action === 'SCALE_UP' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
              scalingStatus.lastDecision.action === 'SCALE_DOWN' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
              scalingStatus.lastDecision.action === 'COOLDOWN' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
              'bg-gray-500/20 text-gray-400 border border-white/10'
            }`}>
              {scalingStatus.lastDecision.action === 'SCALE_UP' ? <ArrowUpRight size={22} /> :
               scalingStatus.lastDecision.action === 'SCALE_DOWN' ? <ArrowDownRight size={22} /> :
               scalingStatus.lastDecision.action === 'COOLDOWN' ? <Clock size={20} /> :
               <Activity size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-gray-400">Latest Engine Decision</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  scalingStatus.lastDecision.action === 'SCALE_UP' ? 'bg-green-500/20 text-green-300' :
                  scalingStatus.lastDecision.action === 'SCALE_DOWN' ? 'bg-blue-500/20 text-blue-300' :
                  scalingStatus.lastDecision.action === 'COOLDOWN' ? 'bg-yellow-500/20 text-yellow-300' :
                  'bg-white/10 text-gray-300'
                }`}>
                  {scalingStatus.lastDecision.action}
                </span>
                <span className="text-[11px] text-gray-500 font-mono">
                  {new Date(scalingStatus.lastDecision.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm text-gray-200 mt-1 font-medium">{scalingStatus.lastDecision.reason}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-gray-400 self-end md:self-center">
            <div>Mode: <strong className="text-white uppercase">{scalingStatus.mode}</strong></div>
            <div>Capacity: <strong className="text-red-400 text-base">{scalingStatus.currentCapacity}</strong> workers</div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <Cpu size={15} className="text-red-400" />
            <span className="text-xs text-gray-400">Current Capacity</span>
          </div>
          <div className="text-2xl font-bold text-white flex items-baseline gap-2">
            {scalingStatus ? scalingStatus.currentCapacity : '—'}
            <span className="text-xs text-gray-500 font-normal">slots</span>
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            Floor: {scalingStatus?.minWorkers || 2} · Ceiling: {scalingStatus?.maxWorkers || 10}
          </div>
        </div>

        <div className="glass rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={15} className="text-purple-400" />
            <span className="text-xs text-gray-400">Active Workers</span>
          </div>
          <div className="text-2xl font-bold text-purple-400">
            {scalingStatus ? scalingStatus.activeWorkers : 0}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            Utilization: {scalingStatus?.currentCapacity ? Math.round((scalingStatus.activeWorkers / scalingStatus.currentCapacity) * 100) : 0}%
          </div>
        </div>

        <div className="glass rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <Layers size={15} className="text-yellow-400" />
            <span className="text-xs text-gray-400">Queued Backlog</span>
          </div>
          <div className="text-2xl font-bold text-yellow-400">
            {scalingStatus ? scalingStatus.queuedJobs : 0}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            Avg Wait: {scalingStatus?.avgWaitTimeMs ? `${scalingStatus.avgWaitTimeMs}ms` : '0ms'}
          </div>
        </div>

        <div className="glass rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={15} className="text-green-400" />
            <span className="text-xs text-gray-400">Completion Rate</span>
          </div>
          <div className="text-2xl font-bold text-green-400">
            {scalingStatus?.completionRate ? `${scalingStatus.completionRate} j/s` : '0 j/s'}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            Rolling 10-second throughput
          </div>
        </div>
      </div>

      {/* Main Controls Grid: Mode Config + Traffic Generator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scaling Mode & Threshold Controls */}
        <div className="glass rounded-xl p-6 border border-white/5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                <Sliders size={16} className="text-red-400" /> Auto-Scaling Configuration
              </h2>
              <span className="text-xs text-gray-500 font-mono">Live Engine Controls</span>
            </div>

            {/* Mode Switcher */}
            <div className="flex p-1 rounded-lg bg-black/40 border border-white/10 mb-5">
              <button
                type="button"
                onClick={() => setMode('auto')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition ${
                  mode === 'auto'
                    ? 'bg-red-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Adaptive Auto-Scaling
              </button>
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition ${
                  mode === 'manual'
                    ? 'bg-red-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Manual Fixed Concurrency
              </button>
            </div>

            {mode === 'auto' ? (
              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex justify-between text-gray-300 mb-1">
                    <span>Minimum Worker Floor:</span>
                    <span className="font-bold text-red-400">{minWorkers} workers</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="6"
                    value={minWorkers}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      setMinWorkers(val)
                      if (val > maxWorkers) setMaxWorkers(val)
                    }}
                    className="w-full accent-red-600 cursor-pointer"
                  />
                  <span className="text-[10px] text-gray-500">Minimum baseline capacity maintained when idle</span>
                </div>

                <div>
                  <div className="flex justify-between text-gray-300 mb-1">
                    <span>Maximum Worker Ceiling:</span>
                    <span className="font-bold text-red-400">{maxWorkers} workers</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="20"
                    value={maxWorkers}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      setMaxWorkers(val)
                      if (val < minWorkers) setMinWorkers(val)
                    }}
                    className="w-full accent-red-600 cursor-pointer"
                  />
                  <span className="text-[10px] text-gray-500">Maximum upper bound during high burst traffic</span>
                </div>

                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5 text-[11px] text-gray-400 space-y-1">
                  <div>• Scale-Up Threshold: Queue backlog ≥ 3 jobs or wait time ≥ 2.5s</div>
                  <div>• Anti-Flapping Cooldown: 3s scale-up cooldown, 5s scale-down idle observation</div>
                  <div>• Elastic Step Size: Up to +2 workers on spike, -1 worker on gradual drain</div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex justify-between text-gray-300 mb-1">
                    <span>Fixed Worker Concurrency:</span>
                    <span className="font-bold text-yellow-400">{manualCapacity} workers</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    value={manualCapacity}
                    onChange={(e) => setManualCapacity(parseInt(e.target.value))}
                    className="w-full accent-yellow-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-gray-500">Fixed static worker allocation without dynamic auto-scaling</span>
                </div>
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-[11px]">
                  Manual mode demonstrates traditional static server allocation: capacity does not expand during traffic spikes, causing queue backlog to accumulate.
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
            <button
              onClick={handleSaveConfig}
              disabled={configSaving}
              className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition disabled:opacity-50"
            >
              {configSaving ? 'Saving...' : 'Apply Scaling Policy'}
            </button>
            {configMsg && (
              <span className={`text-xs ${configMsg.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                {configMsg.text}
              </span>
            )}
          </div>
        </div>

        {/* Traffic Spike Generator */}
        <div className="glass rounded-xl p-6 border border-white/5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
              <Rocket size={16} className="text-red-400" /> Trigger Workload Burst
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Inject synthetic video events into the queue to observe the engine's scaling decision, latency impact, and cooldown behavior.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {[10, 25, 50].map((count) => (
                <button
                  key={count}
                  onClick={() => simulate(count)}
                  disabled={running}
                  className={`p-3 rounded-xl border text-center transition ${
                    selected === count
                      ? 'bg-red-600/20 border-red-500 text-white shadow-lg shadow-red-600/10'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                  } disabled:opacity-50`}
                >
                  <div className="text-lg font-bold text-white">+{count}</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Jobs Spike</div>
                </button>
              ))}
            </div>

            {running && (
              <div className="flex items-center gap-2 text-yellow-400 text-xs py-2">
                <Clock size={14} className="animate-spin" /> Ingesting synthetic traffic into pipeline…
              </div>
            )}

            {result && !result.error && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <CheckCircle size={14} className="text-green-400" /> Ingested {result.generated} jobs
                </span>
                <span className="text-gray-400">
                  Queue: <strong className="text-yellow-300">{result.queued}</strong> · Active: <strong className="text-purple-300">{result.active}</strong>
                </span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 text-[11px] text-gray-500">
            Compare: Run +25 jobs in <strong>Manual Mode (Fixed: 2)</strong> vs <strong>Adaptive Mode (Min: 2, Max: 10)</strong> to observe queue clearance speed.
          </div>
        </div>
      </div>

      {/* Synchronized Real-Time Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Worker Capacity vs Queue Depth */}
        <div className="glass rounded-xl p-5 border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              <Activity size={16} className="text-red-400" /> Capacity vs. Queue Depth
            </h2>
            <span className="text-[11px] text-gray-500">Workload Response</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData.slice(-30)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
              <XAxis dataKey="t" tick={false} stroke="#444" />
              <YAxis stroke="#555" fontSize={11} />
              <Tooltip contentStyle={{ background: '#121226', border: '1px solid #333', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
              <Line type="stepAfter" dataKey="capacity" stroke="#ef4444" strokeWidth={2.5} name="Worker Capacity" dot={false} />
              <Line type="monotone" dataKey="active" stroke="#8b5cf6" strokeWidth={2} name="Active Workers" dot={false} />
              <Line type="monotone" dataKey="queued" stroke="#f59e0b" strokeWidth={2} name="Queue Backlog" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Throughput & Completed Events */}
        <div className="glass rounded-xl p-5 border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              <CheckCircle size={16} className="text-green-400" /> Cumulative Event Throughput
            </h2>
            <span className="text-[11px] text-gray-500">Completed vs Failed</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData.slice(-30)}>
              <defs>
                <linearGradient id="colorComp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
              <XAxis dataKey="t" tick={false} stroke="#444" />
              <YAxis stroke="#555" fontSize={11} />
              <Tooltip contentStyle={{ background: '#121226', border: '1px solid #333', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
              <Area type="monotone" dataKey="completed" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorComp)" name="Completed Events" />
              <Area type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={1.5} fillOpacity={0} name="Failed / DLQ" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Scaling Events Audit Log */}
      <div className="glass rounded-xl p-5 border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Clock size={16} className="text-red-400" /> Scaling Decision History & Audit Trail
          </h2>
          <span className="text-xs text-gray-500 font-mono">SQLite Persisted Log</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-gray-400 font-mono">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Capacity Transition</th>
                <th className="py-2.5 px-3">Queue / Active</th>
                <th className="py-2.5 px-3">Decision Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {scalingEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">
                    No scaling events recorded yet. Trigger a traffic spike to observe decisions.
                  </td>
                </tr>
              ) : (
                scalingEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-white/[0.02] transition">
                    <td className="py-2.5 px-3 font-mono text-gray-500 whitespace-nowrap">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        evt.action === 'SCALE_UP' ? 'bg-green-500/20 text-green-400' :
                        evt.action === 'SCALE_DOWN' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {evt.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-gray-300">
                      <span className="text-gray-500">{evt.previousCapacity}</span> → <strong className="text-white">{evt.newCapacity}</strong> workers
                    </td>
                    <td className="py-2.5 px-3 text-gray-400 font-mono">
                      Q: <span className="text-yellow-400">{evt.queueDepth}</span> · A: <span className="text-purple-400">{evt.activeWorkers}</span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-300 max-w-md truncate" title={evt.reason}>
                      {evt.reason}
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
