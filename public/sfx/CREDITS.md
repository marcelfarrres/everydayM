# Efectos de sonido: origen y licencias

Todos son de dominio público o CC0: se pueden usar en una app comercial sin atribución (esta lista es por orden y por si hay que volver a la fuente).
Recortados, en mono, normalizados a un nivel común y codificados en mp3 con FFmpeg; algunos mezclan dos grabaciones o van más lentos.

| Sonido | Qué es | Fuente | Autor | Licencia |
|---|---|---|---|---|
| `launch.mp3` | Despegue real del Atlas V (misión SDO, 2010): primeros 2,6 s, con el rugido que crece y se aleja. | [nasa.gov/historical-sounds](https://www.nasa.gov/historical-sounds/) · [mp3](https://www.nasa.gov/wp-content/uploads/2015/01/590329main_ringtone_SDO_launchNats.mp3) | NASA | Dominio público (obra del Gobierno de EE. UU.; sin usar el logo ni dar a entender que NASA respalda la app) |
| `slowMo.mp3` | Rugido del transbordador (STS-131) a cámara lenta: 0,62× (unos 8 semitonos más grave), más oscuro, en bucle sin cortes de 4 s. | [mp3](https://www.nasa.gov/wp-content/uploads/2015/01/590189main_ringtone_131_launchNats.mp3) | NASA | Dominio público |
| `boost.mp3` | El mismo rugido del STS-131 un poco más agudo (1,12×), entrando rápido y alejándose. | [mp3](https://www.nasa.gov/wp-content/uploads/2015/01/590189main_ringtone_131_launchNats.mp3) | NASA | Dominio público |
| `land.mp3` | Rugido del Atlas V más grave (frenada) y, a los 0,24 s, un golpe sordo (`impactSoft_heavy_000`). | NASA (arriba) + [Kenney · Impact Sounds](https://kenney.nl/assets/impact-sounds) | NASA · Kenney | Dominio público · CC0 |
| `separate.mp3` | Golpe metálico sobre chapa (`impactPlate_heavy_000`) y un soplido de aire comprimido. | [Kenney · Impact Sounds](https://kenney.nl/assets/impact-sounds) + [Air duster short.ogg](https://commons.wikimedia.org/wiki/File:Air_duster_short.ogg) | Kenney · stephan (PDSounds) | CC0 · Dominio público |
| `hammer.mp3` | Golpe de metal (`impactMetal_medium_000`). | [Kenney · Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 |
| `ratchet.mp3` | Llave de carraca en un taller: una pasada de 0,5 s. | [Tools Ratchet.ogg](https://commons.wikimedia.org/wiki/File:Tools_Ratchet.ogg) | CapsLok | CC0 |
| `puff.mp3` | Soplido corto de un bote de aire comprimido, algo apagado. | [Air duster short.ogg](https://commons.wikimedia.org/wiki/File:Air_duster_short.ogg) | stephan (PDSounds) | Dominio público |
| `pam.mp3` | Golpe sordo (`impactSoft_heavy_001`) con un toque metálico debajo (`impactMetal_light_000`). | [Kenney · Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 |
| `banner.mp3` | Cierre metálico (`metalLatch`). | [Kenney · RPG Audio](https://kenney.nl/assets/rpg-audio) | Kenney | CC0 |
| `clack.mp3` | Golpe ligero sobre chapa (`impactPlate_light_000`), recortado a 0,2 s. | [Kenney · Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 |
| `ignite.mp3` | Chispa de un mechero barato y, debajo, un soplo flojito del rugido del Atlas V. | [Cheap cigarette lighter.ogg](https://commons.wikimedia.org/wiki/File:Cheap_cigarette_lighter.ogg) + NASA (arriba) | stephan (PDSounds) · NASA | Dominio público |

`beep`, `beepFinal` (3-2-1) y `engineRumble` no tienen archivo: siguen sintetizados (`lib/audio/sfxRecipes.ts`).

## Cambiar un sonido
Deja aquí un mp3 nuevo con el mismo nombre (p. ej. `launch.mp3`), corto, en mono y sin silencio al principio; si suena fuerte o flojo, ajusta su `gain` en `lib/audio/sfxSamples.ts` (para `slowMo`, también su tramo de bucle, `loop`).
Si falta el archivo o no se puede leer, la app toca el sonido sintetizado de siempre.
