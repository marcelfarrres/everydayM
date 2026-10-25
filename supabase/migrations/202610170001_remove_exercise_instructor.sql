BEGIN;

ALTER TABLE public.exercises
DROP COLUMN IF EXISTS instructor;

COMMIT;
