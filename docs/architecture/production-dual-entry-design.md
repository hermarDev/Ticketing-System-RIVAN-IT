# Production Dual-Entry Architecture Specification

**Project:** NetOps Ticket Desk
**Date:** 2026-07-24
**Status:** Approved & Ready for Migration

---

## 1. Executive Summary

This document specifies the production architecture for separating the **Client Request Portal** from the **Staff/Admin/CEO Command Center** in the NetOps Ticket Desk web application.

The target system uses a **Vite Dual Entry Point (Multi-Page Application) Model** with **Supabase Row Level Security (RLS)** at the database tier. This architecture guarantees physical code bundle isolation so that internal staff logic is 100% absent from client JavaScript assets, while preserving a clean, DRY monorepo structure for shared components and services.

---

## 2. Architecture & Bundle Isolation

```
                              ┌───────────────────────────────┐
                              │  NetOps Project Repository    │
                              └───────────────┬───────────────┘
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
        ┌─────────────────────────┐                       ┌─────────────────────────┐
        │  index.html (Client)    │                       │   ops.html (Staff)      │
        │  src/main.jsx           │                       │   src/ops.jsx           │
        └────────────┬────────────┘                       └────────────┬────────────┘
                     │                                                 │
                     ▼                                                 ▼
        ┌─────────────────────────┐                       ┌─────────────────────────┐
        │  Public Client Bundle   │                       │  Private Staff Bundle   │
        │  (dist/index.html + JS) │                       │  (dist/ops.html + JS)   │
        └────────────┬────────────┘                       └────────────┬────────────┘
                     │                                                 │
                     │  Deployed to:                                   │  Deployed to:
                     │  support.netops.com                             │  ops.netops.com (VPN/IP)
                     └────────────────────────┬────────────────────────┘
                                              │
                                              ▼
                               ┌─────────────────────────────┐
                               │  Supabase Managed Backend   │
                               │  (Auth, DB RLS, Realtime)   │
                               └─────────────────────────────┘
```

---

## 3. Physical Directory Structure

```
TicketingSystem/
├── index.html                  # Public Client HTML Shell
├── ops.html                    # Staff/Admin/CEO HTML Shell
├── vite.config.js              # Vite Dual-Entry Configuration
├── docs/                       # Architecture & API Specs
└── src/
    ├── app/
    │   └── App.jsx             # Client Portal Root Component
    ├── ops/
    │   └── OpsApp.jsx          # Staff Command Center Root Component
    ├── main.jsx                # Client React Entry Point
    ├── ops.jsx                 # Staff React Entry Point
    ├── features/
    │   ├── landing/            # Public Marketing Landing Page
    │   ├── client/             # Client Workspace & Tickets
    │   └── admin/              # Staff / Admin / CEO Dashboards
    ├── shared/                 # Shared Primitives (Chat, Buttons, Modals)
    └── lib/                    # Supabase Client, Services, Utilities
```

---

## 4. Security & Threat Model

1. **Client JS Bundle Isolation**: Rollup builds `dist/index.html` exclusively from `src/main.jsx`. Staff JSX files in `src/features/admin/` are excluded from the client build bundle.
2. **CDN Path Isolation**: Client web deployment serves only `dist/index.html`. Requests to `/ops.html` on the public domain return `404 Not Found`.
3. **Database RLS Enforcer**: All PostgreSQL operations enforce Row Level Security checking `auth.uid() IN (SELECT id FROM profiles WHERE role IN ('staff', 'admin', 'ceo'))`.

---

## 5. Decision Log

| Decision | Alternative Considered | Rationale |
|---|---|---|
| **Vite Dual Entry (`index.html` + `ops.html`)** | Hash routing or hidden client routes | Keeps staff code out of public client entry points and serves it only through the dedicated ops entry. |
| **Database-Level RLS Enforcement** | Client-side role checks | Prevents API tampering or bypass attempts at the network boundary. |
| **Independent Domain Deployment** | Single domain path matching | Allows strict CDN/VPN access control rules on the staff endpoint. |
