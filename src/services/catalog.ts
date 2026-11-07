import { catalogSchema, type Story } from '../schema';
import type { Env } from '../env';
let cache: { bucket: R2Bucket; key: string; expires: number; data: Story[] } | undefined;
let pending: { bucket: R2Bucket; key: string; promise: Promise<Story[]> } | undefined;
export async function getCatalog(env: Env): Promise<Story[]> {
  const key = env.CATALOG_KEY;
  if (cache && cache.bucket === env.CONTENT && cache.key === key && cache.expires > Date.now()) return cache.data;
  if (pending && pending.bucket === env.CONTENT && pending.key === key) return pending.promise;
  const promise = (async () => {
    const obj = await env.CONTENT.get(key);
    if (!obj) throw new Error('Catálogo no disponible');
    const data = catalogSchema.parse(await obj.json());
    const ttl = Number(env.CATALOG_TTL_SECONDS ?? 300);
    cache = { bucket: env.CONTENT, key, data, expires: Date.now() + (Number.isFinite(ttl) && ttl >= 0 ? ttl : 300) * 1000 };
    return data;
  })();
  pending = { bucket: env.CONTENT, key, promise };
  try { return await promise; } finally { if (pending?.promise === promise) pending = undefined; }
}
export async function publishedStory(env: Env, id: number) { return (await getCatalog(env)).find(s => s.id === id && s.status === 'published'); }
