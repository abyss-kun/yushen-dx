/* 标签
 * id: lib-eval-own
 * kind: module
 * summary: 自家记忆的小评测：固定问题 + 期望关键词，量“问得出来、接得住吗”，不吹对标。
 * tags: 评测, 记忆, 检索, 召回
 * created: 2026-11-21 22:1x
 * author: 大鱼·本班
 * authority: 老板（2026-11-21：继续——小评测）
 * audience: 维护、以后对比
 * owner: 框架；只读检索，不写记忆
 * usage: evaluateRecall(questions, search, {limit}) → 命中统计；QUESTIONS 是固定题
 * why: 之前只有 hit@4 自测 90.9%，没有“问真事”的固定题；改完不知道有没有变好
 * result: hit@1 / hit@8 / 漏掉的题；只对自家数据，不冒充 LOCOMO
 * mutable: 可改；题目只增不删（删要记原因）
 */
import { searchMemory } from '../memory-core/search.mjs'

/** 固定题：问的是“我们真发生过的事”，expected 是答案里该出现的词。 */
export const QUESTIONS = Object.freeze([
  { q: '图书馆到底收什么？', expected: ['图书馆', '整个软件'] },
  { q: '弱使用怎么算？', expected: ['显式', '弱使用'] },
  { q: '记忆带不带情绪？', expected: ['情绪', 'valence'] },
  { q: '决定改口了怎么处理？', expected: ['superseded', '覆盖'] },
  { q: '出厂包怎么打？', expected: ['出厂', 'tgz'] },
  { q: '心跳事故查过吗？', expected: ['心跳', '事故'] },
  { q: '老板怎么称呼？', expected: ['老板'] },
  { q: '卡片分级怎么分？', expected: ['顶游', '上游', '中游'] },
  { q: '派活单怎么验收？', expected: ['派活', '验收'] },
  { q: '备份放哪儿？', expected: ['备份', '冷档'] },
])

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase()

export function evaluateRecall(questions = QUESTIONS, search = searchMemory, { limit = 8, role = 'dayu' } = {}) {
  const rows = []
  for (const item of questions) {
    let hits = []
    try {
      const r = search(item.q, { role, limit })
      hits = (r?.hits || []).map((h) => String(h.text || ''))
    } catch { hits = [] }
    const hitAt = (k) => hits.slice(0, k).some((t) => item.expected.some((e) => norm(t).includes(norm(e))))
    const hit1 = hitAt(1)
    const hit8 = hitAt(limit)
    rows.push({ q: item.q, expected: item.expected, hits: hits.length, hit1, hit8 })
  }
  const total = rows.length
  const h1 = rows.filter((r) => r.hit1).length
  const h8 = rows.filter((r) => r.hit8).length
  return {
    total,
    hit1: h1,
    hit8: h8,
    rate1: total ? Number((h1 / total).toFixed(3)) : 0,
    rate8: total ? Number((h8 / total).toFixed(3)) : 0,
    misses: rows.filter((r) => !r.hit8).map((r) => r.q),
    rows,
  }
}
