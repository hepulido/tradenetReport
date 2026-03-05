import XLSX from 'xlsx';

const files = [
  { name: 'Invoice Template (AIA)', path: '/Users/hectorpulido/Downloads/Facturas - Template Invoice and Draw (AIA).xlsx' },
  { name: 'Facturas Trebol Contractor', path: '/Users/hectorpulido/Downloads/Facturas Trebol Contractor.xlsx' },
  { name: 'MATERIAL', path: '/Users/hectorpulido/Downloads/MATERIAL.xlsx' },
  { name: 'Prueba (Test)', path: '/Users/hectorpulido/Downloads/prueba.xlsx' },
  { name: 'Nomina (Payroll)', path: '/Users/hectorpulido/Downloads/Nomina 02-26-2026 Trebol (1).xlsx' },
];

for (const file of files) {
  console.log("\n" + "=".repeat(100));
  console.log("FILE: " + file.name);
  console.log("=".repeat(100));

  try {
    const wb = XLSX.readFile(file.path);
    console.log("Sheets:", wb.SheetNames.join(", "));

    for (const sheetName of wb.SheetNames) {
      console.log("\n" + "-".repeat(80));
      console.log("SHEET: " + sheetName);
      console.log("-".repeat(80));

      const sheet = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      // Show more rows for detailed analysis
      const maxRows = Math.min(60, data.length);
      for (let i = 0; i < maxRows; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        // Show up to 15 columns, truncate long values
        const displayRow = row.slice(0, 15).map(c => {
          const val = String(c).trim();
          return val.length > 25 ? val.substring(0, 22) + "..." : val;
        });

        if (displayRow.some(c => c)) {
          console.log(`Row ${i}: ${displayRow.join(" | ")}`);
        }
      }

      if (data.length > maxRows) {
        console.log(`... (${data.length - maxRows} more rows)`);
      }
    }
  } catch (err) {
    console.log("ERROR reading file:", err.message);
  }
}
