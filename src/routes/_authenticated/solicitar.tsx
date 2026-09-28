import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { useMe } from "@/hooks/use-me";
import { createDemandRequestBatch } from "@/lib/demand.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/datetime";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PartSearchInput } from "@/components/PartSearchInput";

export const Route = createFileRoute("/_authenticated/solicitar")({
  validateSearch: (search: Record<string, unknown>) => ({
    reference: typeof search["reference"] === "string" ? search["reference"].slice(0, 60) : "",
    description: typeof search["description"] === "string" ? search["description"].slice(0, 200) : "",
  }),
  head: () => ({
    meta: [
      { title: "Registrar Solicitação — Demanda de Peças" },
      { name: "description", content: "Registre uma ou várias peças solicitadas por um cliente." },
      { property: "og:title", content: "Registrar Solicitação — Demanda de Peças" },
      { property: "og:description", content: "Registre uma ou várias peças solicitadas por um cliente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Solicitar,
});

type RequestItem = { reference: string; description: string; quantity: string };

function Solicitar() {
  const { data: me } = useMe();
  const searchParams = Route.useSearch();
  const qc = useQueryClient();
  const create = useServerFn(createDemandRequestBatch);
  const [form, setForm] = useState({ customer_name: "", customer_contact: "" });
  const [items, setItems] = useState<RequestItem[]>([
    { reference: searchParams.reference, description: searchParams.description, quantity: "1" },
  ]);
  const [now, setNow] = useState(() => new Date());

  const recent = useQuery({
    queryKey: ["requests", "mine-recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("demand_requests")
        .select("*")
        .eq("kind", "manual")
        .order("created_at", { ascending: false })
        .limit(15);
      return data ?? [];
    },
  });

  const m = useMutation({
    mutationFn: () =>
      create({
        data: {
          customer_name: form.customer_name,
          customer_contact: form.customer_contact,
          items: items.map((item) => ({
            reference: item.reference,
            description: item.description,
            quantity: Number(item.quantity),
          })),
        },
      }),
    onSuccess: (rows) => {
      toast.success(`${rows.length} ${rows.length === 1 ? "peça registrada" : "peças registradas"} com sucesso`);
      setForm({ customer_name: "", customer_contact: "" });
      setItems([{ reference: "", description: "", quantity: "1" }]);
      setNow(new Date());
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["ranking"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setItem = (index: number, key: keyof RequestItem, value: string) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Registrar Solicitação" subtitle="Registre uma ou várias peças solicitadas pelo cliente" />
      <div className="grid gap-4 xl:grid-cols-[560px_1fr]">
        <form
          className="panel space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.customer_name.trim()) {
              toast.error("Nome do cliente é obrigatório");
              return;
            }
            if (items.some((item) => !item.reference.trim())) {
              toast.error("Informe a referência de todas as peças");
              return;
            }
            if (items.some((item) => !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1)) {
              toast.error("Informe uma quantidade válida para todas as peças");
              return;
            }
            m.mutate();
          }}
        >
          <div className="space-y-1">
            <Label>Nome do Cliente *</Label>
            <Input value={form.customer_name} onChange={set("customer_name")} maxLength={120} required autoFocus />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Peças *</Label>
              <span className="text-[11px] text-muted-foreground">{items.length}/50</span>
            </div>
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-[1fr_1.25fr_72px_28px] items-end gap-1.5 rounded-md border bg-background/45 p-2">
                <div className="space-y-1">
                  <Label htmlFor={`reference-${index}`}>Referência</Label>
                  <Input id={`reference-${index}`} className="num uppercase" value={item.reference} onChange={(e) => setItem(index, "reference", e.target.value)} maxLength={60} required placeholder="320/A7130" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`description-${index}`}>Descrição</Label>
                  <PartSearchInput
                    id={`description-${index}`}
                    value={item.description}
                    onChange={(v) => setItem(index, "description", v)}
                    onPick={(p) => setItems((current) => current.map((it, i) => (i === index ? { ...it, reference: p.reference, description: p.description } : it)))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`quantity-${index}`}>Qtd.</Label>
                  <Input id={`quantity-${index}`} className="num" type="number" min={1} max={100000} value={item.quantity} onChange={(e) => setItem(index, "quantity", e.target.value)} required />
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-7 text-muted-foreground hover:text-destructive" disabled={items.length === 1} title="Remover peça" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-full" disabled={items.length >= 50} onClick={() => setItems((current) => [...current, { reference: "", description: "", quantity: "1" }])}>
              <Plus className="h-3.5 w-3.5" /> Adicionar outra peça
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Data da Solicitação</Label>
              <Input value={formatDateTime(now)} readOnly disabled className="num" />
            </div>
            <div className="space-y-1">
              <Label>Vendedor / Consultor</Label>
              <Input value={me ? `${me.full_name} (@${me.username})` : ""} readOnly disabled />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Contato do Cliente</Label>
            <Input value={form.customer_contact} onChange={set("customer_contact")} maxLength={120} placeholder="e-mail ou telefone (opcional)" />
          </div>
          <Button type="submit" className="w-full" disabled={m.isPending}>
            {m.isPending ? "Registrando…" : "Registrar Solicitação"}
          </Button>
        </form>

        <section className="panel">
          <div className="border-b px-3 py-2 text-[13px] font-semibold">Últimos registros manuais</div>
          <table className="table-dense w-full">
            <thead>
              <tr className="border-b text-left">
                <th>Data</th>
                <th>Referência</th>
                <th>Descrição</th>
                <th>Cliente</th>
                <th>Contato</th>
                <th className="text-right">Qtd</th>
              </tr>
            </thead>
            <tbody>
              {recent.data?.length === 0 && (
                <tr><td colSpan={6} className="py-5 text-center text-muted-foreground">Nenhum registro ainda.</td></tr>
              )}
              {recent.data?.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.created_at)}</td>
                  <td className="num font-medium">{r.reference}</td>
                  <td className="max-w-xs truncate">{r.description ?? <span className="text-muted-foreground">—</span>}</td>
                  <td>{r.customer_name}</td>
                  <td className="text-muted-foreground">{r.customer_contact ?? "—"}</td>
                  <td className="num text-right">{r.quantity ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
