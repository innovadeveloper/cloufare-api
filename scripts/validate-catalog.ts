import { readFileSync, existsSync } from 'node:fs';
import { catalogSchema, chapterSchema } from '../src/schema';
const base = 'content/sample';
const catalog = catalogSchema.parse(JSON.parse(readFileSync(`${base}/catalog/catalog.json`, 'utf8')));
for (const story of catalog) {
  const chapters = new Map<string, ReturnType<typeof chapterSchema.parse>>();
  for (let i = 1; i <= story.chapterCount; i++) {
    const path = `${base}/stories/${story.id}/chapters/${i}.json`;
    if (!existsSync(path)) throw new Error(`Falta ${path}`);
    const chapter = chapterSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    if (chapter.id !== String(i)) throw new Error(`ID incorrecto: ${path}`);
    chapters.set(chapter.id, chapter);
  }
  for (const chapter of chapters.values()) for (const choice of chapter.choices) if (!chapters.has(choice.nextChapterId)) throw new Error(`Destino inexistente: ${choice.nextChapterId}`);
}
console.log(`Catálogo válido: ${catalog.length} historias`);
