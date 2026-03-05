/**
 * Payroll Excel Parser
 * Parses Trebol's weekly payroll Excel format (Nomina) and converts to payroll entries
 *
 * Supports two Excel formats:
 *
 * FORMAT 1: Pivot-table style (current)
 * - Row 0: "SEMANA" header with week range like "SEMANA DEL 02/20/2026 AL 02/26/2026"
 * - Row 2: Column headers [APELLIDO Y NOMBRE, NOMBRE DEL PROYECTO, SUELDO SEMANAL, PARKING, Suma de SUELDO TOTAL]
 * - Data: Worker name on first row, subsequent rows for same worker have empty first column
 * - "Total [name]" rows are subtotals to skip
 *
 * FORMAT 2: Flat format (legacy)
 * - Full row per entry with all columns
 */

import XLSX from 'xlsx';

export interface PayrollRow {
  empresa: string;
  proyecto: string;
  semana: string;
  workerName: string;
  cargo: string | null;
  dailyRate: number;
  daysWorked: number;
  basePay: number;
  parking: number;
  overtimeHours: number;
  overtimePay: number;
  bonus: number;
  deductions: number;
  totalPay: number;
}

export interface ParsedPayroll {
  weekStart: string;
  weekEnd: string;
  rows: PayrollRow[];
  errors: string[];
  warnings: string[];
}

/**
 * Parse week string like "SEMANA DEL 02/20/2026 AL 02/26/2026" to dates
 */
function parseWeekString(semana: string): { weekStart: string; weekEnd: string } | null {
  // Try to extract dates from various formats
  // Format 1: "SEMANA DEL MM/DD/YYYY AL MM/DD/YYYY"
  const match1 = semana.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+AL\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (match1) {
    const [, startStr, endStr] = match1;
    const startParts = startStr.split('/');
    const endParts = endStr.split('/');

    // MM/DD/YYYY format
    const weekStart = `${startParts[2]}-${startParts[0].padStart(2, '0')}-${startParts[1].padStart(2, '0')}`;
    const weekEnd = `${endParts[2]}-${endParts[0].padStart(2, '0')}-${endParts[1].padStart(2, '0')}`;

    return { weekStart, weekEnd };
  }

  // Format 2: Just extract any date pattern
  const dateMatch = semana.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dateMatch) {
    const [, month, day, year] = dateMatch;
    const weekStart = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    // Calculate week end (6 days later)
    const startDate = new Date(weekStart);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    const weekEnd = endDate.toISOString().split('T')[0];

    return { weekStart, weekEnd };
  }

  return null;
}

/**
 * Parse a numeric value from Excel cell (handles strings, numbers, null)
 */
function parseNumber(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Skip special values
    if (value === '(en blanco)' || value === '(blank)') return 0;
    // Remove currency symbols, commas, etc.
    const cleaned = value.replace(/[$,]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

/**
 * Clean and normalize worker name
 */
function normalizeWorkerName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Clean and normalize project name
 */
function normalizeProjectName(name: string): string {
  return name.trim().toUpperCase();
}

/**
 * Parse pivot-table style payroll Excel (Format 1)
 * Where workers span multiple rows with projects underneath
 */
function parsePivotFormat(data: any[][], weekInfo: string): { rows: PayrollRow[]; warnings: string[] } {
  const rows: PayrollRow[] = [];
  const warnings: string[] = [];

  // Find header row
  let headerRowIndex = -1;
  let colMap = { name: 0, project: 1, basePay: 2, parking: 3, totalPay: 4 };

  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const rowStr = row.map((c: any) => String(c).toLowerCase()).join('|');

    if (rowStr.includes('apellido') && rowStr.includes('proyecto')) {
      headerRowIndex = i;

      // Map columns dynamically
      for (let j = 0; j < row.length; j++) {
        const header = String(row[j]).toLowerCase().trim();
        // Worker name column: "apellido y nombre" (prioritize apellido)
        if (header.includes('apellido')) colMap.name = j;
        // Project column: "nombre del proyecto" (must have proyecto)
        if (header.includes('proyecto')) colMap.project = j;
        if (header.includes('sueldo semanal') || header.includes('semanal')) colMap.basePay = j;
        if (header.includes('parking')) colMap.parking = j;
        if (header.includes('total') || header.includes('suma')) colMap.totalPay = j;
      }
      break;
    }
  }

  if (headerRowIndex === -1) {
    warnings.push('Could not find header row, using default column mapping');
    headerRowIndex = 2; // Default to row 2
  }

  let currentWorker = '';

  // Parse data rows
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const nameCell = String(row[colMap.name] || '').trim();
    const projectCell = String(row[colMap.project] || '').trim();

    // Skip total rows and empty rows
    if (nameCell.toLowerCase().startsWith('total ') || nameCell.toLowerCase() === 'total general') {
      continue;
    }

    // Skip blank/invalid entries
    if (nameCell === '(en blanco)' || projectCell === '(en blanco)') {
      continue;
    }

    // Update current worker if name cell is not empty
    if (nameCell && nameCell !== '0') {
      currentWorker = nameCell;
    }

    // Skip if no project or no current worker
    if (!projectCell || !currentWorker || projectCell === '0') {
      continue;
    }

    const basePay = parseNumber(row[colMap.basePay]);
    const parking = parseNumber(row[colMap.parking]);
    const totalPay = parseNumber(row[colMap.totalPay]);

    // Skip rows with no pay data
    if (totalPay === 0 && basePay === 0) {
      continue;
    }

    rows.push({
      empresa: 'TREBOL CONTRACTOR',
      proyecto: normalizeProjectName(projectCell),
      semana: weekInfo,
      workerName: normalizeWorkerName(currentWorker),
      cargo: null,
      dailyRate: 0, // Not available in this format
      daysWorked: 0, // Not available in this format
      basePay,
      parking,
      overtimeHours: 0,
      overtimePay: 0,
      bonus: 0,
      deductions: 0,
      totalPay: totalPay || (basePay + parking),
    });
  }

  return { rows, warnings };
}

/**
 * Parse flat format payroll Excel (Format 2 - legacy)
 * Where each row is a complete entry
 */
function parseFlatFormat(data: any[][], weekInfo: string): { rows: PayrollRow[]; warnings: string[] } {
  const rows: PayrollRow[] = [];
  const warnings: string[] = [];

  // Find header row with full column set
  let headerRowIndex = -1;
  let columnMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i];
    if (!row) continue;

    const rowStr = row.map((c: any) => String(c).toLowerCase()).join('|');

    // Look for rows with sueldo diario (indicates flat format)
    if (rowStr.includes('sueldo diario') || rowStr.includes('dias laborados')) {
      headerRowIndex = i;

      for (let j = 0; j < row.length; j++) {
        const header = String(row[j]).toLowerCase().trim();

        if (header.includes('empresa')) columnMap.empresa = j;
        if (header.includes('proyecto')) columnMap.proyecto = j;
        if (header.includes('semana')) columnMap.semana = j;
        if (header.includes('apellido') || (header.includes('nombre') && !header.includes('proyecto'))) columnMap.workerName = j;
        if (header.includes('cargo')) columnMap.cargo = j;
        if (header.includes('sueldo diario')) columnMap.dailyRate = j;
        if (header.includes('dias laborados') || header.includes('dias')) columnMap.daysWorked = j;
        if (header.includes('sueldo semanal')) columnMap.basePay = j;
        if (header.includes('parking')) columnMap.parking = j;
        if (header.includes('horas extra')) columnMap.overtimeHours = j;
        if (header.includes('bonificacion') && !columnMap.bonus) columnMap.bonus = j;
        if (header.includes('deducc') && !columnMap.deductions) columnMap.deductions = j;
        if (header.includes('sueldo total') || header === 'total') columnMap.totalPay = j;
      }

      break;
    }
  }

  if (headerRowIndex === -1) {
    warnings.push('Could not find flat format header row');
    return { rows: [], warnings };
  }

  // Parse data rows
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const workerNameRaw = String(row[columnMap.workerName] || '').trim();
    if (!workerNameRaw || workerNameRaw === '0' || workerNameRaw === '(en blanco)') {
      continue;
    }

    const proyectoRaw = String(row[columnMap.proyecto] || '').trim();
    if (!proyectoRaw || proyectoRaw === '0') {
      continue;
    }

    const dailyRate = parseNumber(row[columnMap.dailyRate]);
    const daysWorked = parseNumber(row[columnMap.daysWorked]);
    const basePay = parseNumber(row[columnMap.basePay]);
    const parking = parseNumber(row[columnMap.parking]);
    const overtimeHours = parseNumber(row[columnMap.overtimeHours]);
    const bonus = parseNumber(row[columnMap.bonus]);
    const deductions = parseNumber(row[columnMap.deductions]);
    const totalPay = parseNumber(row[columnMap.totalPay]);

    if (totalPay === 0 && basePay === 0 && daysWorked === 0) {
      continue;
    }

    let overtimePay = 0;
    if (overtimeHours > 0 && dailyRate > 0) {
      const hourlyRate = dailyRate / 8;
      overtimePay = hourlyRate * 1.5 * overtimeHours;
    }

    rows.push({
      empresa: String(row[columnMap.empresa] || 'TREBOL CONTRACTOR').trim(),
      proyecto: normalizeProjectName(proyectoRaw),
      semana: weekInfo,
      workerName: normalizeWorkerName(workerNameRaw),
      cargo: row[columnMap.cargo] ? String(row[columnMap.cargo]).trim() : null,
      dailyRate,
      daysWorked,
      basePay: basePay || (dailyRate * daysWorked),
      parking,
      overtimeHours,
      overtimePay,
      bonus,
      deductions,
      totalPay: totalPay || (basePay + parking + overtimePay + bonus - deductions),
    });
  }

  return { rows, warnings };
}

/**
 * Parse payroll Excel file from buffer
 */
export function parsePayrollExcel(buffer: Buffer): ParsedPayroll {
  const errors: string[] = [];
  const warnings: string[] = [];
  let rows: PayrollRow[] = [];
  let weekStart = '';
  let weekEnd = '';

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Use first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      errors.push('No sheets found in workbook');
      return { weekStart: '', weekEnd: '', rows: [], errors, warnings };
    }

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

    // Extract week info from first few rows
    let weekInfo = '';
    for (let i = 0; i < Math.min(5, data.length); i++) {
      const row = data[i];
      if (!row) continue;

      for (const cell of row) {
        const cellStr = String(cell);
        if (cellStr.includes('SEMANA') || cellStr.match(/\d{2}\/\d{2}\/\d{4}/)) {
          const parsed = parseWeekString(cellStr);
          if (parsed) {
            weekStart = parsed.weekStart;
            weekEnd = parsed.weekEnd;
            weekInfo = cellStr;
            break;
          }
        }
      }
      if (weekStart) break;
    }

    // Detect format and parse accordingly
    const hasDetailedColumns = data.some((row: any[]) => {
      if (!row) return false;
      const rowStr = row.map((c: any) => String(c).toLowerCase()).join('|');
      return rowStr.includes('sueldo diario') || rowStr.includes('dias laborados');
    });

    let parseResult;
    if (hasDetailedColumns) {
      // Flat format with daily rate, days worked, etc.
      parseResult = parseFlatFormat(data, weekInfo);
    } else {
      // Pivot format with grouped workers
      parseResult = parsePivotFormat(data, weekInfo);
    }

    rows = parseResult.rows;
    warnings.push(...parseResult.warnings);

    if (rows.length === 0) {
      warnings.push('No valid payroll entries found in the file');
    }

    // If we still don't have week dates, use current week
    if (!weekStart) {
      const today = new Date();
      const monday = new Date(today);
      monday.setDate(today.getDate() - today.getDay() + 1);
      weekStart = monday.toISOString().split('T')[0];

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      weekEnd = sunday.toISOString().split('T')[0];

      warnings.push(`Could not parse week from file, using current week: ${weekStart} to ${weekEnd}`);
    }

  } catch (err: any) {
    errors.push(`Failed to parse Excel file: ${err.message}`);
  }

  return { weekStart, weekEnd, rows, errors, warnings };
}

/**
 * Convert parsed rows to payroll entry format for database
 */
export interface PayrollEntryInput {
  workerId: string;
  projectId: string;
  weekStart: string;
  weekEnd: string;
  daysWorked: string;
  dailyRate: string;
  basePay: string;
  parking: string;
  overtimeHours: string;
  overtimePay: string;
  bonus: string;
  deductions: string;
  totalPay: string;
  source: string;
  sourceRef?: string;
}

export interface PayrollImportResult {
  success: boolean;
  entriesCreated: number;
  totalPay: number;
  weekStart: string;
  weekEnd: string;
  errors: string[];
  warnings: string[];
  unmatchedWorkers: string[];
  unmatchedProjects: string[];
  createdWorkers: string[];
  entries: PayrollEntryInput[];
}
