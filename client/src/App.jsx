import { useState } from 'react'
import {
  LayoutDashboard, Workflow, Activity, TrendingUp,
  Network, BookOpen, GitCompare, Menu, X, Zap, Gauge,
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Pipeline from './pages/Pipeline'
import FunctionMonitor from './pages/FunctionMonitor'
import AutoScaling from './pages/AutoScaling'
import Benchmarking from './pages/Benchmarking'
import Architecture from './pages/Architecture'
import Research from './pages/Research'
import Comparison from './pages/Comparison'

const NAV = [
  { id: 'dashboard',    label: 'Dashboard',             icon: LayoutDashboard },
  { id: 'pipeline',     label: 'Media Pipeline & DLQ',  icon: Workflow },
  { id: 'monitor',      label: 'Function Monitor',       icon: Activity },
  { id: 'scaling',      label: 'Auto-Scaling Engine',   icon: TrendingUp },
  { id: 'benchmarking', label: 'Benchmarking Suite',     icon: Gauge },
  { id: 'architecture', label: 'Architecture',         icon: Network },
  { id: 'research',     label: 'Research & Case Study', icon: BookOpen },
  { id: 'comparison',   label: 'Serverless vs Traditional', icon: GitCompare },
]

const PAGES = {
  dashboard: Dashboard,
  pipeline: Pipeline,
  monitor: FunctionMonitor,
  scaling: AutoScaling,
  benchmarking: Benchmarking,
  architecture: Architecture,
  research: Research,
  comparison: Comparison,
}

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const Page = PAGES[page]

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a1a]">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-16'} flex-shrink-0 transition-all duration-300 bg-[#0d0d20] border-r border-white/5 flex flex-col`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-white/5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center flex-shrink-0">
            <Zap size={18} className="text-white" />
          </div>
          {sidebarOpen && (
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
              Streamless
            </span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                ${page === id
                  ? 'bg-red-600/15 text-red-400 shadow-[inset_0_0_0_1px_rgba(229,9,20,0.25)]'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {sidebarOpen && <span>{label}</span>}
            </button>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="h-12 flex items-center justify-center border-t border-white/5 text-gray-500 hover:text-gray-300 transition"
        >
          {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          <Page />
        </div>
      </main>
    </div>
  )
}
