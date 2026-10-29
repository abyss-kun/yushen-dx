// 翻自己的旧账：她以前的判断、纠结、越线、不回的理由。
//
// 只读本地；看多少、看哪类，她自己定。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runtimeDir } from './runtime.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

function readJsonl(dir, kind, { limit = 50 } = {}) {
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort().slice(-3) } catch { return [] }
  const rows = []
  for (const f of files) {
    let lines = []
    try { lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/) } catch { continue }
    for (const line of lines) {
      if (!line.trim()) continue
      try { rows.push({ kind, ...JSON.parse(line) }) } catch { /* 坏行跳过 */ }
    }
  }
  return rows.slice(-Math.max(1, limit))
}

/**
 * @param {string} role
 * @param {{what?:string, limit?:number}} opts  what: thoughts / judgments / decisions / ventures / 空=全翻
 */
export function recallSelf(role, { what = '', limit = 10 } = {}) {
  const w = String(what || '').toLowerCase()
  const wants = (k) => !w || w.includes(k)
  const out = []
  if (wants('judgments')) out.push(...readJsonl(path.join(runtimeDir(role), 'judgments'), 'judgment', { limit }))
  if (wants('decisions')) out.push(...readJsonl(path.join(runtimeDir(role), 'cheap'), 'decision', { limit }))
  if (wants('ventures')) out.push(...readJsonl(runtimeDir(role), 'venture', { limit }))
  if (wants('thoughts')) out.push(...readJsonl(path.join(HOME, 'dayu', 'thoughts'), 'thought', { limit }))
  out.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))
  return {
    items: out.slice(-Math.max(1, Number(limit) || 10)).map((r) => ({
      kind: r.kind,
      at: r.at || '',
      text: String(r.what || r.text || r.reply || r.why || '').slice(0, 160),
      why: r.why ? String(r.why).slice(0, 80) : '',
      verdict: r.verdict || r.mode || '',
    })),
  }
}
