import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, BrainCircuit, Eye, EyeOff, Layers3, Loader2, LockKeyhole, UserRound } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { forgotPassword, login } from "@/lib/auth.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acesso restrito — Portal de Solicitação de Peças" },
      { name: "robots", content: "noindex,nofollow,noarchive,noimageindex" },
      { name: "description", content: "Acesso ao portal de solicitação de peças da NORMAQ JCB." },
      { property: "og:title", content: "Acesso Restrito — NORMAQ JCB" },
      { property: "og:description", content: "Entre com suas credenciais para acessar o painel." },
    ],
  }),
  component: AuthPage,
});

const highlights = [
  { icon: Activity, label: "Solicitações em Andamento" },
  { icon: BrainCircuit, label: "Demanda Reprimida" },
  { icon: Layers3, label: "Relatório de Compras" },
];

function messageOf(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("Muitas tentativas") ||
    message.includes("Usuário ou senha inválidos") ||
    message.includes("Conta desativada") ||
    message.includes("Mínimo 3 caracteres") ||
    message.includes("Use apenas letras") ||
    message.includes("Informe") ||
    message.includes("Perfil não encontrado") ||
    message.includes("Não foi possível")
  ) {
    return message;
  }
  return fallback;
}

function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={"flex items-center gap-3 " + className}>
      <div className="flex size-11 items-center justify-center rounded-lg bg-[#ffc107] shadow-md">
        <Layers3 className="size-6 text-[#161b22]" strokeWidth={2.5} />
      </div>
      <div className="leading-none">
        <div className="login-display text-xl font-extrabold tracking-[0.16em] text-white">NORMAQ</div>
        <div className="mt-1 text-xs font-semibold tracking-[0.28em] text-[#ffc107]">JCB</div>
      </div>
    </div>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const loginFn = useServerFn(login);
  const forgotFn = useServerFn(forgotPassword);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const previous = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "0";
    return () => {
      document.body.style.paddingBottom = previous;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) navigate({ to: "/inicio", replace: true });
      else setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "forgot") {
      await requestReset();
      return;
    }
    const user = username.trim().toLowerCase();
    if (!user || !password) {
      toast.error("Informe usuário e senha.");
      return;
    }
    setBusy(true);
    try {
      const tokens = await loginFn({ data: { username: user, password } });
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (sessionError) throw new Error(sessionError.message);
      toast.success("Bem-vindo de volta!");
      navigate({ to: "/inicio", replace: true });
    } catch (error) {
      toast.error(messageOf(error, "Usuário ou senha inválidos."));
    } finally {
      setBusy(false);
    }
  }

  async function requestReset() {
    const user = username.trim().toLowerCase();
    if (!user) {
      toast.error("Informe seu usuário.");
      return;
    }
    setBusy(true);
    try {
      await forgotFn({ data: { username: user } });
      toast.success("Se a conta estiver cadastrada, os administradores receberão sua solicitação.");
      setMode("signin");
      setPassword("");
    } catch (error) {
      toast.error(messageOf(error, "Não foi possível registrar o pedido."));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <div className="min-h-screen bg-[#0d1117]" />;

  return (
    <div className="login-screen relative flex min-h-screen flex-col bg-[#0d1117] lg:flex-row">
      <div className="login-photo absolute inset-0" aria-hidden="true" />
      <section className="relative z-[1] flex min-h-[680px] flex-col justify-between overflow-hidden px-6 py-8 text-white sm:px-10 lg:min-h-screen lg:w-[60%] lg:px-16 lg:py-10">
        <BrandMark />
        <div>
          <p className="mb-4 text-xs font-bold tracking-[0.28em] text-[#ffc107] sm:text-sm">DEMANDA DE PEÇAS</p>
          <h1 className="login-display max-w-xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">Painel de Solicitação de Peças</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/75 sm:text-lg">Registre peças procuradas pelos clientes e não encontradas no estoque para priorizar as compras da concessionária.</p>
          <div className="mt-10 grid max-w-2xl gap-4 sm:grid-cols-3">
            {highlights.map((item) => (
              <div key={item.label} className="flex items-center gap-[0.65rem] pt-[0.85rem] text-[0.8rem] font-semibold" style={{ borderTop: "1px solid rgb(255 255 255 / 0.22)", color: "rgb(255 255 255 / 0.82)" }}>
                <item.icon className="size-5 shrink-0 text-[#ffc107]" />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/65">Desenvolvido por Lucas Cruz | © 2026 NORMAQ - Todos os direitos reservados</p>
      </section>
      <section className="relative z-[1] flex min-h-screen items-center justify-center bg-transparent px-5 py-10 sm:px-8 lg:w-[40%] lg:px-12">
        <div className="login-form-card login-glow-frame w-full max-w-[430px] rounded-2xl p-6 sm:p-9">
          <BrandMark className="mb-8 lg:hidden" />
          <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-[#ffc107]">PORTAL CORPORATIVO</p>
          <h2 className="login-display text-3xl font-bold tracking-tight text-white">{mode === "signin" ? "Acesso Restrito" : "Redefinir senha"}</h2>
          <p className="mt-3 text-sm leading-6 text-[#9aa4b2]">
            {mode === "signin"
              ? "Entre com suas credenciais corporativas para acessar o painel."
              : "Informe seu usuário. Os administradores receberão sua solicitação para redefinir o acesso."}
          </p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="usuario" className="text-xs font-semibold uppercase tracking-[0.12em] text-[#c7ced8]">Usuário</Label>
              <div className="login-field">
                <UserRound className="size-4 shrink-0 text-[#6c757d]" />
                <Input id="usuario" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Digite seu usuário" autoComplete="username" required autoFocus />
              </div>
            </div>
            {mode === "signin" && (
              <div className="space-y-2">
                <Label htmlFor="senha" className="text-xs font-semibold uppercase tracking-[0.12em] text-[#c7ced8]">Senha</Label>
                <div className="login-field">
                  <LockKeyhole className="size-4 shrink-0 text-[#6c757d]" />
                  <Input id="senha" value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" minLength={6} required />
                  <button type="button" className="text-[#6c757d] hover:text-[#ffc107]" aria-label={showPassword ? "Esconder senha" : "Mostrar senha"} onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            )}
            <Button type="submit" className="login-submit w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              {mode === "signin" ? "Entrar no Painel" : "Solicitar reset aos administradores"}
            </Button>
            <button
              type="button"
              className="block w-full text-center text-sm text-[#ffc107] underline-offset-2 hover:text-white hover:underline"
              onClick={() => {
                setMode((current) => (current === "signin" ? "forgot" : "signin"));
                setPassword("");
              }}
            >
              {mode === "signin" ? "Esqueci minha senha" : "Voltar para o login"}
            </button>
          </form>
          <div className="mt-8 border-t border-white/10 pt-5 text-center text-xs leading-5">
            <p className="text-[#9aa4b2]">Portal de Solicitação de Peças <span className="text-[#d4a017]">•</span> Acesso monitorado</p>
            <p className="text-[#6c757d]">(81) 3472-0039</p>
            <p className="text-[#ffc107]">Desenvolvido por Lucas Cruz</p>
          </div>
        </div>
      </section>
    </div>
  );
}
