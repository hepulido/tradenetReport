#!/bin/bash
# Run the full demo - upload 3 invoices, process them, generate report

COMPANY_ID="bdcfdd0f-d122-46c7-a015-04e187e0de59"
TOKEN="dev-secret-token"
BASE="http://localhost:5050"

echo "=========================================="
echo "TREBOL CONTRACTORS - INVOICE PROCESSING"
echo "=========================================="

# Invoice 1: FBM
echo ""
echo "📄 Uploading FBM Invoice..."
JOB1=$(curl -s -X POST "$BASE/api/ingestion/upload?companyId=$COMPANY_ID" -H "x-ingest-token: $TOKEN" -F "file=@/Users/hectorpulido/Downloads/SalesInvoice_Bills_120040985-00_20251226104928904 (12-26).pdf" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
echo "   Job ID: $JOB1"

echo "   Processing..."
curl -s -X POST "$BASE/api/ingestion/jobs/$JOB1/run" -H "x-ingest-token: $TOKEN" -H "Content-Type: application/json" -d '{"forceReprocess":true}' > /dev/null
echo "   ✅ Done"

# Invoice 2: Banner Supply
echo ""
echo "📄 Uploading Banner Supply Invoice..."
JOB2=$(curl -s -X POST "$BASE/api/ingestion/upload?companyId=$COMPANY_ID" -H "x-ingest-token: $TOKEN" -F "file=@/Users/hectorpulido/Downloads/Invoice.pdf" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
echo "   Job ID: $JOB2"

echo "   Processing..."
curl -s -X POST "$BASE/api/ingestion/jobs/$JOB2/run" -H "x-ingest-token: $TOKEN" -H "Content-Type: application/json" -d '{"forceReprocess":true}' > /dev/null
echo "   ✅ Done"

# Invoice 3: Home Depot
echo ""
echo "📄 Uploading Home Depot Receipt..."
JOB3=$(curl -s -X POST "$BASE/api/ingestion/upload?companyId=$COMPANY_ID" -H "x-ingest-token: $TOKEN" -F "file=@/Users/hectorpulido/Downloads/eReceipt.pdf" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
echo "   Job ID: $JOB3"

echo "   Processing..."
curl -s -X POST "$BASE/api/ingestion/jobs/$JOB3/run" -H "x-ingest-token: $TOKEN" -H "Content-Type: application/json" -d '{"forceReprocess":true}' > /dev/null
echo "   ✅ Done"

# Wait for processing
echo ""
echo "⏳ Waiting for OCR processing (30 seconds)..."
sleep 30

# Show invoices
echo ""
echo "=========================================="
echo "📋 PROCESSED INVOICES"
echo "=========================================="
curl -s "$BASE/api/invoices?companyId=$COMPANY_ID" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Generate report
echo ""
echo "=========================================="
echo "📊 GENERATING CSV REPORT"
echo "=========================================="
curl -s "$BASE/api/companies/$COMPANY_ID/reports/weekly/csv?weekStart=2025-01-01&weekEnd=2026-12-31" -H "Authorization: Bearer $TOKEN" -o ~/Downloads/trebol_report.csv
echo "✅ Report saved to: ~/Downloads/trebol_report.csv"

# Show report preview
echo ""
echo "Preview:"
cat ~/Downloads/trebol_report.csv

echo ""
echo "=========================================="
echo "✅ COMPLETE!"
echo "=========================================="
echo "Open ~/Downloads/trebol_report.csv in Excel"
