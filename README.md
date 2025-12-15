# JobCost AI

A mobile-friendly construction finance analytics platform that helps contractors track project costs, revenue, and margins through weekly job cost reports.

## Features

- **Dashboard**: Real-time KPI metrics, project tracking, and actionable financial insights
- **Projects Management**: Track multiple construction projects with cost/revenue breakdowns
- **Weekly Reports**: Automated weekly report generation with margin analysis
- **Labor Tracking**: Detailed labor hour and cost tracking by worker
- **CSV Import**: Import transactions from spreadsheets
- **Configurable Alerts**: Custom thresholds for margin, cost spikes, and large transactions
- **Notifications**: Email, SMS, and WhatsApp notification support (configurable)
- **QuickBooks Integration**: Connect to QuickBooks Online for automatic transaction sync (placeholder)

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, shadcn/ui
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **State Management**: TanStack React Query

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd jobcost-ai
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials and secrets
```

4. Push the database schema:
```bash
npm run db:push
```

5. (Optional) Seed demo data:
```bash
npx tsx scripts/seed.ts
```

6. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5000`

### Production Build

```bash
npm run build
npm start
```

## Environment Variables

See `.env.example` for all available configuration options:

- `DATABASE_URL` - PostgreSQL connection string (required)
- `SESSION_SECRET` - Session encryption secret (required)
- `EMAIL_*` - SMTP settings for email notifications (optional)
- `TWILIO_*` - Twilio settings for SMS notifications (optional)
- `QB_*` - QuickBooks OAuth settings (optional)

## Project Structure

```
client/           # React frontend
  src/
    components/   # Reusable UI components
    pages/        # Page components
    lib/          # Utilities and API client
server/           # Express backend
  storage.ts      # Database operations
  routes.ts       # API endpoints
  notifications.ts # Notification service
shared/           # Shared types and schemas
  schema.ts       # Drizzle ORM schema
scripts/          # Utility scripts
  seed.ts         # Database seeder
```

## API Endpoints

### Companies
- `GET /api/companies` - List all companies
- `POST /api/companies` - Create a company
- `GET /api/companies/:id` - Get company details

### Projects
- `GET /api/companies/:companyId/projects` - List projects
- `POST /api/companies/:companyId/projects` - Create project
- `GET /api/projects/:id` - Get project details
- `GET /api/projects/:id/summary` - Get project financial summary

### Transactions & Labor
- `GET /api/companies/:companyId/transactions` - List transactions
- `POST /api/companies/:companyId/transactions` - Create transaction
- `GET /api/companies/:companyId/labor` - List labor entries
- `POST /api/companies/:companyId/labor` - Create labor entry

### Reports & Dashboard
- `GET /api/companies/:companyId/dashboard` - Get dashboard data
- `GET /api/companies/:companyId/reports` - List weekly reports
- `POST /api/companies/:companyId/reports/weekly` - Generate weekly report

### Settings
- `GET /api/settings?companyId=` - Get company settings
- `PUT /api/settings?companyId=` - Update company settings

### QuickBooks Integration
- `GET /api/integrations/quickbooks/status?companyId=` - Connection status
- `GET /api/integrations/quickbooks/connect?companyId=` - Get auth URL
- `POST /api/integrations/quickbooks/disconnect?companyId=` - Disconnect
- `POST /api/integrations/quickbooks/sync-now?companyId=` - Trigger sync

## License

MIT
