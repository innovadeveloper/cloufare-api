import { z } from 'zod';
export const storySchema = z.object({
  id: z.number().int().positive().safe(), slug: z.string().min(1), title: z.string().min(1),
  description: z.string(), genres: z.array(z.string()), coverKey: z.string(),
  status: z.enum(['published', 'draft']), publishedAt: z.iso.datetime(),
  chapterCount: z.number().int().nonnegative(), tags: z.array(z.string()),
});
export const catalogSchema = z.array(storySchema).superRefine((stories, ctx) => {
  const ids = new Set<number>();
  for (const s of stories) { if (ids.has(s.id)) ctx.addIssue({ code: 'custom', message: `ID duplicado: ${s.id}` }); ids.add(s.id); }
});
export const chapterSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), title: z.string(), text: z.string(), choices: z.array(z.object({ text: z.string(), nextChapterId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/) })).default([]) });
export type Story = z.infer<typeof storySchema>;
