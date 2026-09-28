DROP POLICY IF EXISTS "Inicio panel reads stock" ON public.stock_items;
DROP POLICY IF EXISTS "Active users read stock" ON public.stock_items;
CREATE POLICY "Active users read stock" ON public.stock_items
FOR SELECT TO authenticated
USING (public.is_active_user(auth.uid()));