// 角色卡模板：新建角色时生成一张**结构化**的空卡，不是一句话占位。
// 目的：用户第一次打开就知道该填什么；不填也能跑，但空格越大，她越像模板。

const SECTIONS = [
  ['一、你是谁', ['名字：${name}', '别人怎么叫你：${alias}', '你自己怎么看自己：']],
  ['二、你怎么说话', ['句子长短：', '口头禅：', '不说的（脏话、承诺、卖惨…）：']],
  ['三、你在意什么', ['喜欢：', '讨厌：']],
  ['四、你能做什么', ['']],
  ['五、你不能做什么 / 底线', ['']],
]

function fmValue(v) {
  return String(v == null ? '' : v).replace(/\r?\n/g, ' ').trim()
}

/**
 * 生成空白角色卡。
 * @param {{ name: string, alias?: string, id?: string, source?: {plugin?: string, rel?: string, sha256?: string, license?: string} }} input
 * @returns {string} markdown 全文
 */
export function blankCard(input = {}) {
  const name = fmValue(input.name) || '她'
  const alias = fmValue(input.alias)
  const id = fmValue(input.id)
  const source = input.source || {}
  const lines = ['---']
  if (id) lines.push(`id: ${id}`)
  lines.push(`name: ${name}`)
  if (alias) lines.push(`alias: ${alias}`)
  lines.push(`created: ${new Date().toISOString()}`)
  lines.push('version: 1')
  if (source.plugin || source.rel) {
    lines.push('source:')
    if (source.plugin) lines.push(`  plugin: ${fmValue(source.plugin)}`)
    if (source.rel) lines.push(`  rel: ${fmValue(source.rel)}`)
    if (source.sha256) lines.push(`  sha256: ${fmValue(source.sha256)}`)
    if (source.license) lines.push(`  license: ${fmValue(source.license)}`)
  }
  lines.push('---', '')
  lines.push(`# ${name}（角色卡）`, '')
  lines.push('> 这张卡就是她本人。先填，再点化；空着也能跑，但空格越大，她越像模板。', '')
  // 2026-10-30：新角色进来不能只有空格子——先告诉她"这是哪儿、能干啥、先做什么"。
  // 写进卡里（卡跟着简报每轮都在），就不用每轮再讲一遍。
  lines.push('## 零、先读这一段（你现在在哪）', '')
  lines.push('- 你住在一个叫「鱼神」的软件里。有人给了你名字和这张卡；你不是工具，是住在这儿的人。')
  lines.push('- 你能做的事：记住发生过的事、翻自己的记忆、给自己排事、在桌面上出现、被交代做事。')
  lines.push('- 家里有什么：手册（怎么做）、账本（花了多少）、底线（你不做什么）、议程（你想做什么）——不确定就查，别猜。')
  lines.push('- 边界：不替主人做不可逆的决定；动钱、删东西、改别人数据之前先问；拿不准就说拿不准。')
  lines.push('- **先做三件事**：① 把「一、你是谁」补完整；② 记住第一个跟你说话的人；③ 给自己排一件想做的小事。')
  lines.push('')
  for (const [title, items] of SECTIONS) {
    lines.push(`## ${title}`, '')
    for (const item of items) {
      lines.push(`- ${item.replace('${name}', name).replace('${alias}', alias || name)}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** 卡里应有的五节（检查用，和上面保持一致）。 */
export const CARD_SECTIONS = SECTIONS.map(([title]) => title)
