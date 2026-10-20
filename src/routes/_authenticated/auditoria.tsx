import { createFileRoute } from "@tanstack/react-router";
import { requirePanel, userIdFromContext } from "@/lib/route-guard";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly, PageHeader } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { endOfDayBR, formatDateTime, startOfDayBR } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/auditoria")({
  beforeLoad: ({ context }) => requirePanel("auditoria", userIdFromContext(context)),
  head: () => ({ meta: [{ title: "Auditoria — Demanda de Peças" }] }),
  component: () => (
    <AdminOnly>
      <Auditoria />
    </AdminOnly>
  ),
});

const ACTIONS: Record<string, string> = {
  solicitar_item: "Solicitação de item",
  flagar_peca: "Flag manual de peça",
  editar_solicitacao: "Edição de solicitação",
  excluir_solicitacao: "Exclusão de solicitação",
  importar_estoque: "Importação de estoque",
  criar_usuario: "Criação de usuário",
  editar_usuario: "Edição de usuário",
  redefinir_senha: "Redefinição de senha",
  login: "Entrada",
  logout: "Saída",
  login_falho: "Falha de entrada",
  esqueci_senha: "Pedido de senha esquecida",
  tentativa_esqueci_senha: "Pedido de senha esquecida",
  resetar_senha_padrao: "Senha temporária gerada",
  alterar_propria_senha: "Alteração da própria senha",
  alterar_permissoes: "Alteração de permissões",
};

function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !["id", "user_id", "updated_at", "created_at"].includes(k));
  if (!keys.length) return <span className="text-muted-foreground">—</span>;
  const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px]">
      {keys.map((k) => {
        const changed = before !== null && before !== undefined && JSON.stringify(b[k]) !== JSON.stringify(a[k]);
        return (
          <span key={k} className="whitespace-nowrap">
            <span className="text-muted-foreground">{k}:</span>{" "}
            {changed && <><span className="text-destructive line-through">{fmt(b[k])}</span> → </>}
            <span className={changed ? "text-primary" : ""}>{fmt(k in a ? a[k] : b[k])}</span>
          </span>
        );
      })}
    </div>
  );
}

function Auditoria() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [user, setUser] = useState("");
  const [action, setAction] = useState("");

  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id, username, full_name")).data ?? [],
  });

  const logs = useQuery({
    queryKey: ["audit", from, to, user, action],
    queryFn: async () => {
      let q = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500);
      if (from) q = q.gte("created_at", startOfDayBR(from));
      if (to) q = q.lte("created_at", endOfDayBR(to));
      if (user) q = q.eq("user_id", user);
      if (action) q = q.eq("action", action);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-3">
      <PageHeader title="Auditoria" subtitle="Histórico de todas as ações do sistema (horário de Brasília)" />
      <div className="panel flex flex-wrap items-end gap-2 px-3 py-2">
        <div><Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">De</Label><Input type="date" className="h-7 w-36 text-[12px]" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Até</Label><Input type="date" className="h-7 w-36 text-[12px]" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Usuário</Label>
          <select className="h-7 rounded-md border border-input bg-background px-2 text-[12px]" value={user} onChange={(e) => setUser(e.target.value)}>
            <option value="">Todos</option>
            {profiles.data?.map((p) => <option key={p.id} value={p.id}>{p.username}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Ação</Label>
          <select className="h-7 rounded-md border border-input bg-background px-2 text-[12px]" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => { setFrom(""); setTo(""); setUser(""); setAction(""); }}>Limpar</Button>
        <span className="ml-auto text-[11.5px] text-muted-foreground">{logs.data?.length ?? 0} registros{logs.data?.length === 500 ? " (máx. 500)" : ""}</span>
      </div>

      <section className="panel overflow-auto">
        <table className="table-dense w-full">
          <thead>
            <tr className="border-b text-left"><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Dados (antes → depois)</th></tr>
          </thead>
          <tbody>
            {logs.isLoading && <tr><td colSpan={5} className="py-5 text-center text-muted-foreground">Carregando…</td></tr>}
            {logs.data?.length === 0 && <tr><td colSpan={5} className="py-5 text-center text-muted-foreground">Nenhum registro.</td></tr>}
            {logs.data?.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="whitespace-nowrap text-muted-foreground">{formatDateTime(l.created_at)}</td>
                <td className="num whitespace-nowrap">{l.username}</td>
                <td className="whitespace-nowrap font-medium">{ACTIONS[l.action] ?? l.action}</td>
                <td className="whitespace-nowrap text-muted-foreground">{l.entity}</td>
                <td><Diff before={l.before_data} after={l.after_data} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
