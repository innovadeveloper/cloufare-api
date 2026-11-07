import type { Env } from '../env';
type Stat = { story_id: number; rating_sum: number; rating_count: number };
export async function stats(env: Env, ids: number[]) {
  const result = new Map<number, { ratingAverage: number | null; ratingCount: number }>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const query = await env.DB.prepare(`SELECT story_id, rating_sum, rating_count FROM story_rating_stats WHERE story_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<Stat>();
    if (env.ENVIRONMENT === 'development') console.log('D1 stats', query.meta);
    for (const s of query.results) result.set(s.story_id, { ratingAverage: s.rating_count ? s.rating_sum / s.rating_count : null, ratingCount: s.rating_count });
  }
  return result;
}
export const emptyStat = { ratingAverage: null, ratingCount: 0 };
export async function putRating(env: Env, id: number, reader: string, rating: number) {
  const result = await env.DB.prepare(`INSERT INTO story_ratings (story_id, reader_id, rating) VALUES (?, ?, ?) ON CONFLICT(story_id, reader_id) DO UPDATE SET rating = excluded.rating, updated_at = CURRENT_TIMESTAMP WHERE story_ratings.rating <> excluded.rating`).bind(id, reader, rating).run();
  if (env.ENVIRONMENT === 'development') console.log('D1 put', result.meta);
}
export async function deleteRating(env: Env, id: number, reader: string) { await env.DB.prepare('DELETE FROM story_ratings WHERE story_id = ? AND reader_id = ?').bind(id, reader).run(); }
export async function myRating(env: Env, id: number, reader: string) { return (await env.DB.prepare('SELECT rating FROM story_ratings WHERE story_id = ? AND reader_id = ?').bind(id, reader).first<{rating:number}>())?.rating ?? null; }
