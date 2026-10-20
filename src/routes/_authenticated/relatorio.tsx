import { createFileRoute } from "@tanstack/react-router";
import { requirePanel, userIdFromContext } from "@/lib/route-guard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Pencil, Trash2 } from "lucide-react";
import { exportPdf, exportXlsx, type ExportTable } from "@/lib/report-export";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { PageHeader, Stat } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { endOfDayBR, formatDateTime, startOfDayBR, todayISO } from "@/lib/datetime";
import { deleteDemandRequest, updateDemandRequest } from "@/lib/demand.functions";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/relatorio")({
  beforeLoad: ({ context }) => requirePanel("relatorio", userIdFromContext(context)),
  head: () => ({ meta: [{ title: "Relatório de Demanda — Demanda de Peças" }] }),
  component: Relatorio,
});

type Req = Tables<"demand_requests">;

function firstOfMonth() {
  return todayISO().slice(0, 8) + "01";
}

function Relatorio() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());
  const [vendor, setVendor] = useState("");
  const [search, setSearch] = useState("");
  const [rankingSearch, setRankingSearch] = useState("");
  const [editing, setEditing] = useState<Req | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setRankingSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const profiles = useQuery({
    queryKey: ["profiles", "names"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return (data ?? []).map((row) => {
        const p = row as typeof row & { user_id?: string | null; display_name?: string | null };
        const name = (p.display_name || p.full_name || p.username || "").trim();
        return { id: p.id, user_id: p.user_id || p.id, username: p.username, name };
      });
    },
  });
  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles.data ?? []) {
      if (!p.name) continue;
      map.set(p.id, p.name);
      map.set(p.user_id, p.name);
    }
    return map;
  }, [profiles.data]);

  const range = { from: from ? startOfDayBR(from) : null, to: to ? endOfDayBR(to) : null };
  const ownId = (me as { user_id?: string | null } | undefined)?.user_id || me?.id || null;
  const userFilter = me?.isAdmin ? vendor || null : ownId;

  const requests = useQuery({
    queryKey: ["requests", "report", range, userFilter],
    enabled: Boolean(me),
    staleTime: 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from("demand_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (range.from) q = q.gte("created_at", range.from);
      if (range.to) q = q.lte("created_at", range.to);
      if (userFilter) q = q.eq("user_id", userFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const ranking = useQuery({
    queryKey: ["ranking", "report", range, userFilter, rankingSearch],
    enabled: Boolean(me),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const args: { _from?: string; _to?: string; _user?: string; _search?: string } = {};
      if (range.from) args._from = range.from;
      if (range.to) args._to = range.to;
      if (userFilter) args._user = userFilter;
      if (rankingSearch) args._search = rankingSearch;
      const { data, error } = await supabase.rpc("demand_ranking_by_branch", args);
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rows = requests.data ?? [];
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.reference.toLowerCase().includes(s) ||
        (r.description ?? "").toLowerCase().includes(s) ||
        (r.customer_name ?? "").toLowerCase().includes(s),
    );
  }, [requests.data, search]);

  const uniqueRefs = new Set(filtered.map((r) => r.reference)).size;
  const top5 = (ranking.data ?? []).slice(0, 5);

  function exportCsv() {
    const header = [
      "Data/Hora (Brasília)",
      "Tipo",
      "Referência",
      "Descrição",
      "Filial",
      "Quantidade",
      "Cliente",
      "Contato",
      "Vendedor",
    ];
    const esc = (v: unknown) => {
      const raw = String(v ?? "");
      const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = filtered.map((r) =>
      [
        formatDateTime(r.created_at),
        r.kind === "manual" ? "Flag manual" : "Solicitação estoque",
        r.reference,
        r.description,
        r.branch || "Sem filial",
        r.quantity,
        r.customer_name,
        r.customer_contact,
        nameOf.get(r.user_id) ?? r.user_id,
      ]
        .map(esc)
        .join(";"),
    );
    const csv = "\uFEFF" + [header.map(esc).join(";"), ...lines].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `demanda_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function buildTables(): ExportTable[] {
    return [
      {
        title: "Ranking",
        header: [
          "#",
          "Referência",
          "Descrição",
          "Filial",
          "Solicitações",
          "Qtd",
          "Estoque (filial)",
        ],
        rows: (ranking.data ?? []).map((r, i) => [
          i + 1,
          r.reference,
          r.description ?? "",
          r.branch || "Sem filial",
          Number(r.total_requests),
          Number(r.total_quantity ?? 0),
          r.current_stock === null ? "—" : Number(r.current_stock),
        ]),
      },
      {
        title: "Solicitações",
        header: [
          "Data/Hora",
          "Referência",
          "Descrição",
          "Filial",
          "Qtd",
          "Cliente",
          "Contato",
          "Vendedor",
        ],
        rows: filtered.map((r) => [
          formatDateTime(r.created_at),
          r.reference,
          r.description ?? "",
          r.branch || "Sem filial",
          r.quantity ?? "",
          r.customer_name ?? "",
          r.customer_contact ?? "",
          nameOf.get(r.user_id) ?? "",
        ]),
      },
    ];
  }
  const periodLabel = `Período: ${from || "início"} a ${to || "hoje"}`;
  const fileBase = `relatorio_demanda_${from || "inicio"}_${to || "hoje"}`;

  const del = useServerFn(deleteDemandRequest);
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Registro excluído");
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["ranking"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <PageHeader
        title="Relatório de Demanda"
        subtitle={me?.isAdmin ? "Todas as solicitações" : "Suas solicitações"}
        right={
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              disabled={!filtered.length}
              onClick={() =>
                exportPdf(
                  `${fileBase}.pdf`,
                  "Relatório de Demanda de Peças — NORMAQ JCB",
                  periodLabel,
                  buildTables(),
                ).catch((e) => toast.error(String(e)))
              }
            >
              <FileText className="mr-1 h-3.5 w-3.5" /> PDF
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              disabled={!filtered.length}
              onClick={() =>
                exportXlsx(`${fileBase}.xlsx`, buildTables()).catch((e) => toast.error(String(e)))
              }
            >
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={exportCsv}
              disabled={!filtered.length}
            >
              <Download className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        }
      />

      <div className="panel flex flex-wrap items-end gap-2 px-3 py-2">
        <div>
          <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">De</Label>
          <Input
            type="date"
            className="h-7 w-36 text-[12px]"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Até
          </Label>
          <Input
            type="date"
            className="h-7 w-36 text-[12px]"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        {me?.isAdmin && (
          <div>
            <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Vendedor
            </Label>
            <select
              className="h-7 rounded-md border border-input bg-background px-2 text-[12px]"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            >
              <option value="">Todos</option>
              {profiles.data?.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex-1 min-w-52">
          <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Buscar (referência, descrição, cliente)
          </Label>
          <Input
            className="h-7 text-[12px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="digite para filtrar"
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={() => {
            setFrom("");
            setTo("");
            setVendor("");
            setSearch("");
          }}
        >
          Limpar
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <Stat label="Solicitações no período" value={filtered.length} tone="warm" />
        <Stat label="Referências únicas" value={uniqueRefs} />
        <div className="panel px-3 py-2 md:col-span-2">
          <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Top 5 mais pedidos
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {top5.length === 0 && <span className="text-muted-foreground">—</span>}
            {top5.map((r, i) => (
              <span
                key={r.reference}
                className={`num rounded px-1.5 py-0.5 text-[11.5px] ${i < 3 ? "rank-hot" : "rank-warm"}`}
                title={r.description ?? ""}
              >
                {r.reference} <b>×{r.total_requests}</b>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="panel self-start">
          <div className="border-b px-3 py-2 text-[13px] font-semibold">
            Ranking — peças mais buscadas e não encontradas
            <span className="ml-1 font-normal text-muted-foreground">(prioridade de compra)</span>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="table-dense w-full">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left">
                  <th className="w-10">#</th>
                  <th>Referência</th>
                  <th>Descrição</th>
                  <th>Filial</th>
                  <th className="text-right">Solic.</th>
                  <th className="text-right">Qtd</th>
                  <th className="text-right">Estoque (filial)</th>
                </tr>
              </thead>
              <tbody>
                {ranking.data?.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-5 text-center text-muted-foreground">
                      Sem dados no período.
                    </td>
                  </tr>
                )}
                {ranking.data?.map((r, i) => (
                  <tr key={r.reference}>
                    <td>
                      <span
                        className={`num inline-block rounded px-1.5 text-[11px] font-semibold ${i < 3 ? "rank-hot" : i < 10 ? "rank-warm" : "bg-muted"}`}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="num font-medium">{r.reference}</td>
                    <td className="max-w-56 truncate" title={r.description ?? ""}>
                      {r.description || "—"}
                    </td>
                    <td className="whitespace-nowrap">{r.branch || "Sem filial"}</td>
                    <td className="num text-right font-semibold">{r.total_requests}</td>
                    <td className="num text-right">{r.total_quantity || "—"}</td>
                    <td className="text-right">
                      {r.current_stock === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={`num ${Number(r.current_stock) === 0 ? "stock-zero" : ""}`}
                        >
                          {Number(r.current_stock)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel self-start">
          <div className="border-b px-3 py-2 text-[13px] font-semibold">
            Solicitações{" "}
            <span className="font-normal text-muted-foreground">· {filtered.length}</span>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="table-dense w-full">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left">
                  <th>Data</th>
                  <th>Referência</th>
                  <th>Descrição</th>
                  <th>Filial</th>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th className="text-right">Qtd</th>
                  <th>Contato</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {requests.isLoading && (
                  <tr>
                    <td colSpan={9} className="py-5 text-center text-muted-foreground">
                      Carregando…
                    </td>
                  </tr>
                )}
                {filtered.length === 0 && !requests.isLoading && (
                  <tr>
                    <td colSpan={9} className="py-5 text-center text-muted-foreground">
                      Nenhuma solicitação no período.
                    </td>
                  </tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="num font-medium whitespace-nowrap">
                      {r.reference}
                      {r.kind === "manual" && (
                        <span className="ml-1 rounded bg-muted px-1 text-[9.5px] uppercase text-muted-foreground">
                          flag
                        </span>
                      )}
                    </td>
                    <td className="max-w-48 truncate" title={r.description ?? ""}>
                      {r.description || "—"}
                    </td>
                    <td className="max-w-40 truncate whitespace-nowrap" title={r.branch ?? ""}>
                      {r.branch || "Sem filial"}
                    </td>
                    <td className="max-w-36 truncate">{r.customer_name ?? "—"}</td>
                    <td className="whitespace-nowrap">{nameOf.get(r.user_id) ?? "—"}</td>
                    <td className="num text-right">{r.quantity ?? "—"}</td>
                    <td className="max-w-32 truncate text-muted-foreground">
                      {r.customer_contact ?? "—"}
                    </td>
                    <td>
                      <div className="flex justify-end gap-0.5">
                        <button
                          className="rounded p-1 hover:bg-accent"
                          title="Editar"
                          onClick={() => setEditing(r)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded p-1 text-destructive hover:bg-accent"
                          title="Excluir"
                          onClick={() => {
                            if (confirm(`Excluir a solicitação ${r.reference}?`))
                              remove.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editing && <EditDialog req={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditDialog({ req, onClose }: { req: Req; onClose: () => void }) {
  const qc = useQueryClient();
  const upd = useServerFn(updateDemandRequest);
  const [f, setF] = useState({
    quantity: req.quantity?.toString() ?? "",
    customer_name: req.customer_name ?? "",
    customer_contact: req.customer_contact ?? "",
    description: req.description ?? "",
  });
  const m = useMutation({
    mutationFn: () =>
      upd({
        data: {
          id: req.id,
          quantity: f.quantity ? Number(f.quantity) : null,
          customer_name: f.customer_name,
          customer_contact: f.customer_contact,
          description: f.description,
        },
      }),
    onSuccess: () => {
      toast.success("Registro atualizado");
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["ranking"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Editar solicitação · <span className="num">{req.reference}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div>
            <Label>Descrição</Label>
            <Input
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input
              type="number"
              min={1}
              value={f.quantity}
              onChange={(e) => setF({ ...f, quantity: e.target.value })}
            />
          </div>
          <div>
            <Label>Cliente</Label>
            <Input
              value={f.customer_name}
              onChange={(e) => setF({ ...f, customer_name: e.target.value })}
            />
          </div>
          <div>
            <Label>Contato</Label>
            <Input
              value={f.customer_contact}
              onChange={(e) => setF({ ...f, customer_contact: e.target.value })}
            />
          </div>
          <Button className="w-full" onClick={() => m.mutate()} disabled={m.isPending}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
