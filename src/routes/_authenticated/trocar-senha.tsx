import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { changeOwnPassword } from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/AppShell";
import { useMe } from "@/hooks/use-me";

export const Route = createFileRoute("/_authenticated/trocar-senha")({
  head: () => ({ meta: [{ title: "Alterar senha — Demanda de Peças" }] }),
  component: TrocarSenha,
});

function TrocarSenha() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const change = useServerFn(changeOwnPassword);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const forced = Boolean(me?.needs_password_change);

  const m = useMutation({
    mutationFn: () => change({ data: { password, confirm, current: forced ? "" : current } }),
    onSuccess: async (res) => {
      const { error } = await supabase.auth.setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
      });
      if (error) {
        toast.success("Senha alterada. Entre novamente.");
        navigate({ to: "/auth", replace: true });
        return;
      }
      toast.success("Senha alterada com sucesso");
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate({ to: "/inicio", replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-md space-y-3">
      <PageHeader title="Alterar senha" subtitle="Defina uma nova senha pessoal para continuar" />
      {forced && (
        <div className="panel flex items-start gap-2 border-primary/40 p-3 text-[12.5px]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>Sua senha foi redefinida. Crie uma nova senha para acessar o portal.</span>
        </div>
      )}
      <form
        className="panel space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password !== confirm) {
            toast.error("As senhas não conferem");
            return;
          }
          m.mutate();
        }}
      >
        {!forced && (
          <div className="space-y-1">
            <Label htmlFor="cpw">Senha atual</Label>
            <Input id="cpw" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="np">Nova senha (mín. 12 caracteres)</Label>
          <Input id="np" type="password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={forced} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cp">Confirmar nova senha</Label>
          <Input id="cp" type="password" minLength={12} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={m.isPending}>
          {m.isPending ? "Salvando…" : "Salvar nova senha"}
        </Button>
      </form>
    </div>
  );
}
