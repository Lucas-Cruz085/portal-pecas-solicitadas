-- Definicao real de public.demand_ranking em producao.
-- Nao desfaz demand_ranking_by_branch. Para remover so a funcao nova:
--   DROP FUNCTION IF EXISTS public.demand_ranking_by_branch(timestamp with time zone, timestamp with time zone, uuid, text);

CREATE OR REPLACE FUNCTION public.demand_ranking(_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _to timestamp with time zone DEFAULT NULL::timestamp with time zone, _user uuid DEFAULT NULL::uuid, _search text DEFAULT NULL::text)
 RETURNS TABLE(reference text, branch text, description text, total_requests bigint, total_quantity bigint, last_requested timestamp with time zone, current_stock numeric, requesters text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.reference,
         COALESCE(NULLIF(trim(d.branch), ''), '') AS branch,
         COALESCE(MAX(NULLIF(d.description, '')), MAX(s.description), MAX(s_all.description), '') AS description,
         COUNT(*)::bigint AS total_requests,
         COALESCE(SUM(d.quantity), 0)::bigint AS total_quantity,
         MAX(d.created_at) AS last_requested,
         COALESCE(MAX(s.quantity), MAX(s_all.quantity)) AS current_stock,
         string_agg(
           DISTINCT COALESCE(
             NULLIF(trim(COALESCE(p.display_name, '')), ''),
             NULLIF(trim(COALESCE(p.username, '')), ''),
             left(d.user_id::text, 8)
           ),
           ', '
         ) AS requesters
  FROM public.demand_requests d
  LEFT JOIN public.profiles p
    ON p.user_id = d.user_id OR p.id = d.user_id
  LEFT JOIN (
    SELECT si.reference,
           si.branch,
           MAX(si.description) AS description,
           SUM(si.quantity) AS quantity
    FROM public.stock_items si
    GROUP BY si.reference, si.branch
  ) s ON s.reference = d.reference
    AND NULLIF(trim(COALESCE(d.branch, '')), '') IS NOT NULL
    AND s.branch = trim(d.branch)
  LEFT JOIN (
    SELECT si.reference,
           MAX(si.description) AS description,
           SUM(si.quantity) AS quantity
    FROM public.stock_items si
    GROUP BY si.reference
  ) s_all ON s_all.reference = d.reference
    AND NULLIF(trim(COALESCE(d.branch, '')), '') IS NULL
  WHERE public.demanda_has_profile(auth.uid())
    AND (d.user_id = auth.uid() OR public.demanda_can_see_all(auth.uid()))
    AND (_user IS NULL OR _user = auth.uid() OR public.demanda_can_see_all(auth.uid()))
    AND (_user IS NULL OR d.user_id = _user)
    AND (_from IS NULL OR d.created_at >= _from)
    AND (_to IS NULL OR d.created_at <= _to)
    AND (
      _search IS NULL OR _search = ''
      OR d.reference ILIKE '%' || _search || '%'
      OR COALESCE(d.description, '') ILIKE '%' || _search || '%'
      OR COALESCE(d.branch, '') ILIKE '%' || _search || '%'
      OR COALESCE(s.description, '') ILIKE '%' || _search || '%'
      OR COALESCE(s_all.description, '') ILIKE '%' || _search || '%'
      OR COALESCE(p.display_name, '') ILIKE '%' || _search || '%'
      OR COALESCE(p.username, '') ILIKE '%' || _search || '%'
    )
  GROUP BY d.reference, COALESCE(NULLIF(trim(d.branch), ''), '')
  ORDER BY total_requests DESC, last_requested DESC;
$function$;

REVOKE ALL ON FUNCTION public.demand_ranking(timestamp with time zone, timestamp with time zone, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demand_ranking(timestamp with time zone, timestamp with time zone, uuid, text) TO authenticated;