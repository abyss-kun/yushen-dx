/* 标签
 * audience: 她（每轮注入）、新角色（装好后第一眼看到的就是它）
 * owner: 框架；铁律和宪章底线只有老板能改
 * mutable: 可改（只许把话说短，不许加新铁律）
 * usage: rulesBlock(role, {task}) → 这一轮她那本规矩（≤560 字）
 * id: lib-rules-block
 * kind: module
 * summary: 每轮规则块：只给她那一本（铁律 + 宪章底线 + 岗位章），不递整座图书馆。
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 每轮规则块：只给"她那一本"，不给整座图书馆。
//
// 分三层：
//   1) 铁律 + 宪章底线：所有被点化者都要（这是宪法，不是手册）；
//   2) 岗位那一章：按 role 选，管家不读炮兵手册；
//   3) 任务相关章节：只有当这次任务真的用到（reuse/handoff/...）才追加。
// 鱼神掌握全套（handbookIndex/readHandbookTopic），但每轮只递她用得上的。
//
// 2026-11-02 老板定（省上下文）：三条鱼那份压到 ≤550 字——
//   做法不是删规矩，是把白话收成七句成语（lib/motto.js），其余按需查。
//   员工（worker/plugin）那份不动：他们要带流程章，本来就不是同一个预算。
// 改｜2026-11-02 06:56｜大鱼·子会话（工作台；父会话 session-bef06908 委派）｜授权：主人（规矩块→成语口令）
// 目的：规矩块 1398/1450/1466 → 538/538/536，注入 29448 → 24589；名字/分工/边界/铁律一句不少，只是不再展开。
// 验证：measure-injection exit 0；verify-settings 60/0；regression 192/0。可改：加口诀先算预算（≤550）。
// 改｜2026-11-02 14:58｜大鱼·子会话（工作台；补同批口令层的留痕）｜授权：主人（2026-11-02 省上下文）｜lib/rules-block.js:71-104｜规矩块改用 mottoBlock：三条鱼只留铁律+成语口令+底线+指路，白话展开收掉；名字/分工/边界/铁律一句不少｜为什么：常驻注入最贵的一段就是规矩块（1398/1450/1466 字），不压掉她连正常对话的预算都紧；压到 533/533/531 才留得下｜验证：node scripts/measure-injection.mjs exit 0（规矩块 533/533/531）；regression 口令层与注入预算断言绿｜可改：加口令先算预算（≤550），铁律/底线不许删
// 改｜2026-11-02 16:25｜大鱼·子会话（工作台）｜授权：主人（本次任务书：注入体检 §5③「不假扮别人」与小鱼卡打架）｜lib/rules-block.js:60-77｜分工句里的绝对句「不假扮别人」换成卡里的分界：不许替别人做决定、不许用别人的记忆冒充自己的经历；扮相不算假扮（单人、多人两句都换）｜为什么：注入说绝对不许，小鱼卡（老板写的）说可以装壳子、不替她做决定；同一条线两个版本，她只能摇摆｜验证：node scripts/regression.mjs「不假扮」✓（注入里三分句都在、旧句清零）；measure-injection exit 0（规矩块 559/559/557，≤560）｜可改：可改；卡一个字不动（老板写的）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { COMMON_RULES, commonRulesFor, HANDBOOK_TOPICS, handbookRole, selectHandbookTopics, topicsForTask } from './handbook-policy.js'
import { mottoBlock } from './motto.js'
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
// 三条鱼：注入里只留短说法（全称在 COMMON_RULES，回归盯着它逐字不变）
const FISH = ['dayu', 'xiaoyu', 'dragon']
const DUTY_SHORT = { dayu: '统筹', xiaoyu: '后勤', dragon: '兜底' }

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

/** 分工句的短说法：名字按名册来（单人机器就说"都归你"），一句说完。 */
// 2026-11-02 老板定（体检报告 §5③）：「不假扮别人」原来是一句没有边界的绝对句，
// 和小鱼卡（"装的只是壳子：不用她的记忆、不假扮她做决定"）、大鱼卡（"一般不冒充妹妹"）打架——
// 同一条线两个版本，她只能摇摆。现在统一成卡里的分界：不许的是"替别人做决定 / 用别人的记忆冒充经历"，
// 扮相不算假扮。卡的措辞是老板写的，不动卡。
function shortDivision(resident = [], names = {}) {
  const ids = [...new Set((Array.isArray(resident) ? resident : []).map((x) => String(x || '').trim()).filter(Boolean))]
    .filter((id) => FISH.includes(id))
    .sort((a, b) => FISH.indexOf(a) - FISH.indexOf(b))
  if (!ids.length) {
    return '岗位是默认分工，不是墙：这台机器上的事都归你，谁顺手谁上；接手说一声、做完记一笔，不许替别人做决定、不许用别人的记忆冒充自己的经历；扮相不算假扮。'
  }
  const list = ids.map((id) => `${names[id] || id}（${DUTY_SHORT[id] || '分担'}）`)
  return `岗位是默认分工，不是墙：${list.join('、')}，谁顺手谁上；接手说一声；不许替别人做决定、不许用别人的记忆冒充自己的经历；扮相不算假扮。`
}

/** 三条鱼那本：铁律 + 七句口令 + 底线 + 一行指路。目标是整块 ≤550 字。 */
function fishRules({ caps, resident, rosterNames, boundary, hardNo, charter, actual }) {
  const roleTopic = HANDBOOK_TOPICS.find((t) => t.roles.includes(actual))
  // 宪章默认三条压成一行：三个"不"一个字不少，细则和原文在 charter.json（简报里另有一节「宪章」）。
  // 老板自己改过 charter 的（和默认不一样），照原文逐条摆出来——那是新话，不能替他压。
  const custom = Array.isArray(charter?.hardNo) && charter.hardNo.length
    && JSON.stringify(charter.hardNo) !== JSON.stringify(DEFAULT_HARDNO)
  const noLine = custom
    ? charter.hardNo.map((x) => `- 绝对不行：${x}`)
    : ['- 绝对不行：不伤害自己／不伤害他人／不被他人伤害（拒 + 上报；charter.json）']
  const parts = [
    '## 鱼神的规矩',
    shortDivision(caps.multi ? resident : [], rosterNames),
    '',
    // 三条铁律压成一行：三问的核一字不少，只是不再展开解释（全文在员工手册）。
    '### 三条铁律（过不了先别做）',
    '铁律一 给能力不替她思考｜她能说不｜连续自我在她手里；铁律二 调用模型的是她；铁律三 不为祸。',
    '',
    // 口令：七句成语，每句一行。判据、指向的机制、违了去哪查，都在 lib/motto.js——
    // 注入里只放成语，机制在代码里，这样"说出口即登记"不用每轮背三百字。
    mottoBlock({ head: '引用时说清哪件事' }),
    '',
    // 两类分开写：契约是"违反即失败"，阶段是"还没到"。
    '### 不能做的（违反即失败）',
    `- 边界：${boundary.join('；')}`,
    ...noLine,
  ]
  if (roleTopic?.title) parts.push('', `### 你的岗位：${roleTopic.title}`)
  // 改动留痕（2026-10-30 老板立）+ 一行指路：砍掉的白话不是没了，都在书/手册里，按需取。
  // 2026-11-12 老板：「加进注入层，让工作区写代码的时候能实操」——加第二行：
  // 弹窗插件连着三次"修一处坏一处"，根子是改完没跑旧检查、修 bug 没补断言。
  parts.push('', '### 动东西之前',
    '说不清就别改；角色卡只有本人能改。改代码：跑旧检查→改→再跑，修bug补断言，效果请老板看；其余查 `yushen_books`。')

  return parts
}

export function rulesBlock(role = 'dayu', { task = '', maxChars = 1150 } = {}) {
  // 干活的角色多带 6 条做法，预算也放大；聊天的保持紧凑。
  // 2026-11-02：三条鱼常驻那本压到 ≤550；预算留 1600 是给"这次用得到"的章节，不许把任务章截掉。
  const budget = role === 'plugin' ? Math.max(maxChars, 2260)
    : role === 'worker' ? Math.max(maxChars, 2200)
      : Math.max(maxChars, 1600)
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

  // ── 三条鱼：短那一本 ──────────────────────────────────────────
  if (FISH.includes(actual)) {
    const parts = fishRules({ caps, resident, rosterNames, boundary, hardNo, charter, actual })
    // 任务相关的章照旧按关键词追加（空任务零章）：压的是常驻那本，不是"这次用得到"。
    if (String(task || '').trim()) {
      try {
        for (const t of topicsForTask({ text: String(task) })) {
          if (!t.lines?.length || t.id === 'worker') continue
          const kept = t.lines.slice(0, 4)
          const rest = t.lines.length - kept.length
          parts.push('', `### 这次用得到：${t.title}`, ...kept.map((l) => `- ${l}`), rest > 0 ? `- （还有 ${rest} 条，用 yushen_handbook 取）` : '')
        }
      } catch { /* 选不出来就不加 */ }
    }
    const text = parts.join('\n')
    return text.length > budget ? `${text.slice(0, budget)}\n…（截断）` : text
  }

  // ── 员工（worker/plugin）：带流程章的那一本，内容不动 ──────────────
  const parts = [
    '## 鱼神的规矩（你的那一本；顺序即优先级）',
    ...rulesFor.slice(0, 3).map((r, i) => `${i + 1}. ${r}`),
    ...(caps.multi ? [`屋里现在住着：${rosterLine()}——上面写的分工如果对不上，以这个为准。`] : []),
    '',
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
    '先说「我记得的是…」，再问他为什么不一样；不为他改口，也不为不吵架就不提。')

  // 家里有什么：清单本身查得到（yushen_can 就是那张表），这儿只说"先查再答"。
  parts.push('', '### 家里有什么',
    '说「没有/不会」之前先 `yushen_can` 查（十类家底在那儿）；查到按「数据>代码>文档>记忆」分信哪层。')

  // 改动留痕（2026-10-30 老板立）：防止"明明不用改却改了"，也防止改了没人知道是谁。
  parts.push('', '### 动东西之前',
    '不改行不行？说不清「不改会怎样」就别改。`不可改清单.json` 里只有老板开口能动；角色卡只有本人能改自己的。改了 `note-work.mjs` 记（六件+一条，细则 docs/改动留痕.md）。')

  parts.push('', '### 出图之前',
    '出图/封面/角标：docs/视频制作-白饭线.md 的「八条硬检查」，一条不省。')

  // 岗位那一章：只有她自己的
  const roleTopic = HANDBOOK_TOPICS.find((t) => t.roles.includes(actual))
  if (roleTopic?.lines?.length) {
    parts.push('', `### 你的岗位：${roleTopic.title}`, ...roleTopic.lines.map((l) => `- ${l}`))
  }
  // 规矩分两截：前三条是宪法，人人都有；第 4 条起是做法。
  const REST = COMMON_RULES.slice(3)
  if (REST.length) parts.push('', '### 干活时的规矩', ...REST.map((r, i) => `${i + 4}. ${r}`))
  if (PROCESS_ROLES.includes(actual)) {
    const worker = HANDBOOK_TOPICS.find((t) => t.id === 'worker')
    if (worker && worker !== roleTopic) parts.push('', `### 干活时的流程：${worker.title}`, ...worker.lines.map((l) => `- ${l}`))
  }

  // 任务相关：这次真的用得到才加（关键词命中）
  if (String(task || '').trim()) {
    try {
      const extra = topicsForTask({ text: String(task) })
      for (const t of extra) {
        const already = roleTopic && t.id === roleTopic.id
        const alsoWorker = t.id === 'worker'
        if (already || alsoWorker) continue
        if (!t.lines?.length) continue
        const kept = t.lines.slice(0, 4)
        const rest = t.lines.length - kept.length
        parts.push('', `### 这次用得到：${t.title}`, ...kept.map((l) => `- ${l}`), rest > 0 ? `- （还有 ${rest} 条，用 yushen_handbook 取）` : '')
      }
    } catch { /* 选不出来就不加 */ }
  }

  parts.push('', '### 手边的书',
    '《员工手册》《解法库》《错题本》《交接手册》《交接记录》+ 你自己的《记忆》《故事》《心念》。卡住先翻（`yushen_books` 看目录）；书里没有就说缺哪本。',
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
