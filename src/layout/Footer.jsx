export function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-10 text-slate-900 dark:text-slate-100 transition-colors">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <strong className="text-lg text-slate-900 dark:text-white font-black">NetOps Ticket Desk</strong>
          <p className="mt-2 max-w-xl text-sm text-slate-700 dark:text-slate-300 font-medium">
            A client account and ticket portal for Cisco, Fortinet, network device sales, installation, configuration, renewals, and support requests.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <a href="#features" className="hover:text-slate-950 dark:hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-slate-950 dark:hover:text-white transition-colors">Workflow</a>
          <a href="#faq" className="hover:text-slate-950 dark:hover:text-white transition-colors">FAQ</a>
          <a href="#contact" className="hover:text-slate-950 dark:hover:text-white transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  )
}

