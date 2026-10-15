import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PANELS = ["inicio", "solicitar", "relatorio", "importar", "usuarios", "auditoria"] as const;
export type Panel = (typeof PANELS)[number];
export const PANEL_LABELS: Record<Panel, string> = {
  inicio: "Início",
  solicitar: "Registrar Solicitação",
  relatorio: "Relatório de Demanda",
  importar: "Importar Estoque",
  usuarios: "Gestão de Usuários",
  auditoria: "Auditoria",
};

const setSchema = z.object({
  userId: z.string().uuid(),
  panels: z.array(z.enum(PANELS)),
});

export const setUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { loadCaller, writeAudit } = await import("./audit.server");
    const { profile, isAdmin } = await loadCaller(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before } = await supabaseAdmin
      .from("user_permissions")
      .select("panel, allowed")
      .eq("user_id", data.userId);
    const beforeSet = (before ?? []).filter((p) => p.allowed).map((p) => p.panel);

    const { error: permErr } = await supabaseAdmin.from("user_permissions").upsert(
      PANELS.map((panel) => ({ user_id: data.userId, panel, allowed: data.panels.includes(panel), updated_at: new Date().toISOString() })),
      { onConflict: "user_id,panel" },
    );
    if (permErr) throw new Error("Falha ao salvar as permissões");

    await writeAudit(context.supabase, {
      userId: context.userId,
      username: profile.username,
      action: "alterar_permissoes",
      entity: "usuario",
      entityId: data.userId,
      before: { paineis: beforeSet },
      after: { paineis: data.panels },
    }, true);
    return { ok: true };
  });

export const listPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadCaller } = await import("./audit.server");
    const { isAdmin } = await loadCaller(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Acesso negado");
    const { data } = await context.supabase.from("user_permissions").select("user_id, panel, allowed");
    return data ?? [];
  });
