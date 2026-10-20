import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { forgotPassword, login } from "@/lib/auth.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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

function messageOf(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("Muitas tentativas") ||
    message.includes("Usuário ou senha inválidos") ||
    message.includes("Conta desativada") ||
    message.includes("Mínimo 3 caracteres") ||
    message.includes("Use apenas letras")
  ) {
    return message;
  }
  return fallback;
}

function AuthPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const forgotFn = useServerFn(forgotPassword);
  const loginFn = useServerFn(login);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inicio", replace: true });
    });
  }, [navigate]);

  async function forgot() {
    setError(null);
    setInfo(null);
    const u = username.trim().toLowerCase();
    if (!u) return setError("Informe seu usuário para pedir a redefinição.");
    if (!window.confirm("Pedir a redefinição de senha do usuário \"" + u + "\"? Um administrador precisa gerar a nova senha.")) return;
    setLoading(true);
    try {
      await forgotFn({ data: { username: u } });
      setInfo("Os administradores foram avisados. Procure um deles para receber a nova senha.");
    } catch (e) {
      setError(messageOf(e, "Não foi possível registrar o pedido."));
    }
    setLoading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const u = username.trim().toLowerCase();
    if (!u || !password) return setError("Informe usuário e senha.");
    setLoading(true);
    try {
      const tokens = await loginFn({ data: { username: u, password } });
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (sessionError) throw new Error("Usuário ou senha inválidos.");
      navigate({ to: "/inicio", replace: true });
    } catch (e) {
      setError(messageOf(e, "Usuário ou senha inválidos."));
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen bg-[#EDEBE6]">
      <aside className="relative hidden min-h-screen w-1/2 overflow-hidden lg:block">
        <img src="/brand/JCB_LOGIN_FHD.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10" />
        <div className="relative z-10 flex h-full flex-col justify-end px-10 pb-12 text-white xl:px-14">
          <div className="mb-7 w-fit rounded-md bg-white px-3 py-2">
            <img src="/brand/LOGO_NMQ.png" alt="JCB NORMAQ" className="h-8 w-auto" />
          </div>
          <h1 className="text-[2.55rem] font-bold leading-[1.05] tracking-tight">
            Painel de
            <br />
            <span className="text-[#F5B400]">Solicitação de Peças</span>
          </h1>
          <p className="mt-5 max-w-md text-[13.5px] leading-relaxed text-white/80">
            Registre peças procuradas pelos clientes e não encontradas no estoque para priorizar as compras da concessionária.
          </p>
          <div className="mt-10 grid max-w-lg grid-cols-3 gap-6">
            <div>
              <div className="text-[15px] font-semibold">Estoque</div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/60">Importado</div>
            </div>
            <div>
              <div className="text-[15px] font-semibold">Demanda</div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/60">Reprimida</div>
            </div>
            <div>
              <div className="text-[15px] font-semibold">Relatório</div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/60">de compra</div>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex min-h-screen w-full flex-col lg:w-1/2">
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <form onSubmit={submit} className="w-full max-w-[420px]">
            <div className="mb-8 w-fit rounded-md bg-white px-3 py-2 lg:hidden">
              <img src="/brand/LOGO_NMQ.png" alt="JCB NORMAQ" className="h-8 w-auto" />
            </div>
            <h2 className="text-[1.7rem] font-semibold tracking-tight text-neutral-900">Bem-vindo de volta</h2>
            <p className="mt-1.5 text-[13.5px] text-neutral-500">Entre com suas credenciais para acessar o painel</p>
            <div className="mt-8 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="u" className="text-[13px] text-neutral-800">Usuário</Label>
                <div className="relative">
                  <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <Input id="u" className="h-11 border-neutral-300 bg-white pl-10 text-[14px]" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p" className="text-[13px] text-neutral-800">Senha</Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <Input id="p" className="h-11 border-neutral-300 bg-white pl-10 pr-10 text-[14px]" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={forgot} disabled={loading} className="text-[12.5px] font-medium text-[#C58A00] hover:underline disabled:opacity-60">
                    Esqueci minha senha
                  </button>
                </div>
              </div>
              {error && <p className="text-[12.5px] text-destructive">{error}</p>}
              {info && <p className="text-[12.5px] text-neutral-700">{info}</p>}
              <Button type="submit" className="h-11 w-full text-[15px] font-semibold" disabled={loading}>
                {loading ? "Entrando…" : "Entrar no Sistema"}
              </Button>
            </div>
          </form>
        </div>
        <p className="pb-6 text-center text-[11px] text-neutral-400">© 2026 NORMAQ JCB. Todos os direitos reservados.</p>
      </main>
    </div>
  );
}
