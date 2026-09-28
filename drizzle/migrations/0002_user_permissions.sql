CREATE TYPE public.app_panel AS ENUM ('inicio', 'solicitar', 'relatorio');

CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  panel public.app_panel NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, panel)
);
GRANT SELECT ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own permissions" ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.has_panel_access(_user_id uuid, _panel public.app_panel)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
    OR COALESCE((SELECT allowed FROM public.user_permissions WHERE user_id = _user_id AND panel = _panel), false)
$$;

-- Seed default permissions for the initial admin (harmless; admin bypasses anyway)
INSERT INTO public.user_permissions (user_id, panel, allowed)
SELECT p.id, panel, true FROM public.profiles p CROSS JOIN (VALUES ('inicio'::public.app_panel), ('solicitar'), ('relatorio')) AS v(panel)
ON CONFLICT (user_id, panel) DO NOTHING;

-- Tighten demand_requests policies to require the matching panel
DROP POLICY IF EXISTS "Own or admin read requests" ON public.demand_requests;
CREATE POLICY "Own or admin read requests" ON public.demand_requests FOR SELECT TO authenticated
  USING (public.is_active_user(auth.uid()) AND public.has_panel_access(auth.uid(), 'relatorio')
         AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS "Active users insert own requests" ON public.demand_requests;
CREATE POLICY "Active users insert own requests" ON public.demand_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_active_user(auth.uid()) AND user_id = auth.uid()
    AND ((kind = 'manual'::public.request_kind AND public.has_panel_access(auth.uid(), 'solicitar'))
      OR (kind = 'estoque'::public.request_kind AND public.has_panel_access(auth.uid(), 'inicio'))));
DROP POLICY IF EXISTS "Own or admin update requests" ON public.demand_requests;
CREATE POLICY "Own or admin update requests" ON public.demand_requests FOR UPDATE TO authenticated
  USING (public.is_active_user(auth.uid()) AND public.has_panel_access(auth.uid(), 'relatorio')
         AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS "Own or admin delete requests" ON public.demand_requests;
CREATE POLICY "Own or admin delete requests" ON public.demand_requests FOR DELETE TO authenticated
  USING (public.is_active_user(auth.uid()) AND public.has_panel_access(auth.uid(), 'relatorio')
         AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));

-- Stock reads require the Inicio panel
DROP POLICY IF EXISTS "Active users read stock" ON public.stock_items;
CREATE POLICY "Inicio panel reads stock" ON public.stock_items FOR SELECT TO authenticated
  USING (public.is_active_user(auth.uid()) AND (public.has_panel_access(auth.uid(), 'inicio') OR public.has_role(auth.uid(), 'admin')));

-- demand_ranking requires the caller's panel (inicio or relatorio both use it)
CREATE OR REPLACE FUNCTION public.demand_ranking(_from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _user uuid DEFAULT NULL, _search text DEFAULT NULL)
RETURNS TABLE (reference text, description text, total_requests bigint, total_quantity bigint, last_requested timestamptz, current_stock numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.reference,
         COALESCE(MAX(NULLIF(d.description,'')), MAX(s.description), '') AS description,
         COUNT(*)::bigint AS total_requests,
         COALESCE(SUM(d.quantity),0)::bigint AS total_quantity,
         MAX(d.created_at) AS last_requested,
         MAX(s.quantity) AS current_stock
  FROM public.demand_requests d
  LEFT JOIN public.stock_items s ON s.reference = d.reference
  WHERE public.is_active_user(auth.uid())
    AND (public.has_panel_access(auth.uid(), 'inicio') OR public.has_panel_access(auth.uid(), 'relatorio') OR public.has_role(auth.uid(), 'admin'))
    AND (_user IS NULL OR _user = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    AND (_from IS NULL OR d.created_at >= _from)
    AND (_to IS NULL OR d.created_at <= _to)
    AND (_user IS NULL OR d.user_id = _user)
    AND (_search IS NULL OR _search = '' OR d.reference ILIKE '%' || _search || '%' OR COALESCE(d.description,'') ILIKE '%' || _search || '%' OR COALESCE(s.description,'') ILIKE '%' || _search || '%')
  GROUP BY d.reference
  ORDER BY total_requests DESC, last_requested DESC
$$;