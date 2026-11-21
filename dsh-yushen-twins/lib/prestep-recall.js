/* 标签
 * id: lib-prestep-recall
 * kind: module
 * summary: 每轮开始前，只在话里出现“上次/之前/原来/答应”等回指时，给一条记忆预览；没回指不注入。
 * tags: 预注入, 召回, 每轮, 回指, 按需
 * created: 2026-11-17 19:52:00
 * changed: 2026-11-21 19:33:21
 * author: 大鱼·本班
 * authority: 老板（2026-11-17：每轮按需预注入，不是每轮都注入）
 * audience: agent/pre-step 钩子
 * owner: 框架；只读检索，不写记忆
 * mutable: 可改；回指词和“只给一条预览”是边界
 * usage: needsRecall(text) / buildPreStepRecall(role,text,{search,limit})
 * why: 她不会每句话都搜；但说“上次/之前/答应”时，本地应该先把相关一条放眼前
 * result: 一句【记忆预览】；没有回指/没搜到就空串
 */
import { find } from '../memory-core/runtime/query.js'
import { logInjection } from './injection-log.js'

const CUE = /上次|上一次|之前|以前|原来|还记得|记得|那天|昨晚|昨晚|刚才|刚刚|说过|答应|约定|历史|那时|当时/
const SKIP = /^(继续|好|嗯|在吗|谢谢|哈哈)/

export function needsRecall(text) {
  const s = String(text || '').trim()
  if (!s || s.length < 3) return false
  if (SKIP.test(s)) return false
  return CUE.test(s)
}

/**
 * 只在有回指时搜一条预览；search 可注入测试。
 * @returns {string} 空串=不注入
 */
export function buildPreStepRecall(role, text, { search = find, limit = 1 } = {}) {
  const s = String(text || '').trim()
  if (!needsRecall(s)) return ''
  let hits = []
  try { hits = search(s, { limit: Math.max(1, Number(limit) || 1), role }) || [] } catch { hits = [] }
  const first = Array.isArray(hits) ? hits[0] : null
  if (!first) return ''
  const snippet = String(first.snippet || first.text || '').replace(/\s+/g, ' ').trim().slice(0, 180)
  if (!snippet) return ''
  const refValue = first.ref
  const ref = String(
    typeof refValue === 'string'
      ? refValue
      : refValue?.path || refValue?.ref || refValue?.id || first.path || first.turnId || '',
  ).slice(0, 120)
  // 2026-11-21：落一笔注入账，事后可审计“给过什么、用没用上”。
  try { logInjection({ role, kind: 'prestep', items: [{ key: ref || String(first.turnId || ''), text: snippet }] }) } catch { /* 记账失败不挡注入 */ }
  return `【记忆预览】${snippet}${ref ? `\n出处：${ref}` : ''}`
}
