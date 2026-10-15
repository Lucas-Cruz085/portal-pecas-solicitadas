-- Run manually in the Supabase SQL editor. Not applied by the app migration.
UPDATE public.demand_requests
SET branch = CASE
  WHEN upper(btrim(branch)) LIKE 'NORMAQ %' THEN upper(btrim(regexp_replace(branch, '\\s+', ' ', 'g')))
  ELSE 'NORMAQ ' || upper(btrim(regexp_replace(branch, '\\s+', ' ', 'g')))
END
WHERE branch IS NOT NULL
  AND btrim(branch) <> '';
