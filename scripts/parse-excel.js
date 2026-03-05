import XLSX from 'xlsx';

const file1 = '/Users/hectorpulido/Downloads/Cuentas por cobrar - CO y Proporsal pendientes Trebol Contractor.xlsx';
const file2 = '/Users/hectorpulido/Downloads/Cuadro de Gastos Proyectos en ejecucion (Trebol Contractors Corp).xlsx';

console.log("=".repeat(80));
console.log("FILE 1: CUENTAS POR COBRAR (Accounts Receivable)");
console.log("=".repeat(80));

const wb1 = XLSX.readFile(file1);
console.log("\nSheets:", wb1.SheetNames.join(", "));

for (const sheetName of wb1.SheetNames) {
  console.log("\n" + "-".repeat(60));
  console.log("SHEET: " + sheetName);
  console.log("-".repeat(60));
  const sheet = wb1.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  for (let i = 0; i < Math.min(35, data.length); i++) {
    const row = data[i].slice(0, 14).map(function(c) { return String(c).substring(0, 20); });
    if (row.some(function(c) { return c.trim(); })) {
      console.log("Row " + i + ": " + row.join(" | "));
    }
  }
}

console.log("\n\n" + "=".repeat(80));
console.log("FILE 2: CUADRO DE GASTOS (Project Expenses)");
console.log("=".repeat(80));

const wb2 = XLSX.readFile(file2);
console.log("\nSheets:", wb2.SheetNames.join(", "));

for (const sheetName of wb2.SheetNames) {
  console.log("\n" + "-".repeat(60));
  console.log("SHEET: " + sheetName);
  console.log("-".repeat(60));
  const sheet = wb2.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  for (let i = 0; i < Math.min(55, data.length); i++) {
    const row = data[i].slice(0, 12).map(function(c) { return String(c).substring(0, 16); });
    if (row.some(function(c) { return c.trim(); })) {
      console.log("Row " + i + ": " + row.join(" | "));
    }
  }
}
