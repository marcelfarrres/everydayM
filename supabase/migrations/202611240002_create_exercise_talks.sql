-- Migración idempotente: vídeos hablados de cada ejercicio (public.exercise_talks).
-- Ejecutar en Supabase -> SQL Editor.
-- Un ejercicio puede tener cero, uno o varios. Se borran con su ejercicio.
-- RLS como en 202611120001_harden_rls.sql: lectura pública, escritura solo service_role.

BEGIN;

-- ============================================================================
-- 1. Tabla
-- ============================================================================

-- El tipo SQL de public.exercises.id no aparece en ninguna migración del repo (la tabla se
-- creó desde el Dashboard; en TypeScript es un string, puede ser uuid, bigint o text).
-- Una clave ajena tiene que tener el mismo tipo que la columna a la que apunta, así que se lee
-- del catálogo (format_type da el nombre exacto, p. ej. 'uuid' o 'bigint') y se construye el
-- CREATE TABLE con format(). Si la tabla ya existe no se toca.
DO $$
DECLARE
  exercise_id_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
  INTO exercise_id_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.exercises'::regclass
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  IF exercise_id_type IS NULL THEN
    RAISE EXCEPTION 'No se encuentra la columna public.exercises.id.';
  END IF;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.exercise_talks (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       exercise_id %s NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
       video_url text NOT NULL,
       video_lite_url text NULL,
       poster_url text NULL,
       duration_seconds integer NOT NULL,
       note text NULL,
       created_at timestamptz DEFAULT now()
     )',
    exercise_id_type
  );
END
$$;

CREATE INDEX IF NOT EXISTS exercise_talks_exercise_id_idx
  ON public.exercise_talks (exercise_id);

-- ============================================================================
-- 2. Seguridad
-- ============================================================================

ALTER TABLE public.exercise_talks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'exercise_talks'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.exercise_talks', pol.policyname);
  END LOOP;
END
$$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.exercise_talks FROM anon, authenticated;
GRANT SELECT ON TABLE public.exercise_talks TO anon, authenticated;
GRANT ALL ON TABLE public.exercise_talks TO service_role;

CREATE POLICY "exercise_talks_select_public"
  ON public.exercise_talks
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "exercise_talks_all_service_role"
  ON public.exercise_talks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
