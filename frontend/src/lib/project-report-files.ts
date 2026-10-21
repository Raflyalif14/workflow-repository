import type { Cell, CellObject, SheetData } from 'write-excel-file/browser';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ProjectReport } from './project-report';

export function projectReportSheet(report: ProjectReport): SheetData {
  // Explicit strings cannot become spreadsheet formulas, URLs, or external references.
  const text = (value: string, style: Partial<CellObject> = {}): Cell => ({ type: String, value, fontFamily: 'Calibri', fontSize: 11, wrap: true, alignVertical: 'top', ...style });
  const full = (value: string, style: Partial<CellObject> = {}) => [text(value, { columnSpan: 6, ...style }), null, null, null, null, null];
  const rows: SheetData = [
    full('WORKFLOWHUB', { textColor: '#2563EB', fontWeight: 'bold', height: 25 }),
    full(report.labels.title, { fontSize: 20, fontWeight: 'bold', height: 34 }),
    full(`${report.labels.generated}: ${report.generatedAt}`, { textColor: '#64748B', height: 24 }), [],
    ...report.summary.map(([label, value]) => [text(label, { columnSpan: 2, fontWeight: 'bold', backgroundColor: '#EFF6FF', height: 30 }), null, text(value, { columnSpan: 4 }), null, null, null]),
    [], full(report.labels.scope, { textColor: '#64748B', height: 28 }),
    full(report.labels.milestones, { fontSize: 14, fontWeight: 'bold', height: 30 }),
    report.headers.map(label => text(label, { fontWeight: 'bold', backgroundColor: '#1E40AF', textColor: '#FFFFFF', height: 30 })),
  ];
  for (const [index, row] of report.rows.entries()) rows.push(row.map((value, col) => col === 0
    ? { type: Number, value: index + 1, align: 'center', alignVertical: 'top', height: Math.max(38, ...row.map((cell, column) => Math.ceil(cell.length / [5, 40, 21, 31, 16, 16][column]) * 15 + 12)), backgroundColor: index % 2 ? '#F1F5F9' : '#FFFFFF' }
    : text(value, { backgroundColor: index % 2 ? '#F1F5F9' : '#FFFFFF' })));
  if (!report.rows.length) rows.push(full(report.labels.empty, { height: 30 }));
  rows.push([], full(report.labels.note, { textColor: '#64748B', height: 34 }));
  return rows;
}

export function projectReportPdf(report: ProjectReport): TDocumentDefinitions {
  const summary: Content = {
    table: { widths: [100, '*'], body: report.summary.map(([label, value]) => [
      { text: label, bold: true, color: '#475569', fillColor: '#F1F5F9' }, { text: value },
    ]) }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 6, paddingBottom: () => 6, paddingLeft: () => 9, paddingRight: () => 9 },
  };
  return {
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [36, 38, 36, 44],
    info: { title: `${report.labels.title} - ${report.name}`, author: 'WorkflowHub', subject: report.labels.scope },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#0F172A', lineHeight: 1.2 },
    footer: (page, pages) => ({ margin: [36, 12, 36, 0], columns: [
      { text: 'WorkflowHub', color: '#64748B', fontSize: 8 },
      { text: `${report.labels.page} ${page} ${report.labels.of} ${pages}`, alignment: 'right', color: '#64748B', fontSize: 8 },
    ] }),
    content: [
      { text: 'WORKFLOWHUB', color: '#2563EB', fontSize: 10, bold: true, characterSpacing: 2, margin: [0, 0, 0, 8] },
      { text: report.labels.title, fontSize: 23, bold: true, margin: [0, 0, 0, 4] },
      { text: `${report.labels.generated}: ${report.generatedAt}`, color: '#64748B', fontSize: 8, margin: [0, 0, 0, 18] },
      summary,
      { text: report.labels.scope, color: '#64748B', fontSize: 8, margin: [0, 12, 0, 14] },
      { text: report.labels.milestones, fontSize: 13, bold: true, margin: [0, 0, 0, 9] },
      report.rows.length ? {
        table: { headerRows: 1, widths: [22, '*', 85, 120, 68, 68], body: [
          report.headers.map(text => ({ text, color: '#FFFFFF', bold: true, fillColor: '#1E40AF' })),
          ...report.rows.map((row, index) => row.map(text => ({ text, fillColor: index % 2 ? '#F1F5F9' : '#FFFFFF' }))),
        ] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 7, paddingBottom: () => 7, paddingLeft: () => 8, paddingRight: () => 8 },
      } : { text: report.labels.empty, color: '#64748B', margin: [0, 0, 0, 12] },
      { text: report.labels.note, color: '#64748B', fontSize: 8, margin: [0, 16, 0, 0] },
    ],
  };
}

export async function createProjectReportBlob(report: ProjectReport, format: 'xlsx' | 'pdf'): Promise<Blob> {
  if (format === 'xlsx') {
    const { default: writeExcelFile } = await import('write-excel-file/browser');
    return writeExcelFile(projectReportSheet(report), { sheet: report.labels.summary.slice(0, 31), columns: [6, 45, 24, 35, 18, 18].map(width => ({ width })), orientation: 'landscape', showGridLines: false }).toBlob();
  }
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  pdfMake.addVirtualFileSystem(fonts);
  return pdfMake.createPdf(projectReportPdf(report)).getBlob();
}
