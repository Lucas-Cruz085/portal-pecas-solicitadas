import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RequestButton({ reference, description }: { reference: string; description?: string | null }) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-end">
      <Button
        size="sm"
        className="h-6 px-2 text-[11.5px]"
        title="Adicionar à solicitação"
        onClick={() => navigate({ to: "/solicitar", search: { reference, description: description ?? "" } })}
      >
        <Plus className="h-3.5 w-3.5" /> Solicitar
      </Button>
    </div>
  );
}
