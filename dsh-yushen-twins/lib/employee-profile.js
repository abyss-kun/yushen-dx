// 员工画像与定制手册：不是每个会话都发同一本，而是先看她干过什么，再发她这一本。
//
// 依据（框架 §8.8.1 / §4.6.3）：
//   "通用底线保持短小；岗位章按职责发放；专项经验只有任务相关时才召回。
//    全局可发现不等于全量注入。"
//
// 证据只读本地账本，不调模型：
//   · 派活单（dispatch.json）里这个会话接过的简报
//   · 事故单（incidents.json）里这个会话出过的错
//   · 本次派活的简报
// 从这些文字里认出「这个员工在干什么」（标签），再交给 handbook-policy 选章、按预算裁。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { HANDBOOK_TOPICS, selectHandbookTopics } from './handbook-policy.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

/** 手册预算：一页以内。她要的不是整本书，是这一章。 */
export const EMPLOYEE_HANDBOOK_CHARS = 1200

/** 认得出来的岗位标签（可解释：命中哪些词，就发哪些章）。 */
export const TAG_RULES = Object.freeze([
  { tag: '界面/前端', re: /界面|页面|面板|client|组件|样式|拖拽|立绘|avatar|ui\b/i },
  { tag: '插件开发', re: /插件|plugin|cordis|manifest|注册|包装|适配器|补丁草案/i },
  { tag: '视频', re: /视频|剪辑|剪一条|剪片|片子|做片|字幕|渲染|ffmpeg|封面|配音|转写|成片/i },
  { tag: 'B站', re: /b站|bilibili|投稿|动态|私信|弹幕/i },
  { tag: '群聊/通道', re: /群聊|群消息|qq|私聊|桥接|潜水|唤醒/i },
  // 真实派活单里最常见的就是自修单："[自修] 冒烟/回归/真机/探活/缺口"
  { tag: '自修/排障', re: /\[自修\]|自省|冒烟|回归|真机|健康|探活|缺口|failed|失败|超时/i },
  { tag: '排查/运维', re: /报错|错误|端口|日志|事故|备份|磁盘|进程|崩溃|超时/i },
  { tag: '查资料/搜索', re: /查资料|查一下|搜一下|搜索|搜搜|资料|调研/i },
  { tag: '文档/整理', re: /文档|说明|readme|手册|整理|归档/i },
  { tag: '数据/账本', re: /账本|统计|报表|数据|导入|导出/i },
])

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}

/** 这个会话干过什么：最近几单的简报 + 它出过的错。只读，不改任何东西。 */
export function evidenceFor(sessionId, { jobs = 8, incidents = 5 } = {}) {
  const sid = String(sessionId || '')
  if (!sid) return { jobs: [], incidents: [] }
  const allJobs = readJson(path.join(DATA, 'dispatch.json'), [])
  const mine = (Array.isArray(allJobs) ? allJobs : [])
    .filter((j) => String(j.sessionId || '') === sid)
    .slice(0, Math.max(1, jobs))
    .map((j) => String(j.brief || '').slice(0, 160))
  const allInc = readJson(path.join(DATA, 'incidents.json'), [])
  const inc = (Array.isArray(allInc) ? allInc : [])
    .filter((i) => String(i.sessionId || '') === sid)
    .slice(0, Math.max(1, incidents))
    .map((i) => `${String(i.title || '')}：${String(i.text || '').slice(0, 120)}`)
  return { jobs: mine, incidents: inc }
}

/** 认标签：命中哪些词就认哪个岗位（带证据 + 出现次数，方便她复核）。 */
export function tagsOf(text) {
  const s = String(text || '')
  const hits = []
  for (const rule of TAG_RULES) {
    const flags = rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`
    let all = []
    try { all = [...s.matchAll(new RegExp(rule.re.source, flags))] } catch { all = [] }
    if (all.length) hits.push({ tag: rule.tag, hit: String(all[0][0]).slice(0, 20), count: all.length })
  }
  return hits
}

/** 岗位标签 → 要发的那几章（除了永远都有的 worker 基本章）。 */
// 2026-10-30：这里之前写的是 'problemSolving' / 'video' 这种不存在的 id，
// topicById 找不到就静默跳过——所以「做视频」「查资料」只发了 worker 基础章。
// 现在一律用 handbook-policy.js 里真实存在的 id，并补上原来空着的几类。
export const TAG_CHAPTERS = Object.freeze({
  '插件开发': ['plugin'],
  '界面/前端': ['plugin'],
  '视频': ['video-line'],
  'B站': ['video-line', 'common-extra'],
  '群聊/通道': ['handoff'],
  '自修/排障': ['common-extra'],
  '排查/运维': ['common-extra', 'handoff'],
  '文档/整理': ['reuse'],
  '数据/账本': ['common-extra'],
  '查资料/搜索': ['common-extra'],
})

/** 一页之内：头 + 员工底线 + 岗位章 + 任务相关章。 */
// 注意：这里**不放**三问/身份那几条铁律——它们约束的是"她"（是否被系统替她思考、替她写台词），
// 员工不是她。实测 6 次回执里 5 次念"已读手册"，但没有一次引用铁律、也没有一次拿它拒绝过什么，
// 说明那几条对员工只是背诵项（2026-10-26）。
const BOUNDARY = [
  '底线（员工版，能直接照做）：',
  '- **说的每句话都要有证据**：路径、行号、命令输出、时间戳、原文引用。没有证据就说“没查到/不确定”——不猜、不说“应该/大概/我记得”。',
  '- 不改别人的数据；改了什么要说，留证据；',
  '- 不冒充老板、不冒充她；说话就是你自己在说；',
  '- 不碰 DSH 安装目录；不读无关私人文件；不外传令牌与聊天记录；',
  '- 拿不准、做不到、要授权——直接说，别硬撑也别编。',
].join('\n')
const TAIL = '做完直接回：结果 + 证据（路径/命令输出/链接），别只说“做完了”。查重先跑 scripts/wheel-check.mjs。'

// 工具不随身带：手册告诉你去哪找、叫什么名。
// 2026-10-27 老板定的口径：工具是工具，谁用谁拿——需要的时候拿起来用，不是揣在兜里。
const TOOLS_HINT = [
  '## 这活要用的工具去哪找',
  '常用的几个名字：`read` 读文件 · `edit` 改文件 · `write` 新建 · `pwsh` 跑命令 · `grep`/`glob` 搜文件 · `read_image` 看图 · `present` 交成品 · `dayu_dispatch` 再派给别人。',
  '不确定就叫什么：`yushen_tools action=search query="你想干的事"`，它会给你名字和参数；拿到名字用 `action=call name=… args={…}` 直接用。',
  '**用时才拿，不用不占地方。**',
].join('\n')

/** 这个岗位常用的三个工具：只告诉她用得上的，别让她去 96 个里翻。 */
const TAG_TOOLS = Object.freeze({
  '插件开发': ['read', 'edit', 'pwsh'],
  '界面/前端': ['read', 'edit', 'read_image'],
  '视频': ['pwsh', 'read', 'present'],
  'B站': ['web_search', 'read', 'pwsh'],
  '群聊/通道': ['read', 'grep', 'pwsh'],
  '排查/运维': ['pwsh', 'grep', 'read'],
  '文档/整理': ['read', 'write', 'edit'],
  '数据/账本': ['read', 'pwsh', 'write'],
})

// 源章（视频/排障/发放）不在常驻章节库里——它们本来就按需读。
// 所以这里只给一句"该看哪本"，不把正文搬过来（§8.8.1：专项经验只在任务相关时召回）。
const SOURCE_HINT = Object.freeze({
  '视频': '视频：先定时长和段落结构；字幕对轴、封面单独出；成片路径写清楚。细节读手册「第十七章 视频创作」。',
  '排查/运维': '排障：先看账本和日志再判断，别猜；修不了就留单，写清根因和怎么防复发。细节读手册「第十六章 灵活解决问题」。',
  'B站': 'B站：一条只做一件事；发布前核对状态与文案，别拿草稿当已发。',
  '群聊/通道': '通道：只负责收和发，不替她判断该不该回；拿不准就留给她。',
  '文档/整理': '文档：写清给谁看、结论先行；改完别覆盖旧版，进档案。',
  '数据/账本': '账本：只追加不改旧行；压缩和丢弃都要记账，可恢复。',
})

function topicById(id) {
  return HANDBOOK_TOPICS.find((t) => t.id === id) || null
}

/**
 * 这个员工该领哪一本。
 * 不是把整本手册发下去：先认岗位（标签），只发那一章；再按本次任务补一章。
 * @returns {{tags:Array, evidence:{jobs:number,incidents:number}, chapters:string[], text:string, chars:number, empty:boolean}}
 */
export function handbookForEmployee({ sessionId = '', brief = '', expect = '', maxChars = EMPLOYEE_HANDBOOK_CHARS, expiresHours = 8, now = Date.now() } = {}) {
  const ev = evidenceFor(sessionId)
  const workText = [String(brief || ''), String(expect || ''), ...ev.jobs, ...ev.incidents].join('\n')
  const tags = tagsOf(workText)

  const expiresAt = new Date(now + (Number(expiresHours) || 8) * 3600 * 1000).toISOString()
  const who = sessionId ? `发给 ${String(sessionId).replace(/^session-/, '').slice(0, 8)}` : '本次任务'
  const lines = [
    `【这本是给「${tags.map((t) => t.tag).join('、') || '还没看出岗位'}」的 · ${who} · 有效到 ${expiresAt.slice(5, 16).replace('T', ' ')}】`,
    BOUNDARY,
  ]
  // 工具指引放最前（紧接底线）：手册一页装不下时是从末尾往前砍的，
  // 砍到最后会把"怎么拿工具"砍掉——那是她能不能干活的关键，不能当可裁剪内容。
  const tools = [...new Set(tags.flatMap((t) => TAG_TOOLS[t.tag] || []))].slice(0, 4)
  lines.push(tools.length
    ? `· 这个岗位用得上的工具：${tools.join(' / ')}（别的这次用不上，不用管它装了什么）`
    : '· 这个岗位用得上的工具：常用的那几个（read / edit / pwsh / grep），按下面「这活要用的工具去哪找」去拿。')
  lines.push(TOOLS_HINT)
  // 干活章人人都有：怎么交付、怎么留证据。
  const used = ['worker']
  const base = topicById('worker')
  if (base) lines.push(`· ${base.title}：${(base.lines || []).join(' ')}`)
  for (const t of tags) {
    // 常驻章节：把那一章发下去
    for (const id of (TAG_CHAPTERS[t.tag] || [])) {
      const topic = topicById(id)
      if (!topic || used.includes(id)) continue
      used.push(id)
      lines.push(`· ${topic.title}：${(topic.lines || []).join(' ')}`)
    }
    // 源章：只给一句"该看哪本"
    const hint = SOURCE_HINT[t.tag]
    if (hint) lines.push(`· ${hint}`)
  }
  // 任务相关：关键词命中的章（复用/交接/初识/创作）
  for (const t of selectHandbookTopics({ role: 'worker', text: workText }) || []) {
    if (used.includes(t.id)) continue
    used.push(t.id)
    lines.push(`· ${t.title}：${(t.lines || []).join(' ')}`)
  }
  lines.push(`· 这本有效到 ${expiresAt.slice(5, 16).replace('T', ' ')}；到期不续，下回派活重新发。`)
  lines.push(TAIL)

  // 一页以内：超了就按行砍，先砍章，尾巴那句永远留。
  let text = lines.join('\n')
  while (text.length > maxChars && lines.length > 4) {
    lines.splice(lines.length - 2, 1)
    text = lines.join('\n')
  }
  if (text.length > maxChars) text = text.slice(0, maxChars)

  return {
    tags,
    evidence: { jobs: ev.jobs.length, incidents: ev.incidents.length },
    chapters: used,
    tools,
    expiresAt,
    text,
    chars: text.length,
    empty: !text,
  }
}

/** 给人看的一行：她是干什么的、发了几章、多少字。 */
export function describeEmployee(profile) {
  const tags = (profile?.tags || []).map((t) => `${t.tag}（命中「${t.hit}」）`).join('、') || '还没看出是干什么的'
  return `${tags}；发 ${profile?.chapters?.length || 0} 章、${profile?.chars || 0} 字`
}
