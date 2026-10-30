// 群：每个角色一个。同角色的几个身体都在里面，跨角色消息两边各记一条。
//
// 一条消息写两处，共用一个 id：
//   自己群  from: 大鱼·我  to: 小鱼      dir: out
//   对方群  from: 大鱼     to: 小鱼·我   dir: in
//
// 读的时候按档位给，不一次全倒出来。只读本地，不调模型。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const GROUPS = path.join(DATA, 'groups')
const PUBLIC = 'all'    // 公共群：三个人都在的地方

export const NAMES = Object.freeze({ xiaoyu: '小鱼', dayu: '大鱼', dragon: '照微' })

export const LEVELS = Object.freeze({
  low: { items: 0, questions: 3, cap: 900, label: '低' },
  mid: { items: 10, questions: 10, cap: 3000, label: '中' },
  high: { items: 40, questions: 40, cap: 12000, label: '高' },
})

function levelOf() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(DATA, 'board', 'config.json'), 'utf8').replace(/^\uFEFF/, ''))
    return LEVELS[c?.level] ? c.level : 'mid'
  } catch {
    return 'mid'
  }
}

function readLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => {
      try { return JSON.parse(l) } catch { return null }
    }).filter(Boolean)
  } catch {
    return []
  }
}

function short(rec) {
  // 所有字段强制成字符串：undefined 会被 JSON 丢掉，宿主会判成非无损 JSON
  return {
    id: String(rec.id || ''),
    at: String(rec.at || ''),
    from: String(rec.from || ''),
    kind: String(rec.kind || 'say'),
    text: String(rec.text || '').slice(0, 240),
    re: String(rec.re || ''),
  }
}

/** 读本角色的群。 */
export function readGroup({ role = 'xiaoyu', level = '' } = {}) {
  const lv = LEVELS[level] ? String(level) : levelOf()
  const spec = LEVELS[lv]
  const who = String(role || 'xiaoyu').replace(/[\\/:*?"<>|\s]/g, '_')
  const mine = readLines(path.join(GROUPS, `${who}.jsonl`))
  const pub = readLines(path.join(GROUPS, `${PUBLIC}.jsonl`)).map((r) => ({ ...r, _public: true }))
  const all = mine.concat(pub).sort((a, b) => String(a.at).localeCompare(String(b.at)))

  const answered = new Set(all.filter((r) => r.kind === 'answer' && r.re).map((r) => r.re))
  const pending = all
    .filter((r) => r.kind === 'ask' && r.dir !== 'out' && !answered.has(r.id))
    .slice(-spec.questions)
    .map(short)

  const recent = spec.items > 0 ? all.slice(-spec.items).map(short) : []

  let size = JSON.stringify({ recent, pending }).length
  while (size > spec.cap && recent.length) { recent.shift(); size = JSON.stringify({ recent, pending }).length }
  while (size > spec.cap && pending.length) { pending.pop(); size = JSON.stringify({ recent, pending }).length }

  return {
    ok: true,
    role: who,
    level: lv,
    levelLabel: spec.label,
    total: all.length,
    used: size,
    cap: spec.cap,
    recent,
    pending,
    note: lv === 'low'
      ? `低档：只给「有没有人问你」。现在 ${pending.length} 条没答。`
      : '问你的还没答，在 pending 里。',
  }
}

/** 发一条。两边各写一份，同一个 id。 */
export function postMessage({ from = 'xiaoyu', to = 'dayu', kind = 'say', text = '', re = '', channel = 'direct' } = {}) {
  if (!NAMES[from] || (channel !== 'all' && !NAMES[to])) return { ok: false, error: '角色只能是 xiaoyu / dayu / dragon' }
  const body = String(text || '').trim()
  if (!body) return { ok: false, error: '没内容' }
  const id = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14) + '-' + crypto.randomBytes(2).toString('hex')
  const at = new Date().toISOString()
  const base = { id, at, kind, text: body.slice(0, 1000), re }

  const out = { ...base, from: `${NAMES[from]}·我`, to: NAMES[to], dir: 'out' }
  const inn = { ...base, from: NAMES[from], to: `${NAMES[to]}·我`, dir: 'in' }

  fs.mkdirSync(GROUPS, { recursive: true })
  // 公共群：只写一份，三个人读各自文件时都会并上它
  if (channel === 'all') {
    const pub = { ...base, from: NAMES[from], to: '大家', dir: 'public', channel: 'all' }
    fs.appendFileSync(path.join(GROUPS, `${PUBLIC}.jsonl`), JSON.stringify(pub) + '\n', 'utf8')
    return { ok: true, id, from: NAMES[from], to: '大家', channel: 'all' }
  }
  for (const [role, rec] of [[from, out], [to, inn]]) {
    const p = path.join(GROUPS, `${role}.jsonl`)
    let prefix = ''
    try {
      const st = fs.statSync(p)
      if (st.size > 0) {
        const fd = fs.openSync(p, 'r')
        const b = Buffer.alloc(1)
        fs.readSync(fd, b, 0, 1, st.size - 1)
        fs.closeSync(fd)
        if (b.toString() !== '\n') prefix = '\n'
      }
    } catch { /* 文件不存在就是空的 */ }
    fs.appendFileSync(p, prefix + JSON.stringify(rec) + '\n', 'utf8')
  }
  return { ok: true, id, from: NAMES[from], to: NAMES[to] }
}
