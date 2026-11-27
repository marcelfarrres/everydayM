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
- **Datos / Medios**: Sin base de datos. Los vídeos, versiones ligeras, miniaturas, música y el catálogo JSON (`catalog/catalog.json`: ejercicios, vídeos hablados y música) viven en Bunny (Storage + CDN). La app lee el catálogo por la CDN (`NEXT_PUBLIC_MEDIA_BASE_URL`); solo el Estudio local (`/admin`, en el ordenador de Marcel) escribe en Bunny Storage. En desarrollo sin Bunny, los archivos van a `.media/` (ignorada por Git) y se sirven en `/dev-media`.
- **Multimedia**: Reproductor encadenado HTML5 `<video>` (versión ligera, original como reserva) y música con Web Audio (`<audio>` + `GainNode`); compresión, miniaturas y montaje de clips con FFmpeg en el Estudio (FFmpeg se busca en `FFMPEG_PATH`/`FFPROBE_PATH`, el PATH o la instalación de winget).
- **Pruebas**: vitest (`npm run test`, archivos `lib/**/*.test.ts`).

## 2. Arquitectura de Carpetas
Todo el código fuente debe respetar estrictamente la separación de responsabilidades:

- `app/` — Rutas del App Router de Next.js:
  - `app/page.tsx`: Vista pública principal (configurador de entrenamiento y orquestación del reproductor).
  - `app/admin/page.tsx`: Estudio (`/admin`, en el ordenador o por la wifi de casa, siempre con PIN): biblioteca de ejercicios, vídeos hablados, descansos y música.
  - `app/studio-login/`: Pantalla del PIN del Estudio (se pide siempre, también en el ordenador).
  - `app/dev-media/`: Solo desarrollo: sirve los archivos de `.media/` cuando no hay Bunny.
  - `app/api/`: Route Handlers. `admin/*` (ingesta y gestión del catálogo y la sesión del PIN, solo Estudio), `routine-intent` (frase → intención de rutina con Gemini), `studio/clips/*` (cola de clips para TikTok: crear, ver, aprobar, rechazar, regenerar y descargar, vía `lib/server/clips/`) y `studio/idea` (ideas y descripciones para TikTok). Toda ruta del Estudio llama primero a `guardStudioApi`.
  - `app/api/admin/`: `exercises/` (listar; `[id]/`: editar y borrar; `[id]/talks/`: sus vídeos hablados), `talks/[talkId]/` (borrar un vídeo hablado), `ingest/` (subir ejercicios), `music/` (listar y subir; `[id]/`: editar y borrar), `recalculate-durations/` (recalcula las duraciones de ejercicios, hablados y descansos) y `session/` (entrar y salir con el PIN; la única sin `guardStudioApi`).
  - `app/api/admin/rests/`: Vídeos de descanso: listar y subir con progreso NDJSON (`route.ts`); renombrar, activar/desactivar y borrar con sus archivos (`[id]/route.ts`).
- `components/studio/` — Piezas del Estudio: `LibraryView.tsx`, `TalksView.tsx`, `MusicView.tsx` (música: estilo de cada pista y filtro por estilo), `ClipsView.tsx` y `ClipsQueue.tsx` (clips), `ClipForm.tsx`, `StudioDialog.tsx`, `StudioUi.tsx` y `studioClient.ts` (llamadas a `/api/admin/*`).
  - `RestsView.tsx`: Sección «Descansos»: vídeos de Marcel descansando, sin voz (`rests` del catálogo, archivos en `rests/`), que la app pone en bucle y en silencio en los descansos largos.
- `components/workout/` — Componentes de dominio de entrenamiento:
  - `MuscleSelector.tsx`: Mapa anatómico SVG interactivo (vista frontal y posterior) con estados tri-estado (`secondary`, `primary`, desactivado).
  - `RoutineComposer.tsx`: Pantalla de creación (frase → preguntas → rutina lista, con el hilo por bloques), con `MinutesSlider.tsx` (duración), `MarcelFigure.tsx` (figura de Marcel), `CreatorRocket.tsx` (el cohete del creador, móvil) y `CreatorJoke.tsx` (las bromas del móvil: «¿Tan poco tiempo tenemos?», con menos de 25 min, y «¿Tan poco hemos dormido hoy?», solo con intensidad suave, con la pantalla congelada unos 2 s).
  - Primera pantalla del creador (móvil): `LaunchBase.tsx` (la base de cohetes: en reposo, el título «O elige una rutina hecha» con el «Random» redondo y un panel con la rueda de selección de cinco cohetes, su franja central, el contador y las dos garras; los astronautas; las torres, la escalera y la pasarela solo salen cuando hacen falta: al escribir y al despegar con la torre de lanzamiento), `launchDrum.ts` (la rueda: sitios de los cinco, inercia y parada exacta, giro de entrada, ruleta, garras; medidas de la base y tiempos del despegue, funciones puras), `padCrew.ts` (los astronautas: saltos de cohete en cohete y flotar mientras gira la rueda, pasarela, escalera y embarque, funciones puras), `PadRocket.tsx` (el cohete nuevo en SVG, con sus partes por separado; lo usan la barra y la rueda), `padRocketShape.ts` (sus medidas, el ajuste de las etiquetas y la barra de escribir) y `Porthole.tsx` (el ojo de buey con el vídeo). Las piezas del fondo «Amanecer» (paleta, torre de celosía, coches, siluetas lejanas, farolas) están en `dawnScene.tsx`, compartidas con el montaje.
  - Preguntas y final automático del creador (móvil): `AssemblyScene.tsx` (las preguntas a la izquierda y, a la derecha, el cohete de la rutina montándose de pie bajo la grúa, de arriba abajo: punta con el foco, minutos, bloques y motor con la intensidad; camión con elevador, mecánicos, cielo que se hace de día y el despegue), `AssemblyRocket.tsx` (sus piezas, con las de `RocketParts.tsx`, y `LoosePiece`: las respuestas son las piezas sueltas, que viajan ellas mismas al cohete), `PortholePerson.tsx` (el muñeco del ojo de buey que se va vistiendo; luego, vídeos de Marcel), `assembly.ts` (qué pieza va cuándo, cielo, medidas y tiempos, funciones puras con pruebas), `LaunchFinale.tsx` (la frase en el cielo y el humo; sin «Cambiar») y `whiteVeil.ts` (la pantalla blanca de «A ponerse como un cohete» que se funde con el reproductor).
  - Un solo dibujo para todos los cohetes: `rocketPaths.ts` (las piezas como trazados, funciones puras: tobera, aletas, anillo, franja roja y damero, remaches, punta en ojiva, ventanilla, antena, propulsores y llama) y `RocketParts.tsx` (esas piezas pintadas; las usan `PadRocket.tsx`, `RocketShip.tsx` y el cohete de las nubes del ordenador, `Rocket.tsx`); `textMeasure.ts` (medida real de los textos escritos en los cohetes).
  - El cohete del móvil: `RocketShip.tsx` (el dibujo por tramos: nombre de cada bloque y barras de sus series), `rocketShape.ts` (geometría, medidas de la barra, nombres de los tramos tan grandes como caben: `stageLabels`), `rocketStack.ts` (etapas que quedan), `rocketFlight.ts` (vuelos, nubes y tiempos, funciones puras), `rocketSounds.ts` (sus sonidos), `rocketHandoff.ts` (relevo del creador al reproductor), `separation.ts` (poses de la separación en las nubes y la salida de las aletas de la nueva cola), `cloudClock.ts` (el reloj único de las nubes) y `endRocket.ts` (el cohete de la pantalla final).
  - `player/`: Reproductor por piezas. `WorkoutPlayer.tsx` (orquestación), `Stage.tsx` (vídeo a pantalla completa) con `TalkReel.tsx` (vídeos hablados en descansos largos), `PlayerWidget.tsx` (barra inferior del ordenador: `ExerciseBar`, `RestBar`, `Hilo`, `SeriesList`), `RocketWidget.tsx` (barra del móvil: el cohete con sus paneles; `panelRise.ts` y `miniHandoff.ts`, la ventanita del siguiente ejercicio), `RepairCrew.tsx`, `Separation.tsx` y `Mechanic.tsx` (los mecánicos de los descansos y de la separación), `RestClock.tsx` (contador del descanso, móvil), `RestCues.tsx` («Descansando…» y el 3-2-1, móvil), `CheerHits.tsx` y `CheerBurst.tsx` (golpes de ánimo), `PlayerMenu.tsx` («···», con la elección del estilo de música), `RestFrame.tsx`, `RestCountdown.tsx` (velo y cuenta atrás gigante de los descansos), `DesktopBackdrop.tsx` (fondo de pizarra y bombilla, ordenador), `EndScreen.tsx` (final del ordenador), `PhoneEndScreen.tsx` (final del móvil: redoble, ejercicios tachados y el cohete montado; su línea de tiempo, medidas y vuelo en `endSequence.ts`, `endLayout.ts` y `endFlight.ts`, y el cohete en `components/workout/endRocket.ts`), `model.ts` (funciones puras), `hooks.ts` y `ui.ts` (clases comunes).
  - `TiktokExport.tsx`: Textos para TikTok (lo usa `app/Home.tsx`).
  - `CloudTransition.tsx` y `Rocket.tsx`: Transición de nubes y cohete al entrar en cada descanso.
  - `ChalkBoard.tsx`: Pizarra del reproductor en ordenador.
- `components/ui/` — Componentes de interfaz reutilizables y accesibles:
  - `DifficultyScale.tsx`: Selector de dificultad en escala del 1 al 10.
  - `NumberStepper.tsx`: Control numérico incremental accesible.
- `hooks/` — Lógica de estado:
  - `useWorkoutRoutine.ts`: Estado de la sesión (cola, reloj, pausa, anterior/siguiente); delega la construcción de la rutina en `lib/routine/`.
- `lib/` — Clientes externos y utilidades puras:
  - `routine/`: Motor de rutinas (`buildRoutine`: puntuación ponderada, bloques y series, descansos cortos y largos con vídeos hablados, historial reciente en `localStorage`), con pruebas en vitest. Por piezas: `select.ts`, `variation.ts`, `blocks.ts`, `duration.ts` (duraciones y tiempos de las nubes), `talks.ts`, `restClips.ts` (vídeo de descanso de cada descanso largo), `solveForMinutes.ts`, `timeline.ts`, `cheers.ts`, `history.ts` e `index.ts`.
  - `intent/`: Frase → intención de rutina (parser local de palabras clave y Gemini), `creatorJoke.ts` (qué broma salta en el creador: una por rutina, solo en el móvil) y `standIn.ts` (el clip del catálogo que sale en el ojo de buey para cada sugerencia).
  - `data/exercises.ts`: Lectura del catálogo JSON por la CDN: `fetchCatalog()` hace una sola descarga compartida (ejercicios, música y vídeos de descanso); `fetchExercises()`, `fetchMusic()` y `fetchRests()` leen de ella.
  - `audio/`: Sonido del reproductor: `music.ts` (motor de música con Web Audio), `mix.ts` (niveles, bajada bajo la voz, lista de pistas por estilo y estilo recordado; funciones puras), `talkVideo.ts` (el único `<video>` de los vídeos hablados), `unlock.ts` (desbloqueo en el toque de «Empezar»), `useMusic.ts` y los efectos: `sfx.ts` (los reproduce), `sfxSamples.ts` (grabaciones de `public/sfx/`), `sfxRecipes.ts` (recetas sintetizadas y reglas puras), `sfxCue.ts` (un sonido en la línea de tiempo de las animaciones) y `SFX.md`. El `AudioContext` compartido está en `lib/audio.ts`.
  - `clips/`: Lo de los clips que comparten navegador y servidor: registro de tipos (`types.ts`), forma de la cola (`queue.ts`), frase → clip por palabras clave (`intent.ts`) y plan de la música (`musicBed.ts`).
  - `media.ts`: URL de reproducción de cada vídeo (versión ligera si existe) y paso al original si la ligera falla.
  - `difficulty.ts`: Normalización de niveles de dificultad.
  - `musicStyles.ts`: Los cuatro estilos de música (`techno-house`, `anos-80`, `regueton`, `comercial`) y sus nombres; una sola lista para el Estudio y el reproductor.
  - `server/` — Solo servidor (`server-only`), lo usa el Estudio:
    - `catalog.ts`: Lectura y escritura del catálogo (`catalog/catalog.json`) por la API de Storage, con copias en `catalog/backups/` y un único escritor a la vez.
    - `mediaStore.ts`: Almacén de archivos: Bunny Storage, o `.media/` en desarrollo. Cada petición a Bunny pasa por `fetchRetry.mjs` (hasta 4 intentos ante fallos de red y 429/502/503/504; también lo usa `scripts/migrate-media.mjs`).
    - `mediaPipeline.ts`, `ffmpeg.ts`, `studioUpload.ts`: Compresión, versión ligera, miniaturas y subida. `ffmpegBin.mjs` dice dónde están `ffmpeg` y `ffprobe` (también lo usa `scripts/migrate-media.mjs`).
    - `studioGate.ts`: Acceso al Estudio: siempre PIN (`STUDIO_LAN_PIN`) y cookie firmada con `STUDIO_SESSION_SECRET`, también desde localhost; sin ellos el Estudio no abre. Bloqueo global tras 5 PIN fallidos.
    - `clips/`: Generador de clips para TikTok: recetas por tipo (`recipes.ts`), partes (`parts/`), montaje y sonido con FFmpeg (`render.ts`, `run.ts`, `audio.ts`) y la cola en disco (`queue.ts`).
    - `contentIdeas.ts`: Ideas y descripciones para TikTok.
- `types/` — Contratos e interfaces de TypeScript (`Exercise`, `RoutineItem`, `MuscleSelection`, `WorkoutFilters`, `Catalog`, etc.).
- `scripts/` — Utilidades de una vez (`migrate-media.mjs`: mudanza de Supabase a Bunny; `optimize-textures.mjs`: nubes) y el lanzador del Estudio (`scripts/studio/`).
- Carpetas locales ignoradas por Git: `.media/` (medios y catálogo en desarrollo sin Bunny, servidos en `/dev-media`) y `.clips/` (clips montados, su manifiesto, cómo se hizo cada uno y la caché de originales descargados).

## 3. Reglas de Seguridad (CRÍTICO)
1. **Cero Secretos Hardcodeados**: Ninguna URL de almacenamiento, API Key, contraseña de Storage, JWT, secreto o credencial (Bunny, Gemini, Estudio) debe escribirse directamente en el código fuente. Todo acceso debe realizarse exclusivamente mediante variables de entorno: `process.env.NEXT_PUBLIC_MEDIA_BASE_URL` es la única pública; `process.env.BUNNY_STORAGE_KEY` y `process.env.STUDIO_SESSION_SECRET` son solo de servidor y nunca pueden llevar el prefijo `NEXT_PUBLIC_` (igual que el resto de claves del servidor).
2. **Protección de Entorno**: Los archivos `.env` y `.env*.local` están estrictamente bloqueados en `.gitignore`. Solo `.env.example` (con claves vacías) puede versionarse en Git.
3. **Exclusión de Binarios Pesados**: Queda prohibido subir archivos `.mov`, `.pem` o `.key` al repositorio Git. Los `.mp4` solo se permiten dentro de `public/` (vídeos propios de la app, ligeros: menos de 10 MB cada uno); los clips de ejercicios se almacenan únicamente en la zona de Bunny Storage (servida por `NEXT_PUBLIC_MEDIA_BASE_URL`; en desarrollo sin Bunny, en `.media/`, ignorada por Git).
4. **Calidad antes de Commit**: Todo cambio debe superar `npm run lint`, `npm run typecheck` y `npm run build` sin errores antes de integrarse en las ramas `dev` o `main`.

## 4. Flujo de Trabajo Git Obligatorio
1. **Producción Intocable (`main`)**: La rama `main` es **PRODUCCIÓN INTOCABLE**. Tienes estrictamente prohibido hacer commits directos o push directos a `main`.
2. **Rama Base (`dev`)**: La rama base de trabajo e integración continua es `dev`.
3. **Ciclo de Desarrollo por Funcionalidad/Fix**: Cada vez que el usuario pida una nueva funcionalidad o arreglo, tu primer paso automático debe ser:
   - Situarte en `dev` (`git checkout dev`).
   - Crear una rama descriptiva (`feat/nombre-feature` o `fix/nombre-bug`).
   - Desarrollar y verificar los cambios en dicha rama (`npm run lint`, `npm run typecheck`, `npm run build`).
   - Al terminar, fusionarla de vuelta en `dev` (`git checkout dev && git merge <rama>`) y hacer push a `origin dev` (`git push origin dev`).
4. **Lanzamiento a Producción (SemVer)**: Solo cuando el usuario diga explícitamente *"prepara una nueva versión para producción (main)"*, incrementarás la versión en `package.json` (`npm run release:patch`, `npm run release:minor` o `npm run release:major`), crearás el tag semántico (`vX.Y.Z`) y prepararás el paso de `dev` a `main`.
