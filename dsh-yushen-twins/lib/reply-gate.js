// 判断：要不要现在抬头。
//
// 这是「权重参与判断，不替代判断」的最小样板（框架 §4.6）：
// 不再是 `if (score <= 25) return`，而是把几个事实乘上砝码，得一个分数，
// 分数过不过线由她自己那份权重定——砝码摆在明面上，能调、能复盘。
//
// 输入全是事实，不掺结论；输出只是"想不想回"，回什么另说。
import { readWeights } from './runtime.js'
import { feelStance } from './feel.js'

export const PART_WEIGHTS = Object.freeze({ freshness: 0.55, attention: 0.25, atMe: 0.25 })

/**
 * @param {object} input
 * @param {number} input.now       现在
 * @param {number} input.msgAt     这条消息的时间
 * @param {boolean} input.atMe     有没有点名/@ 她
 * @param {number} input.unread    她还没看的条数
 * @param {object} input.weights   她的权重（至少 replyGate）
 */
export function desireOf({ now = Date.now(), msgAt = 0, atMe = false, unread = 1, weights = {} } = {}) {
  const gate = Number(weights.replyGate ?? 0.5)
  const ageMin = Math.max(0, (now - Number(msgAt || now)) / 60000)
  const freshness = Math.exp(-ageMin / 30)                       // 半小时衰减一半
  const attention = 1 / (1 + Math.max(0, Number(unread) - 1) / 5) // 积压越多，越不想插嘴
  const atBoost = atMe ? PART_WEIGHTS.atMe : 0
  const score = PART_WEIGHTS.freshness * freshness + PART_WEIGHTS.attention * attention + atBoost
  const verdict = score >= gate ? 'reply' : score >= gate * 0.6 ? 'later' : 'skip'
  return {
    score: Number(score.toFixed(3)),
    gate,
    verdict,
    parts: { freshness: Number(freshness.toFixed(3)), attention: Number(attention.toFixed(3)), atBoost },
  }
}

/**
 * 自述感觉参与判断：她自己写下的好坏，会把门槛推一点。
 *
 * 规矩：感觉只调门槛，不改事实；推幅最大 ±0.16；没有感觉记录就一点不动。
 * 这样"我最近状态不好"能让她少插嘴，但不是被情绪接管。
 */
export function feelShift(role, { now = Date.now() } = {}) {
  let st = null
  try { st = feelStance(role, { now }) } catch { return null }
  if (!st || !st.n) return null
  const shift = Math.max(-0.16, Math.min(0.16, -st.avg * 0.08))
  return { ...st, shift: Number(shift.toFixed(3)) }
}

/** 按她的权重算；权重从运行时读，不写死在判断里。 */
export function decideFor(role, opts = {}) {
  const base = readWeights(role).values
  const feel = feelShift(role, { now: opts.now })
  const gate = feel
    ? Math.max(0.1, Math.min(0.95, Number(base.replyGate ?? 0.5) + feel.shift))
    : Number(base.replyGate ?? 0.5)
  const weights = { ...base, replyGate: Number(gate.toFixed(3)) }
  return { ...desireOf({ ...opts, weights }), weights, feel }
}
