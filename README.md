# EverydayMarcel (`everydayM`) — Algorithmic Workout Engine & Interactive SVG Anatomy Player

![Next.js](https://img.shields.io/badge/Next.js-16.3-black?logo=next.js)
![React](https://img.shields.io/badge/React-19.2-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss)
![Bunny](https://img.shields.io/badge/Bunny-Storage_%2B_CDN-ff7854)

**EverydayMarcel** es una aplicación web full-stack de entrenamiento físico diseñada para generar y reproducir rutinas de ejercicio dinámicas y personalizadas en tiempo real. Combina un **motor algorítmico de selección ponderada**, un **mapa anatómico SVG interactivo** de doble vista y un **reproductor HTML5 encadenado a pantalla completa** con música de fondo y vídeos hablados en los descansos.

---

## Aspectos Técnicos Destacados

### 1. Motor Algorítmico de Rutinas (`lib/routine/`, orquestado por `hooks/useWorkoutRoutine.ts`)
En lugar de listas estáticas, la aplicación construye cada sesión mediante un algoritmo de ensamblaje dinámico:
- **Priorización Muscular Multi-Rol**: Clasifica el catálogo de ejercicios en tres niveles de prioridad según la coincidencia con los músculos objetivos marcados como **principales (`primary`)** o **secundarios (`secondary`)**, alternando estratégicamente cada 4 ejercicios para equilibrar la fatiga localizada.
- **Muestreo Aleatorio Ponderado por Dificultad**: Calcula un *score* inversamente proporcional a la distancia entre la dificultad solicitada por el usuario (`1-10`) y la dificultad de cada ejercicio (`score = 1 + (10 - |diff_ejercicio - diff_objetivo|)`), aplicando una ruleta de selección ponderada sin repetición dentro del mismo bloque.
- **Cálculo Dinámico de Descansos**: Ajusta automáticamente la duración de los bloques de recuperación en función de la intensidad elegida, añadiendo tiempo extra en las transiciones de fin de ronda.
- **Máquina de Estados de Cola (`RoutineItem[]`)**: Ensambla el calentamiento opcional (`warmup`), los bloques de series (`workout`) con descansos cortos entre series y largos antes de cada bloque (`rest`, con 1 o 2 vídeos hablados que no se repiten en la rutina) y la pantalla final (`outro`). Sin intro: «Empezar» entra directo al calentamiento.

### 2. Mapa Anatómico SVG Interactivo (`components/workout/MuscleSelector.tsx`)
- **Doble Vista Vectorial (Frente / Espalda y Glúteos)**: Geometrías SVG personalizadas y accesibles por teclado (`role="button"`, `aria-pressed`) sin dependencias externas pesadas.
- **Selección Tri-Estado**: Cada región anatómica cicla entre **Sin marcar -> Participa (Secundario) -> Principal -> Quitar**, sincronizando los identificadores musculares específicos (`pectorales`, `dorsales`, `cuadriceps`, `isquiotibiales`, `gluteos`, etc.) tanto en el generador público como en el panel de catalogación `/admin`.

### 3. Reproductor Encadenado HTML5 (`components/workout/player/`)
- **Transiciones Sin Cortes**: Orquesta la reproducción secuencial de clips verticales (`9:16`) alojados en Bunny (Storage + CDN), en su versión ligera (720 px) con el original como reserva, sincronizando el temporizador con los eventos nativos `onTimeUpdate` y `onEnded` del elemento `<video>`.
- **Un solo widget**: En el móvil el vídeo ocupa la pantalla y la barra inferior lleva el hilo de la rutina por bloques, la lista desplegable y, en los descansos, el agua que sube hasta la siguiente serie. Al entrar en cada descanso, nubes y un cohete dibujado a línea.
- **Descansos largos con voz**: Antes de cada bloque suenan 1 o 2 vídeos hablados de sus ejercicios, con un mini vídeo de la primera serie en la barra.
- **Sonido (`lib/audio/`)**: Música de fondo en aleatorio desde el catálogo, con Web Audio (`GainNode`) para el volumen en iPhone, bajada automática mientras habla un vídeo y desbloqueo en el toque de «Empezar».

---

## Arquitectura del Proyecto

```text
├── app/
│   ├── admin/
│   │   └── page.tsx               # Estudio: subida de vídeos a Bunny y catálogo JSON
│   ├── api/
│   │   ├── admin/                 # Route Handlers del Estudio: ejercicios, vídeos hablados, música, sesión del PIN
│   │   ├── routine-intent/        # Frase → intención de rutina (Gemini)
│   │   └── studio/                # Cola de clips para TikTok (clips/*) e ideas de contenido (idea)
│   ├── dev-media/                 # Solo desarrollo: sirve .media/ cuando no hay Bunny
│   ├── preview/player/            # Solo desarrollo: el reproductor con ejercicios de prueba
│   ├── studio-login/              # PIN para abrir el Estudio desde el móvil
│   ├── globals.css                # Tema global y animaciones CSS (Tailwind v4)
│   ├── layout.tsx                 # Root Layout con tipografías Geist y metadatos
│   └── page.tsx                   # Vista principal: Configurador de rutina + Reproductor
├── components/
│   ├── studio/                    # Estudio: biblioteca, vídeos hablados, música y clips
│   ├── ui/
│   │   ├── DifficultyScale.tsx    # Selector accesible de dificultad (1-10)
│   │   └── NumberStepper.tsx      # Control incremental para series y bloques
│   └── workout/
│       ├── MuscleSelector.tsx     # Mapa anatómico SVG interactivo frontal y posterior
│       ├── RoutineComposer.tsx    # Pantalla de creación de la rutina
│       ├── CloudTransition.tsx    # Nubes y cohete al entrar en cada descanso
│       └── player/                # Reproductor: WorkoutPlayer, barra, hilo, lista, descansos, menú
├── hooks/
│   └── useWorkoutRoutine.ts       # Estado de la sesión: cola, reloj, pausa, anterior/siguiente
├── lib/
│   ├── routine/                   # Motor de rutinas (bloques, series, descansos, vídeos hablados) y sus pruebas
│   ├── intent/                    # Frase → intención (parser local y Gemini)
│   ├── data/exercises.ts          # fetchCatalog(): una sola descarga del catálogo (ejercicios y música)
│   ├── audio/                     # Música (Web Audio), bajada bajo la voz, vídeo hablado compartido, desbloqueo
│   ├── clips/                     # Tipos de clip, cola y frase → clip (compartido con el navegador)
│   ├── media.ts                   # URL de reproducción (versión ligera si existe, original como reserva)
│   ├── difficulty.ts              # Normalización de niveles de dificultad y retrocompatibilidad
│   └── server/                    # Solo servidor (Estudio): catalog.ts, mediaStore.ts, studioGate.ts, FFmpeg
│       └── clips/                 # Montaje de clips con FFmpeg y su cola en disco
├── scripts/                       # migrate-media.mjs (mudanza a Bunny), optimize-textures.mjs, studio/ (lanzador)
├── types/
│   ├── index.ts                   # Barrel de exportación de tipos
│   ├── catalog.ts                 # Catálogo: ejercicios con vídeos hablados y música
│   └── workout.ts                 # Interfaces TypeScript (Exercise, RoutineItem, MuscleSelection...)
├── .media/                        # (local, ignorada por Git) medios en desarrollo sin Bunny
└── .clips/                        # (local, ignorada por Git) clips montados, su cola y la caché de originales
```

---

## Instalación y Ejecución en Local

### 1. Requisitos Previos
- **Node.js** `>= 20.x` y `npm`
- `ffmpeg` y `ffprobe` (solo para el Estudio): se buscan en `FFMPEG_PATH` / `FFPROBE_PATH`, después en el PATH y, en Windows, en la instalación de winget (`winget install Gyan.FFmpeg`).
- Opcional: una zona de [Bunny Storage](https://bunny.net/) con su pull zone (ver `docs/MUDANZA-BUNNY.md`). Sin Bunny, en desarrollo los archivos se guardan en `.media/` y se sirven en `/dev-media`.

### 2. Clonar el Repositorio e Instalar Dependencias

```bash
git clone https://github.com/marcelfarrres/everydayM.git
cd everydayM
npm install
```

### 3. Configurar Variables de Entorno
Copia el archivo de plantilla `.env.example` a `.env.local` y rellena lo que necesites (cada variable está explicada en la plantilla):

```bash
cp .env.example .env.local
```

```env
# Pública: URL de la pull zone de Bunny (vacía en desarrollo = /dev-media)
NEXT_PUBLIC_MEDIA_BASE_URL=https://tu-zona.b-cdn.net

# Solo servidor (Estudio en tu ordenador; nunca en Vercel ni con prefijo NEXT_PUBLIC_)
STUDIO_ENABLED=true
BUNNY_STORAGE_ZONE=tu-zona
BUNNY_STORAGE_HOST=storage.bunnycdn.com
BUNNY_STORAGE_KEY=contraseña-de-la-zona
# Solo si abres el Estudio desde el móvil por la wifi:
STUDIO_LAN_PIN=
STUDIO_SESSION_SECRET=
```

### 4. Iniciar el Servidor de Desarrollo

```bash
npm run dev
```

- **Generador y Reproductor de Entrenamientos**: [http://localhost:3000](http://localhost:3000)
- **Panel de Administración (Subida de Clips)**: [http://localhost:3000/admin](http://localhost:3000/admin)

### 5. Verificación de Calidad y Compilación de Producción

```bash
npm run lint
npm run typecheck
npm run test      # pruebas unitarias (vitest)
npm run build
npm run start
```
