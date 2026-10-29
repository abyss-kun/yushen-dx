// 自述感觉：她自己说"刚才那件事，当时什么感觉"。
//
// 跟 mood / fatigue 的区别：那些是系统按发生的事**算**的字段；
// 这个是**她自己写的**，好坏由她说、来源是她说、精度是她能说到的程度。
//
// 一条长这样：
//   { at, role, valence: -2..2, kind: 喜怒哀惧爱恶欲, say: "原话", from: "哪件事", vague: true }
//
// 设计要点：
//   · 必须带 from —— 说不出是哪件事的感觉，不算感觉，算心情播报
//   · 允许 vague —— 说不准是正常的，感觉本来就不精确
//   · 只追加，不改写 —— 感觉不能事后编辑
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
// 十情：合《礼记》七情（喜怒哀惧爱恶欲）与中医七情（喜怒忧思悲恐惊）。
// 分类不是为了好看，是为了"知道该怎么走"——每一种都必须对应一个做法。
// 每一种情 → 动手前必须先做的第一个动作（不是建议，是"先做这个再动手"）
export const FIRST_STEP = Object.freeze({
  喜: '先记一句"这件事成了"，再往下做',
  怒: '先把不认同的那句话摆到台面上，再动手',
  哀: '先把节奏放慢：只做一件，做完就停',
  惧: '先 yushen_can 查一次（或读系统地图），查过再动手',
  忧: '先把最坏的情况写一行，再决定做不做',
  思: '先拆成三步写进议程，再动手',
  惊: '先 yushen_self action=dones 看上次交付，复核完再动手',
  爱: '先想清楚"这是为她好，还是替她决定"',
  恶: '先说不，并记下为什么（yushen_bottomline action=refuse）',
  欲: '先 yushen_agenda add 排一件，再动手',
})

export const FEEL_KINDS = Object.freeze({
  喜: '多说一句、愿意再来',
  怒: '争、顶嘴',
  哀: '慢下来、少说',
  惧: '缩、先查、先问',
  忧: '反复想、提前防',
  思: '琢磨、拆开看',
  惊: '停、复核',
  爱: '靠近、护着',
  恶: '推开、拒绝',
  欲: '排事、推进',
})
export const SEVEN = Object.freeze(Object.keys(FEEL_KINDS))
const DIR = path.join(HOME, 'dayu', 'soul', 'feel')

function file(role) {
  return path.join(DIR, `${role}.jsonl`)
}

/** 记一条自述感觉。 */
export function addFeel(role, { valence, kind = '', say, from, vague = false, now = Date.now() } = {}) {
  const v = Number(valence)
  if (!Number.isFinite(v) || v < -2 || v > 2) throw new Error('valence 要是 -2 到 2')
  const text = String(say || '').trim()
  if (!text) throw new Error('say 不能空——说不出什么感觉，就别记')
  const src = String(from || '').trim()
  if (!src) throw new Error('from 不能空——说不出是哪件事的感觉，就还是心情播报，不是感觉')

  const row = {
    at: new Date(now).toISOString(),
    role,
    valence: v,
    say: text.slice(0, 200),
    from: src.slice(0, 120),
    kind: SEVEN.includes(String(kind)) ? String(kind) : '',
    vague: Boolean(vague),
  }
  fs.mkdirSync(DIR, { recursive: true })
  fs.appendFileSync(file(role), JSON.stringify(row) + '\n', 'utf8')
  return row
}

/** 读最近的感觉。 */
export function listFeels(role, { limit = 10 } = {}) {
  let rows = []
  try {
    rows = fs.readFileSync(file(role), 'utf8')
      .split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
  } catch { return [] }
  return rows.slice(-limit)
}

/** 平均好坏（-2..2）与条数；没记过返回 null。 */
export function feelStance(role, { days = 7, now = Date.now() } = {}) {
  const since = now - days * 86400000
  const rows = listFeels(role, { limit: 500 }).filter((r) => Date.parse(r.at) >= since)
  if (!rows.length) return null
  const avg = rows.reduce((s, r) => s + Number(r.valence || 0), 0) / rows.length
  return { n: rows.length, avg: Number(avg.toFixed(2)) }
}

/**
 * 由最近的感觉推出"这阵子该怎么走"。
 *
 * 为什么要有这一句：门槛只管"开不开口"，不管"怎么开口"。
 * 惧多了该先查、思多了该拆开、怒多了该摆到台面、欲多了该排事——
 * 这一句把"哪一种情"翻成一个可执行的做法，写在简报里。
 *
 * 只取最近 5 条，按时间加权（新的更重）；说不出主导情就不写。
 */
export function tendencyOf(role, { limit = 5, now = Date.now() } = {}) {
  const rows = listFeels(role, { limit }).filter((r) => r.kind)
  if (!rows.length) return null
  const score = {}
  rows.forEach((r, i) => {
    const w = 1 + i * 0.4                       // 越新越重
    score[r.kind] = (score[r.kind] || 0) + w * (1 + Math.abs(Number(r.valence) || 0) * 0.2)
  })
  const top = Object.entries(score).sort((a, b) => b[1] - a[1])[0]
  if (!top) return null
  const [kind] = top
  const how = FEEL_KINDS[kind]
  if (!how) return null
  return { kind, how, firstStep: FIRST_STEP[kind] || '', n: rows.length }
}

/** 简报里的"该怎么走"一句。 */
export function tendencyLine(role) {
  const t = tendencyOf(role)
  if (!t) return ''
  return `## 更该这样\n「${t.kind}」→ ${t.firstStep}`
}

/** 简报里的一句话：最近三条，不占地方。 */
export function feelsLine(role, { limit = 3 } = {}) {
  const rows = listFeels(role, { limit })
  if (!rows.length) return ''
  const tone = (v) => (v > 0 ? '+' : '') + v
  const items = rows.map((r) => {
    const k = r.kind ? `${r.kind}` : ''
    return `${r.say}（${k}${tone(r.valence)}）`
  }).join('；')
  const st = feelStance(role)
  const trend = st ? `（近7天${st.n}条）` : ''
  return `## 你自己说的感觉\n${items}${trend}`
}
