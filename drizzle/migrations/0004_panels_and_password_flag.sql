ALTER TYPE public.app_panel ADD VALUE IF NOT EXISTS 'importar';
ALTER TYPE public.app_panel ADD VALUE IF NOT EXISTS 'usuarios';
ALTER TYPE public.app_panel ADD VALUE IF NOT EXISTS 'auditoria';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS needs_password_change boolean NOT NULL DEFAULT false;