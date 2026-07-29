import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { faqs } from '../../../content/siteContent'
import { SectionHeading } from '../../../shared/components/SectionHeading'

export function Faq({ openFaq, onToggle }) {
  return (
    <section id="faq" className="section-pad mx-auto max-w-4xl px-5 lg:px-8" aria-labelledby="faq-title">
      <SectionHeading
        eyebrow="Common questions"
        title="Questions clients usually ask before submitting a request."
        copy="If something's unclear, find the answer here. Otherwise, just submit your concern and our team will respond directly."
      />
      <div className="faq-list">
        {faqs.map(([question, answer], index) => {
          const isOpen = openFaq === index
          return (
            <article className="faq-item" key={question}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${index}`}
                onClick={() => onToggle(isOpen ? -1 : index)}
              >
                <span>{question}</span>
                <ChevronDown className={isOpen ? 'rotate-180' : ''} size={20} aria-hidden="true" />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={`faq-panel-${index}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    <p>{answer}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </article>
          )
        })}
      </div>
    </section>
  )
}
