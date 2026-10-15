import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  ClipboardPlus,
  BarChart3,
  FileUp,
  Users,
  ScrollText,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useMe, useSignOut } from "@/hooks/use-me";

type Item = { to: string; label: string; icon: LucideIcon; admin?: boolean };

const items: Item[] = [
  { to: "/inicio", label: "Início", icon: LayoutGrid },
  { to: "/solicitar", label: "Registrar Solicitação", icon: ClipboardPlus },
  { to: "/relatorio", label: "Relatório de Demanda", icon: BarChart3 },
  { to: "/importar", label: "Importar Estoque", icon: FileUp, admin: true },
  { to: "/usuarios", label: "Gestão de Usuários", icon: Users, admin: true },
  { to: "/auditoria", label: "Auditoria", icon: ScrollText, admin: true },
];

const SIDEBAR_KEY = "sidebar-collapsed";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "1");
  }, []);

  useEffect(() => {
    if (me?.needs_password_change && pathname !== "/trocar-senha") {
      navigate({ to: "/trocar-senha", replace: true });
    }
  }, [me?.needs_password_change, pathname, navigate]);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ${collapsed ? "w-14" : "w-56"}`}
      >
        <div className={`flex items-center border-b border-sidebar-border ${collapsed ? "justify-center px-1 py-2" : "gap-2 px-3 py-3"}`}>
          {!collapsed && (
            <div className="flex h-10 min-w-0 flex-1 items-center justify-center rounded bg-white px-2">
              <img src="/brand/LOGO_NMQ.png" alt="NORMAQ JCB" className="h-7 w-auto max-w-full object-contain" />
            </div>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expandir menu" : "Encolher menu"}
            title={collapsed ? "Expandir menu" : "Encolher menu"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        {!collapsed && (
          <div className="border-b border-sidebar-border px-4 py-2">
            <div className="leading-tight">
              <div className="text-[13px] font-semibold">Demanda de Peças</div>
              <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Portal interno</div>
            </div>
          </div>
        )}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {items
            .filter((i) => {
              if (me?.needs_password_change) return false;
              if (me?.isAdmin) return true;
              if (i.admin) return false;
              const panel = i.to.slice(1);
              return (me?.panels as string[] | undefined)?.includes(panel) ?? false;
            })
            .map((i) => (
              <Link
                key={i.to}
                to={i.to}
                title={i.label}
                aria-label={i.label}
                className={`flex items-center rounded py-1.5 text-[12.5px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${collapsed ? "justify-center px-0" : "gap-2 px-2.5"}`}
                activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium border-l-2 border-sidebar-primary" }}
              >
                <i.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{i.label}</span>}
              </Link>
            ))}
        </nav>
        <div className={`border-t border-sidebar-border text-[12px] ${collapsed ? "p-2" : "p-3"}`}>
          {!collapsed && (
            <>
              <div className="truncate font-medium">{me?.full_name ?? "…"}</div>
              <div className="truncate text-muted-foreground">
                @{me?.username} · {me?.isAdmin ? "Admin" : "Consultor"}
              </div>
            </>
          )}
          <button
            type="button"
            onClick={signOut}
            title="Sair"
            aria-label="Sair"
            className={`flex items-center rounded text-[12px] hover:bg-sidebar-accent ${collapsed ? "w-full justify-center px-0 py-1.5" : "mt-2 w-full gap-2 px-2 py-1.5"}`}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && "Sair"}
          </button>
        </div>
      </aside>
      <main className={`min-w-0 flex-1 p-4 pb-10 transition-[margin] duration-200 lg:p-5 ${collapsed ? "ml-14" : "ml-56"}`}>{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-[12px] text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function AdminOnly({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <div className="text-muted-foreground">Carregando…</div>;
  if (!me?.isAdmin)
    return (
      <div className="panel p-6 text-center text-muted-foreground">Acesso restrito ao administrador.</div>
    );
  return <>{children}</>;
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "hot" | "warm" }) {
  return (
    <div className="panel px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`num text-xl font-semibold ${tone === "hot" ? "text-destructive" : tone === "warm" ? "text-primary" : ""}`}>
        {value}
      </div>
    </div>
  );
}
