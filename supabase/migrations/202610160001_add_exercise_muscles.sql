BEGIN;

ALTER TABLE public.exercises
ADD COLUMN IF NOT EXISTS muscles jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.exercises
SET muscles = CASE lower(coalesce(muscle, ''))
  WHEN 'pecho' THEN '[{"id":"pectorales","role":"primary"}]'::jsonb
  WHEN 'espalda' THEN '[{"id":"dorsales","role":"primary"}]'::jsonb
  WHEN 'piernas' THEN '[{"id":"cuadriceps","role":"primary"}]'::jsonb
  WHEN 'brazos' THEN '[{"id":"biceps","role":"primary"}]'::jsonb
  WHEN 'core' THEN '[{"id":"abdominales","role":"primary"}]'::jsonb
  ELSE muscles
END
WHERE muscles = '[]'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.exercises
    WHERE difficulty IS NOT NULL
      AND NOT CASE
        WHEN btrim(difficulty::text) ~ '^[0-9]+$'
          THEN btrim(difficulty::text)::integer BETWEEN 1 AND 10
        ELSE lower(btrim(difficulty::text)) IN (
          'principiante',
          'intermedio',
          'avanzado'
        )
      END
  ) THEN
    RAISE EXCEPTION
      'No se puede convertir difficulty: hay valores fuera del rango 1-10 o niveles desconocidos.';
  END IF;
END
$$;

ALTER TABLE public.exercises
  ALTER COLUMN difficulty DROP DEFAULT,
  ALTER COLUMN difficulty TYPE integer
  USING CASE lower(btrim(coalesce(difficulty::text, '')))
    WHEN '' THEN 5
    WHEN 'principiante' THEN 3
    WHEN 'intermedio' THEN 6
    WHEN 'avanzado' THEN 9
    ELSE btrim(difficulty::text)::integer
  END,
  ALTER COLUMN difficulty SET DEFAULT 5,
  ALTER COLUMN difficulty SET NOT NULL;

ALTER TABLE public.exercises
  DROP CONSTRAINT IF EXISTS exercises_difficulty_1_to_10;

ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_difficulty_1_to_10
  CHECK (difficulty BETWEEN 1 AND 10);

ALTER TABLE public.exercises
  DROP COLUMN IF EXISTS age_range,
  DROP COLUMN IF EXISTS goal;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exercises_muscles_is_array'
      AND conrelid = 'public.exercises'::regclass
  ) THEN
    ALTER TABLE public.exercises
    ADD CONSTRAINT exercises_muscles_is_array
    CHECK (jsonb_typeof(muscles) = 'array');
  END IF;
END
$$;

COMMIT;
