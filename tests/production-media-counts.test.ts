import { describe, expect, it } from 'vitest'
// The production workflow executes this native ESM helper directly in Node.
// @ts-expect-error The repository does not emit declarations for workflow scripts.
import { tableCountSql, tableCounts } from '../scripts/production-media-counts.mjs'

describe('production D1 row-count safeguards', () => {
  it('uses independent statements instead of a compound SELECT at large table counts', () => {
    const names = Array.from({ length: 600 }, (_, index) => `table_${index}`)
    const sql: string = tableCountSql(names)
    expect(sql).not.toMatch(/\bUNION\b/i)
    expect(sql.match(/\bSELECT\b/g)).toHaveLength(names.length)
    expect(sql.trim().endsWith(';')).toBe(true)
  })

  it('requires one safe integer count for every expected table', () => {
    expect(tableCounts([{ name: 'alpha', count: 3 }, { name: 'beta', count: '4' }], ['alpha', 'beta']))
      .toEqual({ alpha: 3, beta: 4 })
    expect(() => tableCounts([{ name: 'alpha', count: 3 }], ['alpha', 'beta'])).toThrow('Incomplete')
    expect(() => tableCounts([{ name: 'alpha', count: -1 }], ['alpha'])).toThrow('Invalid')
    expect(() => tableCountSql(['safe', 'unsafe; DROP TABLE safe'])).toThrow('Invalid table name')
  })
})
