-- Migración idempotente: versión ligera y miniatura de cada ejercicio.
-- Ejecutar en Supabase -> SQL Editor.
--   video_lite_url: copia de 720 px de ancho que reproduce la app (video_url sigue siendo el original).
--   poster_url:     captura de la mitad del clip, para listas y pantallas sin vídeo.
-- Ambas guardan la URL completa (los archivos viven en Bunny, no en Supabase Storage).
-- Las políticas RLS de public.exercises (202611120001_harden_rls.sql) ya cubren las columnas nuevas.

BEGIN;

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS video_lite_url text NULL,
  ADD COLUMN IF NOT EXISTS poster_url text NULL;

COMMIT;
