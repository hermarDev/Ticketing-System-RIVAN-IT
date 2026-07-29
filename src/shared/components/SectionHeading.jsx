import { Zap } from 'lucide-react'

export function SectionHeading({ eyebrow, title, copy, light = false }) {
  return (
    <div className={light ? 'section-heading light' : 'section-heading'}>
      <p className="eyebrow">
        <Zap size={15} aria-hidden="true" /> {eyebrow}
      </p>
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  )
}
