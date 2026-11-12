# Guía de Grabación con OBS Studio y Exportación para TikTok (9:16 · 1080×1920)

Con **EverydayM v2** puedes producir **dos vídeos verticales 9:16** a partir de la misma rutina generada:
1. **El vídeo largo (20–40 min):** grabado con **OBS Studio** en el **Modo Creador 9:16 (`/?rec=1`)**, con todas las animaciones de React/Motion, cuenta atrás `3-2-1`, fase *¡Prepárate!* y zonas seguras de TikTok.
2. **El vídeo resumen (10–15 s):** renderizado directamente a **MP4 (`1080×1920` a `30 fps`)** desde **EverydayM Studio** (o reproducido a pantalla completa en 9:16).

---

## 1. Configurar OBS Studio en Formato Vertical 9:16 (Una sola vez)

1. Abre **OBS Studio** en tu PC.
2. Crea un perfil nuevo para TikTok: en el menú superior ve a **Perfil** → **Nuevo** → escribe `TikTok Vertical 1080x1920`.
3. Abre **Ajustes** (`Settings`) → **Vídeo**:
   - **Resolución de la base (lienzo):** escribe manualmente `1080x1920` (relación de aspecto `9:16`).
   - **Resolución de salida (escalada):** escribe `1080x1920`.
   - **Valores comunes de FPS:** `30` (o `60` si quieres máxima fluidez en las animaciones).
4. Ve a **Ajustes** → **Salida** → pestaña **Grabación**:
   - **Formato de grabación:** `mp4` (o `hybrid mp4` en OBS 30+).
   - **Codificador de vídeo:** `NVIDIA NVENC H.264` (o `x264` si no tienes GPU dedicada).
   - **Control de frecuencia:** `CRF` / `CQP` a `20` (o `CBR` a `12000 Kbps`).
5. Ve a **Ajustes** → **Audio**:
   - **Audio del escritorio:** Actívalo si quieres que se escuche el pitido `3-2-1` del reloj y tu vídeo de intro.
   - **Micrófono/Auxiliar:** Desactívalo (salvo que quieras narrar la rutina en vivo).

### Cómo añadir EverydayM como fuente en OBS (2 opciones):

#### Opción A (Recomendada): Fuente de "Navegador" (Browser Source) en OBS
1. En el panel **Fuentes** de OBS, pulsa **`+`** → **Navegador** (`Browser`).
2. Llámala `EverydayM 9:16`.
3. Configura estas propiedades:
   - **URL:** `http://localhost:3000/?rec=1&handle=@everydaym`
   - **Ancho:** `1080`
   - **Alto:** `1920`
   - Marca **"Controlar audio vía OBS"** y **"Actualizar el navegador cuando la escena se active"**.
4. Para interactuar con la página dentro de OBS (escribir tu rutina o pulsar el botón de claqueta), haz clic derecho sobre la fuente `EverydayM 9:16` → **Interactuar**.

#### Opción B: Captura de Ventana de Chrome / Edge en Pantalla Completa (`F11`)
1. Abre Chrome o Edge en `http://localhost:3000/?rec=1` (o pulsa el botón **"Modo Creador TikTok 9:16"** dentro de la app).
2. Pulsa **`F11`** para poner el navegador a pantalla completa.
3. En OBS, añade **Captura de ventana**, selecciona la ventana del navegador y recorta los laterales manteniendo `Alt` arrastrando los bordes hasta ajustarse al escenario central `9:16`.

---

## 2. Atajos de Teclado Invisibles durante la Grabación (`/?rec=1`)

Cuando estás en el **Modo Creador 9:16**, todos los botones de interfaz desaparecen y el cursor del ratón se oculta solo tras **2 segundos** sin moverlo. Puedes controlar toda la grabación sin que salga nada en pantalla usando el teclado:

| Tecla | Acción |
|---|---|
| **`Espacio`** | Pausar / Reanudar el entrenamiento o el temporizador |
| **`Flecha Derecha (→)`** | Saltar al siguiente ejercicio o descanso |
| **`Flecha Izquierda (←)`** | Volver al bloque anterior |
| **`M`** | Activar / Desactivar la música de fondo (por defecto está **OFF** en Modo Creador para que puedas poner música tendencia dentro de TikTok sin problemas de copyright) |
| **`G`** | Mostrar / Ocultar la **Guía de Zonas Seguras de TikTok** (top 12%, bottom 20%, derecha 16%) |
| **`Esc`** | Salir del Modo Creador 9:16 y volver a la vista normal |

---

## 3. Paso a Paso: Grabar la Rutina Completa (20–40 min) y el Resumen de 14s

### Paso 1: Generar y Guardar la Rutina
1. Abre EverydayM y genera tu rutina (por ejemplo con IA: *"Full body con enfoque en brazos, 40 minutos"*).
2. Pulsa el botón **"TikTok 14s"** en el reproductor y haz clic en **"Guardar JSON"**.
   - Se descargará `everydaym-routine.json`. Si quieres grabar la rutina larga más tarde, basta con pulsar **"Cargar Rutina JSON"** en la portada para recuperar exactamente la misma sesión.

### Paso 2: Exportar el Vídeo Resumen de 14s en MP4 (`1080×1920 · 30fps`)
1. Con **EverydayM Studio** abierto en tu PC (`STUDIO_ENABLED=true` en `http://localhost:3000`), abre el modal **"TikTok 14s"**.
2. Revisa la vista previa animada de 14 segundos (puedes activar la vista de **Zonas** para comprobar que ningún texto queda tapado por la interfaz de TikTok).
3. Pulsa **"Exportar Resumen MP4"**.
4. En unos segundos se descargará automáticamente `everydaym-tiktok-summary.mp4` codificado en H.264 `1080×1920` a `30 fps`.

### Paso 3: Grabar la Sesión Completa (20–40 min) con OBS
1. Pulsa **"Abrir Modo Grabación 9:16 (Claqueta 3-2-1)"**.
2. Verás la pantalla previa del Modo Creador:
   - Comprueba tu `@usuario` de marca de agua (ej. `@everydaym`).
   - Pulsa `G` si quieres verificar una última vez el encuadre con las zonas seguras de TikTok.
3. En **OBS Studio**, pulsa **"Iniciar grabación"**.
4. En EverydayM, haz clic en **"Empezar Grabación (3-2-1)"** y suelta el ratón:
   - Aparecerá la **claqueta de cuenta atrás `3 - 2 - 1 - ¡YA!`** (ideal para cortar el inicio exacto en tu editor o en TikTok Studio).
   - Al llegar a `0`, la rutina arranca automáticamente desde la Intro (`bloque 1`) sin botones ni cursor.
5. Cuando termine el último ejercicio, el reproductor se quedará fijo en la **pantalla final ("¡Objetivo Cumplido! · Guarda esta rutina")** sin botones de interfaz para que puedas detener la grabación en OBS con un cierre limpio.
