# App de iPhone (Everyday M)

## Cómo está hecha

- La app es una carcasa nativa de iPhone, hecha con Capacitor, que abre la web.
  - Todo lo que cambies en la web (fotos, textos, diseño, rutinas, vídeos) llega a la app al momento, sin pasar por la App Store.
  - Solo hace falta publicar una versión nueva de la app si cambias algo nativo: el icono, el nombre o los plugins.
- Lo nativo que añade la app:
  - La pantalla no se apaga mientras entrenas.
  - El móvil vibra en los últimos 3 segundos de cada bloque.
  - Arranca con el icono y la pantalla de inicio propios.
  - Si no hay conexión, enseña una página de «Sin conexión».
- Archivos:
  - `capacitor.config.ts`: nombre, identificador y dirección de la web.
  - `ios/`: el proyecto de Xcode.
  - `mobile/www/`: la página de «Sin conexión».

## Quién ve qué

| Dónde | Qué se ve |
|---|---|
| Web pública y app de iPhone | Solo la rutina. No aparecen el botón de Estudio ni TikTok. `/admin` y las API del Estudio responden 404. |
| Tu ordenador, con `STUDIO_ENABLED=true` en `.env.local` | Además: Estudio, subir vídeos y TikTok, después de poner el PIN. |
| Tu móvil en la WiFi de casa | El Estudio, después de poner el PIN. |

En Vercel nunca se configuran `STUDIO_ENABLED`, `BUNNY_STORAGE_KEY` ni `STUDIO_SESSION_SECRET`. Sin esas variables, el código del Estudio está en GitHub pero no funciona.

## Sonido: música y vídeos hablados

Cómo funciona (código en `lib/audio/`):

- Al tocar **Empezar** se desbloquea todo lo que luego sonará, en el mismo toque (`unlockPlayerAudio`): se despierta el `AudioContext` compartido, arranca la música y se «ceba» el único `<video>` que reproduce todos los vídeos hablados (luego solo cambia su `src`). Un `<video>` nuevo con sonido sería rechazado en Safari del iPhone.
- La música pasa por Web Audio (`<audio>` → `GainNode` → altavoz) porque el iPhone ignora `audio.volume`. Mientras suena un vídeo hablado, la música baja al 25 % con rampas de 0,3 s y vuelve al acabar.
- Si el servidor de los archivos (Bunny) no envía cabeceras CORS, Web Audio no puede leerlos: la app lo detecta y toca la música directamente. Suena, pero **en iPhone el volumen y la bajada durante los vídeos hablados dejan de funcionar**. Por eso hay que activar CORS en la pull zone (ver `docs/MUDANZA-BUNNY.md`).
- Con la pantalla bloqueada o la app en segundo plano, la música se para; al volver, sigue sola.
- Silenciar y volumen están en «···» y se recuerdan en el dispositivo (`localStorage`).

Configuración de la app (comprobado en `node_modules/@capacitor/ios`, Capacitor 8.6):

- Capacitor ya crea el WebView con `allowsInlineMediaPlayback = true` (los vídeos no saltan a pantalla completa) y `mediaTypesRequiringUserActionForPlayback = []` (en la app, el audio y el vídeo con sonido pueden empezar sin toque). **No hace falta cambiar `capacitor.config.ts` ni el proyecto de Xcode, ni recompilar la app** por este cambio: llega con la web.
- No se ha añadido el modo de fondo `audio` (`UIBackgroundModes` en `Info.plist`): la música no sigue con la pantalla bloqueada, a propósito (el entrenamiento también se para). Si algún día se quiere, hay que añadirlo en Xcode (Signing & Capabilities → Background Modes → Audio) y publicar una versión nueva.
- El interruptor de silencio del iPhone: mientras suena la música o un vídeo hablado, el sistema usa la categoría de «reproducción» y se oye aunque el interruptor esté en silencio. El pitido de los últimos 3 s, si la música está silenciada, sí respeta el interruptor (como antes).

Lo que solo se puede comprobar en un iPhone de verdad (Safari y la app):

1. Crea una rutina y toca **Empezar** → la música suena en menos de 1 s.
2. «···» → mueve **Volumen** → cambia el volumen (si no cambia, faltan las cabeceras CORS en Bunny).
3. «···» → **Música** apagada → se calla en 0,3 s. Encendida → vuelve.
4. Llega un descanso largo con vídeo hablado → cuando se abren las nubes se oye la voz y la música baja; al terminar, la música sube.
5. Si en lugar de la voz aparece **Activar sonido**, tócalo → se oyen la voz y la música. (Que aparezca es el caso de reserva; anótalo.)
6. Pausa → música y vídeo se paran; reanuda → siguen.
7. Bloquea la pantalla 10 s y desbloquea → la música sigue sola (o con el primer toque).
8. «···» → **Salir** → silencio total.
9. Cierra y vuelve a abrir → el volumen y el silencio elegidos se mantienen.

## Probarla ya en tu iPhone (gratis, sin App Store)

1. Conecta el iPhone al Mac por cable.
2. Activa el **Modo desarrollador** en el iPhone: Ajustes → Privacidad y seguridad → Modo desarrollador.
3. En el Mac, ejecuta `npx cap open ios`. Se abre Xcode.
4. En Xcode, ve a App → Signing & Capabilities → Team y elige tu Apple ID («Personal Team»).
5. Elige tu iPhone arriba y pulsa ▶.

Con una cuenta gratuita, la app caduca a los 7 días; para volver a tenerla, pulsa ▶ otra vez. Mientras `CAP_SERVER_URL` no esté configurada, la app abre el ordenador de casa (`http://192.168.1.37:3000`), así que el Mac tiene que estar encendido y en la misma WiFi.

## Publicarla en la App Store

1. **Publica la web en internet** (Vercel) con su dirección `https://…`. La app necesita funcionar fuera de tu WiFi, también para el revisor de Apple.
2. **Hazte desarrollador de Apple:** Apple Developer Program, 99 €/año, en developer.apple.com. La aprobación tarda entre unas horas y un par de días.
3. **Apunta la app a la web pública:**
   ```bash
   CAP_SERVER_URL=https://tu-dominio npx cap sync ios
   npx cap open ios
   ```
4. **Identificador:** el de ahora es `com.everydaym.app`. Si está cogido, cámbialo en `capacitor.config.ts` y en Xcode (pestaña General → Bundle Identifier).
5. **Ficha en App Store Connect:**
   - Nombre, descripción, categoría «Salud y forma física».
   - Capturas del iPhone grande; se sacan del simulador con ⌘S.
   - URL de política de privacidad (obligatoria).
   - El cuestionario de privacidad: la app no recoge datos personales.
6. **Sube la app:** en Xcode, Product → Archive → Distribute App → App Store Connect.
7. **Pruébala con TestFlight** en tu iPhone y en el de Pablo antes de mandarla a revisión.
8. **Mándala a revisión.** Suele tardar 1–2 días.

### Riesgo de rechazo y qué hacemos para evitarlo

Apple rechaza las apps que son «solo una web metida en una app» (norma 4.2, funcionalidad mínima). Para reducir ese riesgo:

- La app ya hace cosas que una web no hace bien: no apaga la pantalla, vibra en la cuenta atrás y aguanta sin conexión.
- Si aun así la rechazan, lo siguiente sería añadir:
  - Un recordatorio diario con notificación local («Tu rutina de hoy te espera»).
  - Guardar el historial de rutinas hechas.

### Actualizaciones

| Qué cambias | Qué hay que hacer |
|---|---|
| Diseño, textos, fotos, vídeos, rutinas | Publicar la web (push a la rama de producción). La app lo enseña al abrirla. |
| Icono, nombre, permisos, plugins nativos | Nueva versión: Archive → subir → revisión. |
