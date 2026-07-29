import { Check } from 'lucide-react'
import { benefits } from '../../../content/siteContent'
import { SectionHeading } from '../../../shared/components/SectionHeading'

export function Benefits() {
  return (
    <section id="benefits" className="section-pad mx-auto max-w-7xl px-5 lg:px-8" aria-labelledby="benefits-title">
      <div className="benefit-layout">
        <div>
          <SectionHeading
            eyebrow="Why submit a request here"
            title="Your concerns get the right attention — every time."
            copy="This portal makes sure your request doesn't get lost in a text message or missed call. It reaches the right person with the right details, right away."
          />
        </div>
        <div className="benefit-list">
          {benefits.map(([title, copy]) => (
            <article key={title}>
              <Check size={20} aria-hidden="true" />
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
