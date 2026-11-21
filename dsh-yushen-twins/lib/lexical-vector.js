/* 标签
 * id: lib-lexical-vector
 * kind: module
 * summary: 本地词频向量：中文按二字切、英文按词，余弦算相似；不下载模型、不联网。
 * tags: 检索, 词频, 余弦, 本地, 无模型
 * created: 2026-11-19 21:00:00
 * changed: 2026-11-19 21:17:44
 * author: 大鱼·本班
 * authority: 老板（2026-11-19：默认本地词频，小模型可选下载）
 * audience: 记忆检索、混合排序
 * owner: 框架；纯函数，不读盘
 * mutable: 可改；不要把它冒充语义嵌入
 * usage: vectorOf(text) / cosine(a,b) / score(query,doc)
 * why: 没有模型时也要有比纯关键词更稳的本地排序；它不解决换说法，只补词形相近
 * result: Map<string,number> 与 0..1 余弦分
 */

const STOP = new Set(['的', '了', '和', '与', '是', '在', '有', '我', '你', '她', '他', '它', '们', '这', '那', '一个', '一下', '什么', '怎么', '为什么', '可以', '需要', '应该'])

function tokens(text) {
  const s = String(text || '').toLowerCase()
  const out = []
  for (const w of s.match(/[a-z0-9_]+/g) || []) out.push(w)
  const han = s.replace(/[^\u4e00-\u9fff]+/g, '')
  for (let i = 0; i + 1 < han.length; i += 1) out.push(han.slice(i, i + 2))
  return out.filter((t) => t.length >= 2 && !STOP.has(t))
}

export function vectorOf(text) {
  const v = new Map()
  for (const t of tokens(text)) v.set(t, (v.get(t) || 0) + 1)
  return v
}

export function cosine(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  for (const x of a.values()) na += x * x
  for (const x of b.values()) nb += x * x
  if (!na || !nb) return 0
  const small = a.size <= b.size ? a : b
  const other = small === a ? b : a
  for (const [k, x] of small) if (other.has(k)) dot += x * other.get(k)
  return dot / Math.sqrt(na * nb)
}

export function score(query, doc) {
  return cosine(vectorOf(query), vectorOf(doc))
}
