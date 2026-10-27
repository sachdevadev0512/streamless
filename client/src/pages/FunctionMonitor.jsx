import { useState, useEffect } from 'react'
import { api } from '../api'
import { Play, CheckCircle, XCircle, Clock, Zap } from 'lucide-react'

const FN_META = {
  validateMedia:        { trigger: 'S3 PutObject', desc: 'Validates file type and integrity' },
  extractMetadata:      { trigger: 'Validation Complete', desc: 'Extracts codec, resolution, duration' },
  processMedia:         { trigger: 'Metadata Ready', desc: 'Simulated transcoding to multi-bitrate HLS' },
  saveResults:          { trigger: 'Processing Complete', desc: 'Persists output references to database' },
  generateNotification: { trigger: 'Results Saved', desc: 'Sends completion notification' },
}

export default function FunctionMonitor() {
  const [functions, setFunctions] = useState([])
  const [invoking, setInvoking] = useState(null)

  const load = () => api.getFunctions().then(setFunctions).catch(() => {})

  useEffect(() => {
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [])

  const invoke = async (name) => {
    setInvoking(name)
    try {
      await api.invokeFunction(name)
    } catch (e) {
      console.error(e)
    }
    setInvoking(null)
    load()
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Serverless Function Monitor</h1>
        <p className="text-gray-400 mt-1">Monitor and manually invoke simulated Lambda-style functions</p>
      </div>

      <div className="space-y-4">
        {functions.map(fn => {
          const meta = FN_META[fn.name] || {}
          const successRate = fn.invocations > 0 ? ((fn.successes / fn.invocations) * 100).toFixed(1) : '—'
          return (
            <div key={fn.name} className="glass rounded-xl border border-white/5 overflow-hidden">
              {/* Header */}
              <div className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-600/30 to-red-900/20 flex items-center justify-center flex-shrink-0">
                  <Zap size={18} className="text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold font-mono text-sm">{fn.name}()</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{meta.desc}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <div className="text-center">
                    <div className="text-lg font-bold text-white">{fn.invocations}</div>
                    <div>Invocations</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-400">{successRate}%</div>
                    <div>Success</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-purple-400">{fn.avgDuration}ms</div>
                    <div>Avg Duration</div>
                  </div>
                </div>
                <button
                  onClick={() => invoke(fn.name)}
                  disabled={invoking === fn.name}
                  className="ml-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium transition"
                >
                  {invoking === fn.name ? <Clock size={14} className="animate-spin" /> : <Play size={14} />}
                  Invoke
                </button>
              </div>

              {/* Trigger badge */}
              <div className="px-5 pb-2 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-500">Trigger:</span>
                <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-400">{meta.trigger}</span>
                {fn.lastRun && (
                  <>
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 ml-4">Last run:</span>
                    <span className="text-xs text-gray-400">{new Date(fn.lastRun).toLocaleTimeString()}</span>
                  </>
                )}
              </div>

              {/* Recent logs */}
              {fn.logs.length > 0 && (
                <div className="border-t border-white/5 px-5 py-3">
                  <h4 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Recent Executions</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {fn.logs.map((l, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {l.success ? <CheckCircle size={10} className="text-green-500" /> : <XCircle size={10} className="text-red-500" />}
                        <span className="text-gray-500 font-mono">{new Date(l.timestamp).toLocaleTimeString()}</span>
                        <span className="text-gray-400">{l.duration}ms</span>
                        <span className="text-gray-500 truncate">{l.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {functions.length === 0 && (
        <div className="text-center py-20 text-gray-500">Loading functions…</div>
      )}
    </div>
  )
}
