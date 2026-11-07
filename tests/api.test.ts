import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../src/index';
import catalog from '../content/sample/catalog/catalog.json';
const e = env as any;
beforeAll(async () => { await applyD1Migrations(e.DB,e.TEST_MIGRATIONS); await e.CONTENT.put('catalog/catalog.json', JSON.stringify(catalog)); });
describe('API y D1 local', () => {
 it('mantiene agregados mediante insert, actualización y eliminación', async () => {
  const query = `INSERT INTO story_ratings(story_id, reader_id, rating) VALUES(?,?,?) ON CONFLICT(story_id,reader_id) DO UPDATE SET rating=excluded.rating,updated_at=CURRENT_TIMESTAMP WHERE story_ratings.rating <> excluded.rating`;
  await e.DB.prepare(query).bind(101,'google:a',3).run();
  await e.DB.prepare(query).bind(101,'google:b',5).run();
  await e.DB.prepare(query).bind(101,'google:a',4).run();
  await e.DB.prepare(query).bind(101,'google:a',4).run();
  expect(await e.DB.prepare('SELECT rating_sum, rating_count FROM story_rating_stats WHERE story_id=101').first()).toEqual({rating_sum:9,rating_count:2});
  await expect(e.DB.prepare(query).bind(101,'bad',6).run()).rejects.toThrow();
  await expect(e.DB.prepare("UPDATE story_ratings SET reader_id='other' WHERE story_id=101").run()).rejects.toThrow();
  await e.DB.prepare('DELETE FROM story_ratings WHERE story_id=? AND reader_id=?').bind(101,'google:a').run();
  expect(await e.DB.prepare('SELECT rating_sum, rating_count FROM story_rating_stats WHERE story_id=101').first()).toEqual({rating_sum:5,rating_count:1});
  const plan = await e.DB.prepare('EXPLAIN QUERY PLAN SELECT rating FROM story_ratings WHERE story_id=? AND reader_id=?').bind(101,'google:b').all();
  expect(JSON.stringify(plan.results)).toMatch(/PRIMARY KEY/i);
 });
 it('filtra, pagina y ordena por valoración antes de paginar', async () => {
  await e.DB.prepare('INSERT INTO story_ratings(story_id,reader_id,rating) VALUES(?,?,?)').bind(103,'google:c',4).run();
  const response = await app.request('/api/stories?sort=rating_desc&limit=1', {}, e);
  const body = await response.json() as any;
  expect(body.data[0].id).toBe(101); expect(body.pagination.total).toBe(5);
  const filtered = await app.request('/api/stories?genre=aventura',{},e);
  expect((await filtered.json() as any).pagination.total).toBe(2);
  const unrated = await app.request('/api/stories/102',{},e);
  expect((await unrated.json() as any).ratingAverage).toBeNull();
 });
 it('conserva sumas y contadores ante operaciones concurrentes', async () => {
  await Promise.all(Array.from({length: 20}, (_, i) => e.DB.prepare('INSERT INTO story_ratings(story_id,reader_id,rating) VALUES(?,?,?)').bind(104,`google:concurrent-${i}`,(i%5)+1).run()));
  const aggregate = await e.DB.prepare('SELECT rating_sum, rating_count FROM story_rating_stats WHERE story_id=104').first();
  const actual = await e.DB.prepare('SELECT sum(rating) AS rating_sum, count(*) AS rating_count FROM story_ratings WHERE story_id=104').first();
  expect(aggregate).toEqual(actual); expect(actual.rating_count).toBe(20);
 });
 it('verifica que el capítulo pertenece a una historia publicada', async () => {
  await e.CONTENT.put('stories/101/chapters/1.json', JSON.stringify({id:'1', title:'Inicio', text:'Hola', choices:[]}));
  expect((await app.request('/api/stories/101/chapters/1',{},e)).status).toBe(200);
  expect((await app.request('/api/stories/999/chapters/1',{},e)).status).toBe(404);
  expect((await app.request('/api/stories/101/chapters/none',{},e)).status).toBe(404);
 });
 it('protege la información de usuario y rechaza votos anónimos', async () => {
  const response = await app.request('/api/stories/101/rating',{method:'PUT',body:JSON.stringify({rating:5}),headers:{'Content-Type':'application/json'}},{...e,GOOGLE_CLIENT_ID:'example'});
  expect(response.status).toBe(401); expect(response.headers.get('Cache-Control')).toBe('private, no-store');
 });
});
