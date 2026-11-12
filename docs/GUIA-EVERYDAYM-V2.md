# Guía Completa de EverydayM v2 — Estudio Local, Motor IA y Suite TikTok 9:16

Esta guía documenta todos los cambios de arquitectura, seguridad y diseño implementados en **EverydayM v2**, así como el paso a paso para subir tus 40 vídeos `.MOV`, endurecer la seguridad en Supabase, activar la IA con Gemini y producir tanto la **rutina completa (20–40 min)** como el **resumen vertical de 14s en MP4** para TikTok.

---

## 1. Resumen de las 5 Fases Implementadas

| Fase | Módulo | Qué hace ahora |
|---|---|---|
| **Fase 1** | **EverydayM Studio (`/admin` local)** | Panel de ingesta protegido (devuelve `404` en Vercel/producción). Permite arrastrar lotes de vídeos `.MOV` de iPhone, los comprime localmente con FFmpeg a **H.264 1080p SDR (`CRF 24`, `faststart`, `< 50 MB`)**, extrae la duración real con `ffprobe` y los sube a Supabase con `SUPABASE_SERVICE_ROLE_KEY`. |
| **Fase 2** | **Slots Estándar + Fase "¡Prepárate!"** | Los clips de ejercicio **nunca se recortan ni se repiten en bucle**. Cada rutina define un slot estándar (p. ej. `50 s`). Si un clip dura `42 s`, los `8 s` restantes pasan automáticamente al descanso siguiente como fase **¡PREPÁRATE 3-2-1 ¡YA!!** con vista previa del siguiente ejercicio. |
| **Fase 3** | **Rediseño del Reproductor 9:16 + Escritorio** | En escritorio combina el escenario vertical 9:16 con un panel lateral en vivo: **anillo SVG de cuenta atrás** (con aviso en rojo y pitido en los últimos 3 s), **mini mapa muscular**, **línea de tiempo completa** de la rutina y cola *"A continuación"*. Incluye pantalla de **Resumen inicial animado** y pantalla **Final de rutina completada** (sin `alert()`). |
| **Fase 4** | **Generador de Rutinas por Texto o Voz con IA** | Describe tu entreno escribiendo o dictando por micrófono (ej. *"Full body con enfoque en brazos, 40 minutos"*). `/api/routine-intent` interpreta la frase con **Google Gemini** (o con el analizador local por palabras clave si no hay clave configurada) y el solver calcula automáticamente `rondas × ejercicios + descansos` para clavarse en los minutos pedidos. |
| **Fase 5** | **Suite Creador TikTok 9:16 + Resumen 14s MP4** | De una misma rutina obtienes **dos vídeos**: (1) **Modo Grabación 9:16 (`/?rec=1`)** sin botones ni cursor, con claqueta `3-2-1`, zonas seguras de TikTok y marca de agua `@everydaym` para grabar en OBS; y (2) **Resumen animado de 14 s** exportable directamente a `.mp4` (`1080×1920` a `30 fps`) desde EverydayM Studio, además de guardado/carga en `everydaym-routine.json`. |

---

## 2. Configuración de Variables de Entorno y Seguridad en Supabase

### 2.1. Variables en `.env.local` (Tu PC) vs Vercel (Producción)

Abre el archivo `.env.local` en la raíz del proyecto y asegúrate de tener configuradas estas claves (puedes ver la plantilla en [`.env.example`](file:///C:/Users/marce/fitness-app/.env.example)):

```env
# 1. Claves públicas de Supabase (en .env.local Y en Vercel)
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_publica

# 2. Exclusivo de EverydayM Studio en tu PC (SOLO en .env.local, NUNCA en Vercel)
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_secret_key
STUDIO_ENABLED=true

# 3. Clave de IA Gemini (en .env.local Y en Vercel, SIN el prefijo NEXT_PUBLIC_)
GEMINI_API_KEY=tu_api_key_de_google_ai_studio
```

> **Importante de seguridad:**
> - **Nunca** pongas `SUPABASE_SERVICE_ROLE_KEY` ni `STUDIO_ENABLED=true` en Vercel. Gracias a esto, en la web pública de Vercel tanto `/admin` como `/api/admin/*` y `/api/studio/render-summary` devuelven **`404 Not Found`**.
> - `GEMINI_API_KEY` solo se lee en el servidor (`app/api/routine-intent/route.ts`), nunca llega al navegador.

### 2.2. Aplicar la Migración de Seguridad RLS en Supabase (Paso único)

Para cerrar el acceso de escritura público y que solo tu **EverydayM Studio** (con `service_role`) pueda subir vídeos o crear/borrar ejercicios:

1. Entra en tu panel de [Supabase Dashboard](https://supabase.com/dashboard) y selecciona tu proyecto.
2. En el menú lateral izquierdo, abre **SQL Editor** → **New query**.
3. Abre el archivo [`supabase/migrations/202611120001_harden_rls.sql`](file:///C:/Users/marce/fitness-app/supabase/migrations/202611120001_harden_rls.sql), copia todo su contenido y pégalo en el editor SQL.
4. Pulsa **Run** (o `Ctrl + Enter`).
5. **Qué queda configurado:**
   - La tabla `public.exercises` permite `SELECT` público (para que la web genere rutinas), pero bloquea `INSERT`, `UPDATE` y `DELETE` salvo para `service_role`.
   - El bucket `workout-videos` permite reproducir vídeos públicamente, pero solo permite subir o borrar archivos desde `service_role`.

---

## 3. Cómo Subir y Comprimir tus 40 Vídeos `.MOV` en EverydayM Studio

Con la prueba real sobre tus clips `.MOV` de iPhone (HEVC HDR HLG `1920×1080` vertical), un archivo de **50,7 MB se reduce a ~7,8 MB** manteniendo `1080×1920`, convirtiendo HDR a SDR (`bt709`) para que los colores se vean perfectos en todos los navegadores y móviles, y dejando tus 40 vídeos en **~320 MB totales** (dentro del plan gratuito de Supabase).

### Opción A: Crear y usar el Acceso Directo en el Escritorio (`EverydayM Studio.lnk`)
1. Abre PowerShell en la carpeta del proyecto y ejecuta una sola vez:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\studio\install-shortcut.ps1
   ```
2. Verás un nuevo icono **"EverydayM Studio"** en tu Escritorio.
3. Al hacer doble clic en **EverydayM Studio**, el script [`EverydayM-Studio.ps1`](file:///C:/Users/marce/fitness-app/scripts/studio/EverydayM-Studio.ps1) arranca el servidor local con `STUDIO_ENABLED=true` y abre automáticamente `http://localhost:3000/admin`.

### Opción B: Desde la terminal
1. Con `STUDIO_ENABLED=true` en tu `.env.local`, ejecuta `npm run dev` y abre `http://localhost:3000/admin`.

### Flujo de subida por lotes (40 vídeos):
1. **Arrastra tus archivos `.MOV` o `.MP4`** al recuadro de **"1. Cola de Subida por Lotes"** (puedes arrastrarlos de 10 en 10 o los 40 de golpe).
2. Haz clic en cada archivo de la cola a la izquierda para rellenar sus metadatos a la derecha:
   - **Título del ejercicio:** (por defecto toma el nombre del archivo limpio).
   - **Tipo de Clip:**
     - `Rutina Principal (Entreno)`: ejercicios normales del circuito.
     - `Calentamiento`: clips suaves para el bloque inicial.
     - `Intro (Vídeo inicial)`: clip con tu saludo/logo (conserva el audio AAC).
     - `Relleno / fondo`: clip estético de fondo para las pantallas de Resumen y Final (`filler`).
   - **Escala de dificultad (1–10)** y **Equipamiento** (`ninguno`, `mancuernas`, `bandas`, `esterilla`).
   - **Mapa Muscular interactivo** (para clips de tipo *Entreno*):
     - **1 clic (Amarillo):** Músculo secundario.
     - **2 clics (Verde neón):** Músculo principal (obligatorio marcar al menos uno).
     - **3 clics:** Desmarcar.
3. Cuando todos los clips de la cola tengan sus metadatos listos, pulsa **"Comprimir y Subir Cola"**.
4. Verás el progreso en tiempo real por archivo:
   - `Comprimiendo` (FFmpeg convierte HDR→SDR y H.264 CRF 24) → muestra el ahorro de peso (`50,7 MB → 7,8 MB (-85%)`) y la duración exacta en segundos (`⏱ 44s`).
   - `Subiendo` → sube al bucket `workout-videos` e inserta en `public.exercises`.
   - `✅ Subido`.
5. **Si ya tenías vídeos antiguos con duración fija de 60s:** pulsa el botón superior **"Recalcular duraciones"** en `/admin` para que `ffprobe` lea la duración real de cada vídeo almacenado y actualice la base de datos automáticamente.

---

## 4. Cómo Funciona el Generador de Rutinas con IA (Texto y Voz)

### 4.1. Activar Google Gemini (Gratis)
1. Entra en [Google AI Studio](https://aistudio.google.com/apikey) con tu cuenta de Google y pulsa **Create API Key**.
2. Añade `GEMINI_API_KEY=AIza...` en tu `.env.local`.
3. En **Vercel** → tu proyecto → **Settings** → **Environment Variables**, añade `GEMINI_API_KEY` con el mismo valor para los entornos *Production*, *Preview* y *Development*.
4. Si en algún momento no hay conexión o se agota la cuota gratuita, la app cambia automáticamente al **Detector Inteligente por palabras clave** (`lib/intent/keywords.ts`) sin interrumpir al usuario.

### 4.2. Uso en la pantalla principal
1. Escribe lo que te apetece entrenar o pulsa **"Dictar por voz"** (usa el reconocimiento de voz nativo del navegador en español `es-ES`).
   - *Ejemplo:* `"Full body con enfoque en brazos, 40 minutos, intensidad alta"`.
2. Pulsa **"Interpretar rutina"**.
3. Verás las **tarjetas de parámetros detectados**, que puedes ajustar con un toque antes de empezar:
   - **Duración objetivo:** `15m`, `25m`, `30m`, `40m`, `45m`.
   - **Intensidad y Slot estándar:** nivel (`Nv.3` a `Nv.9`) y duración estándar de bloque (`40s`, `50s`, `60s`).
   - **Músculos objetivos:** toca cualquier chip para alternar entre principal (`1º` verde) y secundario (`2º` amarillo), quita con `×` o añade más con `+ Añadir`.
   - **Con / Sin calentamiento.**
4. Pulsa **"Comenzar Entrenamiento (XX min)"**.

---

## 5. Cómo Crear los 2 Vídeos de TikTok desde la Misma Rutina

Para una guía detallada de configuración de OBS Studio, consulta [`docs/OBS-TIKTOK-GUIDE.md`](file:///C:/Users/marce/fitness-app/docs/OBS-TIKTOK-GUIDE.md).

### Resumen rápido del flujo doble:
1. **Genera tu rutina** en la pantalla principal (por ejemplo, *"Full body con enfoque en brazos, 40 minutos"*).
2. En el reproductor, pulsa el botón **"TikTok 14s"** (icono de claqueta) para abrir la **EverydayM Creator Suite 9:16**:
   - **Paso 1 — Guarda la rutina en JSON (`Guardar JSON`):** descarga `everydaym-routine.json`. Así tienes garantizado que el resumen corto y la sesión larga usan exactamente los mismos ejercicios, rondas y tiempos.
   - **Paso 2 — Vídeo Corto (Resumen TikTok 14s en MP4):**
     - Previsualiza la animación vertical de 14 segundos en el reproductor interactivo (gancho + cortes rápidos de cada ejercicio + mapa muscular + cierre con CTA).
     - Si estás en **EverydayM Studio local** (`localhost:3000` con `STUDIO_ENABLED=true`), pulsa **"Exportar Resumen MP4"**. FFmpeg renderizará directamente un archivo `everydaym-tiktok-summary.mp4` a **`1080×1920` y `30 fps`** listo para subir a TikTok.
   - **Paso 3 — Vídeo Largo (Rutina Completa 20–40 min con OBS):**
     - Pulsa **"Abrir Modo Grabación 9:16 (Claqueta 3-2-1)"** (o entra con `/?rec=1`).
     - Dale a **Iniciar grabación** en OBS Studio y haz clic en **"Empezar Grabación (3-2-1)"**.
     - El escenario 9:16 reproduce toda la rutina limpia (sin botones, sin cursor, respetando las zonas seguras de TikTok y con música desactivada por defecto para que añadas audio tendencia en TikTok).
