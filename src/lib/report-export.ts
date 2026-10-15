export type ExportTable = { title: string; header: string[]; rows: (string | number)[][] };

export function asExportCell(value: string | number): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export async function exportXlsx(filename: string, tables: ExportTable[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const t of tables) {
    const ws = XLSX.utils.aoa_to_sheet([t.header.map((cell) => asExportCell(cell)), ...t.rows.map((row) => row.map((cell) => asExportCell(cell)))]);
    ws["!cols"] = t.header.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, t.title.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export async function exportPdf(filename: string, heading: string, subtitle: string, tables: ExportTable[]) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(heading, 40, 40);
  doc.setFontSize(9);
  doc.text(subtitle, 40, 56);
  let y = 72;
  for (const t of tables) {
    doc.setFontSize(11);
    doc.text(t.title, 40, y);
    autoTable(doc, {
      startY: y + 6,
      head: [t.header.map((cell) => String(asExportCell(cell)))],
      body: t.rows.map((r) => r.map((c) => String(asExportCell(c) ?? ""))),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [245, 168, 0], textColor: 20 },
      margin: { left: 40, right: 40 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 24;
  }
  doc.save(filename);
}
