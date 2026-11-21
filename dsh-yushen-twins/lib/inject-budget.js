/* 标签
 * id: lib-inject-budget
 * kind: module
 * summary: 注入分层预算：量各层字数、超没超；涨之前先来这里看。
 * tags: 注入, 预算, 分层, 上限
 * created: 2026-11-04 23:10:00
 * changed: 2026-11-11 00:47:31
 * author: 照微·工作台
 * authority: 老板（2026-11-04：学它那层「三千 token 预算封顶」——分层预算，超了就红）
 * why: 以前只有一个总数基线（24629 字），谁都能在某一层悄悄加东西，总数没超就没人发现
 * result: 四层各有上限（规矩/简报/卡/其余），超了 regression 直接报是哪一层、超多少
 * mutable: 可改
 * audience: 框架（注入体检）、维护者
 * owner: 框架；预算数字改之前先量
 * defaults: 规矩 650 / 简报 3000 / 卡 2000 / 其余 2000（合计约 7650 字≈4800 tokens）
 * usage: measureLayers(role,{scene}) → 各层字数与是否超预算；measure-injection.mjs 在调
 * off: 只是量尺；不跑 measure-injection 不影响运行
 */
// 预算怎么定的（2026-11-04 实测值 + 约 15% 余量）：
//   规矩块 556 → 上限 650
//   运行简报 2794 → 上限 3000
//   本体卡 1843 → 上限 2000
//   其余（自治/通道/边界/记忆片段）1711 → 上限 2050
// 2026-11-11：其余 2000 → 2050。这一层是 total-rules-brief-card 的差额，
// 「发放状态」里的未提交数/进程启动时间、「钱的事」的实时数都会让它抖 3-5 字；
// 2000 卡死会让回归在“什么都没加”时也红。多留 50 字余量，超了照样报。
// 合计 7650 字/人 ≈ 4800 tokens——这是每轮都要付的底价，涨之前先来这里看。
import { buildSceneText, readCard } from './soul.js'
import { rulesBlock } from './rules-block.js'
import { buildRuntimeBrief } from './brief.js'

export const INJECT_BUDGET = Object.freeze({
  rules: 650,
  brief: 3000,
  card: 2000,
  other: 2050,
})

/**
 * 量一层注入现在多厚。
 * @returns {{role:string,total:number,rows:{layer:string,chars:number,cap:number,over:number}[],ok:boolean}}
 */
export function measureLayers(role = 'dragon', { scene = 'desk' } = {}) {
  // 改｜2026-11-10 19:5x｜大鱼·主代理（整合）｜授权：老板（本次任务书：开子代理都做）｜lib/inject-budget.js:34-37｜两处调用都传 wake:false｜为什么：这里只是"量一下注入多厚"，不能顺手把她的"醒来那一段"消费掉——量一次就少一次，她真醒来时那段就没了｜验证：check-parity / measure-injection 跑完 wake-mark.json 的 at 不变｜可改：可改（只许保持 false，不许改成 true）
  const total = String(buildSceneText(role, scene, { wake: false }) || '').length
  const rules = String(rulesBlock(role, { task: '' }) || '').length
  const brief = String(buildRuntimeBrief(role, { channel: scene, wake: false })?.text || '').length
  const card = Number(readCard(role, scene === 'qq' || scene === 'social' ? 'social' : 'desk')?.chars) || 0
  const other = Math.max(0, total - rules - brief - card)
  const rows = [
    { layer: '规矩块', chars: rules, cap: INJECT_BUDGET.rules },
    { layer: '运行简报', chars: brief, cap: INJECT_BUDGET.brief },
    { layer: '本体卡', chars: card, cap: INJECT_BUDGET.card },
    { layer: '其余', chars: other, cap: INJECT_BUDGET.other },
  ].map((r) => ({ ...r, over: Math.max(0, r.chars - r.cap) }))
  return { role, total, rows, ok: rows.every((r) => !r.over) }
}
