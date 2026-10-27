import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts'
import { GitCompare, Server, Cloud, Info } from 'lucide-react'

const DIMENSIONS = [
  {
    aspect: 'Infrastructure Management',
    traditional: 'Requires provisioning, patching, and managing servers (physical or virtual). Teams must monitor OS updates, security patches, and capacity.',
    serverless: 'Fully managed by the cloud provider. No servers to provision or maintain. Developers focus entirely on application code.',
    tradScore: 3,
    servScore: 9,
  },
  {
    aspect: 'Event-Driven Execution',
    traditional: 'Requires custom polling or message-consumer services running continuously to detect and process events.',
    serverless: 'Native event-driven model. Functions execute automatically in response to events from integrated cloud services.',
    tradScore: 4,
    servScore: 9,
  },
  {
    aspect: 'Scaling',
    traditional: 'Manual or auto-scaling based on predefined rules. Scaling takes minutes. Risk of over/under-provisioning.',
    serverless: 'Instant, automatic scaling from zero to thousands of concurrent executions. No capacity planning needed.',
    tradScore: 5,
    servScore: 9,
  },
  {
    aspect: 'Idle Capacity',
    traditional: 'Servers run continuously regardless of load. Significant cost during low-traffic periods.',
    serverless: 'Zero cost when idle. Functions exist only during execution. True pay-per-use model.',
    tradScore: 3,
    servScore: 10,
  },
  {
    aspect: 'Operational Complexity',
    traditional: 'Higher operational burden: monitoring, logging, deployment pipelines, server management, networking.',
    serverless: 'Reduced ops overhead. Built-in monitoring (CloudWatch), managed deployments, no networking configuration.',
    tradScore: 4,
    servScore: 8,
  },
  {
    aspect: 'Fault Handling',
    traditional: 'Requires manual implementation of retry logic, circuit breakers, and health checks.',
    serverless: 'Built-in retry policies, dead-letter queues, and automatic failover across availability zones.',
    tradScore: 5,
    servScore: 8,
  },
  {
    aspect: 'Cost Model',
    traditional: 'Fixed cost based on provisioned resources, regardless of actual utilization. Predictable but often wasteful.',
    serverless: 'Variable cost based on invocation count and execution duration. Highly efficient for bursty workloads but can be expensive at sustained high throughput.',
    tradScore: 5,
    servScore: 8,
  },
]

const radarData = DIMENSIONS.map(d => ({
  aspect: d.aspect.split(' ')[0],
  Traditional: d.tradScore,
  Serverless: d.servScore,
}))

const barData = DIMENSIONS.map(d => ({
  name: d.aspect.length > 15 ? d.aspect.slice(0, 14) + '…' : d.aspect,
  Traditional: d.tradScore,
  Serverless: d.servScore,
}))

export default function Comparison() {
  const [selected, setSelected] = useState(0)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Serverless vs Traditional Cloud</h1>
        <p className="text-gray-400 mt-1">Interactive comparison of architectural approaches</p>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20 mb-8 text-sm text-yellow-200/80">
        <Info size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
        <p>The scores and comparisons below are <strong>illustrative and hypothetical</strong>, intended to convey general industry understanding. They do not represent measured benchmarks or Netflix-specific data.</p>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="glass rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <GitCompare size={16} className="text-red-400" /> Score Comparison
          </h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={barData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
              <XAxis type="number" domain={[0, 10]} stroke="#444" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="#444" fontSize={10} width={100} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="Traditional" fill="#6366f1" radius={[0, 4, 4, 0]} />
              <Bar dataKey="Serverless" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <GitCompare size={16} className="text-red-400" /> Radar View
          </h2>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#1e1e3a" />
              <PolarAngleAxis dataKey="aspect" tick={{ fill: '#888', fontSize: 10 }} />
              <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fill: '#555', fontSize: 9 }} />
              <Radar name="Traditional" dataKey="Traditional" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
              <Radar name="Serverless" dataKey="Serverless" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed comparison table */}
      <div className="glass rounded-xl border border-white/5 overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr] text-xs font-semibold text-gray-400 uppercase tracking-wider bg-white/[0.03] border-b border-white/5">
          <div className="p-4">Aspect</div>
          <div className="p-4 flex items-center gap-2"><Server size={12} /> Traditional</div>
          <div className="p-4 flex items-center gap-2"><Cloud size={12} /> Serverless</div>
        </div>
        {DIMENSIONS.map((d, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`w-full grid grid-cols-[1fr_1fr_1fr] text-sm border-b border-white/5 last:border-0 transition ${
              selected === i ? 'bg-red-600/5' : 'hover:bg-white/[0.02]'
            }`}
          >
            <div className="p-4 text-left font-medium text-white">{d.aspect}</div>
            <div className="p-4 text-left text-gray-400">{d.traditional}</div>
            <div className="p-4 text-left text-gray-400">{d.serverless}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
