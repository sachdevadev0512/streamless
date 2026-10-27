import { Cloud, Database, Mail, Monitor, Server, Upload, ArrowRight, Zap } from 'lucide-react'

const NODES = [
  { id: 'user',    label: 'User / Client',        aws: '—',                   icon: Monitor,  desc: 'End user uploads media content' },
  { id: 'storage', label: 'Object Storage',        aws: 'Amazon S3',           icon: Upload,   desc: 'Stores uploaded media files and triggers events on write' },
  { id: 'event',   label: 'Event Trigger',         aws: 'Amazon EventBridge',  icon: Zap,      desc: 'Detects new objects and routes events to the queue' },
  { id: 'queue',   label: 'Message Queue',         aws: 'Amazon SQS',         icon: Mail,      desc: 'Buffers events for reliable, ordered delivery to functions' },
  { id: 'lambda',  label: 'Serverless Functions',  aws: 'AWS Lambda',         icon: Server,    desc: 'Stateless compute units that execute pipeline stages' },
  { id: 'db',      label: 'Results Database',      aws: 'Amazon DynamoDB',    icon: Database,  desc: 'Persists processing results and metadata' },
  { id: 'monitor', label: 'Monitoring Dashboard',  aws: 'Amazon CloudWatch',  icon: Monitor,   desc: 'Tracks invocations, errors, and latency metrics' },
]

export default function Architecture() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Architecture Explorer</h1>
        <p className="text-gray-400 mt-1">Visual reference architecture for the event-driven serverless media pipeline</p>
      </div>

      {/* Architecture flow */}
      <div className="glass rounded-xl p-8 border border-white/5 mb-8 overflow-x-auto">
        <div className="flex items-center gap-3 min-w-[900px]">
          {NODES.map((node, i) => {
            const Icon = node.icon
            return (
              <div key={node.id} className="flex items-center gap-3">
                <div className="w-32 text-center group">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-red-600/20 to-red-900/10 border border-red-500/20 flex items-center justify-center mb-2 group-hover:border-red-500/50 group-hover:shadow-lg group-hover:shadow-red-600/10 transition-all duration-300">
                    <Icon size={24} className="text-red-400" />
                  </div>
                  <p className="text-xs font-semibold text-white leading-tight">{node.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{node.aws}</p>
                </div>
                {i < NODES.length - 1 && (
                  <ArrowRight size={18} className="text-red-500/40 flex-shrink-0" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Node details */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {NODES.map(node => {
          const Icon = node.icon
          return (
            <div key={node.id} className="glass rounded-xl p-5 border border-white/5 hover:border-red-500/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-red-600/10 flex items-center justify-center">
                  <Icon size={16} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{node.label}</h3>
                  {node.aws !== '—' && <p className="text-[10px] text-red-400/70 font-mono">{node.aws}</p>}
                </div>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{node.desc}</p>
            </div>
          )
        })}
      </div>

      {/* Disclaimers */}
      <div className="glass rounded-xl p-6 border border-white/5">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Important Notes</h2>
        <ul className="text-sm text-gray-400 space-y-2 list-disc list-inside">
          <li>This diagram is a <strong className="text-gray-200">reference architecture mapping</strong>. The application runs entirely locally and does not connect to AWS.</li>
          <li>AWS service names are shown to illustrate which managed services would fulfill each role in a production deployment.</li>
          <li>The research paper by Pogiatzis & Samakovitis (2021) uses a similar event-driven pipeline pattern for ETL workloads on AWS. This project adapts that pattern to a media-processing scenario.</li>
          <li>In production, services like S3 event notifications and SQS provide decoupling and fault tolerance that are simulated here with in-memory queues and timers.</li>
        </ul>
      </div>

      {/* Data flow */}
      <div className="mt-6 glass rounded-xl p-6 border border-white/5">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Data Flow</h2>
        <div className="space-y-3 text-sm text-gray-400">
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
            <p>User uploads a media file through the web interface. The file is sent to the backend via a multipart POST request.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
            <p>The upload triggers an event that places a processing job onto the internal message queue.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
            <p>The queue dispatcher assigns jobs to available serverless function slots (bounded by concurrency limit).</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
            <p>Each job passes through five pipeline stages: Validate → Extract Metadata → Process → Save → Notify.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center text-xs font-bold flex-shrink-0">5</span>
            <p>Results and execution logs are stored in-memory and exposed via the monitoring dashboard and API.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
