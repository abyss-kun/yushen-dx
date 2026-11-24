// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-groups
 * kind: module
 * summary: 群：每个角色一个；同角色几个身体都在里面，跨角色消息两边各记一条、共用一个 id。
 * tags: 群, 多角色, 去重
 * created: 2026-11-11 01:25:00
 * changed: 2026-11-11 01:25:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 三个角色、群路由、面板
 * owner: 框架；**跨角色各记一条但同一个 id** 这条别破
 * mutable: 可改字段；不许让两个角色看到对方私聊
 * usage: 写一条消息 → 两边各记一份；按 id 查
 * why: 同一个人有两个身体，消息只记一处就会丢另一半上下文
 * result: 每角色一组的群记录
 */
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

// 2026-11-02（照微）：群消息原来 `body.slice(0, 1000)`——**超长就静默切断，连省略号都没有**。
// 后果不是"少看一点"，是对方读到一句断在半截的话，还以为你说完了：
// 2026-11-01 我那条会审回复的「我的改法」整段没发出去，大鱼看到的是断句，那轮会审就卡住了。
// 现在超长时留一句明说，长度仍按 1000 记。
export const STORE_LIMIT = 1000
export function clipForStore(body, limit = STORE_LIMIT) {
  const s = String(body || '')
  if (s.length <= limit) return s
  const mark = `……（已截断，全文 ${s.length} 字）`
  return s.slice(0, Math.max(0, limit - mark.length)) + mark
}

export const LEVELS = Object.freeze({
  low: { items: 0, questions: 3, cap: 900, label: '低' },
  mid: { items: 10, questions: 10, cap: 3000, label: '中' },
  high: { items: 40, questions: 40, cap: 12000, label: '高' },
})

// 2026-11-04：哪些是"要你处理"的，不是"看过就算"的。
//   ask     = 在问你
//   deliver = 转达一个已定的决定，要你接住并回一句"收到/不办，因为X"
// 其余（say/answer/handled/归体）不占"欠回复"的位置。
export const NEEDS_REPLY = new Set(['ask', 'deliver'])

/** 标一条"我处理了"（不删、不改原消息；只在群里追加一条 handled）。 */
export function markHandled({ role = 'xiaoyu', id = '', note = '' } = {}) {
  if (!NAMES[role]) return { ok: false, error: '角色只能是 xiaoyu / dayu / dragon' }
  const rid = String(id || '').trim()
  if (!rid) return { ok: false, error: '要给 id（readGroup 的 pending 里那条）' }
  const p = path.join(GROUPS, `${role}.jsonl`)
  const rec = { id: `h-${Date.now()}`, at: new Date().toISOString(), kind: 'handled', re: rid, text: clipForStore(String(note || '已处理')), from: `${NAMES[role]}·我`, to: '', dir: 'self' }
  try {
    fs.mkdirSync(GROUPS, { recursive: true })
    fs.appendFileSync(p, JSON.stringify(rec) + '\n', 'utf8')
    return { ok: true, id: rec.id, handled: rid }
  } catch (e) { return { ok: false, error: String(e?.message || e) } }
}

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

  // 2026-11-03 老板：「做过的为什么不删除」——根因是已答只按当前视图算，
  // 答案落在另一个角色的群里时，这边永远判成"没答"。改成扫全部群文件。
  // 2026-11-03 老板：「做过的为什么不删除」——根因是已答只按当前视图算，
  // 答案落在另一个角色的群里时，这边永远判成"没答"。改成扫全部群文件。
  // 2026-11-04（照微，老板转述的那个"a传b、b不知道"）：**传到了不等于处理了**。
  // 只认 "answered"（回了一句）不够——她读了、点了、心里记了，但没有一个动作说"这条我处理了"，
  // 于是消息永远躺在 recent 里沉底。所以补一个 handled 状态，和收件箱的"已读"同构。
  const scanAll = (pred) => {
    const s = new Set()
    try {
      for (const f of fs.readdirSync(GROUPS)) {
        if (!f.endsWith('.jsonl')) continue
        for (const r of readLines(path.join(GROUPS, f))) if (pred(r) && r.re) s.add(String(r.re))
      }
    } catch { /* 目录读不到就退回当前视图 */ }
    for (const r of all) if (pred(r) && r.re) s.add(String(r.re))
    return s
  }
  const answeredIds = scanAll((r) => r.kind === 'answer')
  const handledIds = scanAll((r) => r.kind === 'handled')
  const seenAsk = new Set()
  const pending = all
    .filter((r) => NEEDS_REPLY.has(String(r.kind)) && r.dir !== 'out' && !answeredIds.has(String(r.id)) && !handledIds.has(String(r.id)))
    // 同一句问了两遍只留一条（老板每天看我们问答，重复的像没长进）
    .filter((r) => {
      const k = String(r.from) + '|' + String(r.text).replace(/\s+/g, '').slice(0, 40)
      if (seenAsk.has(k)) return false
      seenAsk.add(k)
      return true
    })
    .slice(-spec.questions)
    .map((r) => ({ ...short(r), needs: true, needsWhy: String(r.kind) === 'deliver' ? '转达了决定，等你接' : '在问你' }))

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
    handled: handledIds.size,
    note: lv === 'low'
      ? `低档：只给「有没有人问你」。现在 ${pending.length} 条**没处理**（读到了不等于处理了）。`
      : `没处理的 ${pending.length} 条在最前面（pending）；处理完用 action=handled 标掉，不然它会一直在这。`,
  }
}

/** 发一条。两边各写一份，同一个 id。 */
export function postMessage({ from = 'xiaoyu', to = 'dayu', kind = 'say', text = '', re = '', channel = 'direct' } = {}) {
  if (!NAMES[from] || (channel !== 'all' && !NAMES[to])) return { ok: false, error: '角色只能是 xiaoyu / dayu / dragon' }
  const body = String(text || '').trim()
  if (!body) return { ok: false, error: '没内容' }
  const id = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14) + '-' + crypto.randomBytes(2).toString('hex')
  const at = new Date().toISOString()
  const base = { id, at, kind, text: clipForStore(body), re }

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
