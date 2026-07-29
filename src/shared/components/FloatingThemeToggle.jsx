import { motion } from 'framer-motion'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../../lib/useTheme'

export function FloatingThemeToggle() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <motion.button
      onClick={toggleTheme}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3.5 py-2.5 sm:px-4 sm:py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-lg hover:border-slate-400 dark:hover:border-slate-600 transition-all cursor-pointer"
      title={`Switch to ${isDark ? 'Light' : 'Night'} Mode`}
      aria-label="Toggle theme"
    >
      {isDark ? (
        <>
          <Sun size={17} className="text-amber-500" />
          <span className="hidden sm:inline font-bold">Light Mode</span>
        </>
      ) : (
        <>
          <Moon size={17} className="text-slate-500" />
          <span className="hidden sm:inline font-bold">Night Mode</span>
        </>
      )}
    </motion.button>
  )
}

