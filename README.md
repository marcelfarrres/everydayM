# EverydayMarcel (`everydayM`) — Algorithmic Workout Engine & Interactive SVG Anatomy Player

![Next.js](https://img.shields.io/badge/Next.js-16.3-black?logo=next.js)
![React](https://img.shields.io/badge/React-19.2-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_%2B_Storage-3ecf8e?logo=supabase)

**EverydayMarcel** es una aplicación web full-stack de entrenamiento físico diseñada para generar y reproducir rutinas de ejercicio dinámicas y personalizadas en tiempo real. Combina un **motor algorítmico de selección ponderada**, un **mapa anatómico SVG interactivo** de doble vista y un **reproductor multimedia HTML5 encadenado con Picture-in-Picture (PiP)**.

---

## Aspectos Técnicos Destacados

### 1. Motor Algorítmico de Rutinas (`hooks/useWorkoutRoutine.ts`)
En lugar de listas estáticas, la aplicación construye cada sesión mediante un algoritmo de ensamblaje dinámico:
- **Priorización Muscular Multi-Rol**: Clasifica el catálogo de ejercicios en tres niveles de prioridad según la coincidencia con los músculos objetivos marcados como **principales (`primary`)** o **secundarios (`secondary`)**, alternando estratégicamente cada 4 ejercicios para equilibrar la fatiga localizada.
- **Muestreo Aleatorio Ponderado por Dificultad**: Calcula un *score* inversamente proporcional a la distancia entre la dificultad solicitada por el usuario (`1-10`) y la dificultad de cada ejercicio (`score = 1 + (10 - |diff_ejercicio - diff_objetivo|)`), aplicando una ruleta de selección ponderada sin repetición dentro del mismo bloque.
- **Cálculo Dinámico de Descansos**: Ajusta automáticamente la duración de los bloques de recuperación en función de la intensidad elegida, añadiendo tiempo extra en las transiciones de fin de ronda.
- **Máquina de Estados de Cola (`RoutineItem[]`)**: Ensambla secuencialmente clips de `intro`, bloques opcionales de `warmup` y el circuito multiciclo (`workout` + `rest`).

### 2. Mapa Anatómico SVG Interactivo (`components/workout/MuscleSelector.tsx`)
- **Doble Vista Vectorial (Frente / Espalda y Glúteos)**: Geometrías SVG personalizadas y accesibles por teclado (`role="button"`, `aria-pressed`) sin dependencias externas pesadas.
- **Selección Tri-Estado**: Cada región anatómica cicla entre **Sin marcar -> Participa (Secundario) -> Principal -> Quitar**, sincronizando los identificadores musculares específicos (`pectorales`, `dorsales`, `cuadriceps`, `isquiotibiales`, `gluteos`, etc.) tanto en el generador público como en el panel de catalogación `/admin`.

### 3. Reproducción Encadenada HTML5 y Picture-in-Picture (`components/workout/WorkoutPlayer.tsx`)
- **Transiciones Sin Cortes**: Orquesta la reproducción secuencial de clips verticales (`9:16`) alojados en Supabase Storage, sincronizando el temporizador con los eventos nativos `onTimeUpdate` y `onEnded` del elemento `<video>`.
- **Doble Experiencia Picture-in-Picture (PiP)**:
  - **In-App PiP durante descansos**: Muestra una tarjeta flotante con el vídeo en bucle del **siguiente ejercicio** mientras corre la cuenta atrás de recuperación, permitiendo al usuario anticipar la técnica.
  - **Web API Picture-in-Picture nativa**: Permite desacoplar el reproductor de vídeo en una ventana flotante del sistema operativo (`requestPictureInPicture`).
- **Canal de Audio Independiente**: Mezclador de música de fondo con múltiples pistas que se pausa automáticamente durante la secuencia de introducción y se reanuda en el entrenamiento.

---

## Arquitectura del Proyecto

```text
├── app/
│   ├── admin/
│   │   └── page.tsx               # Panel CMS para subida de vídeos a Supabase Storage y catalogación
│   ├── api/
│   │   └── export-routine/
│   │       └── route.ts           # Endpoint servidor para concatenación de vídeos vía FFmpeg
│   ├── globals.css                # Tema global y animaciones CSS (Tailwind v4)
│   ├── layout.tsx                 # Root Layout con tipografías Geist y metadatos
│   └── page.tsx                   # Vista principal: Configurador de rutina + Reproductor
├── components/
│   ├── ui/
│   │   ├── DifficultyScale.tsx    # Selector accesible de dificultad (1-10)
│   │   └── NumberStepper.tsx      # Control incremental para ejercicios y rondas
│   └── workout/
│       ├── MuscleSelector.tsx     # Mapa anatómico SVG interactivo frontal y posterior
│       └── WorkoutPlayer.tsx      # Reproductor HTML5 encadenado con soporte PiP y audio
├── hooks/
│   └── useWorkoutRoutine.ts       # Custom hook con el motor algorítmico y temporizador de sesión
├── lib/
│   ├── difficulty.ts              # Normalización de niveles de dificultad y retrocompatibilidad
│   └── supabase.ts                # Cliente tipado de Supabase (configurado vía variables de entorno)
├── supabase/
│   └── migrations/                # Migraciones SQL para la tabla public.exercises
└── types/
    ├── index.ts                   # Barrel de exportación de tipos
    └── workout.ts                 # Interfaces TypeScript (Exercise, RoutineItem, MuscleSelection...)
```

---

## Instalación y Ejecución en Local

### 1. Requisitos Previos
- **Node.js** `>= 20.x` y `npm`
- Un proyecto en [Supabase](https://supabase.com/) con:
  - Tabla `public.exercises` (puedes aplicar los scripts de `supabase/migrations/`).
  - Bucket público de Storage llamado `workout-videos`.

### 2. Clonar el Repositorio e Instalar Dependencias

```bash
git clone https://github.com/marcelfarrres/everydayM.git
cd everydayM
npm install
```

### 3. Configurar Variables de Entorno
Copia el archivo de plantilla `.env.example` a `.env.local` y rellena las credenciales públicas de tu proyecto de Supabase:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon-publica
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
npm run build
npm run start
```
