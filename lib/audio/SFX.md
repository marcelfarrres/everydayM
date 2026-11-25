# Efectos de sonido (`lib/audio/sfx.ts`)

Sintetizados con Web Audio sobre el `AudioContext` compartido (`lib/audio.ts`); sin archivos. Nunca bajan la música.
Tabla de sonidos y niveles (para ajustar de oído): `sfxRecipes.ts`. Reglas puras probadas en `sfxRecipes.test.ts`.

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
| `engineRumble` | bucle | Desde que quedan 10 s del ejercicio que lleva al descanso con cohete hasta el despegue; `setIntensity(1 - restante/10)` cada segundo. Pararlo justo al llamar a `launch`. |
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
- Nadie los ha escuchado aún: niveles bajos a propósito. Subir/bajar con `gain` de cada receta o `SFX_MASTER`.
