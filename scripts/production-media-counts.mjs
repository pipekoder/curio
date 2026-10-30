const identifier = /^[a-z][a-z0-9_]*$/

export function tableCountSql(names) {
  if (!Array.isArray(names) || names.length === 0) throw new Error('At least one table is required')
  return names.map(name => {
    if (!identifier.test(name)) throw new Error(`Invalid table name: ${name}`)
    return `SELECT '${name}' AS name, COUNT(*) AS count FROM "${name}";`
  }).join('\n')
}

export function tableCounts(rows, expectedNames) {
  const expected = new Set(expectedNames)
  const result = {}
  for (const row of rows) {
    if (!expected.has(row.name) || Object.hasOwn(result, row.name)) throw new Error('Unexpected table-count result')
    const count = Number(row.count)
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid table-count value')
    result[row.name] = count
  }
  if (Object.keys(result).length !== expected.size) throw new Error('Incomplete table-count result')
  return result
}
