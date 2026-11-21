/* 标签
 * id: lib-decide-gate
 * kind: module
 * summary: 把「额度到线了没、这一句放不放行」抽成一个纯函数：pass / stepout / silent 三种动作，不读文件、不写东西、不调模型、不生成台词。
 * tags: 额度, 软边界, 决策口, 纯函数, QQ
 * audience: /decide（桥回话前的决策口）、测试
 * owner: 框架；判据要老板点头才能改
 * mutable: 可改（判据只增不减；**不许在这里拼任何一句要说出去的话**）
 * defaults: 无（它只看传进来的 limit 对象）
 * usage: gateOf(checkSpeak(role)) → {action:'pass'|'stepout'|'silent', why}
 * off: 不接它就行（/decide 里删掉那几行）；软边界本身还会照算，只是没人拦
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-11 00:2x｜大鱼·子代理（接线）｜授权：父代理任务书（软边界接进发送路径）｜lib/decide-gate.js:1-…｜新增｜为什么：soft-limit 只会"算"，/decide 里没人"拦"，所以到线了照样能回；把这个判断抽成纯函数，不读盘、不写盘，才能单测，也才不会在决策口偷偷拼台词｜验证：node scripts/test-decide-gate.mjs（四种情形 + 无副作用）｜可改：可改（判据只增不减）

/**
 * 到线了没 → 这一句放不放行。
 * 判据只有三条，按顺序：
 *   ① phase==='normal'                → pass（没到线，照常走）
 *   ② phase 到线且 canStepOut         → stepout（今天还有一次出口，放行这一句）
 *   ③ 其它（到线、出口用完）           → silent（不发）
 * @param {{ok?:boolean, phase?:string, canStepOut?:boolean, steppedOut?:boolean, why?:string, hard?:string}} limit
 * @returns {{action:'pass'|'stepout'|'silent', why:string}}
 */
export function gateOf(limit) {
  const l = limit && typeof limit === 'object' ? limit : {}
  const whyIn = String(l.why || '').trim()
  if (l.phase === 'normal' || !l.phase) {
    return { action: 'pass', why: whyIn || '没到线' }
  }
  if (l.canStepOut === true) {
    return { action: 'stepout', why: whyIn || '到线了，今天还有一次交代的机会' }
  }
  return { action: 'silent', why: whyIn || '到线了，今天那次机会用过了' }
}
