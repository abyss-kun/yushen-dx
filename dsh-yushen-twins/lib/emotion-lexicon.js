/* 标签
 * id: lib-emotion-lexicon
 * kind: module
 * summary: 本地情绪词表：从一句话里判 valence（-1..1）、强度（0..1）、情绪词；不调模型。
 * tags: 情绪, 记忆, 词表
 * created: 2026-11-21 20:1x
 * author: 大鱼·本班
 * authority: 老板（2026-11-21：记忆要带情绪，别只记事）
 * audience: store.appendEvent、检索打分
 * owner: 框架；词表可加，判断规则可改
 * usage: detectEmotion(text) → {valence, intensity, emotion}
 * why: 事件只记事实，高兴和难受的事检索起来一样；先给事件一个便宜的“温度”
 * result: 正负词 + 否定翻转 + 程度词；判不准就 valence 0/强度 0，不瞎猜
 * mutable: 可改；宁可判不出，不许硬猜
 */
const POS = ['开心', '高兴', '喜欢', '顺利', '舒服', '踏实', '放心', '期待', '满意', '谢', '爱', '暖', '平静', '松', '好', '棒', '值', '感动', '轻松']
const NEG = ['烦', '累', '难过', '生气', '担心', '焦虑', '怕', '慌', '失望', '委屈', '闷', '疼', '苦', '崩', '急', '火', '冷', '后悔', '愧', '尬', '厌', '难受', '堵']
const NEGATION = ['不', '没', '别', '无', '未', '莫']
const BOOST = ['很', '太', '特别', '非常', '极其', '超', '巨', '极', '死', '透', '爆', '真']

function nearNegation(s, idx) {
  const before = s.slice(Math.max(0, idx - 3), idx)
  return NEGATION.some((n) => before.includes(n))
}

export function detectEmotion(text) {
  const s = String(text || '').slice(0, 400)
  if (!s) return { valence: 0, intensity: 0, emotion: '' }
  let pos = 0
  let neg = 0
  let firstPos = ''
  let firstNeg = ''
  for (const w of POS) {
    let i = s.indexOf(w)
    while (i >= 0) {
      const flip = nearNegation(s, i)
      if (flip) neg += 1
      else { pos += 1; if (!firstPos) firstPos = w }
      i = s.indexOf(w, i + w.length)
    }
  }
  for (const w of NEG) {
    let i = s.indexOf(w)
    while (i >= 0) {
      const flip = nearNegation(s, i)
      if (flip) pos += 1
      else { neg += 1; if (!firstNeg) firstNeg = w }
      i = s.indexOf(w, i + w.length)
    }
  }
  const hits = pos + neg
  if (!hits) return { valence: 0, intensity: 0, emotion: '' }
  const valence = Math.max(-1, Math.min(1, (pos - neg) / Math.max(3, hits)))
  const boost = BOOST.some((b) => s.includes(b)) ? 0.3 : 0
  const intensity = Math.max(0.2, Math.min(1, hits * 0.35 + boost))
  const emotion = pos >= neg ? firstPos || '好' : firstNeg || '不好'
  return { valence: Number(valence.toFixed(2)), intensity: Number(intensity.toFixed(2)), emotion }
}
