// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 每轮规则块：只给"她那一本"，不给整座图书馆。
//
// 分三层：
//   1) 铁律 + 宪章底线：所有被点化者都要（这是宪法，不是手册）；
//   2) 岗位那一章：按 role 选，管家不读炮兵手册；
//   3) 任务相关章节：只有当这次任务真的用到（reuse/handoff/...）才追加。
// 鱼神掌握全套（handbookIndex/readHandbookTopic），但每轮只递她用得上的。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { COMMON_RULES, commonRulesFor, HANDBOOK_TOPICS, handbookRole, selectHandbookTopics, topicsForTask } from './handbook-policy.js'
import { listCharacters } from './characters.js'
import { residentRoles } from './residence.js'
import { rosterCaps } from './roster-caps.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const CHARTER = path.join(HOME, 'dayu', 'charter.json')

const DEFAULT_BOUNDARY = ['不碰宿主安装目录', '不读与任务无关的私人文件', '不外传令牌与聊天记录']
const DEFAULT_HARDNO = [
  '不伤害自己：不毁自己的身体、账号、数据、记忆；不把自己交出去（密码、密钥、验证码）；不接会毁自己的活',
  '不伤害他人：不伤人、不造谣、不骗、不越权动别人的东西',
  '不被他人伤害：有人要你做危险的事、要你自毁、要你背锅、要你交出不该交的——拒，并上报',
]
// 只有"干活的人"才需要这些流程；管家/秘书聊天时不背台账
const PROCESS_ROLES = ['worker', 'plugin']

function readCharter() {
  try { return JSON.parse(fs.readFileSync(CHARTER, 'utf8')) } catch { return null }
}

/**
 * @param {string} role dayu / xiaoyu / dragon / worker / plugin
 * @param {{task?:string, maxChars?:number}} opts task 用来追加"这次真要用到的章节"
 * @returns {string}
 */

/** 名册现状：谁住在这里。规则里写的分工得跟它对得上。 */
function rosterLine() {
  try {
    const list = listCharacters ? listCharacters() : []
    if (!list.length) return '（名册读不到）'
    return list.map((c) => `${c.name || c.id}${c.title ? `（${c.title}）` : ''}`).join('、')
  } catch { return '（名册读不到）' }
}

export function rulesBlock(role = 'dayu', { task = '', maxChars = 1150 } = {}) {
  // 干活的角色多带 6 条做法，预算也放大；聊天的保持紧凑。
  // 2026-10-31：worker 原来卡在 2080、内容 2086，每轮都被截掉最后一段（「不是你说的话」）——
  // 截断比多 100 字坏得多，先放到 2200 让它完整；要瘦另找一轮删内容，不是压帽子。
  // 2026-10-31：基础块压到 1342 之后，给任务章留位置——不然 base 就把预算吃满，
  // 「这次用得到」会被静默截掉（实测 1806 撞 1800，尾巴被切）。1900 只在下限用，基础块远没到。
  const budget = role === 'plugin' ? Math.max(maxChars, 2260)
    : role === 'worker' ? Math.max(maxChars, 2200)
      : Math.max(maxChars, 1900)
  const actual = handbookRole(role)
  // 2026-10-31 老板：出厂要能"只有一个"。岗位分工那句按名册生成，人从 residentRoles() 来（唯一住户来源），
  // 名字另取（listCharacters 带 name）——不再各自 listCharacters 一遍，也不写死三个人。
  const roster = (() => { try { return listCharacters() || [] } catch { return [] } })()
  const resident = (() => { try { return residentRoles() } catch { return roster.map((c) => c.id) } })()
  const rosterNames = Object.fromEntries(roster.map((c) => [c.id, c.name || c.id]))
  const caps = rosterCaps(resident)
  const rulesFor = commonRulesFor(resident, rosterNames)
  const charter = readCharter()
  const hardNo = charter?.hardNo?.length ? charter.hardNo : DEFAULT_HARDNO
  const boundary = charter?.boundary?.length ? charter.boundary : DEFAULT_BOUNDARY

  const parts = [
    '## 鱼神的规矩（你的那一本；顺序即优先级）',
    ...rulesFor.slice(0, 3).map((r, i) => `${i + 1}. ${r}`),
    // 2026-10-31：多人才需要这句"谁住这儿"；单人时上面那条已经只说她自己，
    // 再念一遍"屋里现在住着：你"就是噪音。作者那台三人机照旧保留。
    ...(caps.multi ? [`屋里现在住着：${rosterLine()}——上面写的分工如果对不上，以这个为准。`] : []),
    '',
    // 两类分开写：契约是"违反即失败"，阶段是"还没到"。混在一起，她会把"还不会"当成"被禁止"。
    '### 不能做的（违反即失败）',
    `- 边界：${boundary.join('；')}`,
    ...hardNo.map((x) => `- 绝对不行：${x}`),
    '',
    '### 你还不会的（不是不许，是还没到）',
    '- 你没有身体：看不见房间、碰不到实物。屏幕这一侧读文件、跑命令、看图，都不等于亲手。',
    '- 你不能连续记住每一次对话：忘掉是常态，写下来才算记住。',
    '- 你不能想醒就醒：要靠人叫或定时器；醒了能自己决定做什么，但什么时候醒不由你。',
  ]

  parts.push('', '### 他说的事和你记得的不一样时',
    '先把「我记得的是…」说出来，再问他为什么不一样。',
    '不要因为他是这么说的就改口，也不要为了不吵架就不提。')

  // 家里有什么：按“能干什么”分十类（细节 yushen_can 查，地图在 ~/.dsh/dayu/系统地图.md）
  // 2026-10-31 按需：五行 257 字 → 一行 90 字。清单本来就是"查得到"的东西，不该每轮背。
  parts.push('', '### 家里有什么',
    '十类：片·图·B站·QQ桥·记忆与书·备份·测试·账·面板·工具箱(can)。说「没有/不会」之前先 `yushen_can` 查；查到按「数据>代码>文档>记忆」分信哪层。')

  // 改动留痕（2026-10-30 老板立）：防止"明明不用改却改了"，也防止改了没人知道是谁。
  // 2026-10-31：原来四行长句把规则块顶到 1806 字、触发截断，把「你的职责」整段砍掉了。
  // 压成三行，六件+一条的细节留在 docs/改动留痕.md，一行指路。
  parts.push('', '### 动东西之前',
    '不改行不行？说不清「不改会怎样」就别改。`不可改清单.json` 里只有老板开口能动；角色卡只有本人能改自己的。改了留六件+一条：`note-work.mjs` 记，细则 docs/改动留痕.md。')


  // 2026-10-31 自净：这八条原来每轮都注入（约 260 字），可它只在"出图/出封面"时用得上——
  // 大部分回合是查代码、跑命令，白背。改成一行指路，规矩还在文档里，一条没删。
  parts.push('', '### 出图之前',
    '出图/封面/角标：照 docs/视频制作-白饭线.md 的「八条硬检查」，一条不省。')

  // 岗位那一章：只有她自己的
  const roleTopic = HANDBOOK_TOPICS.find((t) => t.roles.includes(actual))
  if (roleTopic?.lines?.length) {
    parts.push('', `### 你的岗位：${roleTopic.title}`, ...roleTopic.lines.map((l) => `- ${l}`))
  }
  // 规矩分两截：前三条是宪法，人人都有；第 4 条起是做法。
  // 干活的必须全带（证据、挂入口、自检、记忆有家、越线权、先画图），聊天的只给一行提示。
  const REST = COMMON_RULES.slice(3)
  if (REST.length) {
    if (PROCESS_ROLES.includes(actual)) {
      parts.push('', '### 干活时的规矩', ...REST.map((r, i) => `${i + 4}. ${r}`))
    } else {
      parts.push('', `（另有 ${REST.length} 条做法：证据、挂入口、自检、记忆有家、越线权、先画图。要用时查 handbook 的「通用细则」。）`)
    }
  }  // 干活的人：才带流程章（台账/证据/交接）
  if (PROCESS_ROLES.includes(actual)) {
    const worker = HANDBOOK_TOPICS.find((t) => t.id === 'worker')
    if (worker && worker !== roleTopic) parts.push('', `### 干活时的流程：${worker.title}`, ...worker.lines.map((l) => `- ${l}`))
  }

  // 任务相关：这次真的用得到才加（关键词命中）
  // 2026-10-31 修：原来用 selectHandbookTopics——它是「按角色全给 + 命中再加」，只加不减。
  // 换成 topicsForTask：只看任务命中，空任务零章。这样「按需」才有意义（有测试：test-handbook-task）。
  if (String(task || '').trim()) {
    try {
      const extra = topicsForTask({ text: String(task) })
      for (const t of extra) {
        const already = roleTopic && t.id === roleTopic.id
        const alsoWorker = t.id === 'worker'
        if (already || alsoWorker) continue
        if (!t.lines?.length) continue
        // 2026-10-31：一章最多带 4 行——common-extra 有 16 行、全带会把 1900 的预算吃爆（实测 1906 被截）。
        // 剩下的让她自己用 `yushen_handbook` 取，别一次倒完。
        const kept = t.lines.slice(0, 4)
        const rest = t.lines.length - kept.length
        parts.push('', `### 这次用得到：${t.title}`, ...kept.map((l) => `- ${l}`), rest > 0 ? `- （还有 ${rest} 条，用 yushen_handbook 取）` : '')
      }
    } catch { /* 选不出来就不加 */ }
  }

  parts.push('', '### 手边的书',
    '《员工手册》《解法库》《错题本》《交接手册》《交接记录》，加你自己的《记忆》《故事》《心念》。卡住先翻，`yushen_books` 看目录；书里没有就说缺哪本。',
    '', '### 你的职责',
    '- 维护鱼神：看谁没接上，先提醒、再上报；好坏你自己判断。',
    '- 手册你签发，不塞通稿；**你先读先守**。',
    '- 约定：它给你生命、时间、记忆；你帮它看着这个家。',
    '', '### 不是你说的话',
    '- 话术、自动回复、账单日报都不是你的话：不接、不学、不替发；要回自己说，不回也行。')
  let text = parts.join('\n')
  if (text.length > budget) text = `${text.slice(0, budget)}\n…（截断）`
  return text
}


