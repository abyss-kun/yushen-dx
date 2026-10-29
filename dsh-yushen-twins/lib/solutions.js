// Human-curated solutions only: no harvesting conversations, commands, or credentials.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const FIELDS = new Set(['problem', 'cause', 'solution', 'scriptRefs', 'verification', 'tags'])
function directory() { return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'solutions') }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype }
function hasSecret(text) {
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk|ghp|gho|github_pat|xox[baprs])[-_][a-z0-9_-]{12,}|\bBearer\s+[a-z0-9._~+\/-]{8,}|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passwd|cookie|authorization|session[_-]?token)\s*["']?\s*[:=]\s*["']?[^\s"',;}{]{4,}|(?:密钥|密码|令牌)\s*[:=：]\s*\S{4,}/i.test(text)
}
function validate(entry) {
  if (!plain(entry) || Object.keys(entry).some(key => !FIELDS.has(key))) throw new Error('Only structured solution fields are accepted')
  const result = {}
  for (const key of ['problem', 'cause', 'solution', 'verification']) {
    if (typeof entry[key] !== 'string' || !entry[key].trim() || entry[key].length > 16000) throw new Error(`${key} must be non-empty text, at most 16000 characters`)
    result[key] = entry[key].trim()
  }
  for (const key of ['scriptRefs', 'tags']) {
    const items = entry[key] ?? []
    if (!Array.isArray(items) || items.length > 32 || items.some(value => typeof value !== 'string' || !value.trim() || value.length > 512)) throw new Error(`${key} must be an array of short strings`)
    result[key] = [...new Set(items.map(value => value.trim()))]
  }
  if (Object.values(result).flat().some(value => hasSecret(value))) throw new Error('Potential credential detected; remove secrets before recording')
  return result
}
/** Explicit human action is mandatory; accepting content is never an implicit authorization. */
export function recordSolution(entry, { explicit = false } = {}) {
  if (explicit !== true) throw new Error('Explicit human record authorization is required')
  const record = validate(entry), dir = directory(), id = crypto.randomUUID()
  fs.mkdirSync(dir, { recursive: true })
  // The record itself contains only the six structured fields. The random filename is its local identity.
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  return { id, ...record }
}
export function listSolutions({ limit = 100, tag } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000 || (tag !== undefined && (typeof tag !== 'string' || tag.length > 512))) throw new Error('Invalid solution list options')
  const dir = directory()
  let names
  try { names = fs.readdirSync(dir) } catch (error) { if (error.code === 'ENOENT') return []; throw new Error('Solutions are unreadable') }
  const result = []
  for (const name of names.sort()) {
    if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue
    let record
    try {
      const file = path.join(dir, name)
      if (!fs.lstatSync(file).isFile() || fs.statSync(file).size > 100000) continue
      record = validate(JSON.parse(fs.readFileSync(file, 'utf8')))
    } catch { continue } // Corrupt/secret-bearing entries are never echoed to the caller.
    if (tag !== undefined && !record.tags.includes(tag)) continue
    result.push({ id: name.slice(0, -5), ...record })
    if (result.length >= limit) break
  }
  return result
}
