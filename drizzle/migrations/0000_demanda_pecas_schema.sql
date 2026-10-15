CREATE TYPE public.app_role AS ENUM ('admin', 'consultor');
CREATE TYPE public.request_kind AS ENUM ('estoque', 'manual');

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), false)
$$;

CREATE POLICY "Authenticated can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

-- Stock items
CREATE TABLE public.stock_items (
  reference text PRIMARY KEY,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active users read stock" ON public.stock_items FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE INDEX stock_items_description_idx ON public.stock_items (description);

-- Stock imports history
CREATE TABLE public.stock_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by uuid NOT NULL,
  file_name text,
  item_count integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_imports TO authenticated;
GRANT ALL ON public.stock_imports TO service_role;
ALTER TABLE public.stock_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active users read imports" ON public.stock_imports FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));

-- Demand requests
CREATE TABLE public.demand_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.request_kind NOT NULL,
  reference text NOT NULL,
  description text,
  quantity integer,
  customer_name text,
  customer_contact text,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_requests TO authenticated;
GRANT ALL ON public.demand_requests TO service_role;
ALTER TABLE public.demand_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or admin read requests" ON public.demand_requests FOR SELECT TO authenticated
  USING (public.is_active_user(auth.uid()) AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "Active users insert own requests" ON public.demand_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_active_user(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Own or admin update requests" ON public.demand_requests FOR UPDATE TO authenticated
  USING (public.is_active_user(auth.uid()) AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "Own or admin delete requests" ON public.demand_requests FOR DELETE TO authenticated
  USING (public.is_active_user(auth.uid()) AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));
CREATE INDEX demand_requests_reference_idx ON public.demand_requests (reference);
CREATE INDEX demand_requests_created_idx ON public.demand_requests (created_at DESC);

-- Audit logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  username text NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE INDEX audit_logs_created_idx ON public.audit_logs (created_at DESC);

-- Ranking view helper (security invoker: respects caller RLS)
CREATE OR REPLACE FUNCTION public.demand_ranking(_from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _user uuid DEFAULT NULL)
RETURNS TABLE (reference text, description text, total_requests bigint, total_quantity bigint, last_requested timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT d.reference,
         COALESCE(MAX(NULLIF(d.description,'')), MAX(s.description), '') AS description,
         COUNT(*)::bigint AS total_requests,
         COALESCE(SUM(d.quantity),0)::bigint AS total_quantity,
         MAX(d.created_at) AS last_requested
  FROM public.demand_requests d
  LEFT JOIN public.stock_items s ON s.reference = d.reference
  WHERE (_from IS NULL OR d.created_at >= _from)
    AND (_to IS NULL OR d.created_at <= _to)
    AND (_user IS NULL OR d.user_id = _user)
  GROUP BY d.reference
  ORDER BY total_requests DESC, last_requested DESC
$$;
GRANT EXECUTE ON FUNCTION public.demand_ranking TO authenticated;

-- Initial admin user. Password is not stored in this repository.
DO $$
DECLARE uid uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', 'lucas.cruz@demanda.local',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"lucas.cruz","full_name":"Lucas Cruz"}'::jsonb,
    now(), now(), '', '', '', '', false);
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid, uid::text, 'email', jsonb_build_object('sub', uid::text, 'email', 'lucas.cruz@demanda.local', 'email_verified', true), now(), now(), now());
  INSERT INTO public.profiles (id, username, full_name, email) VALUES (uid, 'lucas.cruz', 'Lucas Cruz', NULL);
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'admin');
END $$;