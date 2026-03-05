#!/bin/bash
# ================================================
# FULL V2 DEMO - Multi-Invoice Processing
# ================================================
# This script:
# 1. Resets the database
# 2. Creates Trebol Contractors company
# 3. Creates projects (COACH, ARIA RESERVE, etc.)
# 4. Uploads and processes all 3 invoices with V2 extraction
# 5. Generates a CSV report grouped by project
#
# Run: ./scripts/full-demo-v2.sh

set -e

TOKEN="dev-secret-token"
BASE="http://localhost:5050"

echo ""
echo "=========================================="
echo "   TREBOL CONTRACTORS - FULL V2 DEMO"
echo "=========================================="

# Check server is running
echo ""
echo "Checking server..."
if ! curl -s "$BASE/api/companies" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1; then
  echo "❌ Server not running!"
  echo "   Run: npm run dev"
  exit 1
fi
echo "✅ Server is running"

# Step 1: Reset database
echo ""
echo "Step 1: Resetting database..."
npx tsx -r dotenv/config scripts/fresh-start.ts

# Get company ID
COMPANY_ID=$(curl -s "$BASE/api/companies" -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Company ID: $COMPANY_ID"

# Step 2: Create additional projects
echo ""
echo "Step 2: Creating additional projects..."
curl -s -X POST "$BASE/api/companies/$COMPANY_ID/projects" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"ARIA RESERVE","externalRef":"ARIA-MIAMI"}' > /dev/null
echo "✅ Created ARIA RESERVE project"

curl -s -X POST "$BASE/api/companies/$COMPANY_ID/projects" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"TREBOLCONTRACTOR","externalRef":"HOME-DEPOT-JOB"}' > /dev/null
echo "✅ Created TREBOLCONTRACTOR project"

# Step 3: Upload and process invoices with V2
echo ""
echo "Step 3: Processing invoices with V2 extraction..."

# FBM Invoice
echo ""
echo "📄 Processing FBM Invoice..."
JOB1=$(curl -s -X POST "$BASE/api/ingestion/upload?companyId=$COMPANY_ID" -H "x-ingest-token: $TOKEN" -F "file=@/Users/hectorpulido/Downloads/SalesInvoice_Bills_120040985-00_20251226104928904 (12-26).pdf" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
echo "   Job ID: $JOB1"
echo "   Running V2 extraction..."
curl -s -X POST "$BASE/api/ingestion/jobs/$JOB1/process-v2" -H "x-ingest-token: $TOKEN" -H "Content-Type: application/json"
echo ""

# Banner Supply Invoice (multi-page)
echo ""
echo "📄 Processing Banner Supply Invoice (4 pages)..."
JOB2=$(curl -s -X POST "$BASE/api/ingestion/upload?companyId=$COMPANY_ID" -H "x-ingest-token: $TOKEN" -F "file=@/Users/hectorpulido/Downloads/Invoice.pdf" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
echo "   Job ID: $JOB2"
echo "   Running V2 extraction..."
curl -s -X POST "$BASE/api/ingestion/jobs/$JOB2/process-v2" -H "x-ingest-token: $TOKEN" -H "Content-Type: application/json"
echo ""

# Home Depot Receipt
echo ""
echo "📄 Processing Home Depot Receipt..."
JOB3=$(curl -s -X POST "$BASE/api/ingestion/upload?companyId=$COMPANY_ID" -H "x-ingest-token: $TOKEN" -F "file=@/Users/hectorpulido/Downloads/eReceipt.pdf" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
echo "   Job ID: $JOB3"
echo "   Running V2 extraction..."
curl -s -X POST "$BASE/api/ingestion/jobs/$JOB3/process-v2" -H "x-ingest-token: $TOKEN" -H "Content-Type: application/json"
echo ""

# Wait for processing
echo ""
echo "⏳ Waiting for processing to complete..."
sleep 10

# Step 4: Show results
echo ""
echo "=========================================="
echo "📋 PROCESSED INVOICES"
echo "=========================================="
curl -s "$BASE/api/invoices?companyId=$COMPANY_ID" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Step 5: Generate report
echo ""
echo "=========================================="
echo "📊 GENERATING REPORT"
echo "=========================================="
npx tsx scripts/export-report.ts

echo ""
echo "=========================================="
echo "✅ DEMO COMPLETE!"
echo "=========================================="
echo ""
echo "Reports generated:"
echo "  - ~/Downloads/trebol_invoice_report.csv"
echo ""
echo "Open the CSV in Excel to see:"
echo "  - All invoices with line items"
echo "  - Categories (metal_studs, ceiling_grid, etc.)"
echo "  - Job/Project assignments"
echo ""
