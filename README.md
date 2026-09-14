# 🏗️ SiteFlow — Construction Site Management System

An all-in-one, production-style platform for construction companies to **plan, assign, and track work across every active site** — replacing spreadsheets, phone calls, and paper logs. Odoo-style construction management, built as a complete full-stack app.

Covers: role-based access, task assignment, automated notifications, geofenced attendance, live workforce tracking, a free/busy dashboard, invoicing & payments, and exportable reports.

---

## ✨ Features

| Area | What's included |
|---|---|
| **Roles & Access Control** | Admin (full control), CMS/Site Manager (operations), Employee/Worker (field portal). Sidebar, pages and APIs are all role-filtered. |
| **Task & Work Assignment** | Assign to employees or whole crews, priority, deadlines, estimated hours, real-time status (Not Started → In Progress → Completed), instant updates. |
| **Automated Notifications** | In-app bell + email (Resend) + SMS (Twilio, urgent tasks). Task-assigned, location, shift-reminder and overdue alerts. Scheduler endpoint for cron. |
| **Deployment & Location Tracking** | Deploy/recall workers to sites, live GPS pings from the field, deployment history per worker. |
| **Geofenced Attendance** | Check-in/out validated by GPS radius (with GPS-noise tolerance), late detection, half-day rules, flagged off-site check-ins. |
| **Live Workforce Dashboard** | Free vs Busy per worker, site-wise distribution, task progress charts, attendance trend, activity feed. |
| **Payment & Invoicing** | Auto invoice numbering, line items + tax, payment recording (gateway-ready), status flow DRAFT→SENT→PARTIALLY_PAID→PAID, printable PDF invoice. |
| **Reporting & Analytics** | Employee performance, attendance & hours, site productivity, financial summary — all exportable to CSV/Excel. |
| **Dual Calendar (AD ⇄ BS)** | Every date field is a dual-calendar picker: toggle between English (Gregorian) and Nepali (Bikram Sambat) in the same field, with a real BS month grid, both dates always shown, and Saturday-first weeks. Documents, lists and CSV exports display BS + AD side by side. |

## 🧱 Tech Stack

- **Next.js 14** (Pages Router) + React 18 + TypeScript
- **Tailwind CSS** (+ custom construction-amber theme)
- **PostgreSQL + Prisma ORM**
- **NextAuth (credentials, JWT sessions, role claims)**
- **Recharts** dashboards
- **Zod** validation on every write API
- Plain REST integration for Resend email + Twilio SMS (no extra SDKs)

## 🚀 Quick Start

### 1. Start the database

```bash
docker compose up -d        # PostgreSQL 16 on localhost:5433
```

### 2. Configure environment

```bash
cp .env.example .env        # defaults already point at the docker DB
```

### 3. Install, migrate, seed

```bash
npm install
npm run db:setup            # prisma db push + seed demo data
```

### 4. Run

```bash
npm run dev                 # http://localhost:3000
# or production:
npm run build && npm start
```

## 🔑 Demo Logins (password: `password123`)

| Role | Email | Sees |
|---|---|---|
| **Admin** | `admin@siteflow.com` | Everything: dashboard, users, settings, all sites & finances |
| **Site Manager** | `manager@siteflow.com` | Sites, tasks, workforce, crews, attendance, invoices, reports |
| **Worker** | `worker@siteflow.com` | My Day portal: tasks, geofenced check-in/out, schedule, notifications |

The login page has one-click quick-fill buttons for all three.

## 📁 Project Structure

```
prisma/schema.prisma        14 models: User, Site, SiteMember, Crew, Task,
                            TaskAssignment, Deployment, Attendance, Notification,
                            Invoice, InvoiceItem, Payment, ActivityLog, AppSetting
prisma/seed.ts              Realistic demo data (3 sites, 11 users, tasks, 2 weeks
                            of attendance, 3 invoices with payments)
src/lib/                    auth (NextAuth), rbac (guards), api (zod wrapper),
                            geo (haversine geofence), workforce (free/busy logic),
                            notify (in-app/email/SMS), invoicing (totals + PDF),
                            settings, export (CSV)
src/pages/api/              25+ REST endpoints (see below)
src/pages/portal/           11 role-aware pages
src/components/             Shell (sidebar/topbar), NotificationBell, charts,
                            UI primitives, MyDayClient, LocationSharer
```

## 🔌 API Overview

```
Auth        POST /api/auth/callback/credentials (NextAuth) · POST /api/auth/register
Users       GET/POST /api/users · GET/PATCH/DELETE /api/users/:id
Sites       GET/POST /api/sites · GET/PATCH/DELETE /api/sites/:id
Crews       GET/POST /api/crews · PATCH/DELETE /api/crews/:id
Tasks       GET/POST /api/tasks · GET/PATCH/DELETE /api/tasks/:id
Attendance  POST /api/attendance/checkin · /checkout · /ping
            GET /api/attendance · GET /api/attendance/me
Workforce   GET /api/workforce · POST/DELETE /api/workforce/deploy
Notifs      GET /api/notifications · POST /api/notifications/read
Invoices    GET/POST /api/invoices · GET/PATCH/DELETE /api/invoices/:id
            GET /api/invoices/:id/pdf (printable)
Payments    POST /api/payments
Reports     GET /api/reports/employees · /sites · /financial
            GET /api/reports/export?type=employees|attendance|sites|invoices  (CSV)
Settings    GET/PUT /api/settings
Cron        GET|POST /api/cron/notifications  (Authorization: Bearer CRON_SECRET)
```

## 🌍 Deployment

### Vercel (recommended)

1. Push to GitHub and import the repo in Vercel.
2. Provision Postgres (Vercel Postgres / Neon / Supabase) and set `DATABASE_URL`.
3. Set env vars: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `CRON_SECRET` (+ optional Resend/Twilio keys).
4. `vercel.json` already registers the 15-min notification cron.

### Docker

The included `docker-compose.yml` runs Postgres; build the app with `npm run build && npm start` behind Nginx, or add an app service:

```yaml
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/siteflow?schema=public
      NEXTAUTH_URL: http://localhost:3000
      NEXTAUTH_SECRET: change-me
      CRON_SECRET: change-me
    depends_on: [db]
```

## 🔔 Email / SMTP & Notification Channels

**Email is fully configurable from the app** — go to **Admin → Settings → Email (SMTP)** and fill in your mail server. No redeploy needed:

- Host, port, STARTTLS/SSL, username, password, from-address
- **🔌 Verify connection** button (handshake + auth test, no email sent)
- **✉ Send test** button to confirm delivery end-to-end
- Password is stored server-side and always masked in the UI/API

Works with Gmail (app password), Outlook, Zoho, Mailgun, SES SMTP, cPanel — any standard SMTP server.

**Priority order:** Settings-page values → `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/EMAIL_FROM` env vars → Resend API fallback (`RESEND_API_KEY`).

| Channel | Config | Behavior unconfigured |
|---|---|---|
| Email (SMTP) | Settings page or env vars | Falls back to Resend, else skipped |
| Email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` | Skipped |
| SMS (Twilio) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Skipped (sent only for URGENT tasks) |

In-app notifications always work with zero configuration. The scheduler (`/api/cron/notifications`) sends shift-start reminders X hours ahead (configurable in Settings) and daily overdue-task digests to managers.

Related endpoints (admin only):

```
POST /api/settings/smtp/verify   — validates SMTP connection + auth
POST /api/settings/smtp/test     — sends a branded test email { "to": "you@example.com" }
```

## 💳 Payment Gateway

`POST /api/payments` is gateway-ready — plug Stripe/Razorpay in by creating a checkout session and calling this endpoint from the webhook. Invoice status auto-recalculates (SENT → PARTIALLY_PAID → PAID).

## 🧪 Verification Performed

- `tsc --noEmit` clean, production build succeeds (35 routes)
- All three roles log in and see role-filtered data
- Manager assigns task → worker receives notification → geofenced check-in (far coordinates correctly rejected without force, flagged when forced) → check-out computes worked minutes
- Payment recorded → invoice auto-transitions to PARTIALLY_PAID → overpayment rejected
- Invoice PDF endpoint returns printable HTML; all four CSV exports download correctly
- RBAC verified: worker hitting admin-only endpoints gets 403; worker hitting management pages is redirected

## 📝 Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build && npm start` | Production |
| `npm run typecheck` | TypeScript check |
| `npm run db:setup` | Push schema + seed |
| `npm run db:reset` | Force-reset + reseed |
| `npm run db:studio` | Prisma Studio GUI |
