import { features } from '../../../content/siteContent'
import { MotionCard } from '../../../shared/components/MotionCard'
import { SectionHeading } from '../../../shared/components/SectionHeading'

export function FeatureGrid() {
  return (
    <section id="features" className="section-pad mx-auto max-w-7xl px-5 lg:px-8" aria-labelledby="features-title">
      <SectionHeading
        eyebrow="How we handle your request"
        title="Every concern is tracked, assigned, and responded to — properly."
        copy="No more chasing the right person. Submit your request once and our team takes it from there, keeping you updated every step of the way."
      />
      <div className="feature-grid">
        {features.map((feature, index) => (
          <MotionCard className="feature-card" key={feature.title} delay={index * 0.04}>
            <feature.icon size={25} aria-hidden="true" />
            <h3>{feature.title}</h3>
            <p>{feature.copy}</p>
          </MotionCard>
        ))}
      </div>
    </section>
  )
}
