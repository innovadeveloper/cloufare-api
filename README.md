# Entre páginas — API

API REST para Flutter con Workers y Hono. R2 privado contiene catálogo y capítulos; D1 guarda únicamente votos y sus estadísticas. No se necesitan servidores Node en producción.

## Requisitos y desarrollo local

Node.js 22, npm y Wrangler (incluido como dependencia). Los recursos locales residen en `.wrangler/`, separados de los remotos.

```bash
npm ci
npm run db:migrate:local
npm run catalog:validate
npm run catalog:upload -- --local
cp .dev.vars.example .dev.vars
npm run dev
```

Configura en `.dev.vars` el ID de cliente OAuth de Google que figure como audiencia (`aud`) de los ID tokens de Flutter. El archivo no se sube a Git. El catálogo de prueba incluye cinco historias con dos capítulos simples; no incluye imágenes reales.

```bash
npm run typecheck
npm test
npm run test:coverage
npm run build  # dry-run: no publica
```

## API

- `GET /api/health`
- `GET /api/stories?page=1&limit=20&genre=misterio&search=casa&sort=newest`
- `GET /api/stories/101`
- `GET /api/stories/101/chapters/1`
- `GET`, `PUT`, `DELETE /api/stories/101/rating` requieren `Authorization: Bearer <ID_TOKEN_GOOGLE>`. PUT recibe `{"rating": 5}`.

Solo se muestran historias publicadas. La página tiene como máximo 20 elementos. Órdenes: `newest`, `oldest`, `title_asc`, `title_desc`, `rating_asc` y `rating_desc`. Los títulos sin votos van al final en ambos órdenes por rating; los empates se resuelven por ID. El orden por rating consulta todos los candidatos en lotes de hasta 100 IDs antes de paginar: su costo aumenta con el catálogo y está sujeto al límite de subsolicitudes de Workers. Para catálogos grandes hay que rediseñar este índice.

Cada capítulo tiene `id`, `title`, `text` y `choices`, una lista de `{text, nextChapterId}`. Un array vacío representa un final. La validación local exige capítulos consecutivos desde 1 y verifica sus destinos. Los IDs de historias no se deben reutilizar, incluso al borrar contenido: los votos quedarían asociados al ID anterior.

## Identidad y seguridad

El cliente envía un ID token de Google por HTTPS. La API valida firma con claves públicas rotativas de Google, emisor, audiencia y caducidad; guarda `google:<sub>` como lector. No se acepta un ID de usuario enviado sin verificar. Apple y Facebook no están integrados: agregar otro proveedor requiere verificar sus propios tokens y definir vinculación de cuentas para que no duplique votos. Google Client ID no es un secreto, pero debe corresponder a la audiencia real emitida para la app. La API deniega votos si no está configurado.

La limitación de 20 escrituras por minuto y lector usa el binding Rate Limiting de Cloudflare. Es aproximada, por ubicación, y no impide abuso con muchas cuentas. No hay moderación ni garantías contra granjas de cuentas. Los endpoints de rating devuelven `private, no-store`; los públicos permiten caché de 30–60 segundos. El catálogo se mantiene hasta cinco minutos en memoria de cada isolate; estos no comparten memoria ni actualización inmediata. D1 calcula el promedio a partir de suma y contador. Los triggers son atómicos con el cambio del voto.

## Bucket e imágenes

Recomendación actual: mantener `CONTENT` privado, sin `r2.dev` público; el Worker accede al catálogo y los capítulos por binding. El acceso público de capítulos a través del endpoint es intencional. Para imágenes de producción, usar un segundo bucket exclusivo para archivos públicos y conectarlo a un dominio propio bajo Cloudflare; no incluir datos privados ni borradores en ese bucket. `coverKey` aún no es una URL funcional y no hay imágenes incluidas: es deuda pendiente hasta decidir dominio y cargar portadas. `r2.dev` tiene límites y está pensado solo para desarrollo. El dominio puede tener su propio costo; tanto R2 como Workers tienen cuotas, así que no se garantiza costo cero.

## Preparación remota (requiere autorización)

1. Autenticar con `npx wrangler login` o usar un token de API de alcance mínimo.
2. Crear el bucket `npx wrangler r2 bucket create entre-paginas-content` y la base `npx wrangler d1 create entre-paginas-ratings`.
3. Sustituir `database_id: local-only` en `wrangler.jsonc` por el ID devuelto, y configurar `GOOGLE_CLIENT_ID` en las variables del Worker. Nunca guardar tokens en Git.
4. Con la autorización correspondiente: `npm run db:migrate:remote`, `npm run catalog:validate`, `npm run catalog:upload -- --remote`, `npm run deploy`.
5. Consultar logs con `npx wrangler tail`.

Para desarrollo y producción remotos, crear recursos separados y configurar entornos de Wrangler con sus propios bindings y variables; aún no están configurados. No usar los comandos remotos contra el entorno equivocado. La carga del catálogo es independiente del despliegue del Worker y sube capítulos antes que el catálogo; no elimina objetos antiguos ni proporciona una publicación atómica de múltiples archivos.

## CI/CD

Un pipeline puede instalar con `npm ci`, validar, comprobar tipos y probar antes de desplegar. Guardar `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` como variables protegidas del proveedor CI. El pipeline de API ejecutaría migraciones autorizadas y `npm run deploy`; otro independiente validaría y cargaría el contenido con `npm run catalog:upload -- --remote`. No se ha configurado un pipeline ni se han creado recursos remotos.

## Límites y deuda

D1 Free tiene límites diarios de filas leídas y escritas; al agotarlos las consultas fallan hasta su reinicio. R2 Standard tiene cuotas gratuitas de almacenamiento y operaciones. Revisar precios y métricas de Cloudflare antes de publicar. Los datos de contenido son ejemplos; faltan portadas, pruebas de autenticación con tokens reales y pruebas adicionales de concurrencia, errores y carga. Un despliegue real requiere confirmar recursos, dominios, ID de cliente y estrategia de publicación.
