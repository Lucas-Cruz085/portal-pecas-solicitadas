import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active, needs_password_change")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile || !profile.is_active) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    if (profile.needs_password_change && location.pathname !== "/trocar-senha") {
      throw redirect({ to: "/trocar-senha" });
    }
    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
