# Test Plan
## Trebol Contractors Corp - Construction Management System

**Version:** 1.0
**Last Updated:** 2026-02-28

---

## 1. Testing Strategy

### 1.1 Test Types

| Type | Tool | Purpose |
|------|------|---------|
| Unit Tests | Vitest | Test utilities, parsers, formatters |
| Component Tests | Vitest + Testing Library | Test React components in isolation |
| Integration Tests | Vitest | Test API endpoint handlers |
| E2E Tests | Playwright | Test full user flows in browser |

### 1.2 Coverage Goals

| Category | Target Coverage |
|----------|-----------------|
| Utilities/Parsers | 90% |
| API Handlers | 80% |
| React Components | 70% |
| E2E Critical Paths | 100% |

---

## 2. Unit Tests

### 2.1 Payroll Parser (`server/payrollParser.ts`)

| Test Case | Description |
|-----------|-------------|
| `parseWeekString` - valid format | Parses "SEMANA DEL MM/DD/YYYY AL MM/DD/YYYY" |
| `parseWeekString` - single date | Extracts date and calculates week end |
| `parseWeekString` - invalid | Returns null for unparseable strings |
| `parseNumber` - number input | Returns number as-is |
| `parseNumber` - string with currency | Strips $ and commas, returns number |
| `parseNumber` - empty/null | Returns 0 |
| `normalizeWorkerName` - mixed case | Returns proper case "John Smith" |
| `parsePayrollExcel` - valid file | Returns rows with week dates |
| `parsePayrollExcel` - missing headers | Returns error in result |
| `parsePayrollExcel` - empty rows | Skips empty rows gracefully |

### 2.2 Currency Formatter (`client/src/lib/utils.ts`)

| Test Case | Description |
|-----------|-------------|
| Format positive number | `1234.56` → `$1,235` |
| Format zero | `0` → `$0` |
| Format negative | `-500` → `-$500` |
| Format null/undefined | Returns `$0` |
| Format string number | `"1234"` → `$1,234` |

### 2.3 Date Utilities

| Test Case | Description |
|-----------|-------------|
| Get week start | Returns Monday of current week |
| Get week end | Returns Sunday of current week |
| Format date range | `2026-02-23` to `2026-03-01` → "Feb 23 - Mar 1, 2026" |

---

## 3. Integration Tests (API)

### 3.1 Projects API

| Endpoint | Test Cases |
|----------|------------|
| `GET /api/companies/:id/projects` | Returns array of projects |
| `POST /api/companies/:id/projects` | Creates project, returns with ID |
| `GET /api/projects/:id` | Returns project with extended fields |
| `PATCH /api/projects/:id` | Updates project, returns updated |

### 3.2 Payroll API

| Endpoint | Test Cases |
|----------|------------|
| `GET /api/companies/:id/payroll` | Returns payroll entries |
| `POST /api/companies/:id/payroll/parse-excel` | Parses file, returns preview |
| `POST /api/companies/:id/payroll/import` | Creates entries, returns count |
| `GET /api/projects/:id/payroll` | Returns project-specific payroll |

### 3.3 Workers API

| Endpoint | Test Cases |
|----------|------------|
| `GET /api/companies/:id/workers` | Returns workers array |
| `POST /api/companies/:id/workers` | Creates worker |
| `PATCH /api/workers/:id` | Updates worker |

### 3.4 Invoices API

| Endpoint | Test Cases |
|----------|------------|
| `GET /api/projects/:id/invoices` | Returns invoices array |
| `POST /api/companies/:id/project-invoices` | Creates invoice |
| `PATCH /api/project-invoices/:id` | Updates invoice |

### 3.5 Change Orders API

| Endpoint | Test Cases |
|----------|------------|
| `GET /api/projects/:id/change-orders` | Returns change orders |
| `POST /api/companies/:id/change-orders` | Creates change order |
| `PATCH /api/change-orders/:id` | Updates change order |

---

## 4. E2E Tests (Playwright)

### 4.1 Critical User Flows

#### Flow 1: Create Project
```
1. Navigate to /projects
2. Click "Add Project"
3. Fill in project name
4. Select status
5. Submit
6. Verify project appears in list
7. Click project to open CRM
8. Verify CRM loads with tabs
```

#### Flow 2: Import Payroll
```
1. Navigate to /payroll
2. Click "Import Excel"
3. Upload test payroll file
4. Verify preview dialog shows
5. Check "Create missing workers"
6. Click "Import"
7. Verify success message
8. Verify entries appear in list
```

#### Flow 3: Project CRM Navigation
```
1. Navigate to /projects
2. Click on a project
3. Verify Overview tab shows
4. Click Invoices tab
5. Verify invoices content loads
6. Click Change Orders tab
7. Verify change orders load
8. Click Payroll tab
9. Verify payroll entries load
10. Click Materials tab
11. Verify materials content shows
```

#### Flow 4: Create Invoice (Phase 2)
```
1. Navigate to project CRM
2. Click Invoices tab
3. Click "New Invoice"
4. Fill invoice details
5. Select change orders to include
6. Submit
7. Verify invoice appears in list
```

#### Flow 5: Create Change Order (Phase 2)
```
1. Navigate to project CRM
2. Click Change Orders tab
3. Click "New CO"
4. Fill CO details
5. Submit
6. Verify CO appears in list
```

### 4.2 Smoke Tests (Run on Every Deploy)

| Test | Description |
|------|-------------|
| Homepage loads | Dashboard renders without errors |
| Projects page loads | Projects list renders |
| Project CRM loads | CRM with tabs renders |
| Payroll page loads | Payroll list renders |
| Settings page loads | Settings form renders |
| Navigation works | All nav links work |

---

## 5. Test Data

### 5.1 Fixtures

```typescript
// test/fixtures/project.ts
export const testProject = {
  name: "TEST PROJECT",
  status: "active",
  companyId: "test-company-id",
};

// test/fixtures/payroll.ts
export const testPayrollRow = {
  workerName: "Test Worker",
  proyecto: "TEST PROJECT",
  dailyRate: 200,
  daysWorked: 5,
  basePay: 1000,
  parking: 50,
  totalPay: 1050,
};

// test/fixtures/worker.ts
export const testWorker = {
  name: "Test Worker",
  dailyRate: "200.00",
  role: "framer",
  workerType: "employee",
  status: "active",
};
```

### 5.2 Test Files

| File | Location | Purpose |
|------|----------|---------|
| test-payroll.xlsx | test/fixtures/ | Valid payroll Excel |
| test-payroll-invalid.xlsx | test/fixtures/ | Missing columns |
| test-payroll-empty.xlsx | test/fixtures/ | No data rows |

---

## 6. Test Environment

### 6.1 Setup Requirements

```bash
# Install test dependencies
npm install -D vitest @testing-library/react @testing-library/jest-dom
npm install -D @playwright/test

# Initialize Playwright
npx playwright install
```

### 6.2 Configuration Files

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
    },
  },
});
```

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  baseURL: 'http://localhost:5050',
  use: {
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 5050,
    reuseExistingServer: true,
  },
});
```

---

## 7. Test Execution

### 7.1 Commands

```bash
# Run all unit tests
npm run test

# Run unit tests in watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run specific test file
npm run test -- payrollParser.test.ts

# Run tests with coverage
npm run test:coverage
```

### 7.2 CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

---

## 8. Bug Tracking

### 8.1 Current Bugs

| ID | Description | Status | Test to Add |
|----|-------------|--------|-------------|
| BUG-001 | Payroll parseResult.rows undefined | Open | E2E: payroll page load |
| BUG-002 | Report generation fails | Open | E2E: generate report |
| BUG-003 | Workers API returns wrapped object | Open | Integration: workers endpoint |

### 8.2 Regression Tests

After fixing each bug, add a test to prevent regression:

```typescript
// test/regression/bug-001.test.ts
test('BUG-001: Payroll page loads without parseResult error', async ({ page }) => {
  await page.goto('/payroll');
  await expect(page.locator('h1')).toContainText('Payroll');
  // No runtime error should appear
  await expect(page.locator('[data-error]')).not.toBeVisible();
});
```

---

## 9. Test Maintenance

### 9.1 Review Schedule

- **Daily:** Run smoke tests on develop branch
- **Weekly:** Full E2E suite review
- **Sprint End:** Coverage report review

### 9.2 Test Ownership

| Area | Owner |
|------|-------|
| Unit Tests | Developer who writes feature |
| Integration Tests | Backend developer |
| E2E Tests | Full-stack developer |

---

## 10. Appendix

### A. Test File Structure

```
/test
  /unit
    /server
      payrollParser.test.ts
      storage.test.ts
    /client
      utils.test.ts
      formatters.test.ts
  /integration
    projects.test.ts
    payroll.test.ts
    workers.test.ts
  /e2e
    projects.spec.ts
    payroll.spec.ts
    navigation.spec.ts
  /fixtures
    project.ts
    payroll.ts
    worker.ts
    test-payroll.xlsx
  setup.ts
```

### B. Test Naming Convention

- Unit: `[function].test.ts`
- Integration: `[resource].test.ts`
- E2E: `[flow].spec.ts`
- Fixtures: `[entity].ts`
