// 场景包：把「合订本」拆成「常驻核心 + 到场景才给的那几页」。
//
// 为什么要有（2026-10-27）：全系统只有员工手册是按岗位发的（369–587 字），
// 而住在鱼神里的人拿的是合订本——QQ 预设 8,790 字 / 39 节，工作台卡 7,576 字。
// 39 节里「怎么收藏表情包」「发语音默认没开怎么办」每轮都在她眼前，
// 而绝大多数轮次根本碰不到。这不是省 token 的问题（大头都缓存命中），
// 是注意力被摊薄：她要在一张"所有岗位说明书"里找这一轮该做什么。
//
// 铁律：**拆分不等于删减**。这里把原文按小节切开，常驻 + 场景的字数之和
// 必须等于原文（回归里有断言）。谁都能查到全文，只是不必每轮都读。
import fs from 'node:fs'
import path from 'node:path'
import { pluginPresetsDir } from './paths.js'

const QQ_PRESET = path.join(pluginPresetsDir(), 'qq-chat-v2.patch.yml')

/** 每轮都要的节（其余按场景给）。按标题关键字判，判不出来就当常驻（宁可多给，不可漏）。 */
const CORE_HINTS = [
  '安全规则', '工具协议', '会话令牌', '先读已有消息', '本次消息快照', '已读水位',
  '唤醒与自主权', '等待与收尾', '操作即动作', '群聊不是客服队列', '反 AI 味',
  '保持主体性', '该说/不该说', '分条与节奏', 'QQ 场景规则', '发送与汇报禁令',
]

/** 到了场景才给的节：标题 → 触发词（信号里出现任一个就把这页给她）。 */
const SCENE_HINTS = {
  '看图': ['media', 'image'],
  '表情包': ['sticker', 'emoji', 'face'],
  '偷图收藏': ['sticker', 'collect'],
  '发语音': ['voice', 'audio'],
  '合并转发': ['forward'],
  '拍一拍': ['poke'],
  '黑话学习': ['slang'],
  '轻量记忆': ['memory'],
  '记忆卫生': ['memory'],
  '等特定的人': ['waiting-person'],
  '主动开话题': ['cold', 'idle'],
  '沉睡前观察': ['closing', 'sleep'],
  '像真人一样漏看': ['late'],
  '学习群友策略': ['learn'],
  '不要当群管家': ['host'],
}

function readPresetPrefix(file = QQ_PRESET) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const m = text.match(/prefix:\s*\|-\s*\n([\s\S]*?)\n\s{10,}- id:/)
  if (!m) throw new Error(`读不到 preset 的 prefix：${file}`)
  // YAML 块缩进：去掉每行公共前缀空格
  const raw = m[1].split(/\r?\n/)
  const indent = Math.min(...raw.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length))
  return raw.map((l) => l.slice(indent)).join('\n').trim()
}

/** 去掉二级标题里的「」外层，只留比较用的关键字。 */
function shortTitle(title) {
  return title.replace(/^【/, '').replace(/】$/, '').replace(/（[^）]*）/g, '').trim()
}

function isCore(short) {
  return CORE_HINTS.some((h) => short.includes(h))
}

function scenesOf(short) {
  for (const [key, signals] of Object.entries(SCENE_HINTS)) {
    if (short.includes(key)) return signals
  }
  return null
}

/**
 * 把 QQ 预设拆成 { core, scenes:[{title, text, signals}], stats }。
 * 保证 core + 全部 scenes 的字符数 = 原文（回归锁着）。
 */
export function loadQQPack(file = QQ_PRESET) {
  const text = readPresetPrefix(file)
  // 小节标题在原文里不一定在行首（整段是连着的），所以按【 直接切。
  // 第一个【 之前如果有前言，也算常驻，不能丢。
  const parts = text.split(/(?=【)/).filter((s) => s.length > 0)
  const head = parts.length && !parts[0].startsWith('【') ? parts.shift() : ''
  const core = head ? [head] : []
  const scenes = []
  for (const part of parts) {
    const m = part.match(/^【([^】]+)】/)
    const title = m ? shortTitle(`【${m[1]}】`) : ''
    if (!title || isCore(title)) { core.push(part); continue }
    const signals = scenesOf(title)
    if (signals) { scenes.push({ title, text: part, signals }); continue }
    core.push(part) // 判不出来 ⇒ 常驻（宁可多给，不可漏）
  }
  const coreChars = core.reduce((n, s) => n + s.length, 0)
  const sceneChars = scenes.reduce((n, s) => n + s.text.length, 0)
  return {
    core: core.join('\n'),
    scenes,
    stats: {
      total: text.length,
      core: coreChars,
      scenes: sceneChars,
      sceneCount: scenes.length,
      // 守恒：常驻 + 场景 的字符数必须等于原文（拆开不等于删掉）
      balanced: coreChars + sceneChars === text.length,
    },
  }
}

/**
 * 按这一轮的信号拼出该给她的那几页。
 * @param {{signals?:string[], pack?:object}} input  signals 例：['media','closing']
 */
export function packText({ signals = [], pack = null } = {}) {
  const p = pack || loadQQPack()
  const want = new Set((signals || []).map((s) => String(s).toLowerCase()))
  const hit = p.scenes.filter((s) => s.signals.some((x) => want.has(x)))
  const text = [p.core, ...hit.map((s) => s.text)].join('\n')
  return {
    text,
    chars: text.length,
    core: p.core.length,
    used: hit.map((s) => s.title),
    saved: p.stats.total - text.length,
  }
}

/** 她自己查：「这一页在哪里」——按标题找原文。 */
export function findScene(keyword = '') {
  const p = loadQQPack()
  const k = String(keyword || '').trim()
  if (!k) return { ok: true, core: Object.keys(CORE_HINTS), scenes: p.scenes.map((s) => ({ title: s.title, signals: s.signals })) }
  const hit = p.scenes.find((s) => s.title.includes(k))
  if (hit) return { ok: true, kind: 'scene', title: hit.title, text: hit.text }
  if (p.core.includes(k)) return { ok: true, kind: 'core', text: p.core.slice(Math.max(0, p.core.indexOf(k) - 120), p.core.indexOf(k) + 400) }
  return { ok: false, error: `没找到「${k}」`, 可查: p.scenes.map((s) => s.title) }
}
