import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

export type AuditInput = {
  userId: string | null;
  username: string;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

export async function writeAudit(_client: SupabaseClient<Database>, input: AuditInput, strict = false) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    user_id: input.userId,
    username: input.username,
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId ?? null,
    before_data: (input.before ?? null) as Json,
    after_data: (input.after ?? null) as Json,
  });
  if (error) {
    console.error("[audit]", error.message);
    if (strict) throw new Error("Não foi possível registrar a auditoria.");
  }
}

export async function loadCaller(
  client: SupabaseClient<Database>,
  userId: string,
  options?: { allowPendingPassword?: boolean },
) {
  const [{ data: profile }, { data: isAdmin }] = await Promise.all([
    client.from("profiles").select("*").eq("id", userId).maybeSingle(),
    client.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (!profile) throw new Error("Perfil não encontrado");
  if (!profile.is_active) throw new Error("Usuário desativado");
  if (profile.needs_password_change && !options?.allowPendingPassword) {
    throw new Error("Altere sua senha para continuar.");
  }
  return { profile, isAdmin: Boolean(isAdmin) };
}

export async function assertPanelAccess(
  client: SupabaseClient<Database>,
  userId: string,
  isAdmin: boolean,
  panel: "inicio" | "solicitar" | "relatorio",
) {
  if (isAdmin) return;
  const { data, error } = await client.rpc("has_panel_access", { _user_id: userId, _panel: panel });
  if (error || !data) throw new Error("Acesso negado");
}

export function usernameToEmail(username: string) {
  return `${username.toLowerCase()}@demanda.local`;
}
