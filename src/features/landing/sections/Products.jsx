import { productLines } from '../../../content/siteContent'
import { SectionHeading } from '../../../shared/components/SectionHeading'

export function Products() {
  return (
    <section id="services" className="section-pad mx-auto max-w-7xl px-5 lg:px-8" aria-labelledby="services-title">
      <SectionHeading
        eyebrow="What you can request"
        title="Submit concerns about Cisco, Fortinet, or any network-related need."
        copy="This is your official channel. Whether it's a quotation, installation, renewal, troubleshooting, or a general inquiry — submit it here and our team will get back to you."
      />
      <div className="product-grid">
        {productLines.map((product) => (
          <article className="product-card" key={product.title}>
            <product.icon size={28} aria-hidden="true" />
            <h3>{product.title}</h3>
            <p>{product.copy}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
