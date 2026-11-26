# Efectos de sonido (`lib/audio/sfx.ts`)

Sobre el `AudioContext` compartido (`lib/audio.ts`). Nunca bajan la música.

## Grabaciones reales y sintetizados
- **Grabaciones** (`public/sfx/<nombre>.mp3`, servidas por la propia app en `/sfx/`): `launch`, `slowMo`, `boost`, `land`, `separate`, `pam`, `banner`, `clack`, `ignite`, `drumRoll`, `drumHit`, `error`. Origen y licencias (dominio público / CC0): `public/sfx/CREDITS.md`.
- **Pantalla final (móvil)**: `drumRoll` es un redoble de caja real (bucle, 10,5 s sin repetirse; el crescendo es su intensidad, de 0,3 a 1) y `drumHit` el platillo que lo cierra. Sus recetas de reserva: ruido que tiembla 16–19 veces por segundo (el redoble) y un crash de ruido agudo sobre un golpe grave.
- **Sintetizados** (`sfxRecipes.ts`): `beep` y `beepFinal`. (`engineRumble` y los sonidos de la reparación, `hammer`, `ratchet` y `puff`, se quitaron: el golpe agudo del martillo se confundía con el 3-2-1 y no aportaban nada sobre la música; los mecánicos trabajan en silencio.)
- Cada grabación se descarga y decodifica una sola vez (`fetch` + `decodeAudioData`) y se guarda. Empiezan a cargar en el toque de «Empezar» (`unlockPlayerAudio` → `preloadSfx()`) y, si no, con el primer efecto.
- Si un archivo falta, no se puede decodificar o aún no ha llegado, suena su receta sintetizada, sin avisar.
- **Cambiar un sonido**: sustituir su mp3 por otro con el mismo nombre. Para añadir o quitar uno, su línea en `sfxSamples.ts`.

## Niveles (para ajustar de oído)
- Grabaciones: `gain` de cada una en `sfxSamples.ts`. Los archivos vienen normalizados a un nivel común (los 200 ms más fuertes a unos −16 dBFS RMS, picos ≤ −1 dBFS), así que `gain` es solo la mezcla: vuelo y separación 0,7–0,75 (se oyen claros, por debajo de la música), el golpe de los caballetes (`pam`) 0,55, clics de interfaz 0,28–0,4, y los tambores del final, que suenan solos, el redoble 0,6 y el platillo 0,8.
- Sintetizados: `gain` de cada receta en `sfxRecipes.ts`. Todos: `SFX_MASTER` (en `sfxRecipes.ts`).
- Música: por defecto al 0,4 (`DEFAULT_MUSIC_SETTINGS` en `mix.ts`, antes 0,8). La preferencia se guarda en `everydaym.music.v2`; la v1 se borra (conservando solo el silencio), así todos empiezan una vez al nuevo nivel. Los efectos van con el mismo volumen, así que la proporción efectos/música no cambia al moverlo.
- Nadie los ha escuchado aún.

Reglas puras probadas en `sfxRecipes.test.ts` y `sfxSamples.test.ts`.

## API
- `playSfx(name, { gain?, gesture? })`: un golpe. `gesture: true` solo si se llama dentro de un toque (puede despertar el contexto).
- `const stop = startSfxLoop(name, { intensity? })`: bucle; `stop()` lo apaga con fundido y `stop.setIntensity(0..1)` lo cambia en vivo.
  Sirve tal cual en un efecto: `useEffect(() => startSfxLoop('slowMo'), [])`.
- `stopAllSfx()`: silencio inmediato (al salir del reproductor).
- Antes del toque de «Empezar», en el servidor o sin Web Audio: todo es no-op.
- `sfxCue(at, play)` (`sfxCue.ts`): un sonido en la línea de tiempo de las animaciones (se pausa y se cancela como ellas). Los del cohete salen de `flightSounds` (`components/workout/rocketSounds.ts`).

## Volumen, silencio y vídeos hablados
- Siguen solos al volumen y al silencio de la música (menú «···»), sin cablear nada.
- No dependen de que la música suene: al llegar a la pantalla final del móvil la música se va en 1 s y se para (`getMusicEngine().setEnded(true)`; `false` la devuelve con «Repetir») sin tocar el volumen ni el silencio, así que el redoble y el platillo se oyen al volumen elegido (y callan si la música está silenciada).
- Mientras un vídeo hablado suena (cuando la música se agacha), los de **ambiente** callan (y no arrancan); los de **aviso** siguen.

## Cuándo llamar a cada uno
| Sonido | Tipo | Momento |
|---|---|---|
| `beep` | aviso | Al entrar en los segundos 3 y 2 restantes del ejercicio. |
| `beepFinal` | aviso | Al entrar en el último segundo (1). |
| `launch` | ambiente | Al instante en que el cohete sale disparado. |
| `slowMo` | bucle | Mientras el cohete sube despacio entre las nubes; pararlo al salir por arriba. |
| `separate` | ambiente | Cada vez que se suelta un tramo o los propulsores. |
| `boost` | ambiente | Al acelerar y salir por arriba de las nubes. |
| `land` | ambiente | Al volver y empezar a frenar (el derrape va primero; el golpe cae a los 0,24 s). |
| `banner` | ambiente | Al sacar los paneles de la barra del cohete (móvil) y otra vez al recogerlos. |
| `pam` | ambiente | En el fotograma en que el cohete toca el suelo al caer de los caballetes. |
| `clack` | ambiente | Cada vez que una pieza encaja al montar el cohete. |
| `ignite` | ambiente | En el toque de un cohete-botón, con `{ gesture: true }`. |
| `drumRoll` | bucle | Pantalla final (móvil): desde que la música se ha ido hasta el golpe final, creciendo; se para al instante con el golpe, al ocultarse la página y al salir. |
| `error` | ambiente | Creador (móvil): al saltar una broma («¿Tan poco tiempo tenemos?», «¿Tan poco hemos dormido hoy?»), dentro del toque, con `{ gesture: true }`. Grave y áspero (cuadrada y sierra hacia 120–150 Hz en la receta), para que no se confunda con el 3-2-1. Si la grabación aún no ha cargado (la primera vez, antes de cualquier cohete), suena la receta. |
| `drumHit` | ambiente | Pantalla final: cuando la última pieza encaja en el cohete (con movimiento reducido, al abrirse la pantalla). Las piezas de antes encajan con `pam` (la etapa que ya traía el cohete, con `clack`). |

## Notas
- Límite de 8 golpes a la vez (y por sonido, `maxVoices`); el más viejo se corta con un fundido de 30 ms. Bucles: 3.
- Una llamada repetida antes de `minGap` se ignora (dobles renders en desarrollo, dobles toques).
- Bus: aviso/ambiente → limitador suave → volumen general → salida. Los nodos se desconectan al terminar.
- Las grabaciones respetan lo mismo que las recetas: `vary` (tono y nivel), `maxVoices`, `minGap` y su categoría. `slowMo` es un bucle sin cortes de 4 s (`loop` en `sfxSamples.ts`, con 0,15 s de margen a cada lado del archivo). `drumRoll` dura más que el redoble más largo (unos 9 s), así que en la práctica no llega a repetirse.
