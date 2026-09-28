import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

export type AuditInput = {
  userId: string;
  username: string;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

export async function writeAudit(client: SupabaseClient<Database>, input: AuditInput) {
  const { error } = await client.from("audit_logs").insert({
    user_id: input.userId,
    username: input.username,
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId ?? null,
    before_data: (input.before ?? null) as Json,
    after_data: (input.after ?? null) as Json,
  });
  if (error) console.error("[audit]", error.message);
}

export async function loadCaller(client: SupabaseClient<Database>, userId: string) {
  const [{ data: profile }, { data: isAdmin }] = await Promise.all([
    client.from("profiles").select("*").eq("id", userId).maybeSingle(),
    client.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (!profile) throw new Error("Perfil não encontrado");
  if (!profile.is_active) throw new Error("Usuário desativado");
  return { profile, isAdmin: Boolean(isAdmin) };
}

export function usernameToEmail(username: string) {
  return `${username.toLowerCase()}@demanda.local`;
}
