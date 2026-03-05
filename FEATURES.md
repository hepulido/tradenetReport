# Feature Implementation Tracker

## P0 - Critical (Can't Launch Without) ✅ COMPLETE

| Feature | Status | Notes |
|---------|--------|-------|
| Authentication (Firebase) | ✅ Done | Login, signup, Google OAuth implemented |
| Multi-tenancy | ✅ Done | users, user_companies tables with company isolation |
| Role-Based Access (Owner/Admin/Member) | ✅ Done | permissions.ts, TopNav user menu, role checks |
| Subscription Billing (Stripe) | ✅ Done | stripe.ts, paywall component, checkout flow |
| Onboarding Flow | ✅ Done | OnboardingWizard for new users without companies |

## P1 - High Priority (Core Business Value)

| Feature | Status | Notes |
|---------|--------|-------|
| Estimates/Proposals | ✅ Done | Full estimates page with create, send, convert to project |
| PDF Generation | ✅ Done | Invoice PDFs with pdfkit, download button added |
| Document Storage (S3) | ✅ Done | s3.ts, documents.tsx with upload/OCR/review |
| Email Integration | ✅ Done | Send invoices/estimates via email |
| Retainage Tracking | ✅ Done | Added to invoices, shows in UI |
| Lien Waiver Generation | ⏳ Pending | Required to get paid in construction |
| QuickBooks/Xero Sync | ⏳ Pending | Accountants need this |
| Data Export (CSV/Excel) | ✅ Done | Export buttons on CRM, payroll pages |

## P2 - Differentiators (What Makes You Win)

| Feature | Status | Notes |
|---------|--------|-------|
| AIA Billing Forms | ⏳ Pending | Industry standard |
| Cash Flow Projections | ⏳ Pending | When will money come in? |
| Aging Reports | ⏳ Pending | Which invoices are overdue? |
| WIP Reports | ⏳ Pending | % complete vs % billed analysis |
| Daily Logs | ✅ Done | Job site documentation with weather, workers, work performed |
| Photo Documentation | ⏳ Pending | Progress photos per project |
| Notifications | ✅ Done | Email/SMS alerts, notification bell in UI, preferences |
| Mobile App | ⏳ Pending | Field workers need quick time entry |

---

## Current Sprint - Completing P0

### Task 1: Role-Based Access ✅
- [x] Create permissions.ts with role definitions
- [x] Update company-context with currentRole
- [x] Update TopNav with user menu and logout

### Task 2: Subscription Paywall ✅
- [x] Create SubscriptionPaywall component
- [x] Create useSubscription hook
- [x] Create UpgradeDialog with plan selection
- [x] Integrate with Stripe checkout

### Task 3: Team Invite ✅
- [x] Create TeamInviteDialog component
- [x] Add team API endpoints (GET, POST, DELETE, PATCH)
- [x] Add storage methods for team management
- [x] Integrate into App.tsx and TopNav

### Task 4: Onboarding Flow ✅
- [x] First-time user detection (useNeedsOnboarding hook)
- [x] Guided company setup (OnboardingWizard)
- [x] Initial project creation wizard

---

## Sprint 2 - P1 Features

### Task 5: Data Export (CSV/Excel) ✅
- [x] Create export utilities (export.ts)
- [x] Create ExportButton component
- [x] Export invoices to CSV (project-crm.tsx)
- [x] Export change orders to CSV (project-crm.tsx)
- [x] Export payments to CSV (project-crm.tsx)
- [x] Export payroll to CSV (payroll.tsx)

### Task 6: PDF Generation ✅
- [x] Install PDFKit library
- [x] Create pdfGenerator.ts with invoice PDF generation
- [x] Add /api/project-invoices/:id/pdf endpoint
- [x] Add "Download PDF" button to invoice detail dialog
- [ ] AIA billing forms template (future enhancement)

### Task 7: Retainage Tracking ✅
- [x] Add retainage fields to invoice schema
- [x] Add retainage calculation when creating invoices
- [x] Show retainage breakdown in invoice creation UI
- [x] Support retainage release billing type
- [x] Update client types with retainage fields

### Task 8: Estimates/Proposals ✅
- [x] Add estimates schema with line items
- [x] Add storage methods for estimates
- [x] Add API routes for CRUD operations
- [x] Create Estimates page UI
- [x] Add to navigation
- [x] Convert estimate to project functionality
- [x] Send/track estimate status

### Task 9: Email Integration (Send Invoices) ✅
- [x] Email service setup (SendGrid/Resend/Console)
- [x] Send invoice via email endpoint
- [x] Email templates for invoices and estimates
- [x] Track email sent status (updates invoice status)

---

## Legend
- ✅ Done - Feature complete
- 🔄 In Progress - Currently being worked on
- ⏳ Pending - Not started yet
