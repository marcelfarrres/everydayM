# Plan «Hilo conductor» — decisiones y trabajo

Rama: `feat/hilo-conductor` (desde `dev`). Decisiones tomadas con Marcel el 24-11-2026.
Este documento es el contrato para quien implemente: lo que no esté aquí se pregunta, no se inventa.

Vocabulario: **bloque** = lo que el código llama `round`; **serie** = un ejercicio de ~1 min dentro de un bloque. En el código se mantienen los nombres internos (`round`, `exercise`); solo cambia el texto que ve el usuario («3 bloques de 4 series»).

## 0. Principios

- En móvil el vídeo ocupa toda la pantalla. La UI va superpuesta y es mínima: **un solo widget** (la barra inferior) y, arriba, solo el menú «···».
- Estilo: **dibujo de línea, muy pocos colores**. Tinta y blanco como base; rojo para la serie en curso; azul para el descanso. El color se reserva para lo que tiene que impactar.
- Nada debe dar tirones en un móvil de gama media: solo se animan `transform` y `opacity`.
- Gastar la mínima transferencia de Supabase posible (ver §6).

## 1. Reproductor (móvil)

### 1.1 Cabecera
- Solo el botón «···» arriba a la derecha. Dentro: Salir, pitido de los últimos 3 s, música (silenciar + volumen) y, si el Estudio está activo, crear clip.
- Desaparecen: el botón «Salir» suelto, la campana suelta, la barra de porcentaje superior y el texto «Quedan…».

### 1.2 Barra inferior durante una serie
- Fila 1, **el hilo**: una línea por serie, agrupadas por bloque, con más separación entre bloques que entre series. Hecha = blanco, en curso = rojo, pendiente = gris. **Sin tramo de calentamiento.** Al final de la fila, una flecha hacia arriba (`chevron-up`) como pista de que se abre.
- Fila 2: nombre del ejercicio, tiempo, anterior, pausa, siguiente.
- Sin textos del tipo «Ronda 2 · 3 de 4».
- Durante el calentamiento: hilo entero en gris y el nombre «Calentamiento».

### 1.3 Lista desplegable (al tocar la barra)
- Se abre con animación hacia arriba; ocupa menos de media pantalla contando la barra (unas 5 filas visibles). Fondo translúcido.
- Contenido: «Calentamiento» y después cada bloque con sus series. Hecho = tachado y gris; en curso = rojo; pendiente = blanco. Al abrirse queda colocada en la serie en curso. Se puede deslizar arriba y abajo.
- Se cierra con animación: 5 s después del último toque o deslizamiento, al tocar el vídeo, o al tocar la barra otra vez. Tocar los botones de la barra no la cierra, reinicia los 5 s.
- Es solo de lectura: tocar un ejercicio no salta a él.
- Se puede tocar cualquier parte de la barra, no solo la flecha.

### 1.4 Descansos
Hay dos tipos. En ambos: **marco azul** alrededor de la pantalla y la barra en **modo descanso**.

| | Corto (entre series) | Largo (entre bloques, y entre calentamiento y bloque 1) |
|---|---|---|
| Pantalla completa | El ejercicio siguiente, en bucle y sin voz, tras un **velo oscuro** (negro translúcido ~60 %), con la **cuenta atrás gigante** en segundos y debajo «Luego: <ejercicio>» | 1 o 2 **vídeos hablados** seguidos, con voz, sin velo (sin vídeos hablados, o cuando terminan: como un corto) |
| Mini vídeo en la barra | No | Sí: la primera serie del bloque, a la izquierda, asomando por encima de la barra |

Barra en modo descanso:
- Mismo tamaño que en una serie. **Sin hilo.**
- Se **llena de agua azul de abajo arriba** con una ola en la superficie; llena = empieza la serie.
- Texto: «Descanso», el tiempo, «Luego: <ejercicio>» en pequeño, y el botón «Saltar». Sin botón de pausa.
- Cuando el vídeo ya enseña la cuenta atrás gigante (descanso sin vídeos hablados), la barra no repite el tiempo ni «Luego»: solo «Descanso» y «Saltar». El número aparece cuando las nubes se han ido; con movimiento reducido no se anima cada segundo. (Decidido por Marcel tras probarlo, 24-11-2026.)
- No se usa la palabra «tutorial» en ningún sitio.

### 1.5 Transiciones
- Las nubes y el cohete **se quedan como ahora**: en cada entrada a un descanso, con el timeline grande y el cohete cada vez más arriba.
- Nubes: las fotos actuales, optimizadas (ver §5). Cohete: redibujado **a línea**, con la llama en rojo como único color.
- El vídeo hablado empieza cuando las nubes se abren, no debajo de ellas.
- **Sin intro**: al pulsar «Empezar» se entra directo al calentamiento. Se eliminan el ítem `summary`, `RoutinePlan` (quesitos) y el mosaico de 4 vídeos.
- Pantalla final: sin 4 vídeos a la vez; usar las miniaturas (§6).

### 1.6 Hilo desde la creación
- En la pantalla de rutina lista (`RoutineComposer`), bajo los minutos, se dibuja el mismo hilo por bloques junto a «3 bloques de 4 series». Es el mismo dibujo que luego vive en la barra.

### 1.7 Ordenador
- Decidido por Marcel tras probarlo en su PC (24-11-2026): **fuera la pizarra** (panel de tiza, bombilla y fondo de pizarra). Fondo liso oscuro.
- El vídeo 9:16 va **centrado y a toda la altura** de la ventana, sin márgenes. **El mismo widget** del móvil va justo a su derecha, alineado abajo, con ancho fijo (22 rem); el «···» arriba en esa misma columna, fuera del vídeo. El marco azul del descanso rodea el vídeo.
- Se usa cuando la ventana tiene sitio para el vídeo y la columna del widget (ancho ≥ alto × 9/16 + 392 px) y al menos 480 px de alto; si no (ventanas estrechas, tablets en vertical, móvil en horizontal), la disposición del móvil.
- Con ratón, todo control tiene cursor de mano y cambio al pasar por encima; la barra se ilumina donde un clic abre la lista.

## 2. Vídeos hablados

- Un ejercicio puede tener **cero, uno o varios** vídeos hablados (~15 s, Marcel a cámara, con voz). Pueden ser técnica, curiosidad o lo que sea.
- Solo suenan en descansos largos. Para el bloque que va a empezar se eligen al azar 1 o 2 entre los vídeos hablados de sus ejercicios.
- **Un vídeo hablado nunca se repite dentro de la misma rutina.** Si no quedan, el descanso largo muestra el ejercicio siguiente, como uno corto.
- El descanso largo dura lo que duren los vídeos hablados elegidos (mínimo, la duración actual del descanso de fin de bloque).
- Ejercicio sin vídeo hablado: funciona igual que hoy.

## 3. Generador de rutinas

- Por defecto, **bloques casi iguales**: mismo circuito, con algún cambio suelto (sobre todo en bloques intermedios) por otro ejercicio del mismo músculo principal.
- Si la frase del usuario es específica (número de bloques, de series, ejercicios concretos, «bloques distintos»), manda la frase. Ampliar el esquema de intención que devuelve Gemini y el parser local.
- **No repetir siempre la misma rutina**: guardar en el dispositivo (`localStorage`) los ejercicios de las últimas ~10 rutinas y penalizarlos en la puntuación cuando haya alternativas.

## 4. Sonido

- Música **encendida por defecto**. Una sola lista en aleatorio; el usuario no elige pista. Controles en «···»: silenciar y volumen.
- Las pistas se alojan en el almacenamiento propio (Bunny, §6), nunca enlazadas a servidores ajenos. Se suben desde una sección «Música» del Estudio.
- La música baja (~25 %) mientras suena un vídeo hablado y vuelve después, con rampas de ~300 ms.
- iPhone ignora `audio.volume`: usar Web Audio (`GainNode`) y desbloquear audio y vídeo con sonido en el toque de «Empezar».
- **Riesgo nº 1 del proyecto**: que un vídeo con voz arranque solo en iPhone (Safari y la app Capacitor). Hacer una prueba aislada antes de construir encima.

## 5. Rendimiento de las transiciones

Causas medidas del lag actual, por orden: `filter: blur` animado sobre 10 capas enormes con máscara; coincidencia con el montaje del vídeo del descanso; mosaico de 4 vídeos; `backdrop-blur` sobre vídeo; `mix-blend-multiply` a pantalla completa; `RollingTime` con `popLayout` cada segundo; barras que animan `width`.

Qué hacer: quitar el blur animado; como mucho 4 capas de nubes; texturas reescaladas (~900 px, <100 KB); sin lecturas de layout durante la animación; fondos translúcidos sólidos en vez de `backdrop-blur`; progreso con `scaleX`; el reloj como texto tabular sin animación de layout.

## 6. Estudio y consumo

- **Alojamiento de medios: Bunny (Storage + CDN) en prepago**, decidido el 24-11-2026. Motivo: Supabase gratis solo da 1 GB / 5 GB al mes y ha bloqueado el proyecto (402); Bunny permite un techo de gasto real (saldo prepago, recarga automática desactivada y tope mensual de GB en la pull zone). Vídeos, versiones ligeras, miniaturas y música van a Bunny.
- **Sin base de datos** (decidido el 24-11-2026): Supabase pausó el proyecto y no se reanuda. Los datos (ejercicios con sus vídeos hablados, y la música) son un único archivo, `catalog/catalog.json`, en el mismo almacenamiento: `{ version, updatedAt, exercises[], music[] }`. La app pública solo lo lee; solo el Estudio lo escribe, guardando copia fechada antes de cada cambio. La mudanza de lo existente parte de las dos copias descargadas de Supabase (objetos y volcado de la base de datos) y la hace `scripts/migrate-media.mjs`.
- Variables de entorno nuevas (vacías en `.env.example`, valores solo en `.env.local`): `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_HOST`, `BUNNY_STORAGE_KEY` (solo servidor) y `NEXT_PUBLIC_MEDIA_BASE_URL` (URL pública de la pull zone).
- Al subir un vídeo se guardan tres cosas: **original** (1080 de ancho, para exportar), **versión ligera** (720 de ancho, ~8–12 MB, la que reproduce la app) y **miniatura** (captura de la mitad del clip, ~30 KB).
- El Estudio enseña solo miniaturas y textos; un vídeo se descarga únicamente al abrirlo.
- Script único para generar miniatura y versión ligera de los ~40 vídeos ya subidos.
- Subida con **dos huecos**: vídeo del ejercicio y, opcional, su vídeo hablado.
- Pantalla **«Vídeos hablados»**: buscar entre los ejercicios existentes, ver cuáles no tienen, y añadir uno o varios a cada uno.
- Los vídeos hablados **conservan el audio** (hoy la subida lo quita a todo lo que no es intro).

## 7. Clips para TikTok

- La app **no sube nada a TikTok**. Genera el vídeo, lo deja en una **cola** y Marcel lo descarga al móvil y lo publica él.
- Cola: ver el clip, aprobar o rechazar con comentario (para regenerar), descargar. Se abre también desde el móvil por la wifi de casa, como el resto del Estudio. Los clips se guardan en el disco del ordenador, no en Supabase.
- Dos formas de pedir un clip: eligiendo el tipo, o con una **frase** («un clip de un ejercicio de glúteo donde salgo explicando») que Gemini convierte en tipo + músculos + ejercicio.
- Tipos:

| Tipo | Contenido | Sonido |
|---|---|---|
| Rutina completa | Todo el entrenamiento | Música, que baja cuando hay voz |
| Resumen | Un trozo de cada ejercicio, ~30 s | Sin música |
| Top 3 | Los tres ejercicios principales | Sin música |
| Reto | Formato desafío | Sin música |
| Carrusel | Fotos | — |
| Vídeo hablado (nuevo) | Un vídeo hablado | Voz |
| Intro + vídeo hablado (nuevo) | Entrada habitual + vídeo hablado | Voz |
| Mezcla al azar (nuevo) | Ejercicios sueltos de la biblioteca, sin rutina | Sin música |

- La cuenta de TikTok es personal: los clips cortos van sin música y el sonido se pone en TikTok.

## 8. Arquitectura

### 8.1 Datos

> Sustituido por el catálogo JSON de §6. Las tablas descritas abajo quedan solo como referencia de los campos; las migraciones de noviembre no se aplican y Supabase se retira del proyecto al integrar.

- `exercises`: añadir `video_lite_url text null`, `poster_url text null`. Ojo: el tipo de `exercises.id` no aparece en ninguna migración; comprobarlo antes de crear claves ajenas.
- Tabla `exercise_talks`: `id`, `exercise_id` (FK, borrado en cascada), `video_url`, `video_lite_url`, `poster_url`, `duration_seconds`, `note text null`, `created_at`. RLS como en `202611120001_harden_rls.sql`: lectura anónima, escritura solo `service_role`.
- Tabla `music_tracks`: `id`, `title`, `artist`, `source_url`, `license`, `audio_url`, `duration_seconds`, `enabled`. Los archivos van a Bunny, con CORS abierto para que Web Audio pueda leerlos.
- Clips: carpeta local ignorada por git + manifiesto JSON, servidos por una ruta protegida con `guardStudioApi`.

### 8.2 Motor (`lib/routine/`, `types/workout.ts`, `lib/intent/`)
- Eliminar los ítems `summary` e `intro`.
- `rest` gana `restKind: 'short' | 'long'` y, si es largo, `talks: ExerciseTalk[]` (0–2).
- `RoutineMeta.circuit` pasa a `blocks: Exercise[][]`. Actualizar quien lo lee: `tiktokExport`, `contentIdeas`, `RoutineComposer`, `cheers` («Mismo plan, más ganas» deja de ser siempre cierto).
- `buildRoutine` recibe los ejercicios recientes para penalizarlos.
- Un solo tipo `RoutineIntent` (hoy está duplicado), ampliado con variación entre bloques.

### 8.3 Reproductor
- Partir `WorkoutPlayer.tsx` (754 líneas) en `components/workout/player/`: barra, hilo, lista, barra de descanso, marco, menú, escenario.
- Vídeos: reproducir siempre `video_lite_url` (con `video_url` como reserva).

### 8.4 Clips
- Una sola fuente de verdad para los tipos de clip (hoy la lista está repetida en 5 archivos).
- Partir `lib/server/tiktokExport.ts` (1031 líneas). Todas las partes con pista de audio uniforme (silencio donde no haya voz) para poder seguir concatenando sin recodificar; mezcla de música con `sidechaincompress` y `loudnorm` en una pasada final solo para la rutina completa.
- Declarar `sharp` en `package.json` (hoy se usa sin estar declarado).

### 8.5 Limpieza previa
Borrar lo que no se usa: `RoutinePromptCard.tsx`, `MiniMuscleMap.tsx`, el componente `CountdownRing` (conservar su `AudioContext` compartido), el componente `RoutineTimeline` (conservar `formatSeconds`), `RoutinePlan.tsx`, `.bg-neon-grid`, `.glass-panel`, `pizarra-negra-b.webp`, `pizarra-verde.webp`. Corregir en `AGENTS.md` la mención a `app/api/export-routine/route.ts`, que no existe.

## 9. Orden de trabajo

Cada paquete lo hace un agente (Opus 5.5, esfuerzo alto). Dos agentes nunca tocan los mismos archivos a la vez. Cada paquete termina con `npm run lint`, `npm run typecheck` y `npm run build` en verde.

| Fase | Paquete | Archivos principales | Depende de |
|---|---|---|---|
| 0 | Base: limpieza, tipos nuevos (contrato), registro de tipos de clip, migraciones, `sharp` | `types/`, `supabase/migrations/`, borrados | — |
| 1 | A · Motor | `lib/routine/`, `lib/intent/`, `hooks/useWorkoutRoutine.ts` | 0 |
| 1 | B · Estudio y medios | `lib/server/ffmpeg.ts`, `app/api/admin/`, `app/admin/`, script de migración de vídeos | 0 |
| 1 | C · Reproductor | `components/workout/`, `app/globals.css`, cohete y nubes | 0 |
| 2 | D · Sonido | motor de música, ducking, vídeo con voz | B, C |
| 2 | E · Clips | `lib/server/` de clips, cola, frase → clip | A, B |
| 3 | Integración, prueba en iPhone real, repaso final de UI, fusión a `dev` | — | todo |

Antes de la fase 2, prueba aislada del riesgo de §4 en un iPhone.

## 10. Pendiente de Marcel

1. **Cuenta de Bunny**: crearla, meter saldo, desactivar la recarga automática, crear la zona de almacenamiento (Europa) con su pull zone, fijar el tope mensual de GB y poner las claves en `.env.local`. Dejar las dos copias descargadas de Supabase (objetos y base de datos) en una carpeta fuera del repo para la mudanza. Poner `NEXT_PUBLIC_MEDIA_BASE_URL` también en Vercel.
2. **Música**: Pixabay y Free Music Archive prohíben la descarga automática en lote, así que las pistas hay que bajarlas a mano. Lista corta recomendada en el anexo.
3. Grabar al menos 3 o 4 vídeos hablados para poder probar los descansos largos.
4. ~~Confirmar el supuesto de §1.7~~: decidido (sin pizarra, vídeo a toda altura con el widget al lado).

## Anexo — música candidata (≈56 min, comprobada el 24-11-2026)

Todas sin aviso de «Content ID Registered» en su página ese día; puede cambiar. Guardar captura de la página al descargar. No es asesoramiento legal.

**Pixabay (Pixabay Content License), autor Kulakovka** — base `https://pixabay.com/music/`:
`electronic-gym-motivation-620569/` · `action-workout-620537/` · `action-gyms-620583/` · `electronic-adrenaline-sport-620584/` · `electronic-active-sport-618585/` · `video-games-action-game-620581/` · `phonk-phonk-reel-614877/` · `phonk-danger-music-620575/` · `beats-rage-beat-620530/` · `trap-agressive-trap-571173/` · `beats-hip-hop-power-614899/` · `synthwave-cyberpunk-music-624631/` · `synthwave-dark-synthwave-624644/`

**Free Music Archive (CC0), autor HoliznaCC0** — base `https://freemusicarchive.org/music/holiznacc0/`:
`left-overs/movement-1/` · `phonk-aura-farming/re-adusjtment/` · `phonk-aura-farming/pantheon/` · `phonk-aura-farming/phonk-remix/` · `phonk-aura-farming/phonk-ish/` · `after-dark/childs-play-1/` · `after-dark/serial-1/` · `after-dark/skill-test/` · `after-dark/wolf-1/`

El research completo encontró 83 pistas (4 h 26 min). Unas 28 de las de Pixabay están marcadas como generadas con IA y cuatro duran más de 11 min; se han dejado fuera de esta lista corta.
