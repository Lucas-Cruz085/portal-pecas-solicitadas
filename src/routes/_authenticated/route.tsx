import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("needs_password_change")
      .or(`id.eq.${data.user.id},user_id.eq.${data.user.id}`)
      .maybeSingle();
    if (profileError || !profile) {
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
