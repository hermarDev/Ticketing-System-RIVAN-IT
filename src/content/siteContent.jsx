import {
  BellRing,
  FileText,
  LockKeyhole,
  Router,
  RefreshCw,
  ShieldCheck,
  Clock,
  TicketCheck,
  Wifi,
} from 'lucide-react'

// What types of requests clients can submit
export const productLines = [
  {
    icon: Router,
    title: 'Cisco Network Devices',
    copy: "Need a Cisco switch, router, access point, or any configuration and installation work? Submit it here and our team will handle it.",
  },
  {
    icon: ShieldCheck,
    title: 'Fortinet Security',
    copy: "FortiGate firewall, FortiSwitch, VPN setup, security renewals, or policy changes — submit your concern and we'll get back to you.",
  },
  {
    icon: Wifi,
    title: 'Other Network Concerns',
    copy: "Wi-Fi issues, cabling, CCTV, racks, internet problems, or any other network-related concern — this is where you report it.",
  },
]

// How client requests are handled inside the system
export const features = [
  {
    icon: TicketCheck,
    title: 'Every Request Gets a Ticket',
    copy: "Once you submit, your concern is logged with a unique ticket number. Nothing gets missed or forgotten — it's always trackable.",
  },
  {
    icon: BellRing,
    title: 'You Get Notified at Every Step',
    copy: "When your ticket is reviewed, assigned, or resolved — you'll know. No need to follow up or call to check the status.",
  },
  {
    icon: Clock,
    title: 'Urgent Concerns Are Prioritized',
    copy: 'Network outages and critical failures are flagged differently from routine quotations. Urgent requests reach the right engineer faster.',
  },
  {
    icon: RefreshCw,
    title: 'Routed to the Right Person',
    copy: 'Your request goes directly to the engineer or team that handles it — not a general inbox. No more being passed around.',
  },
  {
    icon: FileText,
    title: 'Attach Supporting Details',
    copy: 'Include device models, serial numbers, site photos, or screenshots when submitting. The more detail you give, the faster we respond.',
  },
  {
    icon: LockKeyhole,
    title: 'Your Account Ties Everything Together',
    copy: 'Register once. Every request you submit is tied to your account so our team always knows who you are and where your site is.',
  },
]

// How to use the portal — 4 steps
export const workflow = [
  [
    'Register Your Account',
    'Create an account with your name, company, and contact number. Add your site address later in My Account when you are ready to file tickets.',
  ],
  [
    'Describe Your Concern',
    "Choose the request type — quotation, installation, troubleshooting, or general inquiry — then describe what you need in detail.",
  ],
  [
    'We Assign the Right Team',
    "Your ticket goes to our sales, engineering, or support team depending on the nature of your concern. No wrong door.",
  ],
  [
    'Track and Receive Updates',
    "Your ticket number lets you track your concern anytime. We'll update you when there's progress or when it's resolved.",
  ],
]

// Why clients should use the portal
export const benefits = [
  [
    'No More Missed Calls or Lost Messages',
    "Every concern you raise is formally logged — it can't be forgotten, deleted, or lost in a chat thread.",
  ],
  [
    'You Always Know Who Is Handling It',
    'Your request is assigned to a specific person, so there is clear accountability from submission to resolution.',
  ],
  [
    'Faster, More Accurate Responses',
    'Our team sees your full site details, device information, and urgency level before responding — no back-and-forth clarification needed.',
  ],
  [
    'One Place for All Your Requests',
    'Whether it is a quotation, an installation, or a technical issue — all your concerns are in one tracked, organized place.',
  ],
]

// Testimonials — from client perspective
export const testimonials = [
  {
    quote:
      'Before this, I had to text or call just to ask for a quotation. Now I submit it here and get a proper response with a reference number.',
    name: 'Mark Reyes',
    role: 'IT Manager, Manufacturing Company',
  },
  {
    quote:
      'When our firewall had an issue, I submitted the concern and got an engineer assigned the same day. No chasing, no follow-ups needed.',
    name: 'Carla Domingo',
    role: 'Operations Head, Logistics Firm',
  },
  {
    quote:
      'I can finally see all my past requests in one place. Renewals, installations, support tickets — everything is there with full history.',
    name: 'Jun Pascual',
    role: 'Network Administrator',
  },
]

// FAQs — client-facing questions
export const faqs = [
  [
    'What can I submit a request for?',
    'Anything related to your network — quotations for Cisco or Fortinet equipment, installation or configuration work, internet or Wi-Fi issues, CCTV concerns, renewals, and general technical support.',
  ],
  [
    'Do I need to create an account first?',
    'Yes. An account links your request to your company and site so our team knows exactly who you are and where to go. It only takes a minute to register.',
  ],
  [
    'What happens after I submit a request?',
    "You will receive a ticket number immediately. Our team will review and assign your request, then notify you when there is an update or when it is resolved.",
  ],
  [
    'What details should I include in my request?',
    "The more the better — device model, serial number, site location, photos, screenshots, or a description of what is happening. This helps us respond faster and more accurately.",
  ],
  [
    'Can I check the status of my request?',
    'Yes. Log in with the email you used to register and you can view your active and past tickets at any time.',
  ],
]
