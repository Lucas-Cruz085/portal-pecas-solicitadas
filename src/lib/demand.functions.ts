import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createSchema = z.object({
  kind: z.enum(["estoque", "manual"]),
  reference: z.string().trim().min(1, "Informe a referência").max(60),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  quantity: z.number().int().positive().max(100000).optional(),
  customer_name: z.string().trim().max(120).optional().or(z.literal("")),
  customer_contact: z.string().trim().max(120).optional().or(z.literal("")),
});

const createBatchSchema = z.object({
  customer_name: z.string().trim().min(1, "Nome do cliente é obrigatório").max(120),
  customer_contact: z.string().trim().max(120).optional().or(z.literal("")),
  items: z.array(z.object({
    reference: z.string().trim().min(1, "Informe a referência").max(60),
    description: z.string().trim().max(200).optional().or(z.literal("")),
    quantity: z.number().int().positive().max(100000),
  })).min(1, "Adicione pelo menos uma peça").max(50, "Máximo de 50 peças por solicitação"),
});

export const createDemandRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { loadCaller, writeAudit } = await import("./audit.server");
    const { profile } = await loadCaller(context.supabase, context.userId);
    if (data.kind === "manual" && !data.customer_name) throw new Error("Nome do cliente é obrigatório");

    const reference = data.reference.toUpperCase();
    let description = data.description || null;
    if (data.kind === "estoque") {
      const { data: item } = await context.supabase
        .from("stock_items")
        .select("description, quantity")
        .eq("reference", reference)
        .maybeSingle();
      if (!item) throw new Error("Item não encontrado na base de estoque");
      description = item.description;
      if (!data.quantity) throw new Error("Informe a quantidade");
    } else if (!description) {
      const { data: item } = await context.supabase
        .from("stock_items")
        .select("description")
        .eq("reference", reference)
        .maybeSingle();
      description = item?.description ?? null;
    }

    const { data: row, error } = await context.supabase
      .from("demand_requests")
      .insert({
        kind: data.kind,
        reference,
        description,
        quantity: data.quantity ?? null,
        customer_name: data.customer_name || null,
        customer_contact: data.customer_contact || null,
        user_id: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await writeAudit(context.supabase, {
      userId: context.userId,
      username: profile.username,
      action: data.kind === "estoque" ? "solicitar_item" : "flagar_peca",
      entity: "solicitacao",
      entityId: row.id,
      after: row,
    });
    return row;
  });

export const createDemandRequestBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createBatchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { loadCaller, writeAudit } = await import("./audit.server");
    const { profile } = await loadCaller(context.supabase, context.userId);
    const references = [...new Set(data.items.map((item) => item.reference.toUpperCase()))];
    const { data: stock } = await context.supabase
      .from("stock_items")
      .select("reference, description")
      .in("reference", references);
    const descriptions = new Map((stock ?? []).map((item) => [item.reference, item.description]));
    const payload = data.items.map((item) => {
      const reference = item.reference.toUpperCase();
      return {
        kind: "manual" as const,
        reference,
        description: item.description || descriptions.get(reference) || null,
        quantity: item.quantity,
        customer_name: data.customer_name,
        customer_contact: data.customer_contact || null,
        user_id: context.userId,
      };
    });
    const { data: rows, error } = await context.supabase.from("demand_requests").insert(payload).select();
    if (error) throw new Error(error.message);
    for (const row of rows ?? []) {
      await writeAudit(context.supabase, {
        userId: context.userId,
        username: profile.username,
        action: "flagar_peca",
        entity: "solicitacao",
        entityId: row.id,
        after: row,
      });
    }
    return rows ?? [];
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  quantity: z.number().int().positive().max(100000).nullable().optional(),
  customer_name: z.string().trim().max(120).optional().or(z.literal("")),
  customer_contact: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(200).optional().or(z.literal("")),
});

export const updateDemandRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { loadCaller, writeAudit } = await import("./audit.server");
    const { profile } = await loadCaller(context.supabase, context.userId);
    const { data: before } = await context.supabase.from("demand_requests").select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Registro não encontrado");
    const patch = {
      quantity: data.quantity === undefined ? before.quantity : data.quantity,
      customer_name: data.customer_name === undefined ? before.customer_name : data.customer_name || null,
      customer_contact: data.customer_contact === undefined ? before.customer_contact : data.customer_contact || null,
      description: data.description === undefined ? before.description : data.description || null,
      updated_at: new Date().toISOString(),
    };
    const { data: after, error } = await context.supabase
      .from("demand_requests")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await writeAudit(context.supabase, {
      userId: context.userId,
      username: profile.username,
      action: "editar_solicitacao",
      entity: "solicitacao",
      entityId: data.id,
      before,
      after,
    });
    return after;
  });

export const deleteDemandRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadCaller, writeAudit } = await import("./audit.server");
    const { profile } = await loadCaller(context.supabase, context.userId);
    const { data: before } = await context.supabase.from("demand_requests").select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Registro não encontrado");
    const { error } = await context.supabase.from("demand_requests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(context.supabase, {
      userId: context.userId,
      username: profile.username,
      action: "excluir_solicitacao",
      entity: "solicitacao",
      entityId: data.id,
      before,
    });
    return { ok: true };
  });
