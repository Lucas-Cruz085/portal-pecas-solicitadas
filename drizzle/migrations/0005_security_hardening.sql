-- Hardening that keeps current screens working.
-- Does not delete users, roles, or admin accounts.

CREATE OR REPLACE FUNCTION public.must_change_password(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT needs_password_change FROM public.profiles WHERE id = _user_id), false)
$$;

CREATE OR REPLACE FUNCTION public.escape_like(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(replace(replace(COALESCE(value, ''), '\', '\\'), '%', '\%'), '_', '\_')
$$;

-- Password literals were removed from this file. Do not apply 0000-0005 to production.
-- The row, the role, and the password hash stay. Nobody is removed.
UPDATE public.profiles AS p
SET needs_password_change = true,
    updated_at = now()
FROM auth.users AS u
WHERE u.id = p.id
  AND false;

REVOKE UPDATE ON public.profiles FROM authenticated;
DROP POLICY IF EXISTS "Authenticated can read profiles" ON public.profiles;
CREATE POLICY "Read own profile or admin" ON public.profiles
FOR SELECT TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND (
    id = auth.uid()
    OR (
      public.has_role(auth.uid(), 'admin')
      AND NOT public.must_change_password(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Users can read roles" ON public.user_roles;
CREATE POLICY "Read own role or admin" ON public.user_roles
FOR SELECT TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND NOT public.must_change_password(auth.uid())
  AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);

DROP POLICY IF EXISTS "Users read own permissions" ON public.user_permissions;
CREATE POLICY "Users read own permissions" ON public.user_permissions
FOR SELECT TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND (
    user_id = auth.uid()
    OR (
      public.has_role(auth.uid(), 'admin')
      AND NOT public.must_change_password(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Own or admin read requests" ON public.demand_requests;
CREATE POLICY "Own or admin read requests" ON public.demand_requests
FOR SELECT TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND NOT public.must_change_password(auth.uid())
  AND public.has_panel_access(auth.uid(), 'relatorio')
  AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);

DROP POLICY IF EXISTS "Active users insert own requests" ON public.demand_requests;
CREATE POLICY "Active users insert own requests" ON public.demand_requests
FOR INSERT TO authenticated
WITH CHECK (
  public.is_active_user(auth.uid())
  AND NOT public.must_change_password(auth.uid())
  AND user_id = auth.uid()
  AND (
    (kind = 'manual'::public.request_kind AND public.has_panel_access(auth.uid(), 'solicitar'))
    OR (kind = 'estoque'::public.request_kind AND public.has_panel_access(auth.uid(), 'inicio'))
  )
);

DROP POLICY IF EXISTS "Own or admin update requests" ON public.demand_requests;
CREATE POLICY "Own or admin update requests" ON public.demand_requests
FOR UPDATE TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND NOT public.must_change_password(auth.uid())
  AND public.has_panel_access(auth.uid(), 'relatorio')
  AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
)
WITH CHECK (
  public.is_active_user(auth.uid())
  AND NOT public.must_change_password(auth.uid())
  AND public.has_panel_access(auth.uid(), 'relatorio')
  AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);

DROP POLICY IF EXISTS "Own or admin delete requests" ON public.demand_requests;
CREATE POLICY "Own or admin delete requests" ON public.demand_requests
FOR DELETE TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND NOT public.must_change_password(auth.uid())
  AND public.has_panel_access(auth.uid(), 'relatorio')
  AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);

REVOKE UPDATE ON public.demand_requests FROM authenticated;
GRANT UPDATE (quantity, customer_name, customer_contact, description, updated_at)
  ON public.demand_requests TO authenticated;

DROP POLICY IF EXISTS "Active users read stock" ON public.stock_items;
CREATE POLICY "Active users read stock" ON public.stock_items
FOR SELECT TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND NOT public.must_change_password(auth.uid())
);

DROP POLICY IF EXISTS "Active users read imports" ON public.stock_imports;
CREATE POLICY "Admins read imports" ON public.stock_imports
FOR SELECT TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND NOT public.must_change_password(auth.uid())
  AND public.has_role(auth.uid(), 'admin')
);

CREATE OR REPLACE FUNCTION public.latest_stock_import()
RETURNS TABLE (imported_at timestamptz, item_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.imported_at, s.item_count
  FROM public.stock_imports s
  WHERE public.is_active_user(auth.uid())
    AND NOT public.must_change_password(auth.uid())
  ORDER BY s.imported_at DESC
  LIMIT 1
$$;

DROP POLICY IF EXISTS "Admins read audit" ON public.audit_logs;
CREATE POLICY "Admins read audit" ON public.audit_logs
FOR SELECT TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND NOT public.must_change_password(auth.uid())
  AND public.has_role(auth.uid(), 'admin')
);
DROP POLICY IF EXISTS "Users insert own audit" ON public.audit_logs;
REVOKE INSERT ON public.audit_logs FROM authenticated;

CREATE OR REPLACE FUNCTION public.demand_ranking(
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _user uuid DEFAULT NULL,
  _search text DEFAULT NULL
)
RETURNS TABLE (
  reference text,
  description text,
  total_requests bigint,
  total_quantity bigint,
  last_requested timestamptz,
  current_stock numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.reference,
         COALESCE(MAX(NULLIF(d.description, '')), MAX(s.description), '') AS description,
         COUNT(*)::bigint AS total_requests,
         COALESCE(SUM(d.quantity), 0)::bigint AS total_quantity,
         MAX(d.created_at) AS last_requested,
         MAX(s.quantity) AS current_stock
  FROM public.demand_requests d
  LEFT JOIN public.stock_items s ON s.reference = d.reference
  WHERE public.is_active_user(auth.uid())
    AND NOT public.must_change_password(auth.uid())
    AND (
      public.has_panel_access(auth.uid(), 'inicio')
      OR public.has_panel_access(auth.uid(), 'relatorio')
      OR public.has_role(auth.uid(), 'admin')
    )
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_panel_access(auth.uid(), 'inicio')
      OR d.user_id = auth.uid()
    )
    AND (_user IS NULL OR d.user_id = _user)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR _user IS NULL
      OR _user = auth.uid()
    )
    AND (_from IS NULL OR d.created_at >= _from)
    AND (_to IS NULL OR d.created_at <= _to)
    AND (
      _search IS NULL
      OR btrim(_search) = ''
      OR (
        char_length(_search) <= 80
        AND (
          d.reference ILIKE '%' || public.escape_like(left(_search, 80)) || '%' ESCAPE '\'
          OR COALESCE(d.description, '') ILIKE '%' || public.escape_like(left(_search, 80)) || '%' ESCAPE '\'
          OR COALESCE(s.description, '') ILIKE '%' || public.escape_like(left(_search, 80)) || '%' ESCAPE '\'
        )
      )
    )
  GROUP BY d.reference
  ORDER BY total_requests DESC, last_requested DESC
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.is_active_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.has_panel_access(uuid, public.app_panel) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_panel_access(uuid, public.app_panel) TO authenticated;

REVOKE ALL ON FUNCTION public.must_change_password(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.must_change_password(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.escape_like(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.demand_ranking(timestamptz, timestamptz, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demand_ranking(timestamptz, timestamptz, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.latest_stock_import() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.latest_stock_import() TO authenticated;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_len CHECK (char_length(username) BETWEEN 3 AND 40) NOT VALID;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_full_name_len CHECK (char_length(full_name) BETWEEN 2 AND 120) NOT VALID;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_email_len CHECK (email IS NULL OR char_length(email) <= 255) NOT VALID;

ALTER TABLE public.demand_requests
  ADD CONSTRAINT demand_requests_reference_len CHECK (char_length(reference) BETWEEN 1 AND 60) NOT VALID;
ALTER TABLE public.demand_requests
  ADD CONSTRAINT demand_requests_description_len CHECK (description IS NULL OR char_length(description) <= 200) NOT VALID;
ALTER TABLE public.demand_requests
  ADD CONSTRAINT demand_requests_customer_name_len CHECK (customer_name IS NULL OR char_length(customer_name) <= 120) NOT VALID;
ALTER TABLE public.demand_requests
  ADD CONSTRAINT demand_requests_customer_contact_len CHECK (customer_contact IS NULL OR char_length(customer_contact) <= 120) NOT VALID;
ALTER TABLE public.demand_requests
  ADD CONSTRAINT demand_requests_quantity_range CHECK (quantity IS NULL OR (quantity >= 1 AND quantity <= 100000)) NOT VALID;

ALTER TABLE public.stock_items
  ADD CONSTRAINT stock_items_reference_len CHECK (char_length(reference) BETWEEN 1 AND 60) NOT VALID;
ALTER TABLE public.stock_items
  ADD CONSTRAINT stock_items_description_len CHECK (char_length(description) <= 200) NOT VALID;
ALTER TABLE public.stock_items
  ADD CONSTRAINT stock_items_quantity_range CHECK (quantity >= 0 AND quantity <= 1000000000) NOT VALID;

CREATE TABLE public.stock_import_staging (
  batch_id uuid NOT NULL,
  reference text NOT NULL,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, reference)
);
GRANT ALL ON public.stock_import_staging TO service_role;
ALTER TABLE public.stock_import_staging ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.commit_stock_import(_batch uuid, _file text, _by uuid)
RETURNS TABLE (id uuid, imported_at timestamptz, item_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
  imp_id uuid;
  imp_at timestamptz;
BEGIN
  SELECT count(*) INTO n FROM public.stock_import_staging WHERE batch_id = _batch;
  IF n = 0 THEN
    RAISE EXCEPTION 'empty import';
  END IF;

  INSERT INTO public.stock_items (reference, description, quantity, updated_at)
  SELECT reference, description, quantity, now()
  FROM public.stock_import_staging
  WHERE batch_id = _batch
  ON CONFLICT (reference) DO UPDATE
    SET description = EXCLUDED.description,
        quantity = EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.stock_imports (imported_by, file_name, item_count)
  VALUES (_by, left(COALESCE(_file, ''), 200), n)
  RETURNING stock_imports.id, stock_imports.imported_at INTO imp_id, imp_at;

  DELETE FROM public.stock_import_staging WHERE batch_id = _batch;
  RETURN QUERY SELECT imp_id, imp_at, n;
END $$;

REVOKE ALL ON FUNCTION public.commit_stock_import(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_stock_import(uuid, text, uuid) TO service_role;
