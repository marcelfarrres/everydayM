# TikTok: cómo publicar cada día con el mínimo esfuerzo

Investigado en noviembre de 2026. Cada dato lleva su fuente: **[TikTok]** es documentación oficial, **[Estudio]** son datos de plataformas de analítica y **[Opinión]** son consejos sin datos detrás.

## Tu rutina diaria (unos 10 minutos)

1. Pide los clips del día. Dos caminos, y los dos acaban en la misma **cola** (Estudio → **Clips**):
   - En el Estudio, escribe una frase («un clip de un ejercicio de glúteo donde salgo explicando») o elige el tipo a mano.
   - En la app, con la rutina del día: **Empezar** → **⋯ → TikTok: idea y vídeos de hoy** → el vídeo que quieras.
2. El ordenador los monta de uno en uno, sin esperar con la página abierta. Si hace falta, pulsa **Dame una idea** y graba las tomas del guion con el móvil en el trípode (2 a 5 min).
3. Desde el móvil (wifi de casa, con el PIN) abre **Clips**, mira cada vídeo y **Apruébalo**, o **Recházalo** con un comentario y pide **Otra versión**: usa otros ejercicios y otras frases, y si el comentario nombra un músculo, un ejercicio o un tipo de clip («mejor de hombro», «mejor un reto»), lo cambia.
4. **Descargar** guarda el MP4 en el móvil. En TikTok súbelo, añade un sonido de la biblioteca (en los cortos) y pega la descripción con **Descripción → Copiar**.
5. Publica a la hora en la que más seguidores tengas conectados (ver «Cuándo publicar»).

La app no sube nada a TikTok: la cuenta es personal y el sonido de moda se pone allí.

## La cola de clips

- Vive en el disco del ordenador del Estudio, en `.clips/` (fuera de git): `manifest.json` con cada clip (tipo, frase, ejercicios, estado, comentario, fechas, archivo, duración y tamaño), los vídeos y miniaturas en `files/`, cómo se hizo cada uno en `specs/` y una caché de originales en `cache/`.
- Estados: **Montando** (en cola o en marcha) → **Por revisar** → **Aprobado** o **Rechazado**. **Ha fallado** dice por qué. Si cierras el Estudio a mitad, ese clip queda como fallado y se rehace con **Otra versión**.
- Otra versión no borra la anterior: queda debajo como historial. **Borrar** quita el clip y sus archivos.
- Se monta desde el vídeo original (1080 de ancho), no la copia ligera. Con Bunny, cada original se descarga una vez y se guarda en la caché (hasta 6 GB, se van los menos usados).

## El sonido

- **Cortos** (resumen, 3 ejercicios, reto, mezcla al azar): sin música. Llevan una pista de audio en silencio para que TikTok no se queje; el sonido lo pones tú.
- **Vídeo hablado** e **Intro + vídeo hablado**: tu voz, a unos −14 LUFS (el nivel de TikTok).
- **Rutina completa**: música de la sección **Música** del Estudio (las pistas activas, en orden aleatorio, encadenadas y repetidas hasta el final). Baja sola (unos 12 dB) cuando hablas en los descansos largos y todo queda a unos −14 LUFS. Si no hay pistas activas, sale sin música y el clip lo avisa.

Para ahorrar aún más, un día a la semana deja programados los vídeos de la app. TikTok permite programar hasta 30 días desde la web o desde TikTok Studio ([Buffer](https://buffer.com/resources/how-to-schedule-tiktok-posts/)). Antes, prueba con un vídeo si puedes añadir un sonido de la biblioteca al programarlo; no está confirmado.

## Qué premia el algoritmo

- **[TikTok]** Predice si cada persona dará like, comentará, compartirá, guardará, seguirá, verá el vídeo hasta el final o lo pasará. No publica cuánto pesa cada cosa ([TikTok](https://www.tiktok.com/transparency/en-us/recommendation-system/)).
- **[TikTok]** Que alguien termine un vídeo largo es una señal fuerte. Tener muchos seguidores no es un factor directo ([TikTok](https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you/)).
- **Qué hacemos:**
  - El **resumen** está hecho para verse entero.
  - La **rutina completa** está hecha para guardarse.
  - El **reto** está hecho para comentar.

## Los 8 formatos de la app

| Formato | Duración | Para qué sirve |
|---|---|---|
| Resumen | ≈20 s | Se ve entero. Tu frase se escribe sola, apareces tú y se ve el plan y 4 ejercicios. |
| Rutina completa | 20–40 min | Se guarda para hacerla. Con música, y en los descansos largos salen tus vídeos hablados con tu voz. Los vídeos de 1 a 10 min son los que más alcance tienen ([Buffer, 1,1 M de vídeos](https://buffer.com/resources/longer-tiktoks-get-more-views-data/)). |
| 3 ejercicios | ≈16 s | Se guarda: el «X ejercicios para…» de siempre. |
| Reto 1 minuto | ≈65 s | Genera comentarios. Además pasa de 1 minuto, el mínimo para cobrar en Creator Rewards ([TikTok](https://newsroom.tiktok.com/introducing-the-new-creator-rewards-program)). |
| Carrusel de fotos | 7–10 fotos | Para variar. Los datos no se ponen de acuerdo: más interacción según [Fanpage Karma](https://www.fanpagekarma.com/insights/carousel-vs-video-performance-tiktok-instagram/) y menos alcance que el vídeo según [Metricool](https://metricool.com/press-release-tiktok-study-2026/). Úsalo 1 o 2 veces por semana como mucho. |
| Vídeo hablado | ≈15 s | Uno de tus vídeos hablados, con tu voz y el nombre del ejercicio al principio. Sale tu cara: es lo que más conecta. |
| Intro + vídeo hablado | ≈25 s | La entrada de siempre (frase y tú preparado) y después el vídeo hablado. |
| Mezcla al azar | ≈16 s | 5 ejercicios sueltos de la biblioteca, sin rutina, del músculo que digas. Para los días sin rutina nueva. |

Resumen, rutina completa, 3 ejercicios, reto y carrusel salen de una rutina: la del reproductor o, desde el Estudio, una que monta el propio Estudio con los músculos que pidas. Los otros tres no necesitan rutina. Para los dos con vídeo hablado hace falta que el ejercicio (o algún ejercicio del músculo pedido) tenga uno; si no, la cola te dice cuál falta.

**Prueba pendiente:** nadie ha medido si una rutina de 20–40 min funciona mejor entera o partida en «Parte 1/2/3». Prueba las dos formas durante dos semanas y compara la retención en tus estadísticas.

## Qué hemos cambiado en los vídeos por la investigación

- **El texto ya no queda tapado.** TikTok tapa los 240 px de arriba, los 660 de abajo (la descripción) y la columna de botones de la derecha ([plantilla medida por ManyPixels](https://www.manypixels.co/blog/social-media-design/tiktok-ad-specs)). Ahora todos los textos van entre y=240 e y=1260, y fuera de x>900 en la parte baja.
- **El mensaje llega antes de 3 s.** TikTok recomienda decir de qué va el vídeo en los primeros 3 segundos ([TikTok Ads](https://ads.tiktok.com/help/article/creative-best-practices?lang=en)). La pregunta «¿Qué entrenamos hoy?» sale desde el primer fotograma, y el titular aparece sobre tu clip a los 0,8 s y no al final.
- **Más tiempo para leer.** TikTok recomienda 5–10 palabras por segundo. Por eso el resumen pasa de 5 cortes de 1,1 s a 4 cortes de 1,6 s.
- **Reloj solo en segundos.** Pone «23» en vez de «0:23» y se vuelve rojo en los últimos 3. Es lo que hacen Heather Robertson, MadFit y Chloe Ting.
- **Siempre se sabe qué viene.** En los últimos 8 s de cada ejercicio aparece «Siguiente: X», igual que en Caroline Girvan o en Peloton. Los usuarios de Freeletics se quejaban justo de no ver el siguiente ejercicio ([foro](https://forum.freeletics.com/t/visualize-the-image-of-the-next-exercise-during-the-breaks-between-exercises/24071)).
- **Las descripciones acaban con una pregunta.** Las publicaciones que preguntan algo reciben un 26 % más de comentarios ([Metricool](https://metricool.com/press-release-tiktok-study-2026/)).

## Descripción y hashtags

- **[TikTok]** El texto, el sonido y los hashtags cuentan para recomendar el vídeo ([TikTok](https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you/)). Empieza con lo que la gente busca, como «rutina de piernas en casa 20 minutos».
- **[Estudio]** Usa de 1 a 5 hashtags. Con más, el alcance baja ([SocialPilot, 1,5 M de publicaciones](https://www.socialpilot.co/wp-content/uploads/2025/06/tiktok-strategy-guide.pdf)). La app pone 5.
- **[TikTok]** En TikTok Studio, «Creator Search Insights» enseña qué se busca mucho y tiene pocos vídeos. Mírala una vez a la semana para elegir el músculo del día ([TikTok](https://newsroom.tiktok.com/creator-search-insights?lang=en)).

## Cuánto y cuándo publicar

- **[Estudio]** Quien publica más de 11 veces por semana consigue un 34 % más de visitas por vídeo. La mediana no sube: lo que aumenta es la probabilidad de que un vídeo explote ([Buffer, 11,4 M de publicaciones](https://buffer.com/resources/how-often-should-you-post-on-tiktok/)). Con tus 2–3 vídeos al día vas sobrado.
- **[Estudio]** A nivel mundial, la mejor franja es de 18:00 a 21:00, con el pico a las 20:00 ([Metricool](https://metricool.com/press-release-tiktok-study-2026/)). No hay datos de España. Mira «Actividad de seguidores» en tus estadísticas; esas horas pueden venir en UTC, así que suma 1 o 2 horas.

## Qué mirar cada domingo (5 min)

1. Qué formato tiene más **guardados por cada 100 visitas**. Haz más de ese.
2. En qué segundo cae la retención del resumen. Si cae antes del 3, cambia el gancho.
3. Qué idea grabada por ti tuvo más comentarios. Pide más del mismo tipo con **Otra** hasta que salga una parecida.
