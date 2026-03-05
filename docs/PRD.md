# Product Requirements Document (PRD)
## Trebol Contractors Corp - Construction Management System

**Version:** 1.0
**Last Updated:** 2026-02-28
**Status:** In Development

---

## 1. Executive Summary

A web-based construction project management system tailored for Trebol Contractors Corp, a drywall/framing subcontractor. The system manages projects, invoicing (AIA format), change orders, weekly payroll, and material tracking.

---

## 2. Current State Assessment

### 2.1 Frontend Inventory

| Page | Status | Issues |
|------|--------|--------|
| Dashboard | Working | Onboarding checklist may confuse users |
| Projects | Working | Navigates to CRM correctly |
| Project CRM | 90% Working | Materials tab is stub |
| Payroll | Bug | Runtime error on parseResult.rows |
| Upload | Working | Generic - needs evaluation if needed |
| Documents | Working | PDF/Image AI extraction |
| Reports | Partially Working | Report generation may fail |
| Settings | Working | QuickBooks OAuth placeholder |
| Labor | Working | Old hourly system (replaced by Payroll) |

### 2.2 Identified Bugs

| ID | Page | Bug | Priority |
|----|------|-----|----------|
| BUG-001 | Payroll | `parseResult.rows.length` undefined error | HIGH |
| BUG-002 | Reports | Report generation fails | MEDIUM |
| BUG-003 | Project CRM | API response format mismatch (workers, payroll) | HIGH |

### 2.3 Missing Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Invoice Generator | Generate AIA-format invoices with Trebol template | HIGH |
| Material Tracking | Compare takeoff vs used vs will use | HIGH |
| Edit Project Details | POC info, address, GC assignment | MEDIUM |
| Add/Edit Invoices | Create invoices from Project CRM | HIGH |
| Add/Edit Change Orders | Create COs from Project CRM | HIGH |
| Worker Management | CRUD for workers | MEDIUM |
| GC Management | CRUD for general contractors | MEDIUM |

---

## 3. Target Features

### 3.1 Core Workflows

#### 3.1.1 Project Lifecycle
1. Create project with GC, address, POC info
2. Set initial proposal amount
3. Track progress % (manual today, formula later)
4. Manage change orders
5. Generate invoices (AIA format)
6. Track payments received
7. Monitor profitability

#### 3.1.2 Weekly Payroll
1. Receive Excel file from employee
2. Upload to system
3. Preview parsed data
4. Create missing workers automatically
5. Import entries linked to projects
6. View payroll by week and project

#### 3.1.3 Material Tracking
1. Define takeoff (estimated materials)
2. Record materials used (from vendor invoices)
3. Calculate materials remaining
4. Compare actual vs estimate

#### 3.1.4 Invoice Generation
1. Select project
2. Choose billing type (% complete, milestone, etc.)
3. Include approved change orders
4. Generate PDF with Trebol template
5. Track submission and payment

---

## 4. Technical Architecture

### 4.1 Stack
- **Frontend:** React 18 + TypeScript + Vite
- **UI Library:** shadcn/ui + Tailwind CSS
- **State:** React Query + Context
- **Routing:** Wouter
- **Backend:** Express + PostgreSQL + Drizzle ORM
- **Testing:** Vitest (unit) + Playwright (E2E)

### 4.2 Key Entities
```
Company
  └── Project
        ├── GeneralContractor (FK)
        ├── ChangeOrder[]
        ├── ProjectInvoice[]
        ├── PaymentReceived[]
        ├── PayrollEntry[]
        └── MaterialEntry[] (TBD)
  └── Worker[]
  └── GeneralContractor[]
```

---

## 5. Implementation Phases

### Phase 1: Stabilization (Current Sprint)
**Goal:** Fix all bugs, ensure existing features work perfectly

| Task | Status |
|------|--------|
| Fix Payroll page parseResult error | TODO |
| Fix API response format mismatches | TODO |
| Test all navigation flows | TODO |
| Remove/disable broken features | TODO |
| Setup testing infrastructure | TODO |

**Deliverable:** All existing pages work without errors

---

### Phase 2: Project CRM Completion
**Goal:** Complete the Project CRM as the central hub

| Task | Status |
|------|--------|
| Add Invoice creation dialog | TODO |
| Add Change Order creation dialog | TODO |
| Edit project details (POC, address) | TODO |
| Wire up "New CO" button | TODO |
| Wire up "New Invoice" button | TODO |
| Add payment recording | TODO |

**Deliverable:** Full project management from CRM

---

### Phase 3: Invoice Generation
**Goal:** Generate professional AIA-format invoices

| Task | Status |
|------|--------|
| Design Trebol invoice template | TODO |
| Create invoice preview component | TODO |
| Implement PDF generation | TODO |
| Include change orders in invoice | TODO |
| Track submission method | TODO |

**Deliverable:** Generate and download professional invoices

---

### Phase 4: Material Tracking
**Goal:** Compare estimated vs actual materials

| Task | Status |
|------|--------|
| Design material tracking schema | TODO |
| Create takeoff entry UI | TODO |
| Link vendor invoices to materials | TODO |
| Build comparison dashboard | TODO |
| Add alerts for overruns | TODO |

**Deliverable:** Full material tracking with projections

---

### Phase 5: Cleanup & Polish
**Goal:** Remove unused features, polish UX

| Task | Status |
|------|--------|
| Remove old Labor page | TODO |
| Simplify Dashboard | TODO |
| Improve mobile experience | TODO |
| Add GC management page | TODO |
| Add Worker management page | TODO |
| Performance optimization | TODO |

**Deliverable:** Production-ready application

---

## 6. Pages & Routes (Target State)

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Dashboard | Overview of active projects, costs |
| `/projects` | Projects | List and create projects |
| `/projects/:id/crm` | Project CRM | Full project management hub |
| `/payroll` | Payroll | Import and view weekly payroll |
| `/settings` | Settings | Company config, GC management |
| `/reports` | Reports | Weekly reports (if needed) |

### Pages to Remove/Deprecate
- `/upload` - Replaced by specific importers (payroll, materials)
- `/documents` - Keep if AI extraction useful, else remove
- `/labor` - Replaced by `/payroll`
- `/projects/:id` (basic detail) - Replaced by CRM

---

## 7. Success Criteria

### Phase 1 Complete When:
- [ ] No console errors on any page
- [ ] All navigation works
- [ ] Payroll import works end-to-end
- [ ] Unit tests for critical utilities
- [ ] E2E tests for core flows

### Phase 2 Complete When:
- [ ] Can create invoices from Project CRM
- [ ] Can create change orders from Project CRM
- [ ] Can edit project details
- [ ] Can record payments

### Phase 3 Complete When:
- [ ] Can generate PDF invoice
- [ ] Invoice includes Trebol branding
- [ ] Invoice includes approved COs
- [ ] Can download invoice

### Phase 4 Complete When:
- [ ] Can enter material takeoff
- [ ] Can record material usage
- [ ] Dashboard shows comparison
- [ ] Alerts for overruns work

---

## 8. Open Questions

1. **Invoice Template:** Need exact Trebol invoice format/branding
2. **Material Categories:** What categories to track? (drywall, studs, etc.)
3. **Report Frequency:** Weekly reports still needed?
4. **QuickBooks:** Should we complete integration or remove?
5. **Multi-user:** Any user/role requirements?

---

## 9. Appendix

### A. API Endpoints Reference

See `server/routes.ts` for full API documentation.

### B. Database Schema

See `shared/schema.ts` for Drizzle schema definitions.

### C. Type Definitions

See `client/src/lib/types.ts` for TypeScript types.
