import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { KeyRound, Pencil, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AdminOnly, PageHeader } from "@/components/AppShell";
import { createUser, listUsers, updateUser, resetUserPassword, DEFAULT_RESET_PASSWORD } from "@/lib/auth.functions";
import { listPermissions, setUserPermissions, PANELS, PANEL_LABELS, type Panel } from "@/lib/permissions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/datetime";
import { useMe } from "@/hooks/use-me";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Gestão de Usuários — Demanda de Peças" }] }),
  component: () => (
    <AdminOnly>
      <Usuarios />
    </AdminOnly>
  ),
});

type Role = "admin" | "consultor";
type UserRow = Awaited<ReturnType<typeof listUsers>>[number];

function RoleSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-[12.5px]" value={value} onChange={(e) => onChange(e.target.value as Role)}>
      <option value="consultor">Consultor / Vendedor</option>
      <option value="admin">Administrador</option>
    </select>
  );
}

function PanelChecklist({ value, onChange, disabled }: { value: Panel[]; onChange: (p: Panel[]) => void; disabled?: boolean }) {
  const toggle = (panel: Panel, on: boolean) =>
    onChange(on ? [...new Set([...value, panel])] : value.filter((p) => p !== panel));
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {PANELS.map((panel) => (
        <label key={panel} className="flex items-center gap-2 text-[12.5px]">
          <Checkbox checked={value.includes(panel)} disabled={disabled} onCheckedChange={(c) => toggle(panel, c === true)} />
          {PANEL_LABELS[panel]}
        </label>
      ))}
    </div>
  );
}

function Usuarios() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const fetchUsers = useServerFn(listUsers);
  const fetchPerms = useServerFn(listPermissions);
  const create = useServerFn(createUser);
  const update = useServerFn(updateUser);
  const savePerms = useServerFn(setUserPermissions);
  const resetPw = useServerFn(resetUserPassword);

  const users = useQuery({ queryKey: ["users"], queryFn: () => fetchUsers() });
  const perms = useQuery({ queryKey: ["permissions"], queryFn: () => fetchPerms() });

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [confirmReset, setConfirmReset] = useState<UserRow | null>(null);
  const [nf, setNf] = useState({ username: "", password: "", full_name: "", email: "", role: "consultor" as Role, panels: [] as Panel[] });
  const [ef, setEf] = useState({ full_name: "", email: "", role: "consultor" as Role });
  const [ep, setEp] = useState<Panel[]>([]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return users.data ?? [];
    return (users.data ?? []).filter((u) =>
      [u.username, u.full_name, u.email ?? ""].some((f) => f.toLowerCase().includes(term)),
    );
  }, [users.data, q]);

  const panelsOf = (id: string) =>
    (perms.data ?? []).filter((p) => p.user_id === id && p.allowed).map((p) => p.panel as Panel);

  const openEdit = (u: UserRow) => {
    setEdit(u);
    setEf({ full_name: u.full_name, email: u.email ?? "", role: u.role as Role });
    setEp(u.role === "admin" ? [...PANELS] : panelsOf(u.id));
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["users"] });
    qc.invalidateQueries({ queryKey: ["permissions"] });
  };

  const mCreate = useMutation({
    mutationFn: () => create({ data: nf }),
    onSuccess: () => { toast.success("Usuário criado e ativo"); setOpen(false); setNf({ username: "", password: "", full_name: "", email: "", role: "consultor", panels: [] }); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mEdit = useMutation({
    mutationFn: () => update({ data: { id: edit!.id, ...ef } }),
    onSuccess: () => { toast.success("Usuário atualizado"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mPerms = useMutation({
    mutationFn: () => savePerms({ data: { userId: edit!.id, panels: ep } }),
    onSuccess: () => { toast.success("Permissões salvas"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mReset = useMutation({
    mutationFn: (u: UserRow) => resetPw({ data: { id: u.id } }),
    onSuccess: () => { toast.success(`Senha redefinida para ${DEFAULT_RESET_PASSWORD}. O usuário deverá trocá-la no próximo acesso.`); setConfirmReset(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mToggle = useMutation({
    mutationFn: (u: UserRow) => update({ data: { id: u.id, is_active: !u.is_active } }),
    onSuccess: (_, u) => { toast.success(u.is_active ? "Conta desativada" : "Conta ativada"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const isAdminTarget = edit?.role === "admin";

  return (
    <div className="space-y-3">
      <PageHeader
        title="Gestão de Usuários"
        subtitle="Cadastre consultores e administradores com usuário e senha"
        right={<Button size="sm" className="h-7" onClick={() => setOpen(true)}><UserPlus className="mr-1 h-3.5 w-3.5" /> Novo usuário</Button>}
      />

      <section className="panel p-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder="Pesquisar por nome, usuário ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </section>

      <section className="panel">
        <table className="table-dense w-full">
          <thead>
            <tr className="border-b text-left">
              <th>Usuário</th><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th><th>Criado em</th><th className="w-40" />
            </tr>
          </thead>
          <tbody>
            {users.isLoading && <tr><td colSpan={7} className="py-5 text-center text-muted-foreground">Carregando…</td></tr>}
            {!users.isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="py-5 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id} className={u.is_active ? "" : "opacity-60"}>
                <td className="num font-medium">{u.username}</td>
                <td>{u.full_name}</td>
                <td className="text-muted-foreground">{u.email ?? "—"}</td>
                <td>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${u.role === "admin" ? "rank-warm" : "bg-muted text-muted-foreground"}`}>
                    {u.role === "admin" ? "Admin" : "Consultor"}
                  </span>
                </td>
                <td>
                  <span className={`text-[11.5px] ${u.is_active ? "text-success" : "text-destructive"}`}>{u.is_active ? "Ativo" : "Desativado"}</span>
                  {u.needs_password_change && <span className="ml-1 text-[11px] text-primary">· troca pendente</span>}
                </td>
                <td className="whitespace-nowrap text-muted-foreground">{formatDateTime(u.created_at)}</td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <button className="rounded p-1 hover:bg-accent" title="Editar" onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></button>
                    <button className="rounded p-1 hover:bg-accent" title="Resetar senha" onClick={() => setConfirmReset(u)}><KeyRound className="h-3.5 w-3.5" /></button>
                    <Switch checked={u.is_active} disabled={u.id === me?.id || mToggle.isPending} onCheckedChange={() => mToggle.mutate(u)} title="Ativar/desativar" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); mCreate.mutate(); }}>
            <div><Label>Usuário (login) *</Label><Input className="num" value={nf.username} onChange={(e) => setNf({ ...nf, username: e.target.value.toLowerCase() })} placeholder="ex: joao.silva" required /></div>
            <div><Label>Senha * (mín. 5 caracteres)</Label><Input type="text" value={nf.password} onChange={(e) => setNf({ ...nf, password: e.target.value })} required minLength={5} /></div>
            <div><Label>Nome completo *</Label><Input value={nf.full_name} onChange={(e) => setNf({ ...nf, full_name: e.target.value })} required /></div>
            <div><Label>E-mail (informativo)</Label><Input type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} /></div>
            <div><Label>Papel</Label><RoleSelect value={nf.role} onChange={(role) => setNf({ ...nf, role })} /></div>
            <div className="space-y-1">
              <Label>Abas visíveis</Label>
              <PanelChecklist value={nf.role === "admin" ? [...PANELS] : nf.panels} disabled={nf.role === "admin"} onChange={(panels) => setNf({ ...nf, panels })} />
            </div>
            <Button type="submit" className="w-full" disabled={mCreate.isPending}>{mCreate.isPending ? "Criando…" : "Criar usuário"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Editar · <span className="num">{edit?.username}</span></DialogTitle></DialogHeader>

          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); mEdit.mutate(); }}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Informações básicas</div>
            <div><Label>Nome completo</Label><Input value={ef.full_name} onChange={(e) => setEf({ ...ef, full_name: e.target.value })} required /></div>
            <div><Label>E-mail (informativo)</Label><Input type="email" value={ef.email} onChange={(e) => setEf({ ...ef, email: e.target.value })} /></div>
            <div><Label>Papel</Label><RoleSelect value={ef.role} onChange={(role) => setEf({ ...ef, role })} /></div>
            <Button type="submit" className="w-full" disabled={mEdit.isPending}>Salvar</Button>
          </form>

          <div className="space-y-2 border-t pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Abas visíveis</div>
            <PanelChecklist value={isAdminTarget ? [...PANELS] : ep} disabled={isAdminTarget} onChange={setEp} />
            {isAdminTarget && <p className="text-[11.5px] text-muted-foreground">Administradores têm acesso a todos os painéis.</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                className="bg-success text-success-foreground hover:bg-success/90"
                disabled={isAdminTarget || mPerms.isPending}
                onClick={() => (ep.length === 0 ? toast.error("Selecione ao menos um painel") : mPerms.mutate())}
              >
                Salvar permissões
              </Button>
              <Button type="button" variant="outline" disabled={isAdminTarget} onClick={() => setEp([...PANELS])}>Selecionar todos</Button>
              <Button type="button" variant="outline" disabled={isAdminTarget} onClick={() => setEp([])}>Limpar seleção</Button>
            </div>
          </div>

          <div className="space-y-2 border-t pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Senha</div>
            <p className="text-[12px] text-muted-foreground">
              Redefine a senha para <span className="num font-medium text-foreground">{DEFAULT_RESET_PASSWORD}</span> e obriga o usuário a criar uma nova senha no próximo acesso.
            </p>
            <Button type="button" variant="destructive" onClick={() => edit && setConfirmReset(edit)}>
              <KeyRound className="mr-1 h-3.5 w-3.5" /> Resetar senha
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmReset} onOpenChange={(o) => !o && setConfirmReset(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Resetar senha · <span className="num">{confirmReset?.username}</span></DialogTitle></DialogHeader>
          <p className="text-[12.5px] text-muted-foreground">
            A senha passará a ser <span className="num font-medium text-foreground">{DEFAULT_RESET_PASSWORD}</span> e o usuário precisará definir uma nova senha ao entrar. Deseja continuar?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmReset(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={mReset.isPending} onClick={() => confirmReset && mReset.mutate(confirmReset)}>
              {mReset.isPending ? "Resetando…" : "Confirmar reset"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
