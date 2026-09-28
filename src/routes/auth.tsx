import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LockKeyhole, UserRound } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { forgotPassword } from "@/lib/auth.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import wallpaperAsset from "@/assets/JCB_WPP_1.jpg.asset.json";
import logoAsset from "@/assets/LOGO_NMQ.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Demanda de Peças" },
      { name: "description", content: "Acesso ao portal de demanda reprimida de peças da concessionária." },
      { property: "og:title", content: "Entrar — Demanda de Peças" },
      { property: "og:description", content: "Acesso ao portal de demanda reprimida de peças." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const forgotFn = useServerFn(forgotPassword);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inicio", replace: true });
    });
  }, [navigate]);

  async function forgot() {
    setError(null);
    setInfo(null);
    const u = username.trim().toLowerCase();
    if (!u) return setError("Informe seu usuário para redefinir a senha.");
    if (!window.confirm(`Redefinir a senha do usuário "${u}" para a senha padrão?`)) return;
    setLoading(true);
    try {
      await forgotFn({ data: { username: u } });
      setInfo("Se o usuário existir, a senha foi redefinida para NMQ@12345. Entre e defina uma nova senha.");
    } catch {
      setError("Não foi possível redefinir a senha.");
    }
    setLoading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const u = username.trim().toLowerCase();
    if (!u || !password) return setError("Informe usuário e senha.");
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: `${u}@demanda.local`, password });
    if (error || !data.user) {
      setLoading(false);
      const msg = error?.message ?? "";
      setError(msg.toLowerCase().includes("banned") ? "Conta desativada. Fale com o administrador." : "Usuário ou senha inválidos.");
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle();
    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      setLoading(false);
      setError("Conta desativada. Fale com o administrador.");
      return;
    }
    navigate({ to: "/inicio", replace: true });
  }

  return (
    <div className="surface-dark relative flex min-h-screen items-center justify-end overflow-hidden bg-background p-4 md:p-10">
      <img src={wallpaperAsset.url} alt="Retroescavadeira JCB" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-background/65" />
      <form onSubmit={submit} className="panel relative z-10 w-full max-w-sm border-border bg-card/95 p-6 shadow-2xl backdrop-blur-sm md:mr-[8vw]">
        <div className="mb-5 rounded-md bg-white p-3">
          <img src={logoAsset.url} alt="NORMAQ JCB" className="mx-auto h-12 w-auto max-w-full object-contain" />
        </div>
        <div className="mb-5 text-center">
          <div className="text-lg font-semibold">Acesso restrito</div>
          <div className="mt-1 text-[12px] text-muted-foreground">Entre com seu usuário corporativo.</div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="u">Usuário</Label>
            <div className="relative"><UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="u" className="pl-9" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus /></div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p">Senha</Label>
            <div className="relative"><LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="p" className="pl-9" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          </div>
          {error && <p className="text-[12px] text-destructive">{error}</p>}
          {info && <p className="text-[12px] text-primary">{info}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar no painel"}
          </Button>
          <button type="button" onClick={forgot} disabled={loading} className="w-full text-center text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Esqueci minha senha
          </button>
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Sistema corporativo NORMAQ • Acesso monitorado
        </p>
      </form>
    </div>
  );
}
