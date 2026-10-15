import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

type Part = { reference: string; branch: string; description: string; quantity: number };

export function PartSearchInput({
  id,
  value,
  onChange,
  onPick,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (p: Part) => void;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Part[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const term = value.trim();
    if (!open || term.length < 2) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    const safe = term.replace(/[%_\\]/g, " ").trim();
    if (safe.length < 2) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      const pattern = `%${safe}%`;
      const [byDesc, byRef] = await Promise.all([
        supabase
          .from("stock_items_normaq")
          .select("reference, branch, description, quantity")
          .ilike("description", pattern)
          .order("description")
          .limit(12),
        supabase
          .from("stock_items_normaq")
          .select("reference, branch, description, quantity")
          .ilike("reference", pattern)
          .order("reference")
          .limit(12),
      ]);
      if (cancelled) return;
      if (byDesc.error || byRef.error) {
        setResults([]);
        setFailed(true);
        setLoading(false);
        return;
      }
      const merged = new Map<string, Part>();
      for (const row of [...(byDesc.data ?? []), ...(byRef.data ?? [])]) {
        merged.set(`${row.branch}\0${row.reference}`, {
          reference: row.reference,
          branch: row.branch,
          description: row.description,
          quantity: Number(row.quantity),
        });
      }
      setResults([...merged.values()].slice(0, 12));
      setFailed(false);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, open]);

  const showList = open && (loading || failed || results.length > 0);

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        autoComplete="off"
        maxLength={200}
        placeholder="Pesquisar pela descrição"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {showList && (
        <div className="absolute left-0 z-30 mt-1 max-h-64 w-[420px] max-w-[80vw] overflow-auto rounded-md border bg-popover text-popover-foreground shadow-lg">
          {loading && (
            <div className="px-2 py-1.5 text-[12px] text-muted-foreground">Carregando…</div>
          )}
          {failed && !loading && (
            <div className="px-2 py-1.5 text-[12px] text-destructive">
              Não foi possível buscar o estoque.
            </div>
          )}
          {!loading &&
            !failed &&
            results.map((p) => (
              <button
                key={`${p.branch}-${p.reference}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(p);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 border-b px-2 py-1.5 text-left text-[12px] last:border-0 hover:bg-accent"
              >
                <span className="num w-28 shrink-0 font-medium">{p.reference}</span>
                <span className="flex-1 truncate">{p.description}</span>
                <span className="max-w-24 shrink-0 truncate text-muted-foreground" title={p.branch}>
                  {p.branch.replace(/^NORMAQ\s+/, "")}
                </span>
                <span className="num shrink-0 text-muted-foreground">
                  est. {Number.isFinite(p.quantity) ? p.quantity : "—"}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
