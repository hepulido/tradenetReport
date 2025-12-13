# JobCost AI

## Overview

JobCost AI is a mobile-friendly construction finance analytics platform that helps contractors track project costs, revenue, and margins through weekly job cost reports. The application follows a Company → Projects → Weekly Reports hierarchy, with support for CSV transaction imports and future QuickBooks integration.

The system is designed as a demo-first MVP that can scale, focusing on weekly report generation as the core value proposition. It provides a dashboard-centric interface with KPI metrics, project tracking, and actionable financial insights for construction businesses.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, bundled via Vite
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state, React Context for company selection
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens, supporting light/dark themes
- **Design System**: Modern dashboard style (inspired by Linear/Stripe) with Inter font family and JetBrains Mono for financial figures

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints under `/api/` prefix
- **Build**: esbuild for production bundling with selective dependency inclusion

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` contains all table definitions with Zod validation
- **Database**: PostgreSQL with UUID primary keys (gen_random_uuid)
- **Migrations**: Drizzle Kit for schema push (`db:push` command)

### Core Data Models
- **Companies**: Multi-tenant root entity with timezone support
- **Projects**: Belong to companies with status tracking (active/paused/closed)
- **Transactions**: Unified cost/revenue tracking with categories (material, labor, equipment, revenue)
- **Labor Entries**: Optional detailed labor hour tracking
- **Weekly Reports**: Aggregated summaries with JSON report data and AI-generated insights
- **Import Files/Rows**: CSV import pipeline for transaction ingestion

### Key Design Decisions
1. **Unified Transaction Table**: Labor, materials, and revenue all stored in transactions table for MVP simplicity, with category field for differentiation
2. **Company Isolation**: All data is scoped by companyId for multi-tenant support
3. **Weekly Report Focus**: Reports are the primary deliverable, generated from transaction aggregations
4. **Import Pipeline**: CSV upload with column mapping prepares for future QuickBooks integration
5. **Shared Schema**: Types are shared between client and server via `@shared/` path alias

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable
- **connect-pg-simple**: Session storage in PostgreSQL

### UI Libraries
- **Radix UI**: Full suite of accessible primitives (dialog, dropdown, tabs, etc.)
- **Lucide React**: Icon library
- **Recharts**: Chart components for data visualization
- **date-fns**: Date manipulation and formatting
- **react-day-picker**: Calendar component

### Form & Validation
- **React Hook Form**: Form state management
- **Zod**: Schema validation (shared between client/server via drizzle-zod)

### Development Tools
- **Vite**: Development server with HMR
- **TypeScript**: Full type coverage across client/server/shared
- **Tailwind CSS**: Utility-first styling with PostCSS

### File Processing
- **xlsx**: Excel/CSV file parsing for transaction imports
- **multer**: File upload handling (listed in build allowlist)

### Future Integrations (Prepared)
- **OpenAI/@google/generative-ai**: AI-powered report insights
- **Stripe**: Payment processing
- **Nodemailer**: Email notifications