/* 标签
 * id: lib-subagent-brief
 * kind: module
 * summary: 把「分身最近做了什么」拼成一小段注入（最多 2 条）；只读 subagent-reports，不写盘、不发消息。
 * tags: 子分身, 注入, 工作台, 不是主体亲历
 * created: 2026-11-16 20:20:00
 * changed: 2026-11-16 20:20:00
 * author: 大鱼·子会话（实现代理）
 * authority: 父代理任务书（2026-11-16：分身汇报要能在工作台注入里看见）
 * audience: 常驻主体（大鱼/小鱼）、soul.js 的注入拼装
 * owner: 框架；只读，不改任何一条汇报
 * mutable: 可改；「最多 2 条」「明说不是主体亲历」「没有就返回空」三条不许改
 * usage: buildSubagentBrief(role, { limit = 2, now }) → string（没有就是 ''）
 * why: 分身干完活的汇报目前只落盘；她不翻盘就等于不知道分身做了什么，还会把分身的事当成自己亲历的
 * result: 有汇报时返回「抬头 + 每行 - [childRole/childSession] text + 一句边界说明」；没有返回 ''
 */
// 改｜2026-11-16 20:20｜大鱼·子会话（实现代理）｜授权：父代理任务书（2026-11-16：分身汇报进工作台注入）｜lib/subagent-brief.js:1-59｜新增 buildSubagentBrief：读 recentReports(role,{limit})，拼成短文本并写明「这是分身做的事，不是主体亲历」；空汇报返回 ''，不写盘、不发消息｜为什么：汇报只落盘就进不了注入，主体分不清哪些事是分身干的、哪些是自己亲历的｜验证：node scripts/test-subagent-brief.mjs 全过（临时 DSH_HOME，不碰真家）｜可改：文案可改，三条边界（最多 2 条/明说不是亲历/没有就空）不许改
import { recentReports } from './subagent-reports.js'
import { stripForInject } from './tags.js'

const ABOUT = '是分身做的事，不是主体亲历'
const HEAD = '## 分身在做什么（不是主体亲历）'
/** 一行最多多少字：这是目录不是全文，长了自己翻 ref。 */
const MAX_TEXT = 120

/** 汇报是分身写的自由文本：剥掉标签块、压成一行、去空白；不编内容。 */
const clean = (v) => stripForInject(String(v ?? '')).replace(/\s+/g, ' ').trim()

/**
 * 拼「分身在做什么」这一段。
 *
 * 读的是 lib/subagent-reports.js 的统一形状（只有 parentRole/childRole/childSessionId/text/ref/at），
 * **没有 inner/thoughts**——分身的私人内心不进主体注入，这里连拿都拿不到。
 *
 * @param {string} role 常驻主体（= 汇报的 parentRole）
 * @param {{limit?:number, now?:number|string|Date}} [opts] limit 默认 2（读到几条就写几条，最多 2 条）；
 *        now 是调用方统一的“现在”，目前只收下、不参与筛选：最近几条由汇报自己的 at 倒序决定，
 *        别在这里再拍一个时间窗（等工作台真需要“只报醒来之后的”时再加）。
 * @returns {string} 一段 markdown；一条可用的都没有就返回 ''（调用方 part() 会整段跳过）
 */
export function buildSubagentBrief(role, { limit = 2, now } = {}) {
  void now // 保留口子，见上面 opts 的说明
  let rows = []
  try { rows = recentReports(role, { limit }) } catch { return '' }
  const lines = []
  for (const row of rows) {
    const text = clean(row?.text)
    if (!text) continue // 空汇报不占一行；不拿它凑数
    const who = [clean(row?.childRole), clean(row?.childSessionId)].filter(Boolean).join('/') || '未知分身'
    lines.push(`- [${who}] ${text.slice(0, MAX_TEXT)}`)
  }
  // 没有就返回空串：宁可整段不出现，也不放一个空抬头占注入。
  if (!lines.length) return ''
  return [
    HEAD,
    ...lines,
    `以上${ABOUT}：别当成自己亲手做的；要细节按汇报里的 ref 去查，查不到就说没查到。`,
  ].join('\n')
}
