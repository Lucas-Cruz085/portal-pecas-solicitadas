import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PANELS, type Panel } from "./permissions.functions";

export const DEFAULT_RESET_PASSWORD = "NMQ@123";
export const FORGOT_RESET_PASSWORD = "NMQ@12345";

export const forgotPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ username: z.string().trim().min(3).max(40).regex(/^[a-z0-9._-]+$/i) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = data.username.toLowerCase();
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id, username, is_active")
      .eq("username", username)
      .maybeSingle();
    // Always respond ok to avoid revealing which usernames exist
    if (!prof || !prof.is_active) return { ok: true };
    const { error } = await supabaseAdmin.auth.admin.updateUserById(prof.id, { password: FORGOT_RESET_PASSWORD });
    if (error) return { ok: true };
    await supabaseAdmin
      .from("profiles")
      .update({ needs_password_change: true, updated_at: new Date().toISOString() })
      .eq("id", prof.id);
    await supabaseAdmin.from("audit_logs").insert({
      user_id: prof.id,
      username: prof.username,
      action: "esqueci_senha",
      entity: "usuario",
      entity_id: prof.id,
      after_data: { needs_password_change: true },
    });
    return { ok: true };
  });

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadCaller } = await import("./audit.server");
    const { profile, isAdmin } = await loadCaller(context.supabase, context.userId);
    const { data: perms } = await context.supabase
      .from("user_permissions")
      .select("panel, allowed")
      .eq("user_id", context.userId);
    const panels = isAdmin
      ? ([...PANELS] as Panel[])
      : ((perms ?? []).filter((p) => p.allowed).map((p) => p.panel) as Panel[]);
    return { ...profile, isAdmin, role: isAdmin ? ("admin" as const) : ("consultor" as const), panels };
  });

export const recordSessionEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ event: z.enum(["login", "logout"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadCaller, writeAudit } = await import("./audit.server");
    const { profile } = await loadCaller(context.supabase, context.userId);
    await writeAudit(context.supabase, {
      userId: context.userId,
      username: profile.username,
      action: data.event,
      entity: "sessao",
    });
    return { ok: true };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadCaller } = await import("./audit.server");
    const { isAdmin } = await loadCaller(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Acesso negado");
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      context.supabase.from("profiles").select("*").order("username"),
      context.supabase.from("user_roles").select("user_id, role"),
    ]);
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    return (profiles ?? []).map((p) => ({ ...p, role: roleMap.get(p.id) ?? "consultor" }));
  });

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Mínimo 3 caracteres")
  .max(40)
  .regex(/^[a-z0-9._-]+$/i, "Use apenas letras, números, ponto, hífen ou sublinhado");

const createUserSchema = z.object({
  username: usernameSchema,
  password: z.string().min(5, "A senha precisa ter ao menos 5 caracteres").max(72),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  role: z.enum(["admin", "consultor"]),
  panels: z.array(z.enum(PANELS)).default([]),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createUserSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { loadCaller, writeAudit, usernameToEmail } = await import("./audit.server");
    const { profile, isAdmin } = await loadCaller(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const username = data.username.toLowerCase();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: usernameToEmail(username),
      password: data.password,
      email_confirm: true,
      user_metadata: { username, full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Falha ao criar usuário");

    const uid = created.user.id;
    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      id: uid,
      username,
      full_name: data.full_name,
      email: data.email || null,
    });
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(pErr.code === "23505" ? "Nome de usuário já existe" : pErr.message);
    }
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    await supabaseAdmin.from("user_permissions").upsert(
      PANELS.map((panel) => ({
        user_id: uid,
        panel,
        allowed: data.role === "admin" ? true : data.panels.includes(panel),
      })),
      { onConflict: "user_id,panel" },
    );

    await writeAudit(context.supabase, {
      userId: context.userId,
      username: profile.username,
      action: "criar_usuario",
      entity: "usuario",
      entityId: uid,
      after: { username, full_name: data.full_name, email: data.email || null, role: data.role, is_active: true, paineis: data.role === "admin" ? [...PANELS] : data.panels },
    });
    return { id: uid };
  });

const updateUserSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  role: z.enum(["admin", "consultor"]).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(5).max(72).optional().or(z.literal("")),
});

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateUserSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { loadCaller, writeAudit } = await import("./audit.server");
    const { profile, isAdmin } = await loadCaller(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before } = await supabaseAdmin.from("profiles").select("*").eq("id", data.id).single();
    const { data: beforeRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.id)
      .maybeSingle();
    if (!before) throw new Error("Usuário não encontrado");
    if (data.id === context.userId && data.is_active === false) throw new Error("Você não pode desativar a si mesmo");

    const patch: { updated_at: string; full_name?: string; email?: string | null; is_active?: boolean } = {
      updated_at: new Date().toISOString(),
    };
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.email !== undefined) patch.email = data.email || null;
    if (data.is_active !== undefined) patch.is_active = data.is_active;
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.role && data.role !== beforeRole?.role) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id);
      await supabaseAdmin.from("user_roles").insert({ user_id: data.id, role: data.role });
    }

    const authPatch: { password?: string; ban_duration?: string } = {};
    if (data.password) authPatch.password = data.password;
    if (data.is_active !== undefined) authPatch.ban_duration = data.is_active ? "none" : "876000h";
    if (Object.keys(authPatch).length) {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.id, authPatch);
      if (aErr) throw new Error(aErr.message);
    }

    await writeAudit(context.supabase, {
      userId: context.userId,
      username: profile.username,
      action: data.password ? "redefinir_senha" : "editar_usuario",
      entity: "usuario",
      entityId: data.id,
      before: { full_name: before.full_name, email: before.email, is_active: before.is_active, role: beforeRole?.role },
      after: {
        full_name: data.full_name ?? before.full_name,
        email: data.email !== undefined ? data.email || null : before.email,
        is_active: data.is_active ?? before.is_active,
        role: data.role ?? beforeRole?.role,
        password_changed: Boolean(data.password),
      },
    });
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadCaller, writeAudit } = await import("./audit.server");
    const { profile, isAdmin } = await loadCaller(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: DEFAULT_RESET_PASSWORD,
    });
    if (error) throw new Error(error.message);
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ needs_password_change: true, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (pErr) throw new Error(pErr.message);

    await writeAudit(context.supabase, {
      userId: context.userId,
      username: profile.username,
      action: "resetar_senha_padrao",
      entity: "usuario",
      entityId: data.id,
      after: { needs_password_change: true },
    });
    return { ok: true, password: DEFAULT_RESET_PASSWORD };
  });

export const changeOwnPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        password: z.string().min(5, "A senha precisa ter ao menos 5 caracteres").max(72),
        confirm: z.string(),
      })
      .refine((v) => v.password === v.confirm, { message: "As senhas não conferem", path: ["confirm"] })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { loadCaller, writeAudit } = await import("./audit.server");
    const { profile } = await loadCaller(context.supabase, context.userId);
    if (data.password === DEFAULT_RESET_PASSWORD || data.password === FORGOT_RESET_PASSWORD)
      throw new Error("Escolha uma senha diferente da senha padrão");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: data.password });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles")
      .update({ needs_password_change: false, updated_at: new Date().toISOString() })
      .eq("id", context.userId);

    await writeAudit(context.supabase, {
      userId: context.userId,
      username: profile.username,
      action: "alterar_propria_senha",
      entity: "usuario",
      entityId: context.userId,
      after: { needs_password_change: false },
    });
    return { ok: true };
  });
