import { motion } from 'framer-motion'
import { ArrowRight, ShieldCheck, Clock, CheckCircle, Headphones } from 'lucide-react'

export function Hero({ onCreateTicket }) {
  return (
    <section
      className="hero-grid section-pad mx-auto max-w-7xl px-5 lg:px-8"
      aria-labelledby="hero-title"
    >
      {/* ── Left copy ── */}
      <motion.div
        className="hero-copy"
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="eyebrow">
          <Headphones size={15} aria-hidden="true" /> NetOps Client Support Portal
        </div>

        <h1 id="hero-title">
          Have a concern? Submit it here — we'll handle it.
        </h1>

        <p className="hero-subtitle">
          Whether you need a quotation, equipment installation, network troubleshooting, or follow-up on an existing concern — this is the official channel. No more direct calls. Every request is tracked and assigned to the right engineer.
        </p>

        {/* Single clear CTA */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            className="primary-action hero-action"
            type="button"
            onClick={onCreateTicket}
          >
            Submit a Request <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Trust stats */}
        <dl className="hero-metrics" aria-label="Portal highlights">
          <div>
            <dt>24/7</dt>
            <dd>Request Intake</dd>
          </div>
          <div>
            <dt>Tracked</dt>
            <dd>Every Ticket</dd>
          </div>
          <div>
            <dt>Assigned</dt>
            <dd>Right Engineer</dd>
          </div>
        </dl>
      </motion.div>

      {/* ── Right preview card ── */}
      <motion.div
        className="hero-console"
        initial={{ opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.12, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        aria-label="Sample active support ticket preview"
      >
        <div className="console-toolbar">
          <span className="flex items-center gap-1.5 font-bold text-[var(--ink)]">
            <ShieldCheck size={16} /> ACTIVE REQUEST
          </span>
          <span className="text-xs font-mono text-[var(--muted)]">● LIVE TRACKING</span>
        </div>

        <div className="priority-card">
          <div>
            <p className="micro-label">Open Support Ticket</p>
            <h2>FortiGate 60F Firewall Installation & Configuration</h2>
          </div>
          <span className="status-pill">
            In Progress
          </span>
        </div>

        <div className="console-stack">
          {[
            ['Ticket No.', 'NET-8492', 'Auto-generated reference'],
            ['Request Type', 'Equipment & Installation', 'Fortinet Security'],
            ['Status Update', 'Engineer Assigned', 'On-site visit scheduled'],
            ['Client Contact', 'Verified Philippines number', '09XX-XXX-XXXX'],
          ].map(([label, value, meta]) => (
            <div className="console-row" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{meta}</small>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center justify-between text-xs text-[var(--muted)]">
          <span className="flex items-center gap-1">
            <Clock size={14} className="text-[var(--muted)]" /> Client notified on every update
          </span>
          <span className="flex items-center gap-1 text-[var(--ink)] font-semibold">
            <CheckCircle size={14} /> Account Verified
          </span>
        </div>
      </motion.div>
    </section>
  )
}
