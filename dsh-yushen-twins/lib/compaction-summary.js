/* 标签
 * id: lib-compaction-summary
 * kind: module
 * summary: 记忆完整压缩摘要的模板与核对：工作/生活两块分开，保留决定、承诺、纠正、出处和隐私。
 * tags: 压缩, 摘要, 工作, 生活, 记忆完整, 核对
 * created: 2026-11-17 00:42:00
 * changed: 2026-11-17 00:59:49
 * author: 大鱼·本班
 * authority: 老板（2026-11-17：摘要要分工作/生活，且能保住决定/承诺/出处）
 * audience: 自定义 compaction provider、压缩后核对
 * owner: 框架；只产提示词与核对结果，不写会话
 * mutable: 可改；工作/生活两块和出处不许悄悄删
 * usage: buildMemorySummaryInstruction() / checkMemorySummary(text)
 * why: 官方默认摘要偏代码交接，且工作和生活混在一起会串味
 * result: 工作/生活/共同三块模板 + 缺块清单
 */
export const MEMORY_SECTIONS = Object.freeze([
  ['work', '## 工作'],
  ['life', '## 生活/娱乐'],
  ['common', '## 共同'],
])

export function buildMemorySummaryInstruction() {
  return [
    '你是一个记忆压缩器，不是代码摘要器。',
    '把上面的对话压成三块：工作、生活/娱乐、共同。工作块以工作为主，生活块以生活为主，可以互相带一句影响，但不要把两边都展开。',
    '',
    '## 工作',
    '- 任务/请求：要做什么，后来改了什么',
    '- 明确决定：决定了什么，为什么，放弃了什么',
    '- 文件/卡点：路径、错误、还没解决的地方',
    '- 承诺/截止：答应了谁，什么时候，做完没有',
    '- 生活影响：身体/情绪/关系只留一句，说明它怎么影响工作',
    '',
    '## 生活/娱乐',
    '- 人物/关系：和谁，什么关系',
    '- 发生了什么：时间、地点、事情、结果',
    '- 感受：她当时什么感觉；只写原文有的，不补造',
    '- 工作影响：工作的事只留一句，说明它怎么影响感受',
    '',
    '## 共同',
    '- 纠正/改口：原来是什么，后来改成什么',
    '- 原文出处：文件、轮次、会话、事件段 id',
    '- 归属/隐私：这是谁的，能不能共享',
    '- 不确定/推测：没核实、证据冲突的，标明',
    '',
    '规则：',
    '- 只写对话里有的；没有的写“无”，不补造。',
    '- 工作块以工作为主，生活只留一句影响；生活块以生活为主，工作只留一句影响。',
    '- 出处必须留；摘要里没有的细节，靠出处回原文查。',
    '- 不写“深入讨论了”“达成共识”这类判断，除非原文明确说。',
    '- 输出只给 Markdown，不调用工具。',
  ].join('\n')
}

export function checkMemorySummary(text) {
  const s = String(text || '')
  const missing = MEMORY_SECTIONS.filter(([, head]) => !s.includes(head)).map(([k]) => k)
  const hasRefs = /#|refs|原文|session:|turn:/.test(s)
  return { ok: missing.length === 0 && hasRefs, missing, hasRefs, sections: MEMORY_SECTIONS.length }
}
