import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { getMe, recordSessionEvent } from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";

export function useMe() {
  const fetchMe = useServerFn(getMe);
  return useQuery({
    queryKey: ["me"],
    queryFn: () => fetchMe(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const record = useServerFn(recordSessionEvent);
  return async () => {
    try {
      await record({ data: { event: "logout" } });
    } catch {
      // Leave even if the audit write fails.
    }
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}
