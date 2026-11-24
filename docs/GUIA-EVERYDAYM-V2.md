# Guía Completa de EverydayM v2 — Estudio Local, Motor IA y Suite TikTok 9:16

Esta guía documenta todos los cambios de arquitectura, seguridad y diseño implementados en **EverydayM v2**, así como el paso a paso para subir tus 40 vídeos `.MOV`, activar la IA con Gemini y producir tanto la **rutina completa (20–40 min)** como el **resumen vertical de 14s en MP4** para TikTok.

---

## 1. Resumen de las 5 Fases Implementadas

| Fase | Módulo | Qué hace ahora |
|---|---|---|
| **Fase 1** | **EverydayM Studio (`/admin` local)** | Panel de ingesta protegido (devuelve `404` en Vercel/producción). Permite arrastrar lotes de vídeos `.MOV` de iPhone, los comprime localmente con FFmpeg a **H.264 1080p SDR (`CRF 24`, `faststart`, `< 50 MB`)**, extrae la duración real con `ffprobe` y los sube a Supabase con `SUPABASE_SERVICE_ROLE_KEY`. |
| **Fase 2** | **Slots Estándar + Fase "¡Prepárate!"** | Los clips de ejercicio **nunca se recortan ni se repiten en bucle**. Cada rutina define un slot estándar (p. ej. `50 s`). Si un clip dura `42 s`, los `8 s` restantes pasan automáticamente al descanso siguiente como fase **¡PREPÁRATE 3-2-1 ¡YA!!** con vista previa del siguiente ejercicio. |
| **Fase 3** | **Rediseño del Reproductor 9:16 + Escritorio** | En escritorio combina el escenario vertical 9:16 con un panel lateral en vivo: **anillo SVG de cuenta atrás** (con aviso en rojo y pitido en los últimos 3 s), **mini mapa muscular**, **línea de tiempo completa** de la rutina y cola *"A continuación"*. Incluye pantalla de **Resumen inicial animado** y pantalla **Final de rutina completada** (sin `alert()`). |
| **Fase 4** | **Generador de Rutinas por Texto o Voz con IA** | Describe tu entreno escribiendo o dictando por micrófono (ej. *"Full body con enfoque en brazos, 40 minutos"*). `/api/routine-intent` interpreta la frase con **Google Gemini** (o con el analizador local por palabras clave si no hay clave configurada) y el solver calcula automáticamente `rondas × ejercicios + descansos` para clavarse en los minutos pedidos. |
| **Fase 5** | **Vídeo para TikTok** | Desde el reproductor (menú «···»): **Resumen de 15 s** o **Rutina completa** en MP4 `1080×1920` a `30 fps`, renderizados con FFmpeg en el ordenador del Estudio. |

---

## 2. Configuración de Variables de Entorno

> Desde noviembre de 2026 la app ya no usa Supabase: los vídeos, la música y el catálogo (`catalog/catalog.json`) viven en Bunny. La mudanza está explicada en [`docs/MUDANZA-BUNNY.md`](MUDANZA-BUNNY.md).

### 2.1. Variables en `.env.local` (Tu PC) vs Vercel (Producción)

Abre el archivo `.env.local` en la raíz del proyecto y asegúrate de tener configuradas estas claves (puedes ver la plantilla en [`.env.example`](file:///C:/Users/marce/fitness-app/.env.example)):

```env
# 1. Pública: URL de la pull zone de Bunny (en .env.local Y en Vercel)
NEXT_PUBLIC_MEDIA_BASE_URL=https://tu-zona.b-cdn.net

# 2. Exclusivo de EverydayM Studio en tu PC (SOLO en .env.local, NUNCA en Vercel)
STUDIO_ENABLED=true
BUNNY_STORAGE_ZONE=tu-zona
BUNNY_STORAGE_HOST=storage.bunnycdn.com
BUNNY_STORAGE_KEY=contraseña_de_la_zona_de_storage
# Opcional: PIN (mín. 6 caracteres) para abrir el Studio desde el móvil en la misma WiFi
STUDIO_LAN_PIN=tu_pin_seguro_123
# Obligatorio si usas el PIN: secreto que firma la sesión (mín. 32 caracteres). Genéralo con:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
STUDIO_SESSION_SECRET=

# 3. Clave de IA Gemini (en .env.local Y en Vercel, SIN el prefijo NEXT_PUBLIC_)
GEMINI_API_KEY=tu_api_key_de_google_ai_studio
```

> **Importante de seguridad:**
> - **Nunca** pongas `BUNNY_STORAGE_KEY`, `STUDIO_SESSION_SECRET` ni `STUDIO_ENABLED=true` en Vercel, ni con el prefijo `NEXT_PUBLIC_`. Gracias a esto, en la web pública de Vercel tanto `/admin` como `/api/admin/*` y `/api/studio/tiktok` devuelven **`404 Not Found`**.
> - Sin `STUDIO_SESSION_SECRET` (o si es más corto de 32 caracteres) el acceso con PIN desde el móvil no funciona y la pantalla del PIN explica cómo generarlo; desde `localhost` el Estudio se abre igual.
> - `GEMINI_API_KEY` solo se lee en el servidor (`app/api/routine-intent/route.ts`), nunca llega al navegador.

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

### Opción C: Subir vídeos nuevos directamente desde el móvil (misma WiFi)
1. Añade `STUDIO_LAN_PIN=tu_pin_min_6_caracteres` y `STUDIO_SESSION_SECRET` (mín. 32 caracteres, ver §2.1) a tu `.env.local` (nunca en Vercel).
2. Abre **EverydayM Studio** en tu PC (icono del escritorio o `powershell -ExecutionPolicy Bypass -File .\scripts\studio\EverydayM-Studio.ps1`).
   - Al detectar el PIN, el lanzador escucha en la red local (`-H 0.0.0.0`) e imprime en amarillo la dirección exacta, por ejemplo `http://192.168.1.25:3000/admin`.
   - Si Windows pregunta por el Firewall la primera vez, permite Node.js **solo en Redes privadas**.
3. Abre esa dirección en el navegador de tu iPhone o Android (conectado al mismo WiFi), introduce tu PIN en `/studio-login` y selecciona los vídeos directamente de tu galería. Tu PC los recibirá, los comprimirá con FFmpeg y los subirá a Bunny.

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

## 5. Cómo Crear los Vídeos de TikTok

Los vídeos se crean en el ordenador del Estudio (`STUDIO_ENABLED=true`, FFmpeg instalado). Funciona también desde el móvil por la WiFi de casa.

1. Crea la rutina y pulsa **Empezar**.
2. En el reproductor, abre el menú **«···» → Vídeo para TikTok**.
3. Elige:
   - **Resumen · 15 s**: Marcel, el plan y un vistazo a cada ejercicio. Tarda unos 10 s.
   - **Rutina completa**: entera, con carteles de fase, cuenta atrás, barra de progreso y descansos con vista previa. Tarda unos 10 s por minuto de rutina.
4. Cuando termine, mira la vista previa y pulsa **Descargar MP4** (1080×1920, 30 fps, sin música: añade el sonido en TikTok).

Cómo funciona: el FFmpeg de Homebrew no trae `drawtext`, así que los textos se dibujan como imágenes (SVG → PNG con `sharp`) y FFmpeg solo las superpone a los clips (`lib/server/tiktokExport.ts`, ruta `app/api/studio/tiktok`).
