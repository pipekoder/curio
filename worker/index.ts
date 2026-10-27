import { Hono } from 'hono'
import { z } from 'zod'

type Bindings = {
  META_API_KEY?: string
  META_SPARK_MODEL?: string
  ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Bindings }>()

const magazineRequest = z.object({
  interests: z.string().trim().max(1000),
  lifestyles: z.array(z.string().trim().min(1).max(100)).min(1).max(8),
  allocations: z.object({
    home: z.number().int().min(0).max(100),
    fashion: z.number().int().min(0).max(100),
    travel: z.number().int().min(0).max(100),
  }),
}).refine(({ allocations }) => Object.values(allocations).reduce((a, b) => a + b, 0) === 100, {
  message: 'Category allocations must total 100%.',
})

app.get('/api/health', (c) => c.json({ ok: true, app: 'curio', metaConfigured: Boolean(c.env.META_API_KEY && c.env.META_SPARK_MODEL) }))

app.post('/api/magazine', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON.' }, 400) }
  const parsed = magazineRequest.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid magazine preferences.', details: z.treeifyError(parsed.error) }, 400)
  // Meta API response shape and model identifier must be validated against
  // the actual account before activation. Never fabricate generated content.
  return c.json({
    status: 'not_configured',
    message: 'Magazine generation is not enabled yet. Connect and verify the Meta Muse Spark API before enabling live inference.',
  }, 501)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

export default app
