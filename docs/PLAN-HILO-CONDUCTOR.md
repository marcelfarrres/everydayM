# Plan «Hilo conductor» — decisiones y trabajo

Rama: `feat/hilo-conductor` (desde `dev`). Decisiones tomadas con Marcel el 24-11-2026.
Este documento es el contrato para quien implemente: lo que no esté aquí se pregunta, no se inventa.

Vocabulario: **bloque** = lo que el código llama `round`; **serie** = un ejercicio de ~1 min dentro de un bloque. En el código se mantienen los nombres internos (`round`, `exercise`); solo cambia el texto que ve el usuario («3 bloques de 4 series»).

## 0. Principios

- En móvil el vídeo ocupa toda la pantalla. La UI va superpuesta y es mínima: **un solo widget** (el cohete de abajo, §1.2) y, arriba, el menú «···» y un porcentaje discreto.
- Estilo: **dibujo de línea, muy pocos colores**. Tinta y blanco como base; rojo para la serie en curso; azul para el descanso. El color se reserva para lo que tiene que impactar.
- Nada debe dar tirones en un móvil de gama media: solo se animan `transform` y `opacity`.
- Gastar la mínima transferencia de Supabase posible (ver §6).

## 1. Reproductor (móvil)

### 1.1 Cabecera
- El botón «···» arriba a la derecha. Dentro: Salir, pitido de los últimos 3 s, música (silenciar + volumen) y, si el Estudio está activo, crear clip.
- Arriba a la izquierda, pequeño y discreto, el **porcentaje de rutina hecho** («37 %», por tiempo). Se aparta cuando un vídeo hablado enseña «Activar sonido».
- El porcentaje es la pareja de «···»: la misma pastilla de 44 px, el mismo fondo y los mismos márgenes.
- Desaparecen: el botón «Salir» suelto, la campana suelta, la barra de porcentaje superior y el texto «Quedan…».

### 1.2 El cohete (el widget del móvil)
En móvil el widget de abajo **es el cohete** (`components/workout/RocketShip.tsx`, geometría pura en `rocketShape.ts`): fino, tumbado con la punta a la derecha, blanco con trazo tinta y la llama roja, bajo y pegado al borde inferior. Es el mismo dibujo que el cohete grande de las nubes: **nunca hay dos cohetes en pantalla** (tiempos en `components/workout/rocketFlight.ts`, derivados de las mismas constantes que las nubes y `TALK_LEAD_MS`). Rehecho con Marcel el 24-11-2026 (segunda versión):
- **Dibujo por tramos** (25-11-2026, sustituye al cohete fino): cuerpo central de 30 px dividido en **un tramo por bloque** (bloque 1 en la cola, el último junto a la punta), cada uno con su tobera de campana (solo se ve la de la cola) y dentro las rayas de SUS series; juntas con doble línea fina y franja de cuadros, remaches y algún rasguño; punta corta redondeada con ventanita y sonda; y, mientras dura el calentamiento, **dos propulsores laterales** (arriba y abajo) con su cono y su tobera. Geometría pura en `rocketShape.ts` (`stackGeometry`, `shiftFor`, `widgetLayout(width, stack)`) y etapas en `rocketStack.ts` (`rocketStack`, `dropBetween`), con pruebas.
- **Desprendimiento**: solo en las nubes del descanso que sigue al último ejercicio de un bloque (o al calentamiento, los propulsores): con el cohete ya de pie (a 1,5 s), soplido de humo en la junta y el tramo cae hacia abajo girando despacio; queda a la vista la tobera del siguiente, ya encendida. El último tramo nunca se suelta. El cohete acortado se aparca centrado (se recoloca mientras está fuera de pantalla); pancarta, mástil, reparación, llamas, despegues y relevo con las nubes salen de la geometría real. «Anterior» devuelve los tramos sin animación.
- El resto de cohetes del creador (barra, sugerencias, «Random», opciones, «Seguir») son el mismo dibujo con un tramo y sin propulsores; en la barra, «enviar» y el micrófono van al final del cuerpo (la punta es corta).
- **Pancarta**: sobre un mástil corto, encima del cohete: el nombre (tocarlo abre la lista, con su chevron; «…» si no cabe), el tiempo que queda grande (28 px, cifras tabulares) y **Anterior, Pausa/Reanudar y Siguiente** (44 px). En los descansos: «Descanso» (con «· Luego: …» y el tiempo si el vídeo no enseña la cuenta atrás) y «Saltar». Todo el conjunto mide 123 px de alto a 390 y a 320.
- **Calentamiento**: entre un clip y el siguiente «intenta despegar y no puede»: tose (dos fogonazos y dos bocanadas), se agacha, da un saltito con el morro arriba, tiembla y cae (~1 s; los controles siguen funcionando).
- **Ignición**: en los últimos 3 s de una serie que va seguida de descanso o del final la llama crece cada segundo, sale cada vez más gas y el cohete tiembla mucho, más cada segundo (hasta 4,6 px y ~1°); el texto de la pancarta también tiembla, legible.
- **Aviso desde los 10 s** (segunda demo): antes de un despegue, a los 10 s sale una llama pequeña azul (el azul del descanso) y un temblor suave que crecen sin saltos y enlazan con la ignición roja a los 3 s (`warningLevel`, `engineShake`). **Sin sonido de motor** en esos 10 s (25-11-2026: era demasiado; se quita la llamada a `engineRumble`, la llama azul y el temblor siguen).
- **A las nubes** (25-11-2026, sustituye a «se coloca en las nubes»): a cero **sale disparado por la derecha** (hacia donde apunta el morro, 0,38 s), pausa fuera de pantalla (~0,6 s) mientras se cierran las nubes, **reaparece por abajo**, de pie y grande, frena y **sube a cámara lenta** (90 px en 1,5 s, sin pararse) junto al texto y el contador; ahí se suelta el tramo o los propulsores (a 1,8 s). Al abrirse las nubes acelera y sale por arriba. **Nubes 0,45 s más cortas**: `TALK_LEAD_MS` 3,82 → 3,37 s (también en el ordenador); aparcado a los 6,07 s, pancarta a los 6,57 s. Al final de la rutina sigue el despegue directo hacia arriba.
- **Nubes de fin de bloque** (25-11-2026; solo el descanso tras un bloque, cuando se suelta su tramo): duran 3,5 s más (`BLOCK_END_EXTRA_MS`; se abren a los 6,87 s = `BLOCK_END_LEAD_MS`; el motor alarga ese descanso 4 s y cuenta los hablados desde ahí, `getLongRestSeconds`, también en `solveForMinutes`). Tres frases en la columna de las nubes (`BLOCK_END`): «Has acabado el primer bloque.» (1,2 s), «Llevas el NN % completado.» (2,3 s: en el móvil la pastilla del % de la esquina crece 1,4× y viaja hasta el hueco reservado en la frase, bajando por el borde izquierdo para no pasar por encima del texto; se queda 1 s y **vuelve a su esquina antes de que entre la tercera frase**, 0,4 s antes, `badgeLeadMs`), «Retirando el primer bloque del cohete…» (4,3 s: el tramo se suelta en ese instante) y «Luego: bloque 2 · …» (5,5 s). Ordenador: las mismas frases, sin viaje. Las normales siguen abriéndose a los 3,37 s. **Arreglado (25-11-2026)**: la pastilla se quedaba en el hueco hasta que se abrían las nubes, pero las cuatro frases ocupan el mismo sitio, así que tapaba «Retirando…» y después «Luego: bloque 2 · …». Ahora cada texto tiene su sitio en cada momento; en pantallas bajas (320×568) la columna sube lo necesario para no salirse por abajo (el contador la sigue: `RestClock` se coloca en el hueco que le dejan las nubes, `data-cloud-clock`), y «Luego: …» corta a tres líneas.
  **Arreglado de verdad (25-11-2026, segunda vez)**: a velocidad real seguían solapándose. Causa: las frases se animaban con `motion` programando de golpe la entrada y la salida de cada una; `motion` guarda una sola animación por elemento y propiedad, así que la salida (con retraso y `fill: both`) anulaba la entrada y dejaba las frases 1, 2 y 3 visibles a la vez desde el principio, una encima de otra; además la pastilla iba por su cuenta (`setTimeout` + su propia animación) y en la prueba llegaba ~1 s tarde respecto a las frases. Ahora **un solo reloj** (`components/workout/cloudClock.ts`: una animación web, la del propio documento, leída una vez por fotograma) mueve todo lo escrito en las nubes con funciones puras (`wordsAt`, `sentenceAt`, `badgeAt` en `rocketFlight.ts`): la columna tiene filas propias (aviso «Descanso», hueco del contador, zona de frases, «Luego: …» en su propia fila en el móvil, línea de bloque); en la zona de frases solo una es visible en cada momento (las otras guardan su sitio ocultas); el hueco de la pastilla empieza su propia línea y la pastilla baja por el borde izquierdo, entra en horizontal sin pasar por texto y sale de la columna antes de la tercera frase (el «N min» del raíl se aparta mientras va por ese borde). Las palabras se han ido justo cuando el contador sale de su hueco (al abrirse las nubes, del mismo reloj). Comprobado con un barrido de 150 ms sobre ese reloj en 390×844, 360×740 y 320×568 (corto, fin de calentamiento con hablados, fin de bloque).
- **El minuto entre bloques** (25-11-2026): el descanso entre un bloque y el siguiente dura ≥ 60 s (`BETWEEN_BLOCKS_MIN_SECONDS`; el de después del calentamiento no). Se llena con las nubes largas, los vídeos hablados que quepan (`fillTalks`: primero los del bloque que viene, luego los de los siguientes, sin repetir) y, si faltan, en el móvil el **vídeo de descanso** (§1.4; sustituye el 25-11-2026 al «avance del bloque», que desaparece). En descansos largos los mecánicos alternan 7 s de trabajo con 5 s de pausa (uno se seca el sudor y mira el cohete, el otro se sienta en la caja de herramientas) y trabajan fuerte los últimos 8 s.
- **Fin del calentamiento** (25-11-2026): mismas nubes largas (`BLOCK_END_LEAD_MS`) con «Has acabado el calentamiento.» → «Llevas el NN % completado.» (con el viaje del %) → «Soltando los propulsores…», y en ese instante se sueltan los propulsores. Solo en el móvil; el ordenador mantiene sus nubes (aunque el descanso dura lo que diga el motor).
- **Vuelta**: cuando ha salido por arriba, un respiro y vuelve desde la izquierda y desde el fondo, se pasa un poco, se aplasta al posarse; **medio segundo después** la pancarta sale del cuerpo con un rebote elástico. Hasta entonces no hay controles (`inert`). Al empezar la rutina llega igual; al terminar despega una última vez antes de la pantalla final.
- **Aterrizaje con carrerilla** (segunda demo): llega rápido, pasa de largo y se sale un poco por la derecha (22vw), tira para atrás pasándose un poco al otro lado y se asienta; luego el aplastón y la pancarta a los 0,5 s. La vuelta dura 1,6 s (aparcado a los 6,52 s del descanso).
- **Despegue guiado por el contador** (25-11-2026, ajustado tras probarlo): aviso azul desde los 10 s y rojo desde los 3 s (temblor final algo más suave: hasta 3,4 px). **Ningún cohete se mueve con la pancarta fuera**: en el último segundo primero se recoge la pancarta (0,26 s) y solo entonces, en los últimos 0,7 s, el cohete se echa hacia la cola y se comprime (más contenido que antes); a cero sale disparado. «Siguiente» antes de tiempo: recoge la pancarta, agazapado rápido (0,2 s) y fuera (`launchLeadMs`). La tos del calentamiento también recoge la pancarta antes del saltito y la vuelve a sacar después; en el creador, «Empezar» recoge su pancarta antes de despegar.
- **Descanso «en reparación»** (25-11-2026, sustituye al agua, que desaparece del todo): dos mecánicos pequeños de línea (blancos con trazo tinta, gorra en el azul del descanso, ~1,2 veces el grosor del cohete; cabeza, tronco, dos brazos y dos piernas que giran en sus articulaciones) entran desde los dos lados (el segundo 120 ms después; frenazo con rebote y polvo), ponen dos caballetes y el cohete sube 4 px con rebote. Trabajan en los extremos reales del cohete (aunque esté acortado y centrado): el de la cola martillea (anticipación, golpe, chispa y respingo del cohete de 1–2 px, recuperación) y el de la punta gira una llave en dos tiempos, un tercio de compás después; cada ~4 s se cruzan (uno se agacha), salen bocanadas de humo en los extremos y nunca están quietos (respiran y cabecean, a ritmos distintos). Los 3 últimos s van ×1,4; a 1,2 s del final retiran los caballetes y salen corriendo cada uno por su lado; a cero el cohete cae con el «¡pam!» de siempre y un destello de «listo» en la punta. Coreografía pura en `repairPlan` (`rocketFlight.ts`, con pruebas: fases según lo que queda, versión corta por debajo de 4 s, nada por debajo de 2 s, modo tranquilo) y dibujo en `components/workout/player/RepairCrew.tsx` (Web Animations ancladas al reloj, en pausa con la rutina). Con vídeos hablados trabajan tranquilos (más lentos, sin chispas ni respingos). «Saltar»/«Anterior»: salen corriendo en 0,3 s y el cohete cae. La pancarta no se mueve («Saltar» siempre a mano). Con movimiento reducido: quietos junto al cohete. (25-11-2026) **Más humo**: bocanadas más grandes y frecuentes en los dos extremos (cada 0,6 s; una de cada tres sube más y se deshace), polvo al correr y al frenar, una bocanada en cada martillazo y chispas más grandes; en modo tranquilo, más pequeñas y cada 1,3 s. Nunca tapan las rayas ni la pancarta.
- Cualquier salto, pausa o pestaña en segundo plano lo deja en una pose definida (posado con la pancarta fuera, o fuera del todo), nunca a medio vuelo ni duplicado. Mientras está fuera no se puede tocar (`inert`, que un solo efecto mantiene al paso del vuelo). Con movimiento reducido no vuela ni se agacha: fundidos.
- Arreglado: tras la llegada al empezar la rutina los controles se quedaban bloqueados (`inert`) hasta el primer descanso: el temporizador que los devolvía lo borraba la limpieza de otro efecto en el doble montaje de React.
- En el ordenador sigue la barra de siempre bajo la pizarra (§1.7).

### 1.2.1 Barra inferior durante una serie (ordenador)
- Fila 1, **el hilo**: una línea por serie, agrupadas por bloque, con más separación entre bloques que entre series. Hecha = blanco, en curso = rojo, pendiente = gris. **Sin tramo de calentamiento.** Al final de la fila, una flecha hacia arriba (`chevron-up`) como pista de que se abre.
- Fila 2: nombre del ejercicio, tiempo, anterior, pausa, siguiente.
- Sin textos del tipo «Ronda 2 · 3 de 4».
- Durante el calentamiento: hilo entero en gris y el nombre «Calentamiento».

### 1.3 Lista desplegable (al tocar la barra o el cohete)
- Se abre con animación hacia arriba; ocupa menos de media pantalla contando la barra (unas 5 filas visibles). Fondo translúcido.
- Contenido: «Calentamiento» y después cada bloque con sus series. Hecho = tachado y gris; en curso = rojo; pendiente = blanco. Al abrirse queda colocada en la serie en curso. Se puede deslizar arriba y abajo.
- Se cierra con animación: 5 s después del último toque o deslizamiento, al tocar el vídeo, o al tocar la barra otra vez. Tocar los botones de la barra no la cierra, reinicia los 5 s.
- Es solo de lectura: tocar un ejercicio no salta a él.
- En móvil ya no lleva fila de controles: están siempre en la pancarta sobre el cohete (§1.2); nunca hay dos juegos iguales a la vista.
- Se puede tocar cualquier parte de la barra, no solo la flecha.

### 1.4 Descansos
Hay dos tipos. En ambos: **marco azul** alrededor de la pantalla y la barra en **modo descanso**.

| | Corto (entre series) | Largo (entre bloques, y entre calentamiento y bloque 1) |
|---|---|---|
| Pantalla completa | El ejercicio siguiente, en bucle y sin voz, tras un **velo oscuro** (negro translúcido ~60 %), con la **cuenta atrás gigante** en segundos y debajo «Luego: <ejercicio>» | 1 o 2 **vídeos hablados** seguidos, con voz, sin velo (sin vídeos hablados, o cuando terminan: como un corto) |
| Mini vídeo en la barra | No | Sí: la primera serie del bloque, a la izquierda, asomando por encima de la barra |

Barra en modo descanso:
- Mismo tamaño que en una serie. **Sin hilo.**
- Ordenador: se **llena de agua azul de abajo arriba** con una ola en la superficie; llena = empieza la serie. En el móvil el cohete está «en reparación» (§1.2); en descansos largos con vídeos hablados el contador es una pestaña de la pancarta y el mini vídeo va en su mástil sobre el extremo izquierdo. «Saltar» va en la pancarta.
- Texto: «Descanso», el tiempo, «Luego: <ejercicio>» en pequeño, y el botón «Saltar». Sin botón de pausa.
- Cuando el vídeo ya enseña la cuenta atrás gigante (descanso sin vídeos hablados), la barra no repite el tiempo ni «Luego»: solo «Descanso» y «Saltar». El número aparece cuando las nubes se han ido; con movimiento reducido no se anima cada segundo. (Decidido por Marcel tras probarlo, 24-11-2026.)
- **Duración fija** (24-11-2026): el vídeo dura lo que dura y el descanso es siempre el decidido (corto = `getRestDuration`, largo = `getLongRestBase`, solo más largo si lo piden los vídeos hablados). Ya no se le suma el hueco del «slot» de un clip corto.
- **Móvil, el contador empieza en las nubes** (`RestClock`): la cuenta atrás sale con el texto de las nubes, grande en su columna (bajo «Descanso»; «Descansa» un punto más pequeño), y al abrirse se desliza al centro, ya en blanco sobre el velo, con «Empiezas en» encima y nada debajo. En descansos con vídeos hablados se oculta al abrirse y vuelve al centro cuando acaban. El ordenador sigue con su número gigante y «Luego: …».
- **Debajo del número, el ejercicio siguiente** (25-11-2026): en el centro del velo, «Empiezas en», la cuenta atrás y debajo el nombre del siguiente ejercicio, del tamaño de «Empiezas en», en una línea con «…» si no cabe (también cuando vuelve al centro tras los hablados).
- **Móvil, del vídeo hablado al ejercicio** (`miniHandoff.ts`, `Stage`; simplificado el 25-11-2026, sin izado): el mini vídeo (69×122) ya es el `<video>` del ejercicio que viene, sobre su mástil que sale del cuerpo del cohete. En los **últimos 2 s** crece despacio hasta 1,25× (sobre su mástil) y espera en su primer fotograma. Al acabar, **el vídeo hablado se funde a negro** (0,4 s; solo la imagen, no el cohete ni la pancarta) y entonces el pequeño **cubre la pantalla** (0,4 s, sin arcos ni rebases) y empieza el ejercicio. Con «Saltar»: fundido de 0,25 s y expansión, sin crecer antes. Como mucho 2 vídeos.
- **Móvil, mientras habla** (25-11-2026, rehecho): el contador es **parte de la pancarta**: al abrirse las nubes se funde, y vuelve cuando la pancarta sale del cohete, como una **pestaña** en su esquina superior derecha (blanca con borde tinta, número en tinta, sale con el mismo rebote); la pancarta ya no repite el tiempo («Descanso» y «Luego: …»). Al acabar los vídeos hablados vuelve al centro. El mini vídeo sale del cohete como la pancarta, 0,2 s después de ella y con el mismo rebote (`PREVIEW_OUT_AFTER_REST_MS`), y en el último segundo espera en su primer fotograma para que al crecer no salte (con «Saltar» sí puede saltar).
- **Vídeo de descanso** (25-11-2026, móvil): en todo descanso largo (tras el calentamiento y entre bloques), cuando no habla un vídeo hablado (sin hablados, o cuando acaban), la pantalla enseña a Marcel descansando, en bucle y sin sonido (`RestLoop` en `Stage`). Los hablados siguen primero. El mini vídeo del ejercicio siguiente, la pestaña del contador y el final (crece los 2 últimos s, fundido a negro, cubre la pantalla) funcionan igual que con un hablado. El motor pone a cada descanso largo su `restClip` (`lib/routine/restClips.ts`), de `Catalog.rests` por turnos (no se repite hasta usarlos todos; `fetchRests()`); **mientras el catálogo no tenga vídeos de descanso** usa un clip de calentamiento (de la rutina, si no cualquiera, si no el siguiente ejercicio). Rutinas guardadas sin `restClip`: lo mismo al reproducir (`restClipOf`). Ordenador: sin cambios.
- **«Descansando…»** (25-11-2026, móvil): arriba, en su propia fila bajo la pastilla del % y «···», grande y en blanco, con tres puntos que parpadean uno tras otro (quietos con movimiento reducido). En todo descanso desde que se abren las nubes; no mientras habla un vídeo hablado.
- **3, 2, 1** (25-11-2026, móvil): los 3 últimos s de un descanso largo (hablado o vídeo de descanso, aunque siga hablando) un 3, 2, 1 enorme en el centro, cada uno entra con un pequeño salto de escala; encima del mini vídeo que crece. Los pitidos son los de siempre (`useCountdownBeep`, ya sonaban en los descansos: uno por segundo, y la pausa los para).
- No se usa la palabra «tutorial» en ningún sitio.

### 1.5 Transiciones
- Las nubes y el cohete **se quedan como ahora**: en cada entrada a un descanso, con el timeline grande y el cohete cada vez más arriba.
- Nubes: las fotos actuales, optimizadas (ver §5). Cohete: redibujado **a línea**, con la llama en rojo como único color.
- El vídeo hablado empieza cuando las nubes se abren, no debajo de ellas.
- **Sin intro**: al pulsar «Empezar» se entra directo al calentamiento. Se eliminan el ítem `summary`, `RoutinePlan` (quesitos) y el mosaico de 4 vídeos.
- Pantalla final: sin 4 vídeos a la vez; usar las miniaturas (§6).

### 1.6 Hilo desde la creación
- En la pantalla de rutina lista (`RoutineComposer`), bajo los minutos, se dibuja el mismo hilo por bloques junto a «3 bloques de 4 series». Es el mismo dibujo que luego vive en la barra.

### 1.6.1 El cohete en el creador (móvil; el ordenador no cambia)
El mismo `RocketShip` está desde la frase hasta el calentamiento (`components/workout/CreatorRocket.tsx`):
- La barra de «¿Qué entrenamos hoy?» es el cuerpo del cohete (escala 1,15): el campo (44 px de alto, 18 px), el micrófono y, en la base del morro, «enviar». Con texto, se le enciende una llamita.
- Al enviar despega (gira el morro y sale por arriba). En cada pregunta espera abajo inclinado 12°, con llamita y temblor suaves; en la de minutos es el botón «Seguir» y en las de opciones solo espera (no hay botón de seguir: las opciones responden). Cada respuesta lo lanza (0,48 s) y el siguiente sube desde abajo (0,3 s).
- En la rutina lista «Empezar» es el cohete. Al tocarlo despega y el del reproductor llega para el calentamiento cuando ese ya ha salido (`rocketHandoff.ts`).
- (Por tramos) En la rutina lista, tras el escaneo, el cohete de la rutina se monta pieza a pieza (cada tramo con sus rayas, la punta y los propulsores si hay calentamiento; ~200 ms entre piezas, cada una con su golpe) y sale la pancarta «Empezar»: ese cohete es el botón (en el móvil sustituye a la línea de rayas), fijo abajo y entero a 320×568, y es el mismo que aterriza en el reproductor.
- Los vuelos son una copia del cohete fuera de React: el toque actúa al momento. Con movimiento reducido no vuela: el siguiente aparece con un fundido.
- (24-11-2026, tras la demo) La barra crece una línea cada vez que el texto la llena (hasta 4; luego scroll dentro), con un «¡pam!» y un temblor; al borrar encoge igual. Las sugerencias salen 3 al azar de un banco local de 50 (`lib/intent/suggestions.ts`, todas las entiende el parser local) y son cohetes pequeños; al tocar una, la barra le lanza un cable, la engancha y despega con ella colgando. En la pregunta de minutos, cuantos más minutos más llama (25-11-2026: mucho más exagerada, de casi nada con 20 min a una llamarada larga con 40, y tiembla cada vez más, en vivo con el deslizador: `waitingEngine`; el cohete «Seguir» queda pegado bajo el deslizador). Al pasar el ratón por un cohete-botón, además de crecer y sacar llama, tiembla un poco. «Empezar» queda fijo abajo para verse entero (la figura se encoge al tener la rutina lista).
- (Segunda demo) Al tocar una sugerencia despega ESE cohetito (sin cable ni remolque); la barra solo despega con texto escrito. Las sugerencias son una lista con scroll propio (9 al azar, con desvanecido en los bordes) y a su derecha un cohete «Random» de pie que despega con una frase al azar. La barra crece hasta 3 líneas y su punta se alarga con el grosor (1,8 grosores). En las preguntas de opciones cada opción es un cohete (el que se toca despega) y ya no hay cohete de adorno; «Seguir» de los minutos sigue igual. «Empezar» va fijo abajo y el contenido se desplaza por encima.

### 1.7 Ordenador
- **Se mantiene la pizarra** (fondo de pizarra con viñeta, bombilla colgando con su parpadeo, lo escrito con tiza, el marco que gira alrededor del vídeo, la barra abajo en el centro y el «···» arriba a la derecha). Se probó quitarla (24-11-2026) y Marcel pidió volver a ella: «había perdido todo su encanto».
- Único cambio sobre la pizarra de antes (decidido por Marcel, 24-11-2026): el vídeo 9:16 va **centrado y tan alto como deja la barra** de abajo (antes iba a la izquierda con márgenes grandes arriba y abajo). La pizarra se escribe a los dos lados: la rutina a la izquierda y el reloj de tiza a la derecha, con la bombilla encima del reloj.
- Los descansos cortos llevan también aquí el velo oscuro y la cuenta atrás gigante sobre el vídeo; el marco del descanso es el anillo azul que gira alrededor del vídeo (el marco azul de pantalla completa es solo del móvil).
- Desde 1024 px de ancho (`lg`); por debajo, la disposición del móvil.
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
- **Sin sonidos de reparación** (25-11-2026): se quitan `hammer`, `ratchet` y `puff` (el golpe agudo del martillo se confundía con el 3-2-1 y no aportaban nada sobre la música) y la receta sin uso `engineRumble`. Los mecánicos trabajan en silencio; el «¡pam!» al caer de los caballetes se queda.

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
4. ~~Confirmar el supuesto de §1.7~~: decidido (se mantiene la pizarra, con el vídeo centrado y más alto).

## Anexo — música candidata (≈56 min, comprobada el 24-11-2026)

Todas sin aviso de «Content ID Registered» en su página ese día; puede cambiar. Guardar captura de la página al descargar. No es asesoramiento legal.

**Pixabay (Pixabay Content License), autor Kulakovka** — base `https://pixabay.com/music/`:
`electronic-gym-motivation-620569/` · `action-workout-620537/` · `action-gyms-620583/` · `electronic-adrenaline-sport-620584/` · `electronic-active-sport-618585/` · `video-games-action-game-620581/` · `phonk-phonk-reel-614877/` · `phonk-danger-music-620575/` · `beats-rage-beat-620530/` · `trap-agressive-trap-571173/` · `beats-hip-hop-power-614899/` · `synthwave-cyberpunk-music-624631/` · `synthwave-dark-synthwave-624644/`

**Free Music Archive (CC0), autor HoliznaCC0** — base `https://freemusicarchive.org/music/holiznacc0/`:
`left-overs/movement-1/` · `phonk-aura-farming/re-adusjtment/` · `phonk-aura-farming/pantheon/` · `phonk-aura-farming/phonk-remix/` · `phonk-aura-farming/phonk-ish/` · `after-dark/childs-play-1/` · `after-dark/serial-1/` · `after-dark/skill-test/` · `after-dark/wolf-1/`

El research completo encontró 83 pistas (4 h 26 min). Unas 28 de las de Pixabay están marcadas como generadas con IA y cuatro duran más de 11 min; se han dejado fuera de esta lista corta.
