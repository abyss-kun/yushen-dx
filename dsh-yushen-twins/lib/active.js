// 活跃层：现在在聊什么 + 我正在做什么。
//
// 2026-10-29 从 dsh-onebot-hub 的「活跃层」学来的。它解决的是我们的一个老毛病：
// 醒过来只知道"记忆里有什么"，不知道"手头正干着哪件事、哪个群还在等我回"。
//
// 两条规矩（它的原话，我照抄）：
//   1. **每条都带出处**——A 群能看见 B 群在聊什么，但不会张冠李戴。
//   2. **做完要结算**——留一行摘要进长期记忆，或者直接删掉；
//      一直不结算的条目，一天后提醒一次。
import fs from 'node:fs'
import path from 'node:path'
import { dshHome } from './paths.js'

const MAX_ITEMS = 20
const STALE_HOURS = 24

function fileOf(role) {
  return path.join(dshHome(), 'dayu', 'runtime', role, '活跃.json')
}

export function readActive(role) {
  try {
    const arr = JSON.parse(fs.readFileSync(fileOf(role), 'utf8').replace(/^\uFEFF/, ''))
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function write(role, items) {
  const p = fileOf(role)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = `${p}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(items.slice(-MAX_ITEMS), null, 1), 'utf8')
  fs.renameSync(tmp, p)
}

/** 开一件"进行中"的事。source 写清楚在哪儿（群/私聊/工作台）。 */
export function begin(role, { text = '', source = '', kind = 'doing' } = {}) {
  const items = readActive(role)
  const item = {
    id: `a-${Date.now().toString(36)}`,
    text: String(text).slice(0, 160),
    source: String(source).slice(0, 60),
    kind,
    at: new Date().toISOString(),
    settled: false,
  }
  items.push(item)
  write(role, items)
  return item
}

/** 结算：留一行摘要（进记忆由调用方做），或者直接删。 */
export function settle(role, id, { summary = '' } = {}) {
  const items = readActive(role)
  const it = items.find((x) => x.id === id)
  if (!it) return { ok: false, reason: '没有这一条' }
  if (summary) {
    it.settled = true
    it.summary = String(summary).slice(0, 200)
  } else {
    const i = items.indexOf(it)
    items.splice(i, 1)
  }
  write(role, items)
  return { ok: true, item: it }
}

/** 简报里那一段：进行中的 + 超过一天没结算的（提醒一次）。 */
export function activeLine(role, { now = Date.now() } = {}) {
  const items = readActive(role).filter((x) => !x.settled)
  if (!items.length) return ''
  const stale = []
  const show = items.slice(-6).map((x) => {
    const ageH = (now - Date.parse(x.at)) / 3600000
    if (ageH > STALE_HOURS) stale.push(x)
    return `- [${x.source || '?'}] ${x.text}`
  }).join('\n')
  const head = `## 手头进行中的（${items.length} 条）`
  const tail = stale.length
    ? `\n**有 ${stale.length} 条挂了一天以上没结算**——要么做，要么结掉，别挂着。`
    : ''
  return `${head}\n${show}${tail}`
}
