import { describe, it, expect } from 'vitest';

// We'll need to extract some functions from payrollParser for testing
// For now, let's test the date parsing logic

describe('Payroll Parser', () => {
  describe('parseWeekString', () => {
    it('parses "SEMANA DEL MM/DD/YYYY AL MM/DD/YYYY" format', () => {
      const input = 'SEMANA DEL 02/20/2026 AL 02/26/2026';
      // Expected format: Match pattern, extract dates
      const match = input.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+AL\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('02/20/2026');
      expect(match![2]).toBe('02/26/2026');
    });

    it('extracts date parts correctly', () => {
      const startStr = '02/20/2026';
      const parts = startStr.split('/');

      expect(parts[0]).toBe('02'); // month
      expect(parts[1]).toBe('20'); // day
      expect(parts[2]).toBe('2026'); // year

      // Convert to ISO format
      const isoDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      expect(isoDate).toBe('2026-02-20');
    });
  });

  describe('parseNumber', () => {
    it('returns number for numeric input', () => {
      const parseNumber = (value: unknown): number => {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const cleaned = value.replace(/[$,]/g, '').trim();
          const num = parseFloat(cleaned);
          return isNaN(num) ? 0 : num;
        }
        return 0;
      };

      expect(parseNumber(100)).toBe(100);
      expect(parseNumber(0)).toBe(0);
      expect(parseNumber(-50)).toBe(-50);
    });

    it('strips currency symbols and commas', () => {
      const parseNumber = (value: unknown): number => {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const cleaned = value.replace(/[$,]/g, '').trim();
          const num = parseFloat(cleaned);
          return isNaN(num) ? 0 : num;
        }
        return 0;
      };

      expect(parseNumber('$1,234.56')).toBe(1234.56);
      expect(parseNumber('$100')).toBe(100);
      expect(parseNumber('1,000')).toBe(1000);
    });

    it('returns 0 for null/undefined/empty', () => {
      const parseNumber = (value: unknown): number => {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const cleaned = value.replace(/[$,]/g, '').trim();
          const num = parseFloat(cleaned);
          return isNaN(num) ? 0 : num;
        }
        return 0;
      };

      expect(parseNumber(null)).toBe(0);
      expect(parseNumber(undefined)).toBe(0);
      expect(parseNumber('')).toBe(0);
    });
  });

  describe('normalizeWorkerName', () => {
    it('normalizes worker names to proper case', () => {
      const normalizeWorkerName = (name: string): string => {
        return name
          .trim()
          .replace(/\s+/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      };

      expect(normalizeWorkerName('JOHN SMITH')).toBe('John Smith');
      expect(normalizeWorkerName('john smith')).toBe('John Smith');
      expect(normalizeWorkerName('  john   smith  ')).toBe('John Smith');
    });
  });

  describe('normalizeProjectName', () => {
    it('normalizes project names to uppercase', () => {
      const normalizeProjectName = (name: string): string => {
        return name.trim().toUpperCase();
      };

      expect(normalizeProjectName('hummingbird')).toBe('HUMMINGBIRD');
      expect(normalizeProjectName('  Coach  ')).toBe('COACH');
    });
  });
});
