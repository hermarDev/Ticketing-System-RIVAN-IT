import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Headphones, LogIn, Menu, User, X } from 'lucide-react'
import { navItems } from '../config/navigation'

export function Navbar({
  isMenuOpen,
  onMenuToggle,
  onCreateTicket,
  onOpenClientPortal,
  onLogin,
  clientAccount,
}) {

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl transition-colors">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-8"
        aria-label="Primary"
      >
        {/* ── Brand ── */}
        <a
          className="flex shrink-0 items-center gap-2.5 text-slate-900 dark:text-white"
          href="#main"
          aria-label="NetOps Ticket Desk home"
        >
          <span className="grid size-9 place-items-center rounded-lg border border-slate-800 dark:border-slate-700 bg-slate-950 dark:bg-slate-100 text-white dark:text-slate-950">
            <Headphones size={18} aria-hidden="true" />
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-black leading-tight tracking-tight text-slate-900 dark:text-slate-50">NetOps Desk</span>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">
              Client Request Portal
            </span>
          </span>
        </a>

        {/* ── Desktop nav links ── */}
        <div className="hidden flex-1 items-center justify-center gap-0.5 lg:flex">
          {navItems.map((item) => (
            <a
              key={item}
              className="nav-link"
              href={`#${item.toLowerCase().replaceAll(' ', '-')}`}
            >
              {item}
            </a>
          ))}
        </div>

        {/* ── Desktop actions ── */}
        <div className="hidden shrink-0 items-center gap-2 lg:flex">          {clientAccount ? (
            /* Logged in state */
            <button
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-sm font-bold text-slate-800 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500 transition-all"
              type="button"
              onClick={onOpenClientPortal}
            >
              <User size={14} />
              My Account
            </button>
          ) : (
            /* Logged out state */
            <>
              <button
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                type="button"
                onClick={onLogin}
                id="client-login-btn"
              >
                <LogIn size={14} aria-hidden="true" />
                Log In
              </button>
              <button
                className="primary-action text-sm"
                type="button"
                onClick={onCreateTicket}
              >
                Submit a Request <ArrowRight size={15} aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {/* ── Mobile hamburger ── */}
        <button
          className="icon-button lg:hidden"
          type="button"
          onClick={onMenuToggle}
          aria-label="Toggle navigation menu"
          aria-expanded={isMenuOpen}
        >
          {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 lg:hidden"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="mx-auto grid max-w-7xl gap-2">
              {navItems.map((item) => (
                <a
                  key={item}
                  className="mobile-nav-link"
                  href={`#${item.toLowerCase().replaceAll(' ', '-')}`}
                  onClick={onMenuToggle}
                >
                  {item}
                </a>
              ))}

              <div className="mt-1 flex flex-col gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                {clientAccount ? (
                  <button
                    className="secondary-action w-full justify-center"
                    type="button"
                    onClick={() => { onMenuToggle(); onOpenClientPortal() }}
                  >
                    <User size={15} /> My Account
                  </button>
                ) : (
                  <>
                    <button
                      className="secondary-action w-full justify-center"
                      type="button"
                      onClick={() => { onMenuToggle(); onLogin() }}
                    >
                      <LogIn size={15} /> Log In
                    </button>
                    <button
                      className="primary-action w-full justify-center"
                      type="button"
                      onClick={() => { onMenuToggle(); onCreateTicket() }}
                    >
                      Submit a Request <ArrowRight size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

