import { ArrowRight } from 'lucide-react'

export function Cta({ onCreateTicket }) {
  return (
    <section id="contact" className="section-pad mx-auto max-w-7xl px-5 lg:px-8" aria-labelledby="cta-title">
      <div className="cta-panel">
        <div>
          <p className="eyebrow">Ready to send a request?</p>
          <h2 id="cta-title">
            Don't call — submit your concern here and we'll respond properly.
          </h2>
          <p className="mt-3 text-[var(--muted)] text-base leading-relaxed font-semibold">
            Your request gets a tracking number, assigned to the right engineer, and you'll be updated at every step. No follow-up needed on your end.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button className="primary-action hero-action" type="button" onClick={onCreateTicket}>
            Submit a Request <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}
