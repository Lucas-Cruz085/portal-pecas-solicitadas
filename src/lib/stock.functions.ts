import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rowSchema = z.object({
  reference: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200),
  quantity: z.number().min(0).max(1e9),
});

const importSchema = z.object({
  fileName: z.string().max(200),
  rows: z.array(rowSchema).min(1, "Nenhum item encontrado no PDF").max(50000),
});

export const importStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { loadCaller, writeAudit } = await import("./audit.server");
    const { profile, isAdmin } = await loadCaller(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Deduplicate by reference (last occurrence wins)
    const map = new Map<string, { reference: string; description: string; quantity: number }>();
    for (const r of data.rows) map.set(r.reference.toUpperCase(), { ...r, reference: r.reference.toUpperCase() });
    const rows = [...map.values()];
    const now = new Date().toISOString();

    const { count: beforeCount } = await supabaseAdmin
      .from("stock_items")
      .select("reference", { count: "exact", head: true });

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: now }));
      const { error } = await supabaseAdmin.from("stock_items").upsert(chunk, { onConflict: "reference" });
      if (error) throw new Error(error.message);
    }

    const { data: imp, error: iErr } = await supabaseAdmin
      .from("stock_imports")
      .insert({ imported_by: context.userId, file_name: data.fileName, item_count: rows.length })
      .select()
      .single();
    if (iErr) throw new Error(iErr.message);

    const zero = rows.filter((r) => r.quantity === 0).length;
    await writeAudit(context.supabase, {
      userId: context.userId,
      username: profile.username,
      action: "importar_estoque",
      entity: "estoque",
      entityId: imp.id,
      before: { total_itens: beforeCount ?? 0 },
      after: { arquivo: data.fileName, itens_importados: rows.length, itens_zerados: zero },
    });
    return { imported: rows.length, zero, importedAt: imp.imported_at };
  });
