import { useState, useEffect } from 'react'
import { api } from '../api'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Activity, CheckCircle, XCircle, Clock, Cpu, ListOrdered, TrendingUp, AlertTriangle,
} from 'lucide-react'

function StatCard({ icon: Icon, label, value, sub, color = 'red' }) {
  const colors = {
    red: 'from-red-600/20 to-red-900/10 border-red-500/20 text-red-400',
    green: 'from-green-600/20 to-green-900/10 border-green-500/20 text-green-400',
    yellow: 'from-yellow-600/20 to-yellow-900/10 border-yellow-500/20 text-yellow-400',
    blue: 'from-blue-600/20 to-blue-900/10 border-blue-500/20 text-blue-400',
    purple: 'from-purple-600/20 to-purple-900/10 border-purple-500/20 text-purple-400',
    cyan: 'from-cyan-600/20 to-cyan-900/10 border-cyan-500/20 text-cyan-400',
  }
  return (
    <div className={`glass rounded-xl p-5 bg-gradient-to-br ${colors[color]} border`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-gray-400 font-medium">{label}</span>
        <Icon size={18} className="opacity-60" />
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs mt-1 text-gray-400">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null)
  const [logs, setLogs] = useState([])
  const [err, setErr] = useState(null)

  const load = () => {
    api.getMetrics().then(setMetrics).catch(e => setErr(e.message))
    api.getLogs(20).then(setLogs).catch(() => {})
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [])

  if (err) return (
    <div className="text-center py-20">
      <AlertTriangle className="mx-auto mb-4 text-red-400" size={48} />
      <p className="text-red-400 text-lg">Cannot connect to backend</p>
      <p className="text-gray-500 mt-2 text-sm">Make sure the server is running on port 3001</p>
    </div>
  )
  if (!metrics) return <div className="text-center py-20 text-gray-500">Loading dashboard…</div>

  const throughput = (metrics.throughputHistory || []).map((t, i) => ({
    name: i,
    completed: t.completed,
    failed: t.failed,
    queued: t.queued,
    active: t.active,
  }))

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Overview Dashboard</h1>
        <p className="text-gray-400 mt-1">Real-time serverless media pipeline metrics</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <StatCard icon={Activity}     label="Total Events"      value={metrics.totalEvents} color="blue" />
        <StatCard icon={CheckCircle}  label="Successful"        value={metrics.successful}  color="green" />
        <StatCard icon={XCircle}      label="Failed / DLQ"      value={metrics.failed}      color="red" />
        <StatCard icon={Clock}        label="Avg Duration"      value={`${metrics.avgProcessingTime}ms`} color="purple" />
        <StatCard icon={Cpu}          label="Worker Capacity"   value={`${metrics.scaling?.currentCapacity || 2} slots`} color="cyan" sub={`Active: ${metrics.processing || 0}`} />
        <StatCard icon={ListOrdered}  label="Queue Backlog"     value={metrics.queueLength} color="yellow" />
      </div>

      {/* Auto-Scaling Status Strip */}
      {metrics.scaling && (
        <div className="glass rounded-xl p-4 border border-white/5 mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-gradient-to-r from-red-950/20 to-purple-950/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">Adaptive Auto-Scaling Engine</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-red-500/20 text-red-300">
                  {metrics.scaling.mode} Mode
                </span>
                <span className="text-[10px] text-gray-500">Floor: {metrics.scaling.minWorkers} · Ceiling: {metrics.scaling.maxWorkers}</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{metrics.scaling.lastDecision?.reason}</p>
            </div>
          </div>
          <div className="text-xs text-gray-400 font-mono self-end md:self-center">
            Simulated Capacity: <strong className="text-white">{metrics.scaling.currentCapacity}</strong> workers
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="glass rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-red-400" /> Throughput Over Time
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={throughput}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
              <XAxis dataKey="name" tick={false} />
              <YAxis stroke="#444" fontSize={11} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8 }} />
              <Line type="monotone" dataKey="completed" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="glass rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Activity size={16} className="text-red-400" /> Queue & Active Functions
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={throughput.slice(-20)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
              <XAxis dataKey="name" tick={false} />
              <YAxis stroke="#444" fontSize={11} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8 }} />
              <Bar dataKey="active" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="queued" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent logs */}
      <div className="glass rounded-xl p-5 border border-white/5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Recent Activity</h2>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {logs.length === 0 && <p className="text-gray-500 text-sm">No activity yet. Submit a job to get started.</p>}
          {logs.map(log => (
            <div key={log.id} className="flex items-start gap-3 text-xs py-1.5 border-b border-white/5 last:border-0">
              <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                log.level === 'error' ? 'bg-red-500' : log.level === 'warn' ? 'bg-yellow-500' : 'bg-green-500'
              }`} />
              <span className="text-gray-500 w-36 flex-shrink-0 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span className="text-gray-400 w-28 flex-shrink-0 font-medium">{log.source}</span>
              <span className="text-gray-300">{log.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* System health */}
      <div className="mt-6 flex items-center gap-2 text-xs text-gray-500">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse-dot" />
        System healthy — data refreshes every 3 seconds
      </div>
    </div>
  )
}
