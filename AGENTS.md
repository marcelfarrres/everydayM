<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Reglas de Arquitectura, Stack y Seguridad — EverydayMarcel (`everydayM`)

## 1. Stack Tecnológico
- **Framework**: Next.js 16 (App Router) con React 19.
- **Lenguaje**: TypeScript 5 (`strict: true`, prohibido el uso de `any` explícito).
- **Estilos**: Tailwind CSS v4 + iconografía con `lucide-react`.
- **Backend / Persistencia**: Supabase (`@supabase/supabase-js`) con PostgreSQL (`public.exercises`) y Supabase Storage (`workout-videos`).
- **Multimedia**: Reproductor encadenado HTML5 `<video>` y `<audio>` con soporte de Picture-in-Picture (PiP) y exportación mediante FFmpeg.

## 2. Arquitectura de Carpetas
Todo el código fuente debe respetar estrictamente la separación de responsabilidades:

- `app/` — Rutas del App Router de Next.js:
  - `app/page.tsx`: Vista pública principal (configurador de entrenamiento y orquestación del reproductor).
  - `app/admin/page.tsx`: Panel de administración (`/admin`) para ingesta de clips de vídeo y metadatos musculares.
  - `app/api/export-routine/route.ts`: Endpoint API para concatenación de clips mediante FFmpeg.
- `components/workout/` — Componentes de dominio de entrenamiento:
  - `MuscleSelector.tsx`: Mapa anatómico SVG interactivo (vista frontal y posterior) con estados tri-estado (`secondary`, `primary`, desactivado).
  - `WorkoutPlayer.tsx`: Reproductor HTML5 encadenado (intro, calentamiento, series, descanso con vista previa Picture-in-Picture del siguiente ejercicio y modo PiP nativo).
- `components/ui/` — Componentes de interfaz reutilizables y accesibles:
  - `DifficultyScale.tsx`: Selector de dificultad en escala del 1 al 10.
  - `NumberStepper.tsx`: Control numérico incremental accesible.
- `hooks/` — Lógica de estado y motores algorítmicos:
  - `useWorkoutRoutine.ts`: Motor algorítmico de puntuación ponderada, selección sin repetición inmediata, cálculo dinámico de descansos y cola de reproducción secuencial.
- `lib/` — Clientes externos y utilidades puras:
  - `supabase.ts`: Instancia única del cliente de Supabase.
  - `difficulty.ts`: Normalización de niveles de dificultad.
- `types/` — Contratos e interfaces de TypeScript (`Exercise`, `RoutineItem`, `MuscleSelection`, `WorkoutFilters`, etc.).
- `supabase/migrations/` — Migraciones SQL versionadas del esquema de base de datos.

## 3. Reglas de Seguridad (CRÍTICO)
1. **Cero Secretos Hardcodeados**: Ninguna URL de proyecto, API Key, JWT o credencial de Supabase debe escribirse directamente en el código fuente. Todo acceso debe realizarse exclusivamente mediante `process.env.NEXT_PUBLIC_SUPABASE_URL` y `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. **Protección de Entorno**: Los archivos `.env` y `.env*.local` están estrictamente bloqueados en `.gitignore`. Solo `.env.example` (con claves vacías) puede versionarse en Git.
3. ** Exclusión de Binarios Pesados**: Queda prohibido subir archivos `.mp4`, `.mov`, `.pem` o `.key` al repositorio Git; los activos multimedia se almacenan únicamente en el bucket `workout-videos` de Supabase Storage.
4. **Calidad antes de Commit**: Todo cambio debe superar `npm run lint` y `npm run build` sin errores antes de integrarse en las ramas `dev` o `main`.
