import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PANELS, type Panel } from "./permissions.functions";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Mínimo 3 caracteres")
  .max(40)
  .regex(/^[a-z0-9._-]+$/i, "Use apenas letras, números, ponto, hífen ou sublinhado");

const newPasswordSchema = z
  .string()
  .min(12, "A senha precisa ter ao menos 12 caracteres")
  .max(72);

export const login = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ username: usernameSchema, password: z.string().min(1).max(72) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { assertRateLimit, clientAddress } = await import("./rate-limit.server");
    const { createEphemeralAuth } = await import("./password.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { usernameToEmail, writeAudit } = await import("./audit.server");
    const username = data.username.toLowerCase();
    const ip = clientAddress();
    assertRateLimit(`login:user:${username}`, 20, 15 * 60 * 1000);
    assertRateLimit(`login:ip:${ip}`, 40, 15 * 60 * 1000);

    const auth = createEphemeralAuth();
    const { data: signed, error } = await auth.auth.signInWithPassword({
      email: usernameToEmail(username),
      password: data.password,
    });
    if (error || !signed.session || !signed.user) {
      const banned = (error?.message ?? "").toLowerCase().includes("banned");
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("id, username")
        .eq("username", username)
        .maybeSingle();
      await writeAudit(supabaseAdmin, {
        userId: prof?.id ?? null,
        username: prof?.username ?? username,
        action: "login_falho",
        entity: "sessao",
        after: { motivo: banned ? "conta_desativada" : "credencial_invalida" },
      });
      throw new Error(banned ? "Conta desativada. Fale com o administrador." : "Usuário ou senha inválidos.");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .eq("id", signed.user.id)
      .maybeSingle();
    if (!profile) {
      await writeAudit(supabaseAdmin, {
        userId: signed.user.id,
        username,
        action: "login_falho",
        entity: "sessao",
        after: { motivo: "perfil_ausente" },
      });
      throw new Error("Perfil não encontrado. Fale com o administrador.");
    }

    await writeAudit(supabaseAdmin, {
      userId: signed.user.id,
      username: profile.username,
      action: "login",
      entity: "sessao",
    });
    return {
      access_token: signed.session.access_token,
      refresh_token: signed.session.refresh_token,
    };
  });

export const forgotPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ username: usernameSchema }).parse(d))
  .handler(async ({ data }) => {
    const { assertRateLimit, clientAddress } = await import("./rate-limit.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("./audit.server");
    const username = data.username.toLowerCase();
    const ip = clientAddress();
    assertRateLimit(`forgot:user:${username}`, 3, 60 * 60 * 1000);
    assertRateLimit(`forgot:ip:${ip}`, 5, 60 * 60 * 1000);

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .maybeSingle();
    await writeAudit(supabaseAdmin, {
      userId: prof?.id ?? null,
      username: prof?.username ?? username,
      action: "tentativa_esqueci_senha",
      entity: "usuario",
      entityId: prof?.id ?? null,
      after: { encaminhado_ao_admin: true },
    });
    return { ok: true };
  });

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadCaller } = await import("./audit.server");
    const { profile, isAdmin } = await loadCaller(context.supabase, context.userId, { allowPendingPassword: true });
    const { data: perms } = await context.supabase
      .from("user_permissions")
      .select("panel, allowed")
      .eq("user_id", context.userId);
    const panels = isAdmin
      ? ([...PANELS] as Panel[])
      : ((perms ?? []).filter((p) => p.allowed).map((p) => p.panel) as Panel[]);
    const row = profile as typeof profile & { display_name?: string | null };
    const full_name = profile.full_name || row.display_name || profile.username;
    return { ...profile, full_name, isAdmin, role: isAdmin ? ("admin" as const) : ("consultor" as const), panels };
  });

export const recordSessionEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ event: z.enum(["login", "logout"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadCaller, writeAudit } = await import("./audit.server");
    const { profile } = await loadCaller(context.supabase, context.userId, { allowPendingPassword: true });
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

const createUserSchema = z.object({
  username: usernameSchema,
  password: newPasswordSchema,
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
    const { isRetiredPassword } = await import("./password.server");
    if (isRetiredPassword(data.password)) throw new Error("Escolha uma senha diferente da senha padrão antiga");

    const username = data.username.toLowerCase();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: usernameToEmail(username),
      password: data.password,
      email_confirm: true,
      user_metadata: { username, full_name: data.full_name },
    });
    if (error || !created.user) {
      const duplicate = (error?.message ?? "").toLowerCase().includes("already");
      throw new Error(duplicate ? "Nome de usuário já existe" : "Falha ao criar usuário");
    }

    const uid = created.user.id;
    const rollback = async () => {
      await supabaseAdmin.from("user_permissions").delete().eq("user_id", uid);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
      await supabaseAdmin.from("profiles").delete().eq("id", uid);
      await supabaseAdmin.auth.admin.deleteUser(uid);
    };

    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      id: uid,
      username,
      full_name: data.full_name,
      email: data.email || null,
    });
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(pErr.code === "23505" ? "Nome de usuário já existe" : "Falha ao criar usuário");
    }
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    if (roleErr) {
      await rollback();
      throw new Error("Falha ao criar usuário");
    }
    const { error: permErr } = await supabaseAdmin.from("user_permissions").upsert(
      PANELS.map((panel) => ({
        user_id: uid,
        panel,
        allowed: data.role === "admin" ? true : data.panels.includes(panel),
      })),
      { onConflict: "user_id,panel" },
    );
    if (permErr) {
      await rollback();
      throw new Error("Falha ao criar usuário");
    }

    try {
      await writeAudit(
        context.supabase,
        {
          userId: context.userId,
          username: profile.username,
          action: "criar_usuario",
          entity: "usuario",
          entityId: uid,
          after: {
            username,
            full_name: data.full_name,
            email: data.email || null,
            role: data.role,
            is_active: true,
            paineis: data.role === "admin" ? [...PANELS] : data.panels,
          },
        },
        true,
      );
    } catch (auditError) {
      await rollback();
      throw auditError;
    }
    return { id: uid };
  });

const updateUserSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  role: z.enum(["admin", "consultor"]).optional(),
  is_active: z.boolean().optional(),
  password: newPasswordSchema.optional().or(z.literal("")),
});

async function assertKeepsAnAdmin(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  targetId: string,
  removingTargetAdmin: boolean,
) {
  if (!removingTargetAdmin) return;
  const { data: roles, error } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  if (error) throw new Error("Falha ao atualizar o usuário");
  const ids = (roles ?? []).map((r) => r.user_id).filter((id) => id !== targetId);
  if (!ids.length) throw new Error("O portal precisa manter ao menos um administrador ativo.");
  const { data: active, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .in("id", ids)
    .eq("is_active", true);
  if (pErr) throw new Error("Falha ao atualizar o usuário");
  if (!active?.length) throw new Error("O portal precisa manter ao menos um administrador ativo.");
}

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateUserSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { loadCaller, writeAudit } = await import("./audit.server");
    const { profile, isAdmin } = await loadCaller(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isRetiredPassword, revokeUserSessions } = await import("./password.server");

    const { data: before } = await supabaseAdmin.from("profiles").select("*").eq("id", data.id).single();
    const { data: beforeRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.id)
      .maybeSingle();
    if (!before) throw new Error("Usuário não encontrado");
    if (data.id === context.userId && data.is_active === false) throw new Error("Você não pode desativar a si mesmo");
    if (data.password && isRetiredPassword(data.password)) throw new Error("Escolha uma senha diferente da senha padrão antiga");

    const nextRole = data.role ?? beforeRole?.role;
    const nextActive = data.is_active ?? before.is_active;
    const removingAdmin = beforeRole?.role === "admin" && (nextRole !== "admin" || nextActive === false);
    await assertKeepsAnAdmin(supabaseAdmin, data.id, removingAdmin);

    const patch: { updated_at: string; full_name?: string; email?: string | null; is_active?: boolean } = {
      updated_at: new Date().toISOString(),
    };
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.email !== undefined) patch.email = data.email || null;
    if (data.is_active !== undefined) patch.is_active = data.is_active;
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.id);
    if (error) throw new Error("Falha ao atualizar o usuário");

    if (data.role && data.role !== beforeRole?.role) {
      const { error: delErr } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id);
      if (delErr) throw new Error("Falha ao atualizar o usuário");
      const { error: insErr } = await supabaseAdmin.from("user_roles").insert({ user_id: data.id, role: data.role });
      if (insErr) throw new Error("Falha ao atualizar o usuário");
    }

    const authPatch: { password?: string; ban_duration?: string } = {};
    if (data.password) authPatch.password = data.password;
    if (data.is_active !== undefined) authPatch.ban_duration = data.is_active ? "none" : "876000h";
    if (Object.keys(authPatch).length) {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.id, authPatch);
      if (aErr) throw new Error("Falha ao atualizar o usuário");
      if (data.password || data.is_active === false) await revokeUserSessions(data.id);
    }

    await writeAudit(
      context.supabase,
      {
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
      },
      true,
    );
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
    const { generateTemporaryPassword, revokeUserSessions } = await import("./password.server");
    const { data: target } = await supabaseAdmin.from("profiles").select("id").eq("id", data.id).maybeSingle();
    if (!target) throw new Error("Usuário não encontrado");

    const password = generateTemporaryPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { password });
    if (error) throw new Error("Falha ao redefinir a senha");
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ needs_password_change: true, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (pErr) throw new Error("Falha ao redefinir a senha");
    await revokeUserSessions(data.id);

    await writeAudit(context.supabase, {
      userId: context.userId,
      username: profile.username,
      action: "resetar_senha_padrao",
      entity: "usuario",
      entityId: data.id,
      after: { needs_password_change: true },
    });
    return { ok: true, password };
  });

export const changeOwnPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        password: newPasswordSchema,
        confirm: z.string(),
        current: z.string().max(72).optional().or(z.literal("")),
      })
      .refine((v) => v.password === v.confirm, { message: "As senhas não conferem", path: ["confirm"] })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertRateLimit } = await import("./rate-limit.server");
    assertRateLimit(`changepw:${context.userId}`, 10, 60 * 60 * 1000);
    const { loadCaller, writeAudit, usernameToEmail } = await import("./audit.server");
    const { profile } = await loadCaller(context.supabase, context.userId, { allowPendingPassword: true });
    const { isRetiredPassword, createEphemeralAuth, revokeUserSessions } = await import("./password.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (isRetiredPassword(data.password)) throw new Error("Escolha uma senha diferente da senha padrão antiga");

    const auth = createEphemeralAuth();
    const email = usernameToEmail(profile.username);
    if (!profile.needs_password_change) {
      if (!data.current) throw new Error("Informe a senha atual.");
      const current = await auth.auth.signInWithPassword({ email, password: data.current });
      if (current.error || !current.data.session) throw new Error("Senha atual inválida.");
    }
    const same = await auth.auth.signInWithPassword({ email, password: data.password });
    if (!same.error && same.data.session) throw new Error("Escolha uma senha diferente da senha atual.");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: data.password });
    if (error) throw new Error("Falha ao alterar a senha");
    const { error: flagErr } = await supabaseAdmin
      .from("profiles")
      .update({ needs_password_change: false, updated_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (flagErr) throw new Error("Falha ao alterar a senha");
    await revokeUserSessions(context.userId);

    const fresh = await auth.auth.signInWithPassword({ email, password: data.password });
    if (fresh.error || !fresh.data.session) throw new Error("Senha alterada. Entre novamente com a nova senha.");

    await writeAudit(context.supabase, {
      userId: context.userId,
      username: profile.username,
      action: "alterar_propria_senha",
      entity: "usuario",
      entityId: context.userId,
      after: { needs_password_change: false },
    });
    return {
      ok: true as const,
      access_token: fresh.data.session.access_token,
      refresh_token: fresh.data.session.refresh_token,
    };
  });
