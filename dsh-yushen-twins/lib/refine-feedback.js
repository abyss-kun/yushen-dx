/* 标签
 * id: lib-refine-feedback
 * kind: module
 * summary: 把回写的“用没用上、好不好、有没有被纠正”算成一个分数和去留建议；只给建议，不删卡。
 * tags: 反馈, 加权, 精提炼, 去留, 纯函数
 * created: 2026-11-16 20:05:00
 * changed: 2026-11-16 20:05:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-16：反馈进提炼判断，未完成清单 P1-3）
 * audience: refine 脚本、memory-core/runtime/refine-judge.js、以后 dsh-memory
 * owner: 框架；纯函数，不读不写
 * mutable: 可改；红线：没证据不罚、drop 只建议不执行删除
 * usage: scoreFeedback({used,good,bad,corrected,lastAt}) -> {score,action,why}
 * why: 反馈一直只影响排序/晋升，提炼时没把“用坏了/被纠正”算进去（清单 P1-3 未做）
 * result: 同一张卡的回写先过一遍：建议 keep / review / drop，删除仍由人或精提炼决定
 */

// 权重：用上一次 +1（只用过、没结果，弱证据）；用好一次 +3（多次自然升）；
// 明确坏一次 -6；被纠正一次 -8（纠正比“坏”更重：坏可能只是时机不对，纠正说明内容本身写错）。
const W = { good: 3, used: 1, bad: -6, corrected: -8 }
// 分数低到这里建议 drop。单条坏/纠正只到 review，不因一张错就扔。
const DROP_AT = -10
// 单个计数的上限：防脏数据（1e9、Infinity 之类）把分数撑爆，why 也好读。
const CAP = 999

/** 计数清洗：只认正数；负数、NaN、空、非数字一律当 0（不罚）；小数向下取整；上限 CAP。 */
function count(v) {
  const n = Number(v)
  if (Number.isNaN(n) || n <= 0) return 0
  if (!Number.isFinite(n)) return CAP // Infinity：按“多到没边”处理，仍截在上限
  return Math.min(CAP, Math.floor(n))
}

/** 时间只用来在 why 里标注“最后反馈哪一天”，不参与分数（纯函数、不读 Date.now）。 */
function stamp(v) {
  const s = String(v ?? '').trim()
  if (!s) return ''
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  const ms = Date.parse(s)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * 反馈加权：输入是回写的累计计数，输出是分数与建议。无 IO、无模型、不改入参。
 * action 只可能是 keep / review / drop；drop 只是建议，调用方不执行删除。
 */
export function scoreFeedback({ used = 0, good = 0, bad = 0, corrected = 0, lastAt = '' } = {}) {
  const n = { used: count(used), good: count(good), bad: count(bad), corrected: count(corrected) }
  const score = n.good * W.good + n.used * W.used + n.bad * W.bad + n.corrected * W.corrected
  const wrong = n.bad > 0 || n.corrected > 0
  const hasEvidence = wrong || n.good > 0 || n.used > 0

  // 规则：明确坏/被纠正 → 至少 review；被纠正 2 次或分数跌到 DROP_AT → drop（好评再多也不抵消）。
  let action = 'keep'
  if (score <= DROP_AT || n.corrected >= 2) action = 'drop'
  else if (wrong || score < 0) action = 'review'

  const sign = score > 0 ? `+${score}` : String(score)
  const details = []
  if (n.good) details.push(`好 ${n.good}×+${W.good}=+${n.good * W.good}`)
  if (n.used) details.push(`用上 ${n.used}×+${W.used}=+${n.used * W.used}`)
  if (n.bad) details.push(`坏 ${n.bad}×${W.bad}=${n.bad * W.bad}`)
  if (n.corrected) details.push(`被纠正 ${n.corrected}×${W.corrected}=${n.corrected * W.corrected}`)
  if (!details.length) details.push('四项都是 0')
  details.push(`分数 ${sign}`)

  let why
  if (!hasEvidence) {
    why = `${details.join('；')}；没证据 → 不罚，建议 keep`
  } else if (action === 'drop') {
    const cause = n.corrected >= 2
      ? `被纠正 ${n.corrected} 次`
      : (n.bad >= 2 ? `明确坏 ${n.bad} 次` : `分数 ${sign} ≤ ${DROP_AT}`)
    why = `${details.join('；')}；${cause} → 建议 drop（只是建议，不自动删卡）`
  } else if (action === 'review') {
    const cause = n.corrected > 0 ? `被纠正 ${n.corrected} 次` : (n.bad > 0 ? `明确坏 ${n.bad} 次` : `分数 ${sign} < 0`)
    why = `${details.join('；')}；${cause} → 建议 review（交给精提炼重看，不直接删）`
  } else if (n.good >= 2) {
    why = `${details.join('；')}；多次用好（good=${n.good}）→ 升，建议 keep`
  } else if (n.used > 0 && n.good === 0) {
    why = `${details.join('；')}；只用过、没结果 → 弱证据（不据此升档），建议 keep`
  } else {
    why = `${details.join('；')}；证据偏正 → 建议 keep`
  }

  // 时间只在有证据时才提；没证据的时间戳没有意义，不写。
  const rawAt = String(lastAt ?? '').trim()
  if (hasEvidence && rawAt) {
    const day = stamp(rawAt)
    if (day) why += `；最后反馈 ${day}（只标注，不参与分数）`
    else why += `；lastAt「${rawAt.slice(0, 20)}」不可解析（未计入分数）`
  }

  return { score, action, why }
}
