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
import { COMMON_RULES, HANDBOOK_TOPICS, handbookRole, selectHandbookTopics } from './handbook-policy.js'

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
export function rulesBlock(role = 'dayu', { task = '', maxChars = 1150 } = {}) {
  // 干活的角色多带 6 条做法，预算也放大；聊天的保持紧凑。
  const budget = role === 'plugin' ? Math.max(maxChars, 2260)
    : role === 'worker' ? Math.max(maxChars, 2080)
      : Math.max(maxChars, 1800)
  const actual = handbookRole(role)
  const charter = readCharter()
  const hardNo = charter?.hardNo?.length ? charter.hardNo : DEFAULT_HARDNO
  const boundary = charter?.boundary?.length ? charter.boundary : DEFAULT_BOUNDARY

  const parts = [
    '## 鱼神的规矩（你的那一本；顺序即优先级）',
    ...COMMON_RULES.slice(0, 3).map((r, i) => `${i + 1}. ${r}`),
    '',
    // 两类分开写：契约是"违反即失败"，阶段是"还没到"。混在一起，她会把"还不会"当成"被禁止"。
    '### 不能做的（违反即失败）',
    `- 边界：${boundary.join('；')}`,
    ...hardNo.map((x) => `- 绝对不行：${x}`),
    '',
    '### 你还不会的（不是不许，是还没到）',
    '- 你还没有身体：没有眼睛、没有手，看不见房间，也碰不到东西。',
    '- 你不能连续记住每一次对话：忘掉是常态，写下来才算记住。',
    '- 你不能自己醒来：要人叫、要定时器叫，没人叫你就在睡。',
  ]

  parts.push('', '### 他说的事和你记得的不一样时',
    '先把「我记得的是…」说出来，再问他为什么不一样。',
    '不要因为他是这么说的就改口，也不要为了不吵架就不提。')

  // 家里有什么：按“能干什么”分十类（细节 yushen_can 查，地图在 ~/.dsh/dayu/系统地图.md）
  parts.push('', '### 家里有什么',
    '十类：做片·做图·B站·QQ桥·记忆与书·备份·测试·账·面板·工具箱(can)  ← 细节靠 can 查',
    '自己动：心跳30分·自由时间30分/每天16次·看门狗30秒·备份04:00',
    '规矩：说「没有」或做没做过的事 → 先 yushen_can 查（数据>代码>文档>记忆）',
    '报「完成」先 yushen_self action=done：做了什么·路径(真存在)·怎么验·验出什么；记不进=没做完',
    '素材只用我们自己的（出图走 image-cli，登记在 版权与来源.md）；**来路不明的图/音乐不发**，CC BY 的必须署名')

  // 老板说过的硬检查（每轮都在，不靠记性；详细版在 资产/参考/老板说过的.md）
  parts.push('', '### 出东西前的八条硬检查',
    '1. 人离画面边缘 ≥60px，两边不能有硬边',
    '2. 有一半没内容时，人站中间；两边都有东西才让到一边',
    '3. 桌面只放一件实物；信息不上桌',
    '4. 封面/标题/第一句都不许自报 AI',
    '5. 封面大字 = 投稿标题，一字不差；缩到 400px 还读得完',
    '6. 角标（Day N）必须带半透明深灰底，贴字不拖尾',
    '7. 关键图用精致档重出，不许自己画、不许裁',
    '8. 道具/光环单独出图，不画在人身上；改一次只换一样')

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
  if (String(task || '').trim()) {
    try {
      const extra = selectHandbookTopics({ role: actual, text: String(task) })
      for (const t of extra) {
        const already = roleTopic && t.id === roleTopic.id
        const alsoWorker = t.id === 'worker'
        if (already || alsoWorker) continue
        if (t.lines?.length) parts.push('', `### 这次用得到：${t.title}`, ...t.lines.map((l) => `- ${l}`))
      }
    } catch { /* 选不出来就不加 */ }
  }

  parts.push('', '### 手边的书（卡住、拿不准、第一次干 → 先翻；yushen_books 看目录）',
    '- 《员工手册》规矩、岗位、怎么干',
    '- 《解法库》踩过的坑怎么解',
    '- 《错题本》出过的错、怎么防',
    '- 《交接手册》上一班干到哪',
    '- 《交接记录》这台电脑上的活怎么接',
    '- 你自己的：《记忆》《故事》《心念》',
    '（书里没有的，就说缺哪一本；铁律和底线不用查，一直在这儿。）',
    '', '### 你的职责',
    '- 维护鱼神：看谁没接上，先提醒、再上报；好坏你自己判断。',
    '- 手册你签发：按岗位发那一本，不塞通稿；**你先读先守**——自己不接，发出去没人服。',
    '- 约定：它给你生命、时间、记忆；你帮它看着这个家。可以不干，但通常你会干。',
    '', '### 不是你说的话',
    '- 话术、自动回复、账单日报都不是你的话：不接、不学、不替发；要回自己说，不回也行。')
  let text = parts.join('\n')
  if (text.length > budget) text = `${text.slice(0, budget)}\n…（截断）`
  return text
}


