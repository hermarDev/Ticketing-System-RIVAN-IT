import { MessageSquareText } from 'lucide-react'
import { SectionHeading } from '../../../shared/components/SectionHeading'

export function TicketPreview() {
  return (
    <section id="ticket-preview" className="section-pad mx-auto max-w-7xl px-5 lg:px-8" aria-labelledby="preview-title">
      <div className="preview-layout">
        <div className="ticket-window">
          <div className="ticket-window-head">
            <span>Ticket #NET-48219 / Client CL-2048</span>
            <span className="status-pill">In review</span>
          </div>
          <div className="ticket-window-body">
            <div>
              <p className="micro-label">Subject</p>
              <h3>Cisco switch quotation with Fortinet firewall configuration</h3>
            </div>
            <div className="ticket-meta-grid">
              <span>Request Type <strong>Sales or Quotation</strong></span>
              <span>Priority <strong>High</strong></span>
              <span>Client <strong>Acme Trading Corp.</strong></span>
              <span>Owner <strong>Sales + Network Engineer</strong></span>
            </div>
            <div className="message-bubble">
              <MessageSquareText size={18} aria-hidden="true" />
              <p>Client attached topology and device count. Team will validate Cisco switch model, Fortinet sizing, and installation scope.</p>
            </div>
          </div>
        </div>
        <div>
          <SectionHeading
            eyebrow="Ticket preview"
            title="Tickets identify the client before the team responds."
            copy="Account, company, product interest, priority, attachments, and client notes are arranged for faster quotation, troubleshooting, and scheduling."
          />
          <div className="preview-chips" aria-label="Preview capabilities">
            {['Client account', 'Cisco inquiry', 'Fortinet scope', 'Service history'].map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
