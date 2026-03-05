#!/bin/bash
# ================================================
# PROCESS INVOICES & GENERATE REPORT
# ================================================
# Usage: ./scripts/process-and-report.sh

set -e

BASE_URL="http://localhost:5050"
TOKEN="dev-secret-token"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

header() {
    echo ""
    echo "================================================"
    echo -e "${BLUE}$1${NC}"
    echo "================================================"
}

# Check server
echo "Checking server..."
if ! curl -s "$BASE_URL/api/companies" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1; then
    echo -e "${RED}❌ Server not running! Start with: npm run dev${NC}"
    exit 1
fi

# Get company ID
COMPANY_RESPONSE=$(curl -s "$BASE_URL/api/companies" -H "Authorization: Bearer $TOKEN")
COMPANY_ID=$(echo "$COMPANY_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
COMPANY_NAME=$(echo "$COMPANY_RESPONSE" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$COMPANY_ID" ]; then
    echo -e "${RED}❌ No company found. Run: npx tsx scripts/fresh-start.ts${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Company: $COMPANY_NAME ($COMPANY_ID)${NC}"

header "STEP 1: Upload Invoice PDFs"
echo ""
echo "Drag and drop your invoice PDF files here, or enter the full path."
echo "Enter 'done' when finished uploading."
echo ""

JOB_IDS=()

while true; do
    echo -n "Invoice path (or 'done'): "
    read INVOICE_PATH

    if [ "$INVOICE_PATH" = "done" ]; then
        break
    fi

    # Remove quotes if present
    INVOICE_PATH=$(echo "$INVOICE_PATH" | sed "s/^'//;s/'$//;s/^\"//;s/\"$//")

    if [ ! -f "$INVOICE_PATH" ]; then
        echo -e "${RED}❌ File not found: $INVOICE_PATH${NC}"
        continue
    fi

    echo "Uploading: $(basename "$INVOICE_PATH")..."

    UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/api/ingestion/upload" \
        -H "Authorization: Bearer $TOKEN" \
        -F "file=@$INVOICE_PATH" \
        -F "companyId=$COMPANY_ID")

    JOB_ID=$(echo "$UPLOAD_RESPONSE" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)

    if [ -n "$JOB_ID" ]; then
        echo -e "${GREEN}   ✅ Uploaded! Job ID: $JOB_ID${NC}"
        JOB_IDS+=("$JOB_ID")
    else
        echo -e "${RED}   ❌ Upload failed: $UPLOAD_RESPONSE${NC}"
    fi
done

if [ ${#JOB_IDS[@]} -eq 0 ]; then
    echo -e "${YELLOW}No invoices uploaded. Checking existing jobs...${NC}"
fi

header "STEP 2: Process Uploaded Invoices"

for JOB_ID in "${JOB_IDS[@]}"; do
    echo "Processing job $JOB_ID..."

    PROCESS_RESPONSE=$(curl -s -X POST "$BASE_URL/api/ingestion/jobs/$JOB_ID/run-mvp" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json")

    echo "$PROCESS_RESPONSE" | grep -o '"status":"[^"]*"' || echo "Processing..."
done

echo ""
echo "Waiting for processing to complete..."
sleep 5

header "STEP 3: Review Invoices"

INVOICES_RESPONSE=$(curl -s "$BASE_URL/api/invoices?companyId=$COMPANY_ID" \
    -H "Authorization: Bearer $TOKEN")

echo "$INVOICES_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$INVOICES_RESPONSE"

# Extract invoice IDs
INVOICE_IDS=$(echo "$INVOICES_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

header "STEP 4: Approve All Invoices"

for INV_ID in $INVOICE_IDS; do
    echo "Approving invoice $INV_ID..."
    curl -s -X POST "$BASE_URL/api/invoices/$INV_ID/approve" \
        -H "Authorization: Bearer $TOKEN" > /dev/null
    echo -e "${GREEN}   ✅ Approved${NC}"
done

header "STEP 5: Generate CSV Report"

TODAY=$(date +%Y-%m-%d)
WEEK_AGO=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d "7 days ago" +%Y-%m-%d)
REPORT_FILE="trebol_report_$TODAY.csv"

echo "Generating report from $WEEK_AGO to $TODAY..."

curl -s "$BASE_URL/api/companies/$COMPANY_ID/reports/weekly/csv?weekStart=$WEEK_AGO&weekEnd=$TODAY" \
    -H "Authorization: Bearer $TOKEN" \
    -o "$REPORT_FILE"

if [ -f "$REPORT_FILE" ] && [ -s "$REPORT_FILE" ]; then
    echo -e "${GREEN}✅ Report saved to: $REPORT_FILE${NC}"
    echo ""
    echo "Preview:"
    head -20 "$REPORT_FILE"
else
    echo -e "${YELLOW}Note: CSV report may be empty if no approved invoices in date range.${NC}"
    echo "Generating line items export instead..."

    # Get first project ID
    PROJECT_ID=$(curl -s "$BASE_URL/api/companies/$COMPANY_ID/projects" \
        -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -n "$PROJECT_ID" ]; then
        curl -s "$BASE_URL/api/projects/$PROJECT_ID/line-items/export" \
            -H "Authorization: Bearer $TOKEN" \
            -o "line_items_$TODAY.csv"
        echo -e "${GREEN}✅ Line items export saved to: line_items_$TODAY.csv${NC}"
    fi
fi

header "SUMMARY"

echo ""
echo "📊 Invoices processed: ${#JOB_IDS[@]}"
echo "📁 Report file: $REPORT_FILE"
echo ""
echo "You can now:"
echo "  - Open the CSV in Excel"
echo "  - Share it with your cousin"
echo "  - Run 'npm run ops' for more options"
echo ""
