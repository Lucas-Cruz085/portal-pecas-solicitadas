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
    const { data: resolvedEmail } = await supabaseAdmin.rpc(
      "get_email_by_username" as never,
      { _username: username } as never,
    );
    const email =
      typeof resolvedEmail === "string" && resolvedEmail.includes("@")
        ? resolvedEmail
        : usernameToEmail(username);
    const { data: signed, error } = await auth.auth.signInWithPassword({
      email,
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
      .or(`id.eq.${signed.user.id},user_id.eq.${signed.user.id}`)
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
    assertRateLimit(`forgot:user:${username}`, 10, 60 * 60 * 1000);
    assertRateLimit(`forgot:ip:${ip}`, 40, 60 * 60 * 1000);

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
    }, true);
    return { ok: true };
  });

export const listPasswordResetRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadCaller } = await import("./audit.server");
    const { isAdmin } = await loadCaller(context.supabase, context.userId, { allowPendingPassword: true });
    if (!isAdmin) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("audit_logs")
      .select("username, action, created_at, entity_id")
      .in("action", ["tentativa_esqueci_senha", "resetar_senha_padrao", "redefinir_senha"])
      .order("created_at", { ascending: false })
      .limit(400);
    if (error) return [];
    const newest = new Map();
    for (const row of data ?? []) {
      const key = row.entity_id ? "id:" + row.entity_id : "name:" + String(row.username || "").toLowerCase();
      if (!key.endsWith(":") && !newest.has(key)) newest.set(key, row);
    }
    return [...newest.values()]
      .filter((row) => row.action === "tentativa_esqueci_senha")
      .map((row) => ({
        username: row.username,
        requestedAt: row.created_at,
        userId: row.entity_id,
      }));
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

type LiveProfile = {
  id: string;
  user_id?: string | null;
  username: string;
  display_name?: string | null;
  full_name?: string | null;
  email: string | null;
  needs_password_change?: boolean | null;
  created_at: string;
};

function asLiveProfile(row: object) {
  return row as LiveProfile;
}

function profileAuthId(profile: { id: string; user_id?: string | null }) {
  return profile.user_id || profile.id;
}

async function bannedAuthIds(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  failure: string,
) {
  const banned = new Set<string>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(failure);
    const users = data.users ?? [];
    for (const user of users) {
      const until = user.banned_until ? Date.parse(user.banned_until) : 0;
      if (Number.isFinite(until) && until > Date.now()) banned.add(user.id);
    }
    if (users.length < 200) break;
  }
  return banned;
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadCaller } = await import("./audit.server");
    const { isAdmin } = await loadCaller(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const failure = "Falha ao listar usuários";
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }, banned] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").order("username"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      bannedAuthIds(supabaseAdmin, failure),
    ]);
    if (pErr || rErr) throw new Error(failure);
    const rolesOf = (id: string) => (roles ?? []).filter((r) => r.user_id === id);
    return (profiles ?? []).map((row) => {
      const p = asLiveProfile(row);
      const authId = profileAuthId(p);
      const matched = authId === p.id ? rolesOf(p.id) : [...rolesOf(p.id), ...rolesOf(authId)];
      const name = (p.display_name || p.full_name || p.username || "").trim();
      return {
        id: p.id,
        auth_id: authId,
        username: p.username,
        full_name: name,
        email: p.email,
        role: matched.some((r) => r.role === "admin") ? ("admin" as const) : ("consultor" as const),
        is_active: !banned.has(authId),
        needs_password_change: Boolean(p.needs_password_change),
        created_at: p.created_at,
      };
    });
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
      email: data.email || usernameToEmail(username),
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
      user_id: uid,
      username,
      display_name: data.full_name,
      email: data.email || null,
      is_admin: data.role === "admin",
      needs_password_change: false,
    } as never);
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(pErr.code === "23505" ? "Nome de usuário já existe" : "Falha ao criar usuário");
    }
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role === "admin" ? "admin" : "user" } as never);
    if (roleErr) {
      await rollback();
      throw new Error("Falha ao criar usuário");
    }
    const { error: permErr } = await supabaseAdmin.from("user_permissions").upsert(
      PANELS.map((panel) => ({
        user_id: uid,
        panel,
        allowed: data.role === "admin" ? true : (data.panels.length > 0 ? data.panels : ["inicio", "solicitar", "relatorio"]).includes(panel),
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
            paineis: data.role === "admin" ? [...PANELS] : (data.panels.length > 0 ? data.panels : ["inicio", "solicitar", "relatorio"]),
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
  targetAuthId: string,
  targetProfileId: string,
  removingTargetAdmin: boolean,
) {
  if (!removingTargetAdmin) return;
  const { data: roles, error } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  if (error) throw new Error("Falha ao atualizar o usuário");
  const ids = (roles ?? []).map((r) => r.user_id).filter((id) => id !== targetAuthId && id !== targetProfileId);
  if (!ids.length) throw new Error("O portal precisa manter ao menos um administrador ativo.");
  const banned = await bannedAuthIds(supabaseAdmin, "Falha ao atualizar o usuário");
  if (!ids.some((id) => !banned.has(id))) throw new Error("O portal precisa manter ao menos um administrador ativo.");
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

    const { data: beforeRow, error: beforeErr } = await supabaseAdmin.from("profiles").select("*").eq("id", data.id).maybeSingle();
    if (beforeErr || !beforeRow) throw new Error("Usuário não encontrado");
    const before = asLiveProfile(beforeRow);
    const authId = profileAuthId(before);
    const roleIds = authId === before.id ? [before.id] : [before.id, authId];
    const { data: roleRows, error: roleReadErr } = await supabaseAdmin.from("user_roles").select("role").in("user_id", roleIds);
    if (roleReadErr) throw new Error("Falha ao atualizar o usuário");
    const wasAdmin = (roleRows ?? []).some((r) => r.role === "admin");
    if ((authId === context.userId || before.id === context.userId) && data.is_active === false) {
      throw new Error("Você não pode desativar a si mesmo");
    }
    if (data.password && isRetiredPassword(data.password)) throw new Error("Escolha uma senha diferente da senha padrão antiga");

    const nextIsAdmin = data.role ? data.role === "admin" : wasAdmin;
    const removingAdmin = wasAdmin && (!nextIsAdmin || data.is_active === false);
    await assertKeepsAnAdmin(supabaseAdmin, authId, before.id, removingAdmin);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.full_name !== undefined) patch.display_name = data.full_name;
    if (data.email !== undefined) patch.email = data.email || null;
    if (data.role) patch.is_admin = data.role === "admin";
    const { error } = await supabaseAdmin.from("profiles").update(patch as never).eq("id", before.id);
    if (error) throw new Error("Falha ao atualizar o usuário");

    if (data.role && (data.role === "admin") !== wasAdmin) {
      const { error: delErr } = await supabaseAdmin.from("user_roles").delete().in("user_id", roleIds);
      if (delErr) throw new Error("Falha ao atualizar o usuário");
      const { error: insErr } = await supabaseAdmin.from("user_roles").insert({
        user_id: authId,
        role: data.role === "admin" ? "admin" : "user",
      } as never);
      if (insErr) throw new Error("Falha ao atualizar o usuário");
    }

    if (data.password) {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(authId, { password: data.password });
      if (aErr) throw new Error("Falha ao atualizar o usuário");
      await revokeUserSessions(authId);
    }
    if (data.is_active !== undefined) {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(authId, {
        ban_duration: data.is_active ? "none" : "876000h",
      });
      if (aErr) throw new Error("Falha ao atualizar o usuário");
      if (!data.is_active) await revokeUserSessions(authId);
    }

    const beforeName = before.display_name || before.full_name || before.username;
    await writeAudit(
      context.supabase,
      {
        userId: context.userId,
        username: profile.username,
        action: data.password ? "redefinir_senha" : "editar_usuario",
        entity: "usuario",
        entityId: before.id,
        before: { full_name: beforeName, email: before.email, is_active: data.is_active === undefined ? true : !data.is_active, role: wasAdmin ? "admin" : "consultor" },
        after: {
          full_name: data.full_name ?? beforeName,
          email: data.email !== undefined ? data.email || null : before.email,
          is_active: data.is_active ?? true,
          role: data.role ?? (wasAdmin ? "admin" : "consultor"),
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
    const { data: targetRow } = await supabaseAdmin.from("profiles").select("*").eq("id", data.id).maybeSingle();
    if (!targetRow) throw new Error("Usuário não encontrado");
    const target = asLiveProfile(targetRow);
    const authId = profileAuthId(target);

    const password = generateTemporaryPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(authId, { password });
    if (error) throw new Error("Falha ao redefinir a senha");
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ needs_password_change: true, updated_at: new Date().toISOString() })
      .eq("id", target.id);
    if (pErr) throw new Error("Falha ao redefinir a senha");
    await revokeUserSessions(authId);

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
    const { data: resolvedEmail } = await supabaseAdmin.rpc(
      "get_email_by_username" as never,
      { _username: profile.username.toLowerCase() } as never,
    );
    const email =
      typeof resolvedEmail === "string" && resolvedEmail.includes("@")
        ? resolvedEmail
        : usernameToEmail(profile.username);
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
      .or(`id.eq.${context.userId},user_id.eq.${context.userId}`);
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
