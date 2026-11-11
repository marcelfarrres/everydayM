-- Migración idempotente de endurecimiento de seguridad (RLS + Storage)
-- Ejecutar en Supabase -> SQL Editor.
-- Objetivo:
--   1. public.exercises: lectura pública (anon, authenticated), escritura exclusiva para service_role.
--   2. storage.objects (bucket 'workout-videos'): lectura pública, sin INSERT/UPDATE/DELETE para anon/authenticated.

BEGIN;

-- ============================================================================
-- 1. Tabla public.exercises
-- ============================================================================

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- Eliminar cualquier política previa en public.exercises (incluyendo políticas
-- creadas manualmente desde el Dashboard para anon/public de INSERT/UPDATE/DELETE)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'exercises'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.exercises', pol.policyname);
  END LOOP;
END
$$;

-- Garantizar privilegios mínimos a nivel de tabla
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.exercises FROM anon, authenticated;
GRANT SELECT ON TABLE public.exercises TO anon, authenticated;
GRANT ALL ON TABLE public.exercises TO service_role;

-- Política de solo lectura para clientes públicos y autenticados
DROP POLICY IF EXISTS "exercises_select_public" ON public.exercises;
CREATE POLICY "exercises_select_public"
  ON public.exercises
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Política explícita para service_role (además de BYPASSRLS)
DROP POLICY IF EXISTS "exercises_all_service_role" ON public.exercises;
CREATE POLICY "exercises_all_service_role"
  ON public.exercises
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. Bucket de Storage 'workout-videos'
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('workout-videos', 'workout-videos', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- Eliminar políticas previas asociadas al bucket 'workout-videos' o políticas
-- permisivas de escritura anónima en storage.objects
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        coalesce(qual, '') ILIKE '%workout-videos%'
        OR coalesce(with_check, '') ILIKE '%workout-videos%'
        OR policyname ILIKE '%workout-videos%'
        OR policyname ILIKE '%workout_videos%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END
$$;

-- Política única de lectura pública para los vídeos del bucket 'workout-videos'
DROP POLICY IF EXISTS "workout_videos_public_select" ON storage.objects;
CREATE POLICY "workout_videos_public_select"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'workout-videos');

-- Política de control total exclusiva para service_role en 'workout-videos'
DROP POLICY IF EXISTS "workout_videos_service_role_all" ON storage.objects;
CREATE POLICY "workout_videos_service_role_all"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'workout-videos')
  WITH CHECK (bucket_id = 'workout-videos');

COMMIT;
