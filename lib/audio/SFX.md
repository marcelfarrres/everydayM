# Efectos de sonido (`lib/audio/sfx.ts`)

Sobre el `AudioContext` compartido (`lib/audio.ts`). Nunca bajan la música.

## Grabaciones reales y sintetizados
- **Grabaciones** (`public/sfx/<nombre>.mp3`, servidas por la propia app en `/sfx/`): `launch`, `slowMo`, `boost`, `land`, `separate`, `hammer`, `ratchet`, `puff`, `pam`, `banner`, `clack`, `ignite`. Origen y licencias (dominio público / CC0): `public/sfx/CREDITS.md`.
- **Sintetizados** (`sfxRecipes.ts`): `beep`, `beepFinal` y `engineRumble` (este ya no se usa, pero el nombre sigue).
- Cada grabación se descarga y decodifica una sola vez (`fetch` + `decodeAudioData`) y se guarda. Empiezan a cargar en el toque de «Empezar» (`unlockPlayerAudio` → `preloadSfx()`) y, si no, con el primer efecto.
- Si un archivo falta, no se puede decodificar o aún no ha llegado, suena su receta sintetizada, sin avisar.
- **Cambiar un sonido**: sustituir su mp3 por otro con el mismo nombre. Para añadir o quitar uno, su línea en `sfxSamples.ts`.

## Niveles (para ajustar de oído)
- Grabaciones: `gain` de cada una en `sfxSamples.ts`. Los archivos vienen normalizados a un nivel común (los 200 ms más fuertes a unos −16 dBFS RMS, picos ≤ −1 dBFS), así que `gain` es solo la mezcla: vuelo y separación 0,7–0,75 (se oyen claros, por debajo de la música), reparación 0,4–0,55, clics de interfaz 0,28–0,4.
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
- Mientras un vídeo hablado suena (cuando la música se agacha), los de **ambiente** callan (y no arrancan); los de **aviso** siguen.

## Cuándo llamar a cada uno
| Sonido | Tipo | Momento |
|---|---|---|
| `beep` | aviso | Al entrar en los segundos 3 y 2 restantes del ejercicio. |
| `beepFinal` | aviso | Al entrar en el último segundo (1). |
| `engineRumble` | bucle | Quitado por decisión de Marcel (el nombre sigue, sintetizado y sin usar). Antes: desde que quedan 10 s del ejercicio que lleva al descanso con cohete hasta el despegue; `setIntensity(1 - restante/10)` cada segundo. Pararlo justo al llamar a `launch`. |
| `launch` | ambiente | Al instante en que el cohete sale disparado. |
| `slowMo` | bucle | Mientras el cohete sube despacio entre las nubes; pararlo al salir por arriba. |
| `separate` | ambiente | Cada vez que se suelta un tramo o los propulsores. |
| `boost` | ambiente | Al acelerar y salir por arriba de las nubes. |
| `land` | ambiente | Al volver y empezar a frenar (el derrape va primero; el golpe cae a los 0,24 s). |
| `banner` | ambiente | Al sacar la pancarta y otra vez al recogerla. |
| `hammer` / `ratchet` / `puff` | ambiente | En cada golpe de la animación de reparación (aguantan repetirse cada ~0,6 s). |
| `pam` | ambiente | En el fotograma en que el cohete toca el suelo al caer de los caballetes. |
| `clack` | ambiente | Cada vez que una pieza encaja al montar el cohete. |
| `ignite` | ambiente | En el toque de un cohete-botón, con `{ gesture: true }`. |

## Notas
- Límite de 8 golpes a la vez (y por sonido, `maxVoices`); el más viejo se corta con un fundido de 30 ms. Bucles: 3.
- Una llamada repetida antes de `minGap` se ignora (dobles renders en desarrollo, dobles toques).
- Bus: aviso/ambiente → limitador suave → volumen general → salida. Los nodos se desconectan al terminar.
- Las grabaciones respetan lo mismo que las recetas: `vary` (tono y nivel), `maxVoices`, `minGap` y su categoría. `slowMo` es un bucle sin cortes de 4 s (`loop` en `sfxSamples.ts`, con 0,15 s de margen a cada lado del archivo).
