export type ExportRow = Record<string, unknown>;

function toCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
}

function escapeCsv(value: string): string {
    if (/[",\r\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function rowsToCsv(rows: ExportRow[]): string {
    if (rows.length === 0) return '\uFEFF';

    const headers = Object.keys(rows[0]);
    const lines: string[] = [];
    lines.push(headers.map(escapeCsv).join(','));

    for (const row of rows) {
        const line = headers
            .map((header) => escapeCsv(toCell(row[header])))
            .join(',');
        lines.push(line);
    }

    return '\uFEFF' + lines.join('\n');
}

export function rowsToExcelXml(rows: ExportRow[], sheetName = 'Export'): string {
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const headerRow = headers
        .map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
        .join('');

    const dataRows = rows.map((row) => {
        const cells = headers
            .map((header) => `<Cell><Data ss:Type="String">${escapeXml(toCell(row[header]))}</Data></Cell>`)
            .join('');
        return `<Row>${cells}</Row>`;
    }).join('');

    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="${escapeXml(sheetName.substring(0, 31) || 'Export')}">
  <Table>
   ${headers.length > 0 ? `<Row>${headerRow}</Row>` : ''}
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;
}

