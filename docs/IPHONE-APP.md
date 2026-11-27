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
- La música pasa por Web Audio (`<audio>` → `GainNode` → altavoz) porque el iPhone ignora `audio.volume`. Mientras suena un vídeo hablado, la música baja al 25 % con rampas de 0,3 s y vuelve al acabar. Nuestro código solo la **baja**: nunca la pausa por un vídeo hablado.
- **El iPhone sí la pausa** (WebKit, también Chrome en iOS): cuando un `<video>` empieza a sonar, iOS pausa cualquier otro audio de la página que esté sonando, la música incluida (en WebKit, un «vídeo con sonido» no puede sonar a la vez que otro audio; volver a tocar la música no pausa el vídeo). Antes nadie la volvía a poner y por eso **la música se callaba en el primer vídeo hablado y no volvía**. Ahora hay un **vigía** (`lib/audio/watchdog.ts`, reglas puras con pruebas) que, mientras el entrenamiento va y no está en pausa, mira la música cuando empieza o acaba un vídeo hablado, cuando la música se pausa sin pedirlo, cuando el `AudioContext` pasa a `suspended`/`interrupted`, al volver a la pantalla y cada 2 s: si debería sonar y no suena, reanuda el contexto y la vuelve a poner (hasta 4 intentos, de 0,15 s a 1,8 s). Si el navegador no deja sin un toque, sale **Activar sonido** arriba a la izquierda (y cualquier toque en la pantalla la devuelve). También sube la música si se hubiera quedado baja sin voz.
- El `<video>` de los vídeos hablados solo se «ceba» (play + pausa) dentro de un toque de verdad. Cuando el creador del móvil empieza el entrenamiento solo (sin tocar **Empezar**), ya se cebó en el último toque y no se vuelve a hacer: un play fuera del toque no desbloquea nada y pausaba la música recién empezada.
- La voz va directa al altavoz. Con `?voicegraph=1` en la dirección (prueba) va por el mismo `AudioContext` que la música (`crossOrigin="anonymous"` y un `MediaElementAudioSourceNode`); así el fundido de la voz funciona también en iPhone, pero **no evita** que iOS pause la música (sigue siendo un vídeo con sonido) y, si el contexto se interrumpe, la voz también calla. Por eso no está puesta por defecto.
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
4. Llega un descanso largo con vídeo hablado → cuando se abren las nubes se oye la voz y la música **sigue sonando, más baja** (puede cortarse un instante, menos de medio segundo, mientras el vigía la vuelve a poner); al terminar, la música sube. Pruébalo también con el creador del móvil (el entrenamiento que empieza solo, sin **Empezar**).
5. Si en lugar de la voz aparece **Activar sonido**, tócalo → se oyen la voz y la música. (Que aparezca es el caso de reserva; anótalo.)
6. Pausa → música y vídeo se paran; reanuda → siguen.
7. Bloquea la pantalla 10 s y desbloquea → la música sigue sola (o con el primer toque).
8. «···» → **Salir** → silencio total.
9. Cierra y vuelve a abrir → el volumen y el silencio elegidos se mantienen.

**Panel de depuración del sonido (`?audiodebug=1`).** Abre la app con `?audiodebug=1` al final de la dirección (por ejemplo `https://…/?audiodebug=1`) y empieza un entrenamiento: arriba a la izquierda sale un recuadro pequeño de texto verde (no tapa los toques) con:

- `ctx`: el estado del `AudioContext` (`running`, `suspended`, `interrupted`), si la música va por Web Audio (`graph`) o directa, y su nivel (`gain`: 0,40 normal; 0,10 bajo la voz con el volumen por defecto).
- La música: `playing`/`PAUSED`, el segundo (`t`) y `rs` (`readyState`, 4 = cargada).
- `deseada` (debería sonar), `baja` (bajo la voz), `pausa`, `oculta`, `vigía` (intentos en curso) y `toque` (si está pidiendo «Activar sonido»).
- La voz: `direct` o `graph`, `playing`/`paused`, `MUDA` si sonó sin sonido.
- Los últimos 8 sucesos con la hora: la música (`playing`, `pause`, `pause (no pedida)`, `stalled`, `play() rechazado`), el contexto (`contexto → …`), la voz (`playing`, `pause`, `ended`, `error`), lo que hace el vigía (`intento 1 play() (voz empieza)`, `hace falta un toque`) y la prueba de CORS.

Sin el parámetro no se pinta nada ni se escucha nada de más. Si algo falla en el iPhone, una captura de pantalla de ese recuadro justo después del fallo dice qué ha pasado. Para probar la voz por Web Audio: `?audiodebug=1&voicegraph=1`.

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
