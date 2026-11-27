# Efectos de sonido (`lib/audio/sfx.ts`)

Sobre el `AudioContext` compartido (`lib/audio.ts`). Nunca bajan la música.

## Grabaciones reales y sintetizados
- **Grabaciones** (`public/sfx/<nombre>.mp3`, servidas por la propia app en `/sfx/`): `launch`, `slowMo`, `boost`, `land`, `separate`, `pam`, `banner`, `clack`, `ignite`, `drumRoll`, `drumHit`, `error`, y los de la base de cohetes de la primera pantalla (`drumClick`, `metalStep`, `ladderStep`, `buttonThunk`, `towerDock`). Origen y licencias (dominio público / CC0): `public/sfx/CREDITS.md`.
- **Pantalla final (móvil)**: `drumRoll` es un redoble de caja real (bucle, 10,5 s sin repetirse; el crescendo es su intensidad, de 0,3 a 1) y `drumHit` el platillo que lo cierra. Sus recetas de reserva: ruido que tiembla 16–19 veces por segundo (el redoble) y un crash de ruido agudo sobre un golpe grave.
- **Base de cohetes (móvil)**: grabaciones de Kenney (CC0), elegidas midiendo (nadie las ha escuchado): ruidosas, de graves a medios, sin un tono limpio en la zona del 3-2-1 (880–1320 Hz). `drumClick` es un clic de 27 ms que no resuena; `metalStep` una pisada sorda con un roce de chapa; `ladderStep` un golpe hueco de lata, más agudo, para que subir no suene como andar; `buttonThunk` un golpe grave de chapa (0,25 s) y `towerDock` uno más pesado (0,45 s). Sus recetas siguen de reserva.
- **Sintetizados** (`sfxRecipes.ts`): `beep` y `beepFinal`; y los del creador sin grabación: `engineStart`, `hookGrab`, `truckRoll`, `liftWhir`, `spark`, `veilWhoosh` y `hookCreak`. (`engineRumble` y los sonidos de la reparación, `hammer`, `ratchet` y `puff`, se quitaron: el golpe agudo del martillo se confundía con el 3-2-1 y no aportaban nada sobre la música; los mecánicos trabajan en silencio.)
- Cada grabación se descarga y decodifica una sola vez (`fetch` + `decodeAudioData`) y se guarda. Empiezan a cargar en el toque de «Empezar» (`unlockPlayerAudio` → `preloadSfx()`) y, si no, con el primer efecto.
- Si un archivo falta, no se puede decodificar o aún no ha llegado, suena su receta sintetizada, sin avisar.
- **Cambiar un sonido**: sustituir su mp3 por otro con el mismo nombre. Para añadir o quitar uno, su línea en `sfxSamples.ts`.

## Niveles (para ajustar de oído)
- Grabaciones: `gain` de cada una en `sfxSamples.ts`. Los archivos vienen normalizados a un nivel común (los 200 ms más fuertes a unos −16 dBFS RMS, picos ≤ −1 dBFS), así que `gain` es solo la mezcla: vuelo y separación 0,7–0,75 (se oyen claros, por debajo de la música), el golpe de los caballetes (`pam`) 0,55, clics de interfaz 0,28–0,4, y los tambores del final, que suenan solos, el redoble 0,6 y el platillo 0,8. La base de cohetes, por debajo de los clics y del zumbido: carraca 0,12, pasos y peldaños 0,08, botón 0,24 y torre 0,22.
- Sintetizados: `gain` de cada receta en `sfxRecipes.ts`. Todos: `SFX_MASTER` (en `sfxRecipes.ts`).
- Música: por defecto al 0,4 (`DEFAULT_MUSIC_SETTINGS` en `mix.ts`, antes 0,8). La preferencia se guarda en `everydaym.music.v2`; la v1 se borra (conservando solo el silencio), así todos empiezan una vez al nuevo nivel. Los efectos van con el mismo volumen, así que la proporción efectos/música no cambia al moverlo.
- Nadie los ha escuchado aún.

Reglas puras probadas en `sfxRecipes.test.ts` y `sfxSamples.test.ts`. Los de la base: ninguna receta es un seno limpio en la zona del 3-2-1, y recetas y grabaciones van por debajo del zumbido de las bromas (las grabaciones, también por debajo de `banner` y `clack`).

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
| `drumClick` | ambiente | Primera pantalla (móvil): un clic de carraca por cada cohete que pasa por el centro del tambor (`minGap` 0,08 s: una ruleta rápida no ametralla). Muy bajo. |
| `metalStep` | ambiente | Un paso de los astronautas por la pasarela (uno cada 8 px; también al entrar por la escotilla y al aterrizar sobre el cohete cuando la rueda se para). Muy bajo. |
| `ladderStep` | ambiente | Un peldaño de los astronautas en la escalera de la torre. Muy bajo. |
| `buttonThunk` | ambiente | Al pulsar «Random», dentro del toque, con `{ gesture: true }`: golpe grave y acolchado. |
| `towerDock` | ambiente | Primera pantalla (móvil): cuando la rueda se para y las garras se cierran de golpe sobre el cohete elegido; y en el despegue desde la base, cuando los brazos de la torre de lanzamiento se cierran sobre el cohete. Después, `ignite` (ignición) y `launch` (despegue). |
| `drumHit` | ambiente | Pantalla final: cuando la última pieza encaja en el cohete (con movimiento reducido, al abrirse la pantalla). Las piezas de antes encajan con `pam` (la etapa que ya traía el cohete, con `clack`). |

## Creador (móvil): `creatorSfx.ts`
En el creador no suena música, así que los efectos llevan el ambiente y van más altos que en el entrenamiento. Cada momento es una «señal» de `CREATOR_SFX` (`lib/audio/creatorSfx.ts`): qué sonido toca y su **nivel**, un multiplicador sobre el nivel propio del sonido (`gain` de `sfxSamples.ts` o de `sfxRecipes.ts`), hasta `SFX_GAIN_MAX` (3). Así los sonidos del reproductor no cambian. `gapMs`: si la misma señal vuelve antes, se salta (además del `minGap` del sonido), para que nada repiquetee. El limitador del bus evita que la suma sature. **Nadie los ha escuchado**: se ajustan ahí.

| Señal | Sonido | Nivel | Separación | Cuándo |
|---|---|---|---|---|
| `wheelTick` | `drumClick` | ×1,6 (≈0,19) | 60 ms | Cada cohete que pasa por la franja de la rueda. |
| `clampShut` | `towerDock` | ×1,5 (≈0,33) | 250 ms | La rueda se para: las garras se cierran («pum»). |
| `engineStart` | `engineStart` (sintetizado) | ×1 (0,34) | 500 ms | Encima del «pum»: el motor del elegido arranca (~0,6 s). |
| `noseCreak` | `hookCreak` (sintetizado) | ×1 (0,16) | 800 ms | Al tocar la barra de escribir: cruje un poco la grúa de la que cuelga la punta. Sutil. |
| `levelClick` | `drumClick` | ×1,4 | 50 ms | El nivel del depósito de los minutos se queda en una marca (con un toque de vibración donde se pueda). |
| `randomButton` | `buttonThunk` | ×1,4 (≈0,34) | — | Al pulsar «Random». |
| `crewStep` / `crewRung` | `metalStep` / `ladderStep` | ×1,6 (≈0,13) | — | Pasos y peldaños de los astronautas. |
| `crewLand` | `metalStep` | ×2,4 (≈0,19) | 200 ms | Aterrizan sobre el cohete al pararse la rueda. |
| `crewBoard` | `metalStep` | ×2 | — | Entran por la escotilla o la ventanilla. |
| `gantryDock` | `towerDock` | ×1,6 | — | Los brazos de la torre de lanzamiento se acoplan. |
| `ignite` | `ignite` | ×1,5 (≈0,6) | 300 ms | Ignición (base y montaje). |
| `liftOff` | `launch` | ×1,2 (≈0,9) | 600 ms | Despegue (base y montaje). |
| `hookGrab` | `hookGrab` (sintetizado) | ×1 (0,3) | 200 ms | El gancho de la grúa coge la pieza. |
| `hookRelease` | `clack` | ×0,9 | — | La deja en el elevador. |
| `truckIn` | `truckRoll` (sintetizado) | ×1 (0,22) | 600 ms | Llega el camión. |
| `liftUp` | `liftWhir` (sintetizado) | ×1 (0,18) | 300 ms | El elevador sube la pieza. |
| `dock` | `towerDock` | ×1,5 | 200 ms | La pieza encaja bajo la de arriba. |
| `bolt` + `spark` | `clack` + `spark` (sintetizado) | ×1,5 + ×1 (0,14) | — | Cada tornillo, con sus chispas. |
| `quickPiece` | `clack` | ×1,3 | — | Una pieza que ya se sabía sube sola. |
| `veil` | `veilWhoosh` (sintetizado) | ×1 (0,2) | 1 s | Se cierra la pantalla blanca. |

## Notas
- Límite de 8 golpes a la vez (y por sonido, `maxVoices`); el más viejo se corta con un fundido de 30 ms. Bucles: 3.
- Una llamada repetida antes de `minGap` se ignora (dobles renders en desarrollo, dobles toques).
- Bus: aviso/ambiente → limitador suave → volumen general → salida. Los nodos se desconectan al terminar.
- Las grabaciones respetan lo mismo que las recetas: `vary` (tono y nivel), `maxVoices`, `minGap` y su categoría. `slowMo` es un bucle sin cortes de 4 s (`loop` en `sfxSamples.ts`, con 0,15 s de margen a cada lado del archivo). `drumRoll` dura más que el redoble más largo (unos 9 s), así que en la práctica no llega a repetirse.
