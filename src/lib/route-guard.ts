import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const ORDER = ["inicio", "solicitar", "relatorio"] as const;
type GuardPanel = (typeof ORDER)[number] | "importar" | "usuarios" | "auditoria";

export function userIdFromContext(context: object) {
  const user = (context as { user?: { id?: string } }).user;
  return user?.id;
}

export async function requirePanel(panel: GuardPanel, knownUserId?: string) {
  let userId = knownUserId;
  if (!userId) {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    userId = data.user.id;
  }
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return;

  const adminOnly = panel === "importar" || panel === "usuarios" || panel === "auditoria";
  if (!adminOnly) {
    const { data: row } = await supabase
      .from("user_permissions")
      .select("allowed")
      .eq("user_id", userId)
      .eq("panel", panel)
      .maybeSingle();
    if (row?.allowed) return;
  }

  const { data: perms } = await supabase.from("user_permissions").select("panel, allowed").eq("user_id", userId);
  const allowed = new Set((perms ?? []).filter((p) => p.allowed).map((p) => p.panel));
  const next = ORDER.find((item) => allowed.has(item));
  if (next === "inicio" && panel !== "inicio") throw redirect({ to: "/inicio" });
  if (next === "solicitar" && panel !== "solicitar") throw redirect({ to: "/solicitar", search: { reference: "", description: "" } });
  if (next === "relatorio" && panel !== "relatorio") throw redirect({ to: "/relatorio" });
}
