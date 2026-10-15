import { createFileRoute } from "@tanstack/react-router";
import { requirePanel } from "@/lib/route-guard";
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
  beforeLoad: () => requirePanel("inicio"),
  head: () => ({ meta: [{ title: "Início — Demanda de Peças" }] }),
  component: Inicio,
});

const PAGE = 10;
const STOCK_PAGE = 50;

const BRANCHES = [
  "NORMAQ CAMPINA GRANDE",
  "NORMAQ FORTALEZA",
  "NORMAQ PARNAMIRIM",
  "NORMAQ PETROLINA",
  "NORMAQ RECIFE",
] as const;

function StockCell({ qty }: { qty: number | null }) {
  if (qty === null) return <span className="text-muted-foreground">sem registro</span>;
  return <span className={`num ${qty === 0 ? "stock-zero" : ""}`}>{formatQty(qty)}</span>;
}

function likePattern(value: string) {
  return `%${value.replace(/[%_\\]/g, "")}%`;
}

function formatStockUpdatedAt(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Recife",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = pick("hour").padStart(2, "0");
  const minute = pick("minute").padStart(2, "0");
  return `${pick("day")}/${pick("month")}/${pick("year")} ${hour}:${minute}`;
}

function stockUpdatedLabel(query: {
  isFetching: boolean;
  isError: boolean;
  data: string | null | undefined;
}) {
  if (query.isFetching && !query.data) return "Carregando atualização do estoque…";
  if (query.isError) return "Não foi possível carregar a atualização do estoque.";
  if (!query.data) return "Atualizado em —";
  return `Atualizado em ${formatStockUpdatedAt(query.data)}`;
}

function Inicio() {
  const [page, setPage] = useState(0);
  const [stockPage, setStockPage] = useState(0);
  const [branch, setBranch] = useState<string>(BRANCHES[0]);
  const [ref, setRef] = useState("");
  const [desc, setDesc] = useState("");
  const [applied, setApplied] = useState({ ref: "", desc: "" });

  const ranking = useQuery({
    queryKey: ["ranking", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("demand_ranking_by_branch", {});
      if (error) throw error;
      return data;
    },
  });

  const stock = useQuery({
    queryKey: ["stock-normaq", branch, applied, stockPage],
    queryFn: async () => {
      const from = stockPage * STOCK_PAGE;
      const to = from + STOCK_PAGE - 1;
      let query = supabase
        .from("stock_items_normaq")
        .select("reference, description, quantity", { count: "exact" })
        .eq("branch", branch);
      if (applied.ref) query = query.ilike("reference", likePattern(applied.ref));
      if (applied.desc) query = query.ilike("description", likePattern(applied.desc));
      const { data, error, count } = await query
        .order("reference", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const stockUpdated = useQuery({
    queryKey: ["stock-normaq-updated", branch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items_normaq")
        .select("updated_at")
        .eq("branch", branch)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.updated_at ?? null;
    },
  });

  const rows = ranking.data ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const stockRows = stock.data?.rows ?? [];
  const stockTotal = stock.data?.count ?? 0;
  const stockPages = Math.max(1, Math.ceil(stockTotal / STOCK_PAGE));
  const stockFrom = stockTotal === 0 ? 0 : stockPage * STOCK_PAGE + 1;
  const stockTo = Math.min(stockTotal, (stockPage + 1) * STOCK_PAGE);

  return (
    <div className="space-y-4">
      <PageHeader title="Início" subtitle={stockUpdatedLabel(stockUpdated)} />

      <section className="panel">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-[13px] font-semibold">
            Itens mais solicitados{" "}
            <span className="text-muted-foreground font-normal">· {rows.length} referências</span>
          </h2>
          <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹
            </Button>
            {page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} de {rows.length}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
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
              <th>Filial</th>
              <th className="text-right">Estoque (filial)</th>
              <th className="w-56" />
            </tr>
          </thead>
          <tbody>
            {ranking.isLoading && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            )}
            {!ranking.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-muted-foreground">
                  Nenhuma solicitação registrada ainda.
                </td>
              </tr>
            )}
            {slice.map((r, i) => {
              const pos = page * PAGE + i + 1;
              const tone = pos <= 3 ? "rank-hot" : pos <= 10 ? "rank-warm" : "bg-muted";
              return (
                <tr key={r.reference}>
                  <td>
                    <span
                      className={`num inline-block rounded px-1.5 text-[11px] font-semibold ${tone}`}
                    >
                      {pos}
                    </span>
                  </td>
                  <td className="num font-medium">{r.reference}</td>
                  <td className="max-w-md truncate" title={r.description ?? ""}>
                    {r.description || <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="num text-right font-semibold">{r.total_requests}</td>
                  <td className="num text-right">{r.total_quantity || "—"}</td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(r.last_requested)}
                  </td>
                  <td className="whitespace-nowrap">{r.branch || "Sem filial"}</td>
                  <td className="text-right">
                    <StockCell qty={r.current_stock === null ? null : Number(r.current_stock)} />
                  </td>
                  <td>
                    <RequestButton reference={r.reference} description={r.description} />
                  </td>
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
            setStockPage(0);
            setApplied({ ref: ref.trim(), desc: desc.trim() });
          }}
        >
          <div>
            <label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Filial
            </label>
            <select
              className="h-7 w-64 rounded-md border border-input bg-transparent px-2 text-[12px]"
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                setStockPage(0);
              }}
            >
              {BRANCHES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Referência
            </label>
            <Input
              className="h-7 w-44 text-[12px]"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="ex: 320/A7130"
            />
          </div>
          <div>
            <label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Descrição
            </label>
            <Input
              className="h-7 w-72 text-[12px]"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="ex: filtro"
            />
          </div>
          <Button type="submit" size="sm" className="h-7">
            <Search className="mr-1 h-3.5 w-3.5" /> Buscar no estoque
          </Button>
        </form>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-[13px] font-semibold">
            Estoque <span className="font-normal text-muted-foreground">· {branch}</span>
          </h2>
          <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              disabled={stockPage === 0 || stock.isFetching}
              onClick={() => setStockPage((p) => p - 1)}
            >
              ‹
            </Button>
            {stock.isSuccess ? `${stockFrom}–${stockTo} de ${stockTotal}` : "…"}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              disabled={!stock.isSuccess || stockPage >= stockPages - 1 || stock.isFetching}
              onClick={() => setStockPage((p) => p + 1)}
            >
              ›
            </Button>
          </div>
        </div>
        <table className="table-dense w-full">
          <thead>
            <tr className="border-b text-left">
              <th>Referência</th>
              <th>Descrição</th>
              <th className="text-right">Estoque</th>
              <th className="w-56" />
            </tr>
          </thead>
          <tbody>
            {stock.isFetching && !stock.data && (
              <tr>
                <td colSpan={4} className="py-5 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            )}
            {stock.isError && !stock.isFetching && (
              <tr>
                <td colSpan={4} className="py-5 text-center text-destructive">
                  Não foi possível carregar o estoque.
                </td>
              </tr>
            )}
            {stock.isSuccess && stockRows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-5 text-center text-muted-foreground">
                  Nenhum item encontrado.
                </td>
              </tr>
            )}
            {stock.isSuccess &&
              stockRows.map((item) => {
                const qty = Number(item.quantity);
                return (
                  <tr key={item.reference}>
                    <td className="num font-medium">{item.reference}</td>
                    <td className="max-w-lg truncate" title={item.description}>
                      {item.description || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-right">
                      <StockCell qty={Number.isFinite(qty) ? qty : null} />
                    </td>
                    <td>
                      <RequestButton reference={item.reference} description={item.description} />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
