import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

type Part = { reference: string; description: string; quantity: number };

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

  useEffect(() => {
    const term = value.trim();
    if (!open || term.length < 2) {
      setResults([]);
      return;
    }
    const safe = term.replace(/[%,()]/g, " ");
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("stock_items")
        .select("reference, description, quantity")
        .or(`description.ilike.%${safe}%,reference.ilike.%${safe}%`)
        .order("description")
        .limit(12);
      setResults((data ?? []) as Part[]);
    }, 250);
    return () => clearTimeout(t);
  }, [value, open]);

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
      {open && results.length > 0 && (
        <div className="absolute left-0 z-30 mt-1 max-h-64 w-[420px] max-w-[80vw] overflow-auto rounded-md border bg-popover text-popover-foreground shadow-lg">
          {results.map((p) => (
            <button
              key={p.reference}
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
              <span className="num shrink-0 text-muted-foreground">est. {Number(p.quantity)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
