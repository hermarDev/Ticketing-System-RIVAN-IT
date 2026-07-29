import { workflow } from '../../../content/siteContent'
import { SectionHeading } from '../../../shared/components/SectionHeading'

export function Workflow() {
  return (
    <section id="how-it-works" className="section-pad workflow-band" aria-labelledby="workflow-title">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <SectionHeading
          eyebrow="How it works"
          title="Submit a request in minutes — we take it from there."
          copy="Four simple steps. Register once, describe your concern, and our team gets notified immediately. You'll receive updates until it's fully resolved."
        />
        <div className="workflow-grid">
          {workflow.map(([title, copy], index) => (
            <article className="workflow-step" key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
