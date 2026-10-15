// Browser-only: extracts REFERÊNCIA / DESCRIÇÃO / ESTOQUE rows from the dealer stock PDF.
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export type StockRow = { reference: string; description: string; quantity: number };

type Item = { text: string; x: number; y: number };

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseNumber(s: string) {
  const v = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}

export async function parseStockPdf(file: File, onProgress?: (page: number, total: number) => void) {
  const buf = await file.arrayBuffer();
  const source = { data: buf, isEvalSupported: false };
  const doc = await pdfjs.getDocument(source as Parameters<typeof pdfjs.getDocument>[0]).promise;
  const rows: StockRow[] = [];
  let refX = 0;
  let descX = 0;
  let stockX = 0;
  let nextX = Infinity;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      items.push({ text: it.str.trim(), x: it.transform[4], y: Math.round(it.transform[5]) });
    }
    // group by line (y tolerance 2)
    const lines = new Map<number, Item[]>();
    for (const it of items) {
      let key = it.y;
      for (const k of lines.keys()) {
        if (Math.abs(k - it.y) <= 2) {
          key = k;
          break;
        }
      }
      const arr = lines.get(key) ?? [];
      arr.push(it);
      lines.set(key, arr);
    }
    const ordered = [...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, v]) => v.sort((a, b) => a.x - b.x));

    for (const line of ordered) {
      const norm = line.map((i) => normalize(i.text));
      const hRef = norm.findIndex((t) => t.startsWith("referenc"));
      const hStock = norm.findIndex((t) => t === "estoque");
      const refItem = line[hRef];
      const stockHeader = line[hStock];
      if (refItem && stockHeader) {
        refX = refItem.x;
        const hDesc = norm.findIndex((t) => t.startsWith("descri"));
        descX = line[hDesc]?.x ?? refX + 60;
        stockX = stockHeader.x;
        const after = line.filter((i) => i.x > stockX + 5);
        nextX = after[0]?.x ?? Infinity;
        continue;
      }
      if (!stockX) continue;
      const first = line[0];
      if (!first || Math.abs(first.x - refX) > 15) continue; // not a data row
      const reference = first.text;
      if (normalize(reference).startsWith("total") || /^\d{2}\/\d{2}\/\d{4}$/.test(reference)) continue;
      // Stock cell: numeric item nearest to the Estoque header column, before the next column
      const candidates = line.filter((i) => i.x > descX + 20 && i.x < nextX - 5 && /^[\d.]+,\d+$|^\d+$/.test(i.text));
      if (!candidates.length) continue;
      const stockItem = candidates.reduce((best, i) =>
        Math.abs(i.x + i.text.length * 3 - stockX - 20) < Math.abs(best.x + best.text.length * 3 - stockX - 20) ? i : best,
      );
      const quantity = parseNumber(stockItem.text);
      if (Number.isNaN(quantity)) continue;
      const description = line
        .filter((i) => i !== first && i.x < stockItem.x && i.x >= descX - 10)
        .map((i) => i.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      rows.push({ reference, description, quantity });
    }
    onProgress?.(p, doc.numPages);
  }
  return rows;
}
