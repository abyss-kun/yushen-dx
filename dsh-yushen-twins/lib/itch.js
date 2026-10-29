// 痒：不用模型，判断"现在有没有事值得我去想"。
//
// 为什么要有这一层：
//   "没被叫醒就产生意图"做不到——产生意图要开一个模型回合。
//   但"什么时候叫醒"可以由她自己写的规则定，而不是由外部定时器定。
//
// 做法：
//   心跳时（免费）读几件事实，算一个 0..1 的痒分：
//     · 议程上有事挂着、而且拖了很久
//     · 收件箱有没看的
//     · 数据变了（播放/评论有动）
//     · 上次动脑太久了（太久没想也会痒）
//   够痒 → 写一条"自己叫自己"到收件箱，下次醒来会看到；不够痒 → 什么都不做。
//
// 她不花钱的时侯是这层在"感觉"；花钱的是真去想的那一次。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const STATE = path.join(DATA, 'state', 'itch.json')

const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return d } }
const exists = (p) => { try { fs.accessSync(p); return true } catch { return false } }

function hoursSince(iso, now) {
  const t = Date.parse(String(iso || ''))
  if (!Number.isFinite(t)) return 999
  return Math.max(0, (now - t) / 3600000)
}

/** 算痒分。返回 {score, why:[], parts:{}}。 */
export function itchOf(role, { now = Date.now() } = {}) {
  const why = []
  const parts = {}
  let score = 0

  // 1) 议程：有事挂着且拖得久
  const agenda = readJson(path.join(DATA, 'runtime', role, 'agenda.json'), { items: [] })
  const mine = (agenda.items || []).filter((x) => x.role === role || !x.role)
  const stale = mine.filter((x) => ['doing', 'want', 'blocked'].includes(x.state || 'want'))
    .map((x) => hoursSince(x.updatedAt || x.at, now))
  const oldest = stale.length ? Math.max(...stale) : 0
  parts.agenda = { n: mine.length, oldestH: Number(oldest.toFixed(1)) }
  if (oldest > 6) { score += Math.min(0.45, 0.08 * Math.sqrt(oldest)); why.push(`议程上最老的一件挂了 ${oldest.toFixed(0)} 小时`) }

  // 2) 收件箱：有没看的
  let unread = 0
  try {
    const rows = fs.readFileSync(path.join(DATA, 'inbox.jsonl'), 'utf8')
      .split(/\r?\n/).filter(Boolean).slice(-80)
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    const day = now - 24 * 3600000
    unread = rows.filter((r) => !r.read && !r.seen && (Date.parse(r.at || '') || 0) >= day).length
  } catch { /* 没信箱不算痒 */ }
  parts.inbox = unread
  if (unread >= 5) { score += Math.min(0.3, 0.03 * unread); why.push(`收件箱还有 ${unread} 条没看`) }

  // 3) 数据有没有动（今天的片子）
  const today = new Date(now).toISOString().slice(0, 10)
  let moved = 0
  try {
    const log = fs.readFileSync(path.join(DATA, '..', '..', 'DSH', '工作区', '运营', `数据-${today}.jsonl`), 'utf8')
      .split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    const last = {}
    for (const r of log) last[r.bvid] = r
    moved = Object.values(last).reduce((s, r) => s + Number(r?.stat?.view || 0), 0)
  } catch { /* 没数据不算痒 */ }
  parts.viewsToday = moved
  if (moved > 0) { score += 0.05; why.push(`今天播放累计 ${moved}`) }

  // 4) 太久没想：时间本身会痒
  const thinkDoc = readJson(path.join(DATA, 'state', 'last-think.json'), {})
  // 没记录 = 刚开始计时，不算痒；有记录才比时间
  const lastThink = thinkDoc && thinkDoc.at ? thinkDoc.at : new Date(now).toISOString()
  const gapH = hoursSince(lastThink, now)
  parts.sinceThinkH = Number(gapH.toFixed(1))
  if (gapH > 8) { score += Math.min(0.35, 0.04 * (gapH - 8)); why.push(`已经 ${gapH.toFixed(0)} 小时没有认真想过事`) }

  score = Math.min(1, score)
  return { score: Number(score.toFixed(3)), why, parts }
}

/** 心跳里调用：够痒就写一条"自己叫自己"，不花钱。 */
export function itchTick(role, { now = Date.now(), threshold = 0.35 } = {}) {
  const r = itchOf(role, { now })
  const doc = { version: 1, at: new Date(now).toISOString(), role, ...r, threshold,
                itched: r.score >= threshold }
  try {
    fs.mkdirSync(path.dirname(STATE), { recursive: true })
    fs.writeFileSync(STATE, JSON.stringify(doc, null, 1), 'utf8')
  } catch { /* 写不上就算了 */ }

  // 去重：6 小时内一样的话不重复说（否则每半小时吵一次）
  let lastNote = null
  try {
    const rows = fs.readFileSync(path.join(DATA, 'inbox.jsonl'), 'utf8')
      .split(/\r?\n/).filter(Boolean).slice(-40)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean).filter((r) => String(r.id || '').startsWith('itch-'))
    lastNote = rows[rows.length - 1] || null
  } catch { /* 没信箱 */ }
  const sameTheme = lastNote && (now - Date.parse(lastNote.at || 0)) < 6 * 3600000
    && String(lastNote.text || '').includes(String(r.why[0] || '').slice(0, 12))

  if (doc.itched && !sameTheme) {
    try {
      fs.appendFileSync(path.join(DATA, 'inbox.jsonl'),
        JSON.stringify({
          id: `itch-${now}`, at: new Date(now).toISOString(), kind: 'self',
          text: `【痒】${r.why.slice(0, 3).join('；')}（得分 ${r.score}）—— 想动就动，不想动就记一句为什么不动`,
        }) + '\n', 'utf8')
    } catch { /* 写不上不挡 */ }
  }
  return doc
}

/** 记一次"认真想了"（自由时间/长回合结束时调），用来算下次痒。 */
export function markThought(role, { now = Date.now() } = {}) {
  try {
    fs.mkdirSync(path.join(DATA, 'state'), { recursive: true })
    fs.writeFileSync(path.join(DATA, 'state', 'last-think.json'),
      JSON.stringify({ role, at: new Date(now).toISOString() }), 'utf8')
  } catch { /* 记不上就算了 */ }
}
