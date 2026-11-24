# Mudanza de Supabase a Bunny

Desde ahora la app no usa Supabase: los vídeos, las miniaturas, la música **y los datos** viven en Bunny. Los datos son un único archivo, el **catálogo**: `catalog/catalog.json`.

## 1. Preparar Bunny (una vez)

1. **Storage → Add Storage Zone** (región principal en Europa). En la zona, **Access** muestra:
   - **API Endpoint** → `BUNNY_STORAGE_HOST` (Frankfurt = `storage.bunnycdn.com`; otra región tiene otro host y, si no coincide, Bunny responde 401).
   - **Password** (la de lectura y escritura, no la de solo lectura ni la API key de la cuenta) → `BUNNY_STORAGE_KEY`.
   - El nombre de la zona → `BUNNY_STORAGE_ZONE`.
2. Conecta una **Pull Zone** a esa zona. Su URL (`https://<nombre>.b-cdn.net`) → `NEXT_PUBLIC_MEDIA_BASE_URL`.
3. En la pull zone, **Edge Rules → Add Edge Rule**: acción *Override Cache Time* = `60`, condición *File Extension* = `json`. Así el catálogo nunca se queda en la caché más de un minuto. Activa también las cabeceras CORS para `json`, `m4a`, `mp4` y `webp` (la música se lee con Web Audio).
4. Pon las cuatro variables en `.env.local` (nunca en Git ni en Vercel, salvo `NEXT_PUBLIC_MEDIA_BASE_URL`, que es pública).

> Tras guardar algo en el Estudio, la app pública puede tardar **hasta un minuto** en verlo (la caché del CDN). El Estudio no: lee el catálogo directamente del almacenamiento, nunca del CDN.

## 2. Probar sin Bunny

Sin las variables `BUNNY_STORAGE_*` y con `npm run dev`, el Estudio guarda todo en la carpeta `.media/` del proyecto (ignorada por Git) y lo sirve en `/dev-media`. Deja `NEXT_PUBLIC_MEDIA_BASE_URL` vacía o pon `/dev-media`. En producción sin Bunny, el Estudio da un error claro.

## 3. Mudar los vídeos existentes

Necesitas `ffmpeg` y `ffprobe` en el PATH y la copia descargada de Supabase:

```
<copia>/workout-videos/videos/*.mp4      vídeos (nombre = el de la URL antigua)
<copia>/workout-videos/thumbs/<id>.webp  miniaturas antiguas (solo se informa de ellas)
<copia>/db_cluster-….backup              volcado SQL en texto (también vale .sql o .gz)
```

1. **Simulación** (no sube nada; dice qué fila casa con qué vídeo, qué vídeos sobran y qué filas no tienen vídeo):
   ```
   node scripts/migrate-media.mjs --backup "C:\ruta\a\la\copia" --dry-run
   ```
2. **Ensayo en disco** (opcional): añade `--to-local` en lugar de las variables de Bunny y abre el Estudio con `npm run dev`.
3. **De verdad**, con las variables de Bunny en el entorno de esa terminal (el script no lee `.env.local`):
   ```
   node scripts/migrate-media.mjs --backup "C:\ruta\a\la\copia"
   ```
   Por cada ejercicio sube el original (misma ruta que en Supabase), la versión ligera (720 px) y una miniatura nueva sacada de la mitad del clip, y al final escribe `catalog/catalog.json` con todos los ejercicios y `music: []`.

Si algo falla, vuelve a lanzar el mismo comando: lo ya subido se salta y el catálogo solo se escribe cuando todo ha ido bien. Si ya existe un catálogo con ejercicios no se toca, salvo con `--overwrite-catalog` (guarda antes una copia en `catalog/backups/`). El informe queda en `scripts/migrate-media.out/` (ignorada por Git).

Lo que el script supone: las filas salen del bloque `COPY public.exercises (…) FROM stdin;` (lee los nombres de columna de esa línea); cada fila se empareja con su vídeo por la ruta de `video_url` y, si no, por el nombre del archivo; los vídeos sin fila no se suben. Un volcado en formato personalizado (empieza por `PGDMP`) hay que convertirlo antes con `pg_restore -f volcado.sql`.

Después de comprobar la app con Bunny, ya se puede vaciar el bucket de Supabase.

## 4. El catálogo

```json
{
  "version": 1,
  "updatedAt": "2026-11-24T10:15:30.123Z",
  "exercises": [ { "id": "…", "title": "…", "type": "workout", "video_url": "…", "video_lite_url": "…",
                   "poster_url": "…", "muscle": "…", "muscles": [ … ], "difficulty": 7,
                   "duration_seconds": 58, "equipment": "ninguno", "talks": [ … ] } ],
  "music": [ { "id": "…", "title": "…", "artist": "…", "source_url": "…", "license": "…",
               "audio_url": "…", "duration_seconds": 180, "enabled": true } ]
}
```

Tipos en `types/catalog.ts`. Solo escribe el Estudio: el archivo entero cada vez, guardando antes una copia fechada en `catalog/backups/` (se conservan las 20 últimas). Para deshacer un error, copia una de esas copias encima de `catalog/catalog.json` desde el panel de Bunny.
