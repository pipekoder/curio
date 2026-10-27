import { z } from 'zod'

// A single globally named SQLite DO serializes reservations across Worker isolates.
// Reservations are never refunded: failures/timeouts may still be billed upstream.
export class InferenceBudget {
  constructor(private state: DurableObjectState) {
    state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)`)
  }
  async fetch(request: Request): Promise<Response> {
    const parsed = z.strictObject({ ip: z.string().regex(/^[a-f0-9]{64}$/), ceiling: z.number().int().min(1).max(100) }).safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: 'Invalid reservation' }, { status: 400 })
    const { ip, ceiling } = parsed.data
    const now = Date.now(), minute = 60000, hour = 3600000, day = 86400000
    const result = this.state.storage.transactionSync(() => {
      const counters = [
        { key: 'lifetime', limit: ceiling, expires: 0 },
        { key: `day:${Math.floor(now / day)}`, limit: 20, expires: (Math.floor(now / day) + 1) * day },
        { key: `hour:${ip}:${Math.floor(now / hour)}`, limit: 3, expires: (Math.floor(now / hour) + 1) * hour },
        // Rolling cooldown avoids minute-boundary bursts.
        { key: `cooldown:${ip}`, limit: 1, expires: now + minute },
      ]
      this.state.storage.sql.exec('DELETE FROM counters WHERE expires > 0 AND expires <= ?', now)
      for (const counter of counters) {
        const rows = this.state.storage.sql.exec<{ count: number; expires: number }>('SELECT count, expires FROM counters WHERE key = ?', counter.key).toArray()
        if ((rows[0]?.count ?? 0) >= counter.limit) return { allowed: false, retryAfter: counter.expires ? Math.ceil(((rows[0]?.expires ?? counter.expires) - now) / 1000) : 86400 }
      }
      for (const counter of counters) {
        this.state.storage.sql.exec('INSERT INTO counters (key, count, expires) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1', counter.key, counter.expires)
      }
      return { allowed: true, retryAfter: 0 }
    })
    return Response.json(result)
  }
}
