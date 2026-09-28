DROP FUNCTION IF EXISTS public.demand_ranking(timestamptz, timestamptz, uuid);
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
    AND (_from IS NULL OR d.created_at >= _from)
    AND (_to IS NULL OR d.created_at <= _to)
    AND (_user IS NULL OR d.user_id = _user)
    AND (_search IS NULL OR _search = '' OR d.reference ILIKE '%' || _search || '%' OR COALESCE(d.description,'') ILIKE '%' || _search || '%' OR COALESCE(s.description,'') ILIKE '%' || _search || '%')
  GROUP BY d.reference
  ORDER BY total_requests DESC, last_requested DESC
$$;
REVOKE ALL ON FUNCTION public.demand_ranking FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demand_ranking TO authenticated;