-- Migración idempotente: lista de música del reproductor (public.music_tracks).
-- Ejecutar en Supabase -> SQL Editor.
-- audio_url apunta a Bunny (nunca a servidores ajenos); source_url y license guardan de dónde
-- salió la pista y con qué licencia. enabled = false la saca de la lista sin borrarla.
-- RLS como en 202611120001_harden_rls.sql: lectura pública, escritura solo service_role.

BEGIN;

-- ============================================================================
-- 1. Tabla
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.music_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  artist text NULL,
  source_url text NULL,
  license text NULL,
  audio_url text NOT NULL,
  duration_seconds integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 2. Seguridad
-- ============================================================================

ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'music_tracks'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.music_tracks', pol.policyname);
  END LOOP;
END
$$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.music_tracks FROM anon, authenticated;
GRANT SELECT ON TABLE public.music_tracks TO anon, authenticated;
GRANT ALL ON TABLE public.music_tracks TO service_role;

CREATE POLICY "music_tracks_select_public"
  ON public.music_tracks
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "music_tracks_all_service_role"
  ON public.music_tracks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
