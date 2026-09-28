import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Demanda de Peças — Portal da Concessionária" },
      { name: "description", content: "Registre peças procuradas sem estoque e acompanhe a demanda reprimida para decisões de compra." },
      { property: "og:title", content: "Demanda de Peças — Portal da Concessionária" },
      { property: "og:description", content: "Registre peças procuradas sem estoque e acompanhe a demanda reprimida." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/inicio" : "/auth", replace: true });
    });
  }, [navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando…</div>
  );
}
