import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly, PageHeader, Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { importStock } from "@/lib/stock.functions";
import type { StockRow } from "@/lib/pdf-parser";
import { formatDateTime } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/importar")({
  head: () => ({ meta: [{ title: "Importar Estoque — Demanda de Peças" }] }),
  component: () => (
    <AdminOnly>
      <Importar />
    </AdminOnly>
  ),
});

function Importar() {
  const qc = useQueryClient();
  const doImport = useServerFn(importStock);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StockRow[] | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const imports = useQuery({
    queryKey: ["imports"],
    queryFn: async () => (await supabase.from("stock_imports").select("*").order("imported_at", { ascending: false }).limit(20)).data ?? [],
  });
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id, username, full_name")).data ?? [],
  });
  const total = useQuery({
    queryKey: ["stock-count"],
    queryFn: async () => (await supabase.from("stock_items").select("reference", { count: "exact", head: true })).count ?? 0,
  });
  const last = imports.data?.[0];

  async function analyze(f: File) {
    setFile(f);
    setPreview(null);
    setBusy(true);
    try {
      const { parseStockPdf } = await import("@/lib/pdf-parser");
      const rows = await parseStockPdf(f, (p, t) => setStatus(`Lendo página ${p} de ${t}…`));
      setPreview(rows);
      setStatus(`${rows.length} itens encontrados (${rows.filter((r) => r.quantity === 0).length} zerados).`);
      if (!rows.length) toast.error("Nenhuma linha com Referência/Descrição/Estoque foi reconhecida no PDF.");
    } catch (e) {
      toast.error(`Falha ao ler PDF: ${(e as Error).message}`);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview?.length || !file) return;
    setBusy(true);
    setStatus("Enviando para o banco…");
    try {
      const res = await doImport({ data: { fileName: file.name, rows: preview } });
      toast.success(`${res.imported} itens importados (${res.zero} zerados)`);
      setPreview(null);
      setFile(null);
      setStatus("");
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["stock-count"] });
      qc.invalidateQueries({ queryKey: ["last-import"] });
      qc.invalidateQueries({ queryKey: ["ranking"] });
      qc.invalidateQueries({ queryKey: ["stock-search"] });
    } catch (e) {
      toast.error((e as Error).message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader title="Importar Estoque" subtitle="PDF do relatório Estoque & Demanda (colunas Referência, Descrição, Estoque)" />
      <div className="grid gap-2 md:grid-cols-3">
        <Stat label="Última importação" value={<span className="text-base">{last ? formatDateTime(last.imported_at) : "—"}</span>} />
        <Stat label="Itens na última importação" value={last?.item_count ?? "—"} tone="warm" />
        <Stat label="Itens na base atual" value={total.data ?? "—"} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[400px_1fr]">
        <section className="panel p-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-border p-6 text-center hover:bg-accent/40">
            <FileUp className="h-6 w-6 text-primary" />
            <span className="text-[12.5px]">{file ? file.name : "Selecionar arquivo PDF"}</span>
            <span className="text-[11px] text-muted-foreground">O sistema lê o PDF aqui e mostra uma prévia antes de gravar.</span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) analyze(f); e.target.value = ""; }}
            />
          </label>
          {status && <p className="mt-3 text-[12px] text-muted-foreground">{status}</p>}
          {preview && preview.length > 0 && (
            <Button className="mt-3 w-full" onClick={confirm} disabled={busy}>
              {busy ? "Importando…" : `Confirmar importação de ${preview.length} itens`}
            </Button>
          )}
          {preview && preview.length > 0 && (
            <div className="mt-3 max-h-72 overflow-auto rounded border">
              <table className="table-dense w-full">
                <thead className="sticky top-0 bg-card"><tr className="text-left"><th>Referência</th><th>Descrição</th><th className="text-right">Estoque</th></tr></thead>
                <tbody>
                  {preview.slice(0, 200).map((r) => (
                    <tr key={r.reference}>
                      <td className="num">{r.reference}</td>
                      <td className="max-w-40 truncate" title={r.description}>{r.description}</td>
                      <td className={`num text-right ${r.quantity === 0 ? "stock-zero" : ""}`}>{r.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 200 && <div className="p-2 text-center text-[11px] text-muted-foreground">… e mais {preview.length - 200} itens</div>}
            </div>
          )}
        </section>

        <section className="panel self-start">
          <div className="border-b px-3 py-2 text-[13px] font-semibold">Histórico de importações</div>
          <table className="table-dense w-full">
            <thead><tr className="border-b text-left"><th>Data/Hora</th><th>Arquivo</th><th className="text-right">Itens</th><th>Por</th></tr></thead>
            <tbody>
              {imports.data?.length === 0 && <tr><td colSpan={4} className="py-5 text-center text-muted-foreground">Nenhuma importação realizada.</td></tr>}
              {imports.data?.map((i) => (
                <tr key={i.id}>
                  <td className="whitespace-nowrap">{formatDateTime(i.imported_at)}</td>
                  <td className="max-w-xs truncate">{i.file_name}</td>
                  <td className="num text-right">{i.item_count}</td>
                  <td>{profiles.data?.find((p) => p.id === i.imported_by)?.full_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
