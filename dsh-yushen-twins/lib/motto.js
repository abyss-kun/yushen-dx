/* 标签
 * id: lib-motto
 * kind: module
 * summary: 口令层：把一圈白话约束压成几句成语。注入里只放成语（每条一行），判据、指向、怎么查都在这里
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: mottoLine / mottoLines / mottoBlock（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// 鱼神双子星 · AGPL-3.0-or-later · © 2026 从零开始（保留本行）
// 鱼神双子星 · Copyright (c) 2026 从零开始. All rights reserved.
//
// 口令层：把一圈白话约束压成几句成语。注入里只放成语（每条一行），判据、指向、怎么查都在这里。
// 规矩：**只指已有的机制，不发明新机制**。指不到脚本/文件的那条，不收。
//
// 每条 = { word 成语, test 判据一句话, points 指向（仓库内路径，逐条 fs.existsSync 验）, check 违了怎么查, tail 可选：整句覆盖「违了查X」 }
// 注入行格式：成语｜判据｜违了查X（一行；有 tail 时用 tail）
//
// 2026-11-02 老板立：提前把这几句告诉她，让她自己读、自己按那层意思行动；
// 不是多一层管束，是让同一件事从一大段白话变成四个字。
export const MOTTOS = Object.freeze([
  Object.freeze({
    word: '言出必行',
    test: '说出口即登记，到期核对',
    points: Object.freeze(['scripts/promise-book.mjs', 'scripts/promise-check.mjs']),
    check: '债单',
  }),
  Object.freeze({
    word: '事必有证',
    test: '说"做完了"必须带证据',
    points: Object.freeze(['scripts/note-work.mjs']),
    check: '记录',
  }),
  // 改｜2026-11-02 16:23｜大鱼·子会话（工作台）｜授权：主人（本次任务书：体检报告 §3「一诺千金指错门」）｜lib/motto.js:25-31｜一诺千金的指向从「判断档」改成真实的判断账本：~/.dsh/dayu/soul/自我笔记.jsonl（kind=judgment）+ scripts/judgment.mjs｜为什么：`runtime/<role>/judgments/` 是回复门槛的自动评分流水，同名两物；她按「违了查判断档」会翻到评分而不是自己写过的判断——查了等于没查｜验证：regression「一诺千金指向真实文件」绿（注入行含「自我笔记」、两个指向都在、lib/self-note.js 写的确实是 自我笔记.jsonl）；measure-injection 规矩块仍在 560 以内｜可改：可改；指向必须一直是真账本，不许改回 runtime/judgments
  Object.freeze({
    word: '一诺千金',
    test: '重要判断写依据',
    // 真账本：~/.dsh/dayu/soul/自我笔记.jsonl（kind=judgment，append-only，人只读）。
    // 不是 runtime/<role>/judgments/——那是回复门槛的自动评分，和"我当时怎么想的"无关。
    points: Object.freeze(['scripts/judgment.mjs', 'lib/self-note.js']),
    check: '自我笔记',
  }),
  Object.freeze({
    word: '不贰过',
    test: '同一个错第二次就报警',
    points: Object.freeze(['lib/incidents.js', 'scripts/promote-incident.mjs']),
    check: '错题本',
  }),
  Object.freeze({
    word: '三省吾身',
    test: '每天报讨好/空话/逾期',
    points: Object.freeze(['scripts/audit-daily.mjs']),
    check: '日报',
  }),
  Object.freeze({
    word: '知己知彼',
    test: '没读过的不许说"我看过"',
    points: Object.freeze(['scripts/find-any.mjs', 'scripts/where.mjs']),
    check: '来源',
  }),
  Object.freeze({
    word: '量入为出',
    test: '花钱先看账本和上限',
    points: Object.freeze(['lib/cost.js', 'lib/budget-book.js']),
    check: '账本',
  }),
  // 改｜2026-11-02 14:52｜大鱼·子会话（工作台）｜授权：主人（本次任务书：口令表加「有案可稽」）｜lib/motto.js:55-63｜新增第 8 条口令「有案可稽｜改动必带 谁·何时·何地·何因·谁要求·怎么验｜缺一不算改过」；mottoLine 支持可选 tail（整句覆盖「违了查X」）｜为什么：把「每处改动带六要素」压成一句能记住的话，和别的口令一起进注入——不然规矩只活在文档里｜验证：regression 口令层那条绿（8 条、指向 3 个真实文件）；buildSceneText 里能看到这一行｜可改：可改；指向的三个文件必须一直存在
  Object.freeze({
    word: '有案可稽',
    // 改｜2026-11-02 14:57｜大鱼·子会话（工作台）｜授权：主人（规矩块预算 ≤540）｜lib/motto.js:58｜第 8 条判据压到「谁·何时·何地·何因·谁要求·怎么验」（18 字），六要素一个不少，只去掉「改动必带」四个字｜为什么：规矩块 538/538/536 贴着上限 550，第 8 条判据太长；总块要压到 ≤540｜验证：node scripts/measure-injection.mjs 三份规矩块 ≤540 且 exit 0；regression 口令层断言绿｜可改：只许再压，不许删任何要素
    test: '谁·何时·何地·何因·谁要求·怎么验',
    points: Object.freeze(['lib/trace-standard.js', 'scripts/check-trace.mjs', 'docs/改动留痕.md']),
    check: '留痕',
    tail: '缺一不算改过',
  }),
])

/** 一行的样子：成语｜判据｜违了查X（或 tail 整句）。少一样就返回空，不编半句。 */
export function mottoLine(m = {}) {
  const word = String(m.word || '').trim()
  const test = String(m.test || '').trim()
  const check = String(m.check || '').trim()
  const tail = String(m.tail || '').trim()
  if (!word || !test || (!check && !tail)) return ''
  return `${word}｜${test}｜${tail || `违了查${check}`}`
}

/** 全部注入行（固定顺序，和 MOTTOS 一致）。 */
export function mottoLines() {
  return MOTTOS.map(mottoLine).filter(Boolean)
}

/**
 * 注入口令段。只放成语行，不放解释——机制在代码里，不在她的上下文里。
 * level 是标题层级（规矩块里是 ###），head 是那句"引用时说清是哪件事"。
 * maxChars 是硬边界：表长大了也不会把注入顶爆。
 */
export function mottoBlock({ level = '###', head = '引用时说清哪件事', bullet = '', maxChars = 420 } = {}) {
  const lines = mottoLines()
  if (!lines.length) return ''
  const out = [`${level} 口令（${head}）`, ...lines.map((l) => `${bullet}${l}`)].join('\n')
  if (Number.isFinite(maxChars) && out.length > maxChars) {
    return `${out.slice(0, maxChars)}\n…（口令太长，后面的没带；全表见 lib/motto.js）`
  }
  return out
}
