import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Benefits } from '../features/landing/sections/Benefits'
import { Cta } from '../features/landing/sections/Cta'
import { Faq } from '../features/landing/sections/Faq'
import { FeatureGrid } from '../features/landing/sections/FeatureGrid'
import { Hero } from '../features/landing/sections/Hero'
import { Products } from '../features/landing/sections/Products'
import { Testimonials } from '../features/landing/sections/Testimonials'
import { TicketPreview } from '../features/landing/sections/TicketPreview'
import { Workflow } from '../features/landing/sections/Workflow'
import { AccountModal } from '../features/inquiries/components/AccountModal'
import { TicketModal } from '../features/inquiries/components/TicketModal'
import { ClientPortalModal } from '../features/auth/components/ClientPortalModal'
import { ClientLoginModal } from '../features/auth/components/ClientLoginModal'
import { PasswordRecoveryModal } from '../features/auth/components/PasswordRecoveryModal'
import { Footer } from '../layout/Footer'
import { Navbar } from '../layout/Navbar'
import { ErrorBoundary } from '../shared/components/ErrorBoundary'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { syncOAuthUser, getCurrentClientSession, saveCurrentClientSession, mergeClientAccountProfiles } from '../lib/ticketService'
import { ClientDashboardPage } from '../features/client/ClientDashboardPage'
import { FloatingThemeToggle } from '../shared/components/FloatingThemeToggle'
import '../styles/app.css'

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isTicketOpen, setIsTicketOpen] = useState(false)
  const [isClientPortalOpen, setIsClientPortalOpen] = useState(false)
  const [isPasswordRecoveryOpen, setIsPasswordRecoveryOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState(0)
  const [clientAccount, setClientAccountState] = useState(() => getCurrentClientSession())
  const [transitionAccount, setTransitionAccount] = useState(null)
  const [isGoogleUser, setIsGoogleUser] = useState(false)

  const setClientAccount = useCallback((acc) => {
    saveCurrentClientSession(acc)
    setClientAccountState(acc)
  }, [])

  // Auto-detect and sync Google OAuth sessions & recovery state
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return

    let isSubscribed = true

    const isOAuthReturn =
      window.location.hash.includes('access_token') ||
      window.location.search.includes('code')

    // Detect recovery link in URL on mount
    if (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery')) {
      setIsPasswordRecoveryOpen(true)
    }

    // Auth state change listener (runs in background without blocking rendering)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isSubscribed) return

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecoveryOpen(true)
        return
      }

      if (session?.user) {
        // Check if user is a Staff/Admin/CEO member first
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle()

        if (profile && ['staff', 'admin', 'ceo'].includes(profile.role)) {
          // Staff member: Do NOT set client account!
          return
        }

        const synced = await syncOAuthUser(session.user)
        if (!synced || !isSubscribed) return

        const currentSession = getCurrentClientSession()
        const account = mergeClientAccountProfiles(currentSession, synced)
        if (!account) return

        setIsGoogleUser(session.user?.app_metadata?.provider === 'google')
        setIsLoginOpen(false)
        setIsAccountOpen(false)

        if (!currentSession) {
          setTransitionAccount(account)
          setTimeout(() => {
            const latest = mergeClientAccountProfiles(getCurrentClientSession(), account)
            if (latest) setClientAccount(latest)
            setTransitionAccount(null)
          }, 1800)
        } else {
          setClientAccount(account)
        }

        if (event === 'SIGNED_IN' || isOAuthReturn) {
          if (window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname)
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setClientAccount(null)
        setIsGoogleUser(false)
      }
    })

    return () => {
      isSubscribed = false
      subscription.unsubscribe()
    }
  }, [clientAccount, setClientAccount])

  const openTicketModal = () => {
    setIsMenuOpen(false)
    if (!clientAccount) {
      // Prompt to login or create account first
      setIsLoginOpen(true)
      return
    }
    setIsTicketOpen(true)
  }

  const openAccountModal = () => {
    setIsMenuOpen(false)
    setIsLoginOpen(false)
    setIsAccountOpen(true)
  }

  const openLoginModal = () => {
    setIsMenuOpen(false)
    setIsAccountOpen(false)
    setIsLoginOpen(true)
  }

  const handleAccountCreated = (account) => {
    const merged = mergeClientAccountProfiles(getCurrentClientSession(), account)
    setClientAccount(merged)
    setIsGoogleUser(false)
    setIsAccountOpen(false)
  }

  const handleLoginSuccess = (account) => {
    setIsLoginOpen(false)
    setTransitionAccount(account)
    setTimeout(() => {
      setClientAccount(account)
      setTransitionAccount(null)
    }, 1800)
  }

  const handleLogout = () => {
    setClientAccount(null)
    setIsClientPortalOpen(false)
  }

  // If client is logged in, redirect directly to Dedicated Client Dashboard Workspace
  if (clientAccount && !transitionAccount) {
    return (
      <ErrorBoundary>
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="min-h-screen w-full bg-[var(--bg)]"
        >
          <ClientDashboardPage
            clientAccount={clientAccount}
            isGoogleUser={isGoogleUser}
            onLogout={handleLogout}
            onUpdateAccount={(updated) => setClientAccount(updated)}
          />
        </motion.div>
      </ErrorBoundary>
    )
  }


  return (
    <div className="min-h-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="page-shell">
        <Navbar
          isMenuOpen={isMenuOpen}
          onMenuToggle={() => setIsMenuOpen((v) => !v)}
          onCreateAccount={openAccountModal}
          onCreateTicket={openTicketModal}
          onOpenClientPortal={() => setIsClientPortalOpen(true)}
          onLogin={openLoginModal}
          clientAccount={clientAccount}
        />
        <main id="main">
          <Hero onCreateTicket={openTicketModal} />
          <Products />
          <FeatureGrid />
          <Workflow />
          <Benefits />
          <TicketPreview />
          <Testimonials />
          <Faq openFaq={openFaq} onToggle={setOpenFaq} />
          <Cta onCreateTicket={openTicketModal} />
        </main>
        <Footer />
      </div>

      {/* Client Modals */}
      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        onAccountCreated={handleAccountCreated}
        onSwitchToLogin={openLoginModal}
      />

      <ClientLoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        onSwitchToRegister={openAccountModal}
      />

      <TicketModal
        account={clientAccount}
        isOpen={isTicketOpen}
        onClose={() => setIsTicketOpen(false)}
      />

      <ClientPortalModal
        isOpen={isClientPortalOpen}
        onClose={() => setIsClientPortalOpen(false)}
        clientAccount={clientAccount}
        onOpenNewTicket={() => setIsTicketOpen(true)}
        onLogout={handleLogout}
        onUpdateAccount={(updated) => setClientAccount(updated)}
      />

      <PasswordRecoveryModal
        isOpen={isPasswordRecoveryOpen}
        onClose={() => setIsPasswordRecoveryOpen(false)}
        contextLabel="your account"
      />

      {/* Login Transition Overlay */}
      <AnimatePresence>
        {transitionAccount && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 dark:bg-slate-950/60 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="bg-[var(--paper)] border border-[var(--line)] shadow-[var(--shadow-deep)] rounded-2xl p-8 max-w-sm w-full flex flex-col items-center text-center gap-4"
            >
              <div className="size-12 rounded-full border-[3px] border-[var(--line)] border-t-[var(--ink)] animate-spin" />
              <div>
                <h3 className="text-xl font-black text-[var(--ink)] tracking-tight">Welcome back!</h3>
                <p className="text-sm font-semibold text-[var(--muted)] mt-1">Initializing your secure workspace...</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Bottom-Right Floating Theme Toggle */}
      <FloatingThemeToggle />
    </div>
  )
}

export default App
