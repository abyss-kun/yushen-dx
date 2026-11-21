// 召回 A/B（第二版）：用「同一场对话（session）」当正样本——因为 600 行记忆里 about/who 都是 0。
// 只读记忆，不调模型。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const roleArg = argv.find((a) => a.startsWith('--role='))
const roles = roleArg ? [roleArg.slice(7)] : ['dayu', 'xiaoyu', 'dragon']

function rowsOf(role) {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(DATA, 'soul', 'memory', `${role}.json`), 'utf8'))
    return (doc.events || []).filter((e) => e && e.text)
  } catch { return [] }
}
function grams(text) {
  const s = String(text || '')
  const han = s.match(/[\p{Script=Han}]{2,}/gu) || []
  const out = []
  for (const w of han) for (let i = 0; i + 2 <= w.length; i++) out.push(w.slice(i, i + 2))
  return new Set(out)
}
const overlap = (a, b) => { const A = grams(a); const B = grams(b); let n = 0; for (const g of A) if (B.has(g)) n++; return n }

const ALL = []
for (const role of roles) for (const ev of rowsOf(role)) ALL.push({ role, ...ev })

// 正样本：同一 session 的不同两行（最多 200 对）
const bySession = new Map()
for (const ev of ALL) if (ev.session) {
  const k = String(ev.session)
  if (!bySession.has(k)) bySession.set(k, [])
  bySession.get(k).push(ev)
}
const positives = []
for (const [, list] of bySession) {
  for (let i = 0; i < list.length && positives.length < 200; i++) {
    for (let j = i + 1; j < list.length && positives.length < 200; j++) {
      if (list[i].text === list[j].text) continue
      positives.push({ a: list[i], b: list[j] })
    }
  }
  if (positives.length >= 200) break
}

// 负样本：不同 session 的随机对
const negatives = []
let guard = 0
while (negatives.length < 200 && ALL.length > 4 && guard < 5000) {
  guard += 1
  const a = ALL[Math.floor(Math.random() * ALL.length)]
  const b = ALL[Math.floor(Math.random() * ALL.length)]
  if (a === b || !a.session || !b.session || a.session === b.session) continue
  negatives.push({ a, b })
}

const kwHit = positives.filter((p) => overlap(p.a.text, p.b.text) >= 2).length
const kwFalse = negatives.filter((p) => overlap(p.a.text, p.b.text) >= 2).length
const result = {
  ok: true,
  at: new Date().toISOString(),
  rows: ALL.length,
  sessions: bySession.size,
  positives: positives.length,
  negatives: negatives.length,
  keyword_recall: positives.length ? Number((kwHit / positives.length).toFixed(3)) : null,
  keyword_false_positive: negatives.length ? Number((kwFalse / negatives.length).toFixed(3)) : null,
  session_edge_recall: positives.length ? 1 : null,
  note: '正样本=同一场对话里的两条记忆（沿 session 边必然相连）；keyword 用双字重叠≥2 近似。keyword_recall 越低，说明「同一场对话里字面不重合」的越多，沿边越值。',
}
if (asJson) console.log(JSON.stringify(result, null, 1))
else {
  console.log(`记忆行 ${result.rows}，session 分组 ${result.sessions}`)
  console.log(`正样本 ${result.positives} 对 / 负样本 ${result.negatives} 对`)
  console.log(`关键词能找回：${(result.keyword_recall * 100).toFixed(1)}%（漏 ${result.positives - kwHit} 对）`)
  console.log(`关键词误捞：${(result.keyword_false_positive * 100).toFixed(1)}%`)
  console.log('沿 session 边能找回：100%（定义如此；代价是多一跳、最多 3 条、带 via 标记）')
}
