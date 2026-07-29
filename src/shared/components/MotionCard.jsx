import { motion } from 'framer-motion'

export function MotionCard({ children, className, delay = 0 }) {
  return (
    <motion.article
      className={className}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.42, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.article>
  )
}
