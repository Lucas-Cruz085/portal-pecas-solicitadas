import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { RequestButton } from "@/components/RequestButton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatQty } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/inicio")({
  head: () => ({ meta: [{ title: "Início — Demanda de Peças" }] }),
  component: Inicio,
});

const PAGE = 10;

function StockCell({ qty }: { qty: number | null }) {
  if (qty === null) return <span className="text-muted-foreground">sem registro</span>;
  return <span className={`num ${qty === 0 ? "stock-zero" : ""}`}>{formatQty(qty)}</span>;
}

function Inicio() {
  const [page, setPage] = useState(0);
  const [ref, setRef] = useState("");
  const [desc, setDesc] = useState("");
  const [applied, setApplied] = useState({ ref: "", desc: "" });

  const ranking = useQuery({
    queryKey: ["ranking", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("demand_ranking", {});
      if (error) throw error;
      return data;
    },
  });

  const search = useQuery({
    queryKey: ["stock-search", applied],
    enabled: Boolean(applied.ref || applied.desc),
    queryFn: async () => {
      let q = supabase.from("stock_items").select("*").order("reference").limit(100);
      if (applied.ref) q = q.ilike("reference", `%${applied.ref}%`);
      if (applied.desc) q = q.ilike("description", `%${applied.desc}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const lastImport = useQuery({
    queryKey: ["last-import"],
    queryFn: async () => {
      const { data } = await supabase.from("stock_imports").select("*").order("imported_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  const rows = ranking.data ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Início"
        subtitle={`Base de estoque: ${lastImport.data ? `atualizada em ${formatDateTime(lastImport.data.imported_at)} · ${lastImport.data.item_count} itens` : "nenhuma importação"}`}
      />

      <section className="panel">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-[13px] font-semibold">
            Itens mais solicitados <span className="text-muted-foreground font-normal">· {rows.length} referências</span>
          </h2>
          <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
            <Button variant="ghost" size="sm" className="h-6 px-2" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              ‹
            </Button>
            {page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} de {rows.length}
            <Button variant="ghost" size="sm" className="h-6 px-2" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
              ›
            </Button>
          </div>
        </div>
        <table className="table-dense w-full">
          <thead>
            <tr className="border-b text-left">
              <th className="w-10">#</th>
              <th>Referência</th>
              <th>Descrição</th>
              <th className="text-right">Solicitações</th>
              <th className="text-right">Qtd. pedida</th>
              <th>Última</th>
              <th className="text-right">Estoque</th>
              <th className="w-56" />
            </tr>
          </thead>
          <tbody>
            {ranking.isLoading && (
              <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Carregando…</td></tr>
            )}
            {!ranking.isLoading && rows.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Nenhuma solicitação registrada ainda.</td></tr>
            )}
            {slice.map((r, i) => {
              const pos = page * PAGE + i + 1;
              const tone = pos <= 3 ? "rank-hot" : pos <= 10 ? "rank-warm" : "bg-muted";
              return (
                <tr key={r.reference}>
                  <td><span className={`num inline-block rounded px-1.5 text-[11px] font-semibold ${tone}`}>{pos}</span></td>
                  <td className="num font-medium">{r.reference}</td>
                  <td className="max-w-md truncate" title={r.description ?? ""}>{r.description || <span className="text-muted-foreground">—</span>}</td>
                  <td className="num text-right font-semibold">{r.total_requests}</td>
                  <td className="num text-right">{r.total_quantity || "—"}</td>
                  <td className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.last_requested)}</td>
                  <td className="text-right"><StockCell qty={r.current_stock === null ? null : Number(r.current_stock)} /></td>
                   <td><RequestButton reference={r.reference} description={r.description} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <form
          className="flex flex-wrap items-end gap-2 border-b px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied({ ref: ref.trim(), desc: desc.trim() });
          }}
        >
          <div>
            <label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Referência</label>
            <Input className="h-7 w-44 text-[12px]" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex: 320/A7130" />
          </div>
          <div>
            <label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Descrição</label>
            <Input className="h-7 w-72 text-[12px]" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="ex: filtro" />
          </div>
          <Button type="submit" size="sm" className="h-7">
            <Search className="mr-1 h-3.5 w-3.5" /> Buscar no estoque
          </Button>
          {search.data && <span className="text-[11.5px] text-muted-foreground">{search.data.length} resultado(s){search.data.length === 100 ? " (máx. 100)" : ""}</span>}
        </form>
        <table className="table-dense w-full">
          <thead>
            <tr className="border-b text-left">
              <th>Referência</th>
              <th>Descrição</th>
              <th className="text-right">Estoque</th>
              <th>Atualizado</th>
              <th className="w-56" />
            </tr>
          </thead>
          <tbody>
            {!applied.ref && !applied.desc && (
              <tr><td colSpan={5} className="py-5 text-center text-muted-foreground">Busque por referência e/ou descrição na base importada.</td></tr>
            )}
            {search.isFetching && (
              <tr><td colSpan={5} className="py-5 text-center text-muted-foreground">Buscando…</td></tr>
            )}
            {search.data?.length === 0 && (
              <tr><td colSpan={5} className="py-5 text-center text-muted-foreground">Nenhum item encontrado. Use “Registrar Solicitação” para flagar manualmente.</td></tr>
            )}
            {search.data?.map((s) => (
              <tr key={s.reference}>
                <td className="num font-medium">{s.reference}</td>
                <td className="max-w-lg truncate" title={s.description}>{s.description}</td>
                <td className="text-right"><StockCell qty={Number(s.quantity)} /></td>
                <td className="whitespace-nowrap text-muted-foreground">{formatDateTime(s.updated_at)}</td>
                 <td><RequestButton reference={s.reference} description={s.description} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
