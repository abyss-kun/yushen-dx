// 把「哪个窗口」直接打开给你看：按关键词或会话 id 找到，然后读出对话，不是只报一个 id。
// 用法：ELECTRON_RUN_AS_NODE=1 "<DeepSeek Harness.exe>" scripts/session-open.mjs 轻松的修复你 [--turns=12]
// 只读、零模型调用：搜索走本地会话文件，读正文走 lib/transcript.js。
import { searchSessions } from '../lib/search.js'
import { transcriptDigest } from '../lib/transcript.js'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const turnsArg = process.argv.find((a) => a.startsWith('--turns='))
const turns = turnsArg ? Number(turnsArg.slice(8)) : 12
const query = args.join(' ').trim()
if (!query) {
  console.error('用法：session-open.mjs <关键词|完整会话id> [--turns=12]')
  process.exit(2)
}

// 像完整 id 就直接用；否则深搜取最像的那条会话。
const looksId = /^session-?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query) || /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(query)
let id = query.replace(/^session-/, '')
let hit = null
if (!looksId) {
  const hits = searchSessions(query, { limit: 8, deep: true })
  hit = hits[0]
  if (!hit) {
    console.log(JSON.stringify({ ok: false, error: `没搜到包含「${query}」的会话` }))
    process.exit(3)
  }
  id = String(hit.source).replace(/^session-/, '')
}
const fullId = `session-${id.replace(/^session-/, '')}`
let digest = null
try { digest = transcriptDigest(fullId, { turns }) } catch { digest = null }
if (!digest || digest.ok === false) {
  console.log(JSON.stringify({ ok: false, error: `找到 ${fullId}，但正文读不出来（可能只在备份里）`, hint: '可用 session-search.mjs 看命中片段，或把备份会话还原后再读' }, null, 2))
  process.exit(4)
}
const rows = (digest.turns || []).filter((t) => t.role === 'user' || t.role === 'assistant')
console.log(`窗口：${digest.title || hit?.title || '(无标题)'}`)
console.log(`id：${fullId}`)
console.log(`工作区：${digest.workspace || ''}`)
console.log(`轮次：${rows.length}`)
console.log('---')
for (const t of rows) {
  const who = t.role === 'user' ? '老板' : '她'
  const when = String(t.at || '').replace('T', ' ').slice(0, 19)
  const text = String(t.text || '').replace(/\r/g, '').trim()
  if (/^Current runtime context|^Time sampled while preparing/.test(text)) continue
  console.log(`[${when}] ${who}：${text.slice(0, 1200)}`)
  console.log('')
}
