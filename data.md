# Proyecto: Backend API de Entre páginas con Cloudflare Workers, R2 y D1

Actúa como un ingeniero senior de backend, especializado en TypeScript, Cloudflare Workers, Cloudflare R2, Cloudflare D1, SQLite, Hono, Wrangler CLI y prácticas DevOps.

Necesito que implementes desde cero una API REST para mi aplicación móvil Flutter llamada **Entre páginas**, una plataforma de historias interactivas donde los lectores exploran historias, leen capítulos, toman decisiones y califican historias de 1 a 5 estrellas.

Trabaja directamente sobre el repositorio local abierto en Codex. Puedes crear archivos, instalar dependencias y ejecutar comandos de desarrollo y pruebas. Antes de ejecutar operaciones remotas, modificar recursos existentes de Cloudflare o realizar despliegues, solicita mi confirmación.

## 1. Objetivo de arquitectura

Implementar una solución serverless, modular y de bajo costo, priorizando los límites gratuitos de Cloudflare.

Tecnologías obligatorias:

- TypeScript con modo estricto.
- Cloudflare Workers como runtime de la API.
- Hono como framework HTTP.
- Cloudflare R2 para catálogo JSON, metadatos, capítulos e imágenes.
- Cloudflare D1 (SQLite) exclusivamente para valoraciones.
- Wrangler CLI para desarrollo local, migraciones y despliegues.
- Vitest con herramientas de pruebas compatibles con Workers.
- npm como gestor de paquetes.

No utilizar Node.js como servidor HTTP en producción, Express, NestJS, PostgreSQL, MySQL, Prisma, Redis, Docker ni Kubernetes.

Utilizar únicamente APIs compatibles con el runtime de Cloudflare Workers.

Consultar la documentación oficial actualizada cuando existan dudas sobre comandos, configuraciones o límites del runtime.

## 2. Organización del repositorio

Proponer e implementar una estructura modular similar a:

```text
entre-paginas-api/
├── src/
│   ├── index.ts
│   ├── env.ts
│   ├── routes/
│   │   ├── health.routes.ts
│   │   ├── stories.routes.ts
│   │   └── ratings.routes.ts
│   ├── services/
│   │   ├── catalog.service.ts
│   │   └── ratings.service.ts
│   ├── repositories/
│   │   └── ratings.repository.ts
│   ├── middleware/
│   │   └── error.middleware.ts
│   ├── schemas/
│   │   ├── catalog.schema.ts
│   │   └── rating.schema.ts
│   └── types/
│       └── story.ts
├── content/
│   └── sample/
│       ├── catalog.json
│       └── stories/
├── migrations/
│   └── 0001_create_ratings.sql
├── scripts/
│   ├── validate-catalog.ts
│   └── upload-content.ts
├── tests/
├── wrangler.jsonc
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── .dev.vars.example
└── README.md
```

Puedes ajustar la estructura si existe una razón técnica, pero mantén separación entre rutas, lógica de negocio y acceso a datos.

## 3. Configuración de Cloudflare

Preparar `wrangler.jsonc` con:

- Nombre del Worker: `entre-paginas-api`.
- Binding R2: `CONTENT`.
- Binding D1: `DB`.
- Variable `CATALOG_KEY` con valor `catalog/catalog.json`.
- Fecha de compatibilidad vigente.
- Configuración de observabilidad.
- Preparación para entornos de desarrollo y producción.

No inventar IDs reales de bases D1, Account IDs, API Tokens ni credenciales.

Crear una configuración funcional para desarrollo local y documentar cómo completar los identificadores reales para producción.

Utilizar Wrangler CLI para:

1. Crear el proyecto.
2. Ejecutar el Worker localmente.
3. Crear el bucket R2 remoto cuando lo autorice.
4. Crear la base D1 remota cuando lo autorice.
5. Aplicar migraciones locales.
6. Subir archivos a R2.
7. Ejecutar pruebas.
8. Desplegar a Cloudflare cuando lo autorice.

No ejecutar operaciones destructivas sobre recursos remotos existentes.

## 4. Modelo del catálogo JSON

El catálogo no debe almacenarse en D1.

Cada historia debe disponer de metadatos como:

```json
{
  "id": 101,
  "slug": "la-casa-de-la-niebla",
  "title": "La casa de la niebla",
  "description": "Una historia interactiva de misterio.",
  "genres": ["misterio", "suspenso"],
  "coverKey": "stories/101/cover.webp",
  "status": "published",
  "publishedAt": "2026-11-01T00:00:00Z",
  "chapterCount": 5,
  "tags": ["misterio", "decisiones"]
}
```

Crear cinco historias ficticias para desarrollo y pruebas.

El catálogo global se almacenará en R2:

`catalog/catalog.json`

Los capítulos se almacenarán individualmente en R2:

`stories/{storyId}/chapters/{chapterId}.json`

Las portadas e ilustraciones se almacenarán como objetos R2.

Los IDs numéricos de historias deben ser estables y no depender de su posición en el catálogo.

El catálogo debe poder actualizarse en R2 sin necesidad de redesplegar el Worker.

Implementar validación del catálogo con un esquema tipado, utilizando Zod si resulta apropiado.

## 5. Endpoints del catálogo

Implementar:

### GET /api/health

Devuelve el estado básico de la API.

### GET /api/stories

Soportar los siguientes parámetros:

- `page`: página, comenzando en 1.
- `limit`: cantidad de resultados, máximo 50.
- `search`: búsqueda por título, descripción y etiquetas.
- `genre`: filtro por género.
- `status`: filtrar historias publicadas.
- `sort`: `newest`, `oldest`, `title_asc`, `title_desc`, `rating_desc`, `rating_asc`.

Aplicar filtros sobre los metadatos del catálogo JSON.

Para ordenamientos basados en metadatos, filtrar, ordenar y paginar antes de consultar los ratings de las historias visibles.

Para ordenamientos por rating, recuperar primero las estadísticas de todas las historias candidatas, combinar resultados, ordenar y finalmente paginar.

La respuesta debe incluir:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 500,
    "totalPages": 25
  }
}
```

Cada historia debe incluir `ratingAverage` y `ratingCount`.

Las historias sin votos deben devolver `ratingAverage: null` y `ratingCount: 0`.

### GET /api/stories/:id

Devuelve los metadatos de una historia y sus estadísticas de valoración.

### GET /api/stories/:id/chapters/:chapterId

Lee desde R2 el JSON del capítulo correspondiente.

Validar que la historia y el capítulo existan, y que las rutas no permitan acceder a objetos arbitrarios del bucket.

No implementar todavía monetización, desbloqueos por anuncios ni autenticación de usuarios.

## 6. Diseño de D1 para valoraciones

Implementar dos tablas:

### story_ratings

- `story_id`: INTEGER, NOT NULL.
- `reader_id`: TEXT, NOT NULL.
- `rating`: INTEGER, NOT NULL, CHECK entre 1 y 5.
- `created_at`: TEXT, NOT NULL.
- `updated_at`: TEXT, NOT NULL.

Clave primaria compuesta:

`(story_id, reader_id)`

Evaluar y utilizar `WITHOUT ROWID` si resulta conveniente para reducir almacenamiento.

### story_rating_stats

- `story_id`: INTEGER, PRIMARY KEY.
- `rating_sum`: INTEGER, NOT NULL, DEFAULT 0.
- `rating_count`: INTEGER, NOT NULL, DEFAULT 0.

No almacenar el promedio como columna persistente.

Calcularlo como:

`rating_sum / rating_count`

Controlar división entre cero.

## 7. Triggers SQLite

Crear migraciones SQL que definan:

**AFTER INSERT**

Cuando se inserte una valoración nueva:

- Incrementar `rating_sum` con la puntuación recibida.
- Incrementar `rating_count` en 1.
- Crear el registro de estadísticas si no existe.

**AFTER UPDATE OF rating**

Cuando un lector modifica su valoración:

- Restar la puntuación anterior.
- Sumar la nueva.
- No modificar `rating_count`.
- No hacer nada cuando la puntuación sea idéntica.

**AFTER DELETE**

Cuando se elimina una valoración:

- Restar la puntuación anterior.
- Disminuir `rating_count` en 1.
- Mantener los contadores consistentes.

**Protección de claves**

Evitar modificaciones de `story_id` y `reader_id` en un registro existente.

Asegurar que los triggers sean compatibles con Cloudflare D1 y que sus operaciones sean atómicas.

No recalcular `AVG()` leyendo todos los votos después de cada inserción.

## 8. Registro de valoraciones mediante UPSERT

Implementar:

### PUT /api/stories/:id/rating

La aplicación Flutter enviará una puntuación y un identificador anónimo de lector.

El Worker debe ejecutar un único UPSERT:

```sql
INSERT INTO story_ratings (
    story_id,
    reader_id,
    rating
)
VALUES (?, ?, ?)
ON CONFLICT(story_id, reader_id)
DO UPDATE SET
    rating = excluded.rating,
    updated_at = CURRENT_TIMESTAMP
WHERE story_ratings.rating <> excluded.rating;
```

La aplicación no necesita decidir entre INSERT y UPDATE.

El motor SQLite debe determinar la operación correspondiente y ejecutar los triggers automáticamente.

Validaciones obligatorias:

- La historia debe existir en el catálogo.
- La historia debe estar publicada.
- `rating` debe ser un entero entre 1 y 5.
- `reader_id` debe tener un formato y longitud válidos.
- Utilizar consultas preparadas.
- No concatenar valores del usuario directamente al SQL.
- Evitar escrituras innecesarias cuando se repite la misma puntuación.

Documentar expresamente que `reader_id` es un identificador de instalación, no una autenticación confiable.

No implementar mecanismos ficticios de seguridad que dependan de secretos embebidos en Flutter.

Agregar una protección básica contra abuso y documentar sus limitaciones y cualquier dependencia adicional de Cloudflare.

### GET /api/stories/:id/rating

Devolver:

```json
{
  "storyId": 101,
  "average": 4.5,
  "count": 3000,
  "myRating": 4
}
```

`myRating` debe ser `null` cuando el lector no tenga una valoración registrada.

La respuesta personalizada no debe almacenarse en caché pública.

### DELETE /api/stories/:id/rating

Permitir eliminar la valoración existente del lector.

El trigger debe actualizar las estadísticas.

## 9. Acceso a D1 y optimización

Implementar un repositorio de datos que utilice los bindings de D1.

Para el listado del catálogo:

- Obtener los IDs de las historias seleccionadas.
- Ejecutar una única consulta `SELECT ... WHERE story_id IN (...)`.
- No ejecutar una consulta SQL individual por cada historia.
- Combinar los resultados de D1 con los metadatos JSON.

Para ordenar por valoración, consultar las estadísticas de todas las historias candidatas antes de paginar.

Evitar consultas `AVG()` sobre `story_ratings` en los endpoints públicos.

Registrar en desarrollo:

- `meta.rows_read`.
- `meta.rows_written`.
- Duración de consultas.

Incluir pruebas con `EXPLAIN QUERY PLAN` para verificar el uso de índices.

## 10. Estrategia de caché

Implementar una estrategia sencilla y segura:

**Catálogo JSON**

- Origen: R2.
- Caché en memoria del isolate con TTL configurable de 5 minutos.
- Evitar solicitudes concurrentes duplicadas a R2 mediante una promesa compartida.
- No asumir que la memoria es persistente o compartida entre isolates.
- Documentar que una actualización en R2 puede tardar hasta el TTL en reflejarse.

**Ratings agregados**

- Permitir caché pública corta, de aproximadamente 30–60 segundos, cuando corresponda.
- No cachear información personalizada del lector.
- No cachear operaciones PUT o DELETE.
- Después de votar, devolver estadísticas actualizadas desde D1.

**Imágenes**

- Preparar una estrategia para servir imágenes públicas mediante R2 y un dominio personalizado o URL pública controlada.
- No exponer credenciales.
- No implementar un proxy de imágenes innecesario.

No agregar Workers KV, Durable Objects ni Redis para este MVP.

## 11. Pruebas automatizadas

Crear pruebas que verifiquen:

1. Un lector puede votar por primera vez.
2. El trigger incrementa correctamente suma y contador.
3. Un lector puede modificar su voto.
4. El contador no aumenta al modificar un voto.
5. Enviar la misma puntuación no modifica las estadísticas.
6. Un lector no puede generar votos duplicados con el mismo `reader_id`.
7. La puntuación solo puede estar entre 1 y 5.
8. Un voto puede eliminarse correctamente.
9. El promedio se calcula correctamente.
10. Una historia sin votos devuelve `null` y contador cero.
11. El catálogo se filtra correctamente por género.
12. La paginación devuelve el total correcto.
13. El ordenamiento por rating se realiza antes de paginar.
14. Una historia inexistente no acepta votos.
15. El catálogo no realiza una consulta D1 por cada tarjeta.
16. Las operaciones concurrentes no dejan desincronizados los acumulados.

Utilizar un entorno de pruebas compatible con Cloudflare Workers y D1 local.

## 12. Scripts npm

Preparar comandos similares a:

```bash
npm run dev
npm run build
npm run typecheck
npm run test
npm run test:coverage
npm run db:migrate:local
npm run db:migrate:remote
npm run catalog:validate
npm run catalog:upload
npm run deploy
```

Verificar que cada comando funcione realmente.

No crear scripts de relleno que aparenten funcionar sin ejecutar la operación correspondiente.

## 13. Documentación

Crear un README en español que incluya:

- Arquitectura general.
- Requisitos previos.
- Instalación de dependencias.
- Autenticación con Cloudflare.
- Creación de R2.
- Creación de D1.
- Configuración de bindings.
- Ejecución local.
- Migraciones.
- Carga del catálogo JSON.
- Ejemplos de llamadas HTTP con curl.
- Ejecución de pruebas.
- Despliegue.
- Consulta de logs.
- Consideraciones de seguridad.
- Límites gratuitos y recomendaciones de optimización.
- Separación entre recursos locales y remotos.

Incluir un archivo de ejemplos de solicitudes HTTP o una colección equivalente que pueda importarse fácilmente en un cliente REST.

## 14. Preparación para CI/CD

Dejar preparado el proyecto para despliegues automatizados mediante GitLab CI, Jenkins o GitHub Actions.

No es necesario implementar los tres pipelines inicialmente.

Documentar cómo utilizar:

- `CLOUDFLARE_API_TOKEN`.
- `CLOUDFLARE_ACCOUNT_ID`.
- Wrangler CLI.
- Migraciones D1.
- Despliegue del Worker.
- Sincronización de contenido R2.

No guardar secretos en Git.

Separar conceptualmente el pipeline de la API y el pipeline del catálogo de historias.

## 15. Forma de trabajo

Trabaja por fases:

**Fase 1 — Inicialización**

Inspecciona el repositorio, prepara el proyecto, instala dependencias y configura Wrangler.

**Fase 2 — Infraestructura local**

Configura bindings R2 y D1 locales y verifica su funcionamiento.

**Fase 3 — Catálogo**

Implementa el JSON de ejemplo, validación, servicio R2, filtros y paginación.

**Fase 4 — Valoraciones**

Implementa las migraciones, triggers, UPSERT, consultas agregadas y endpoints.

**Fase 5 — Caché y optimización**

Agrega TTL, consultas por lotes, métricas y manejo de errores.

**Fase 6 — Pruebas**

Ejecuta tests, typecheck y corrige los errores detectados.

**Fase 7 — Despliegue**

Documenta y prepara el despliegue remoto, pero solicita mi autorización antes de crear recursos remotos o publicar.

No detengas la implementación entre fases locales si no hay bloqueos reales.

Al terminar, presenta:

1. Resumen de lo implementado.
2. Estructura final del repositorio.
3. Endpoints disponibles.
4. Comandos para ejecutar localmente.
5. Resultado de pruebas y validaciones.
6. Recursos de Cloudflare pendientes de crear.
7. Limitaciones conocidas.
8. Siguientes pasos para conectar Flutter.

**Prioridades finales:** simplicidad, costo cercano a US$0, consistencia de las valoraciones, buen uso de índices SQL, bajo consumo de D1 y facilidad de mantenimiento.
