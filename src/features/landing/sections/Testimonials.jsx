import { testimonials } from '../../../content/siteContent'
import { SectionHeading } from '../../../shared/components/SectionHeading'

export function Testimonials() {
  return (
    <section className="section-pad testimonial-band" aria-labelledby="testimonials-title">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <SectionHeading
          eyebrow="Client feedback"
          title="Network teams get fewer surprise calls and better request details."
          copy="A centralized ticket queue gives engineers enough context to troubleshoot, schedule, sell, or configure without starting from zero."
        />
        <div className="testimonial-grid">
          {testimonials.map((item) => (
            <article className="testimonial-card" key={item.name}>
              <p>&ldquo;{item.quote}&rdquo;</p>
              <div>
                <strong>{item.name}</strong>
                <span>{item.role}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
