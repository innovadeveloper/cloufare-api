import { Hono } from 'hono';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import type { Env } from './env';
import { chapterSchema } from './schema';
import { getCatalog, publishedStory } from './services/catalog';
import { stats, emptyStat, putRating, deleteRating, myRating } from './repositories/ratings';

const app = new Hono<{ Bindings: Env }>();
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const noStore = 'private, no-store';
const idFrom = (value: string) => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
app.onError((err, c) => { console.error(err); c.header('Cache-Control', 'no-store'); return c.json({ error: 'Error interno del servicio' }, 500); });
app.get('/api/health', c => c.json({ status: 'ok' }));
app.get('/api/stories', async c => {
  const q = c.req.query();
  const valid = z.object({ page: z.coerce.number().int().min(1).max(1000000).default(1), limit: z.coerce.number().int().min(1).max(20).default(20), search: z.string().max(200).optional(), genre: z.string().max(100).optional(), status: z.literal('published').optional(), sort: z.enum(['newest','oldest','title_asc','title_desc','rating_desc','rating_asc']).default('newest') }).safeParse(q);
  if (!valid.success) return c.json({ error: 'Parámetros inválidos' }, 400);
  const { page, limit, search, genre, sort } = valid.data;
  const normalize = (s: string) => s.toLocaleLowerCase('es');
  let stories = (await getCatalog(c.env)).filter(s => s.status === 'published' && (!genre || s.genres.some(g => normalize(g) === normalize(genre))) && (!search || normalize([s.title, s.description, ...s.tags].join(' ')).includes(normalize(search))));
  const total = stories.length;
  const order = (a: number, b: number) => a - b;
  let values: Awaited<ReturnType<typeof stats>>;
  if (sort.startsWith('rating_')) {
    values = await stats(c.env, stories.map(s => s.id));
    stories.sort((a,b) => { const x = values.get(a.id)?.ratingAverage ?? null, y = values.get(b.id)?.ratingAverage ?? null; if (x === null || y === null) return x === y ? order(a.id,b.id) : x === null ? 1 : -1; return (sort === 'rating_asc' ? x-y : y-x) || order(a.id,b.id); });
    stories = stories.slice((page-1)*limit, page*limit);
  } else {
    stories.sort((a,b) => { const cmp = sort.startsWith('title_') ? a.title.localeCompare(b.title, 'es') : Date.parse(a.publishedAt) - Date.parse(b.publishedAt); return (sort === 'newest' || sort === 'title_desc' ? -cmp : cmp) || order(a.id,b.id); });
    stories = stories.slice((page-1)*limit, page*limit);
    values = await stats(c.env, stories.map(s => s.id));
  }
  c.header('Cache-Control', 'public, max-age=30');
  return c.json({ data: stories.map(s => ({ ...s, ...(values.get(s.id) ?? emptyStat) })), pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
});
app.get('/api/stories/:id', async c => {
  const id = idFrom(c.req.param('id')); if (!id) return c.json({ error: 'ID inválido' }, 400);
  const story = await publishedStory(c.env,id); if (!story) return c.json({ error: 'Historia no encontrada' }, 404);
  const values = await stats(c.env,[id]); c.header('Cache-Control','public, max-age=30');
  return c.json({ ...story, ...(values.get(id) ?? emptyStat) });
});
app.get('/api/stories/:id/chapters/:chapterId', async c => {
  const id = idFrom(c.req.param('id')); const chapterId = c.req.param('chapterId');
  if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(chapterId)) return c.json({ error: 'ID inválido' }, 400);
  if (!await publishedStory(c.env,id)) return c.json({ error: 'Historia no encontrada' }, 404);
  const obj = await c.env.CONTENT.get(`stories/${id}/chapters/${chapterId}.json`); if (!obj) return c.json({ error: 'Capítulo no encontrado' }, 404);
  const chapter = chapterSchema.parse(await obj.json()); if (chapter.id !== chapterId) throw new Error('ID de capítulo inconsistente');
  c.header('Cache-Control','public, max-age=60'); return c.json(chapter);
});
app.use('/api/stories/:id/rating', async (c,next) => {
  c.header('Cache-Control', noStore);
  if (!c.env.GOOGLE_CLIENT_ID) return c.json({ error: 'Autenticación no configurada' }, 503);
  const auth = c.req.header('Authorization'); if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Token requerido' }, 401);
  try {
    const { payload } = await jwtVerify(auth.slice(7), keys, { issuer: ['accounts.google.com', 'https://accounts.google.com'], audience: c.env.GOOGLE_CLIENT_ID, algorithms: ['RS256'], requiredClaims: ['sub','exp'] });
    if (!payload.sub || payload.sub.length > 255) return c.json({ error: 'Token inválido' }, 401);
    c.set('reader' as never, `google:${payload.sub}` as never);
  } catch { return c.json({ error: 'Token inválido' }, 401); }
  await next();
});
app.on(['GET','PUT','DELETE'], '/api/stories/:id/rating', async c => {
  const id = idFrom(c.req.param('id')); if (!id) return c.json({ error: 'ID inválido' }, 400);
  const reader = c.get('reader' as never) as string;
  if (c.req.method !== 'GET') {
    const result = await c.env.RATING_LIMITER.limit({ key: reader });
    if (!result.success) return c.json({ error: 'Demasiadas solicitudes' }, 429);
  }
  if (!await publishedStory(c.env,id)) return c.json({ error: 'Historia no encontrada' }, 404);
  if (c.req.method === 'PUT') {
    let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: 'JSON inválido' },400); }
    const parsed = z.object({ rating: z.number().int().min(1).max(5) }).safeParse(body);
    if (!parsed.success) return c.json({ error: 'Valoración inválida' },400);
    await putRating(c.env,id,reader,parsed.data.rating);
  } else if (c.req.method === 'DELETE') await deleteRating(c.env,id,reader);
  const values = (await stats(c.env,[id])).get(id) ?? emptyStat;
  return c.json({ storyId:id, average:values.ratingAverage, count:values.ratingCount, myRating: await myRating(c.env,id,reader) });
});
export default app;
