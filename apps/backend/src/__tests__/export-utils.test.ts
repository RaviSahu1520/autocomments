import { describe, it, expect } from 'vitest';
import { rowsToCsv, rowsToExcelXml } from '../utils/export.js';

describe('Export Utils', () => {
    it('should produce CSV with headers and escaped values', () => {
        const csv = rowsToCsv([
            { id: '1', text: 'hello, "world"', count: 3 },
        ]);

        expect(csv).toContain('id,text,count');
        expect(csv).toContain('"hello, ""world"""');
    });

    it('should produce Excel XML with worksheet and rows', () => {
        const xml = rowsToExcelXml([
            { id: '1', source: 'reddit' },
            { id: '2', source: 'quora' },
        ], 'Master');

        expect(xml).toContain('<Workbook');
        expect(xml).toContain('ss:Name="Master"');
        expect(xml).toContain('<Data ss:Type="String">reddit</Data>');
    });
});

