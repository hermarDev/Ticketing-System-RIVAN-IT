import React from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('NetOps Application Exception Caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
          <div className="size-16 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 shadow-lg animate-pulse">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-tight mb-2">
            Something went wrong rendering this view
          </h2>
          <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
            An unexpected error occurred ({this.state.error?.message || 'State mismatch'}). Click below to recover the session seamlessly.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            <RefreshCw size={15} />
            <span>Reload &amp; Reset Workspace</span>
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
