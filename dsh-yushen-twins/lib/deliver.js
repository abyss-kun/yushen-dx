// 完成声明：她报"做完了"的时候，必须留下能验的东西。
//
// 为什么：今天文字版渲出来了，我报"完成"，结尾其实被截断。
// 「渲出来了」和「做完了」差着一次验收。
//
// 一条长这样：
//   { at, role, what, path, how, evidence }
//
// 硬规矩：
//   · path 必须存在（可以是文件或目录）—— 不存在就记不进去
//   · how 不能空 —— 说不清怎么验的，就是没验
//   · evidence 不能空 —— 说不出验出什么，就是没看
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DIR = path.join(HOME, 'dayu', 'soul', 'deliveries')

function file(role) {
  return path.join(DIR, `${role}.jsonl`)
}

/** 记一条完成声明。缺路径 / 缺验法 / 缺结果，一律拒。 */
export function addDelivery(role, { what, path: artifact, how, evidence, now = Date.now() } = {}) {
  const w = String(what || '').trim()
  const p = String(artifact || '').trim()
  const h = String(how || '').trim()
  const e = String(evidence || '').trim()

  if (!w) throw new Error('what 不能空——做了什么')
  if (!p) throw new Error('path 不能空——产物在哪，说不出位置就等于没有')
  if (!fs.existsSync(p)) throw new Error(`path 不存在：${p}`)
  if (!h) throw new Error('how 不能空——怎么验的？说不出就是没验')
  if (!e) throw new Error('evidence 不能空——验出什么？说不出就是没看')

  const st = fs.statSync(p)
  const row = {
    at: new Date(now).toISOString(),
    role,
    what: w.slice(0, 160),
    path: p,
    size: st.isDirectory() ? null : st.size,
    how: h.slice(0, 160),
    evidence: e.slice(0, 240),
  }
  fs.mkdirSync(DIR, { recursive: true })
  fs.appendFileSync(file(role), JSON.stringify(row) + '\n', 'utf8')
  return row
}

/** 读最近的完成声明。 */
export function listDeliveries(role, { limit = 10 } = {}) {
  try {
    return fs.readFileSync(file(role), 'utf8')
      .split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
      .slice(-limit)
  } catch { return [] }
}

/** 简报里的一行：最近三条完成的活，带验法。 */
export function deliveriesLine(role, { limit = 3 } = {}) {
  const rows = listDeliveries(role, { limit })
  if (!rows.length) return ''
  const items = rows.map((r) => `${r.what}（${r.how}→${r.evidence}）`).join('；')
  return `## 你最近交付的活\n${items}\n（这些都是验过的；没验的别报完成）`
}
