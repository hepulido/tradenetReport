# JobCost AI Design Guidelines

## Design Approach

**Selected Framework:** Modern Dashboard System (inspired by Linear, Stripe Dashboard, and Notion)

**Rationale:** This is a utility-focused, information-dense financial analytics tool requiring exceptional data clarity, professional credibility, and mobile-responsive design. The dashboard-centric approach prioritizes readability, scannable metrics, and efficient workflows.

---

## Typography Hierarchy

**Font Families:**
- Primary: Inter (via Google Fonts CDN)
- Monospace: JetBrains Mono (for financial figures, transaction IDs)

**Type Scale:**
- Hero/Page Titles: text-3xl font-bold (Company/Project names)
- Section Headers: text-xl font-semibold (Report titles, "This Week's Summary")
- Card Titles: text-lg font-medium (Project cards, metric labels)
- Body/Data: text-base font-normal (Transaction descriptions)
- Captions/Labels: text-sm font-medium (Table headers, form labels)
- Financial Figures: text-2xl font-bold tracking-tight (Total Cost, Revenue, Margin)
- Small Data: text-xs (Timestamps, secondary info)

---

## Layout System

**Spacing Primitives:** Tailwind units of **2, 4, 6, 8, 12, 16** for consistency
- Component padding: p-4 to p-6
- Section spacing: space-y-6 to space-y-8
- Card gaps: gap-4 to gap-6
- Page margins: px-4 md:px-6 lg:px-8

**Container Strategy:**
- Max-width container: max-w-7xl mx-auto
- Dashboard cards: Full-width stacked on mobile, grid on desktop
- Form containers: max-w-2xl for focused input areas

**Grid Patterns:**
- Metrics Dashboard: grid-cols-1 md:grid-cols-2 lg:grid-cols-4 (for KPI cards)
- Project Cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Transaction Tables: Full-width responsive tables with horizontal scroll on mobile

---

## Component Library

### Navigation
- **Top Navigation Bar:** Sticky header with company selector dropdown, main nav links (Dashboard, Projects, Reports), and secondary action button
- **Mobile Bottom Nav:** Fixed bottom bar with 3-4 primary actions (Dashboard, Projects, Reports, Upload)
- Height: h-16 with px-4 padding

### Cards & Containers
- **Metric Cards:** Rounded corners (rounded-lg), subtle border, p-6 padding, includes label + large number + trend indicator
- **Project Cards:** rounded-lg with p-4 padding, includes project name, status badge, key metrics preview, action button
- **Report Card:** Larger container (p-6) with report date range, summary metrics grid, and expand/download actions

### Data Display
- **Tables:** Striped rows for readability, sticky headers, responsive with horizontal scroll on mobile
  - Header: text-sm font-medium with pb-3 padding
  - Rows: text-sm with py-3 px-4 padding
  - Alternating row treatment for visual separation
- **Status Badges:** Inline badges with rounded-full, px-3 py-1, text-xs font-medium (Active, Paused, Closed)
- **Alert Boxes:** Rounded container with icon, message, and optional action, p-4 padding

### Forms & Inputs
- **Input Fields:** h-10 height, px-3 padding, rounded-md borders, text-sm
- **File Upload Zone:** Dashed border, p-8 padding, centered content with icon + instructions
- **Buttons:**
  - Primary CTA: px-6 py-2.5, rounded-md, font-medium
  - Secondary: Outlined variant with same sizing
  - Icon buttons: w-10 h-10 rounded-md

### Dashboard Specific
- **Week Selector:** Horizontal date range picker with prev/next arrows, centered week display
- **Report Summary Section:** 
  - Top: Large metrics grid (Total Cost, Revenue, Margin, Alerts count)
  - Middle: Project breakdown cards in grid
  - Bottom: Alerts list with icon indicators
- **Transaction List:** Paginated table with filters (date range, project, category)

---

## Page Layouts

### Dashboard View
- Header with company name + week selector
- 4-column metrics grid (stacks to single column on mobile)
- "Cost by Project" section with project cards grid
- Alert notifications list
- Vertical spacing: space-y-8

### Projects View
- Page header with "Add Project" button
- Project cards grid (responsive columns)
- Each card shows: name, status, date range, quick metrics
- Empty state with illustration placeholder when no projects

### Weekly Report View
- Report header with date range + download button
- Summary metrics section (same as dashboard)
- Detailed breakdown accordion/collapsible sections per project
- Transactions table with expandable rows for details

### Upload Flow
- Single-column centered layout (max-w-2xl)
- Step indicator at top
- File upload zone with drag-drop support
- Preview table of uploaded data
- Mapping interface (CSV column → Transaction field)
- Confirmation summary before import

---

## Responsive Behavior

**Mobile (< 768px):**
- Single column layout throughout
- Sticky bottom navigation (4 icons)
- Top nav collapses to hamburger menu
- Tables scroll horizontally
- Metric cards stack vertically

**Tablet (768px - 1024px):**
- 2-column grids for cards
- Side-by-side metrics where appropriate
- Persistent top navigation

**Desktop (> 1024px):**
- Full multi-column layouts
- Sidebar navigation option for deep reports
- Expanded table views

---

## Icons

**Library:** Heroicons (via CDN)
- Financial: currency-dollar, chart-bar, arrow-trending-up/down
- Actions: plus, upload, download, trash, pencil
- Navigation: home, document-text, folder, bell
- Status: check-circle, exclamation-triangle, x-circle

---

## Images

No hero images required for this application. Focus is on data visualization and functional clarity. 

**Illustrations/Graphics:**
- Empty state illustrations for "No projects yet" and "No reports generated"
- Simple icon-based graphics for alert types
- Optional: Company logo upload area in settings (placeholder avatar style)

---

## Accessibility & Interaction

- Consistent focus states on all interactive elements
- Clear visual hierarchy with proper heading structure
- Sufficient contrast for financial data readability
- Hover states for clickable cards/rows (subtle background change)
- Loading states for report generation (skeleton screens)
- Success/error toast notifications for actions

---

**Design Principle:** Trust through clarity. Every number, every metric, every interaction should feel reliable, professional, and instantly understandable. This is financial data—design for confidence and decisiveness.