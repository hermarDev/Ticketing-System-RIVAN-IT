import { Suspense, lazy } from 'react'
import { FloatingThemeToggle } from '../shared/components/FloatingThemeToggle'
import { ErrorBoundary } from '../shared/components/ErrorBoundary'
import '../styles/app.css'

const AdminPortalPage = lazy(() =>
  import('../features/admin/AdminPortalPage').then((module) => ({
    default: module.AdminPortalPage,
  }))
)

export function OpsApp() {
  const handleReturnToClient = () => {
    window.location.href = '/'
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-200">
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center text-sm font-bold text-[var(--muted)]">
              Loading operations desk...
            </div>
          }
        >
          <AdminPortalPage onReturnToClientPortal={handleReturnToClient} />
        </Suspense>
        <FloatingThemeToggle />
      </div>
    </ErrorBoundary>
  )
}
