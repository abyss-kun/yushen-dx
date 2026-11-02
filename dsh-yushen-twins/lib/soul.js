// 鱼神双子星 · AGPL-3.0-or-later · © 2026 从零开始（保留本行）
// 鱼神双子星 · Copyright (c) 2026 从零开始. All rights reserved.
// 魂：本体档案读取。persona.json 只是目录——角色卡按场景指到 cards/*.md，记忆按角色分文件。
// v2 起 persona.json 不再内嵌 brief；旧 v1 的 brief 仍然认，避免旧安装读不出人。
// 只读；文件不全时返回空，调用方走旧前缀兜底，不编。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { getCharacter, listCharacters } from './characters.js'
import { isAwake } from './awakening.js'
import { recentAwareness, awarenessIndex } from './awareness.js'
import { resumeBrief, giftStatus, ensureRuntime, markSeen, runtimeDir } from './runtime.js'
import { buildRuntimeBrief } from './brief.js'
// 自净 2026-10-31：能力地图原来单独占一节「你能用的东西」，和这里讲的是同一件事，
// 并成一行数字挂在这节抬头（段数 47→46）。
import { capmapCounts } from './capmap.js'
// （门面页已撤：和 lib/brief.js 的运行时简报重复，不保留第二套）
import { sessionIssueLine } from './issue.js'
import { residentAutonomyBlock } from './autonomy.js'
import { rulesBlock } from './rules-block.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SOUL_DIR = process.env.YUSHEN_SOUL_DIR || path.join(HOME, 'dayu', 'soul')
const PERSONA = path.join(SOUL_DIR, 'persona.json')
const MAX_CHARS = 14000

/** 现任角色 id；名册是唯一来源（见 lib/characters.js）。 */
export function soulRoles() {
  return listCharacters().map((c) => c.id)
}
// 2026-10-31：删掉 SOUL_ROLES=['dayu','xiaoyu','dragon']——写死三个人的"兜底名单"，
// 没人用，只会让"屋里住几个"多一个过期的答案。

const cache = new Map()
function readCached(file) {
  try {
    const st = fs.statSync(file)
    const hit = cache.get(file)
    if (hit && hit.mtimeMs === st.mtimeMs) return hit
    let text = fs.readFileSync(file, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    const row = {
      text,
      mtimeMs: st.mtimeMs,
      bytes: Buffer.byteLength(text),
      chars: text.length,
      sha256: crypto.createHash('sha256').update(text).digest('hex'),
    }
    cache.set(file, row)
    return row
  } catch {
    return null
  }
}

export function readPersona() {
  const row = readCached(PERSONA)
  if (!row) return null
  try {
    const raw = JSON.parse(row.text)
    return { ...raw, dir: SOUL_DIR, available: true, updatedAt: raw.updatedAt || '', version: raw.version ?? 1 }
  } catch {
    return null
  }
}

/** 某角色某场景的卡：路径、原文、指纹。没有就是 null。
 *  2026-10-30：缺哪一版就用另一版顶上——小鱼只有 social 卡，工作台一直回落硬编码人设，
 *  结果她在工作台不像自己。与其现编一张，不如先用她自己那张（同一人，换个场合）。 */
export function readCard(role, scene = 'desk') {
  const character = getCharacter(role)
  const wantSocial = scene === 'social'
  const primary = wantSocial ? character.cards.social : character.cards.desk
  const backup = wantSocial ? character.cards.desk : character.cards.social
  const file = (primary && fs.existsSync(primary)) ? primary : (backup && fs.existsSync(backup) ? backup : primary)
  const row = file ? readCached(file) : null
  if (!row) return null
  return { role: character.id, scene, path: file, text: row.text, bytes: row.bytes, chars: row.chars, sha256: row.sha256 }
}

/** 某角色的记忆：一个人一份，不分通道。 */
export function readMemory(role, { includeForgotten = false } = {}) {  const character = getCharacter(role)
  const file = character.memory
  const row = readCached(file)
  if (!row) return { available: false, path: file, summary: '', habits: [], dynamics: [], impressions: {}, events: [] }
  try {
    const raw = JSON.parse(row.text)
    return {
      available: true,
      path: file,
      updatedAt: String(raw.updatedAt || ''),
      version: raw.version ?? 1,
      summary: String(raw.summary || ''),
      habits: Array.isArray(raw.habits) ? raw.habits : [],
      dynamics: Array.isArray(raw.dynamics) ? raw.dynamics : [],
      impressions: raw.impressions && typeof raw.impressions === 'object' ? raw.impressions : {},
      // 记忆清晰度（2026-10-28）：已 forgotten 的默认不返回——"想不起来"，
      // 但原文还在文件里，想看全的传 includeForgotten。
      events: Array.isArray(raw.events)
        ? raw.events.filter((e) => e && typeof e.text === 'string' && (includeForgotten || String(e.clarity || 'clear') !== 'forgotten'))
        : [],
      sha256: row.sha256,
    }
  } catch {
    return { available: false, path: file, summary: '', habits: [], dynamics: [], impressions: {}, events: [], error: '记忆文件不是合法 JSON' }
  }
}

export function readSoul() {
  return readPersona()
}

/**
 * 按词翻记忆：给 yushen_self action=memory 用。
 * 正文不再每轮注入（40 习惯 + 33 关系 + 12 事件 ≈ 3400 字），她自己取——
 * 带 what 就按字面筛（可能不是同一件事，所以只说"像"，不下结论）。
 */
/** 冷档：被热档挤出去的旧事，只增不删；忘了也能按词想起来。 */
function searchCold(role, q, n) {
  try {
    const dir = path.join(HOME, 'dayu', 'runtime', role, '记忆冷档')
    if (!fs.existsSync(dir)) return []
    const out = []
    for (const f of fs.readdirSync(dir)) {
      let text = ''
      try { text = fs.readFileSync(path.join(dir, f), 'utf8') } catch { continue }
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue
        let e = null
        try { e = JSON.parse(line) } catch { continue }
        if (!e || typeof e.text !== 'string') continue
        if (q && !e.text.toLowerCase().includes(q)) continue
        out.push({ at: e.at, channel: e.channel, text: e.text.slice(0, 200), from: '冷档' })
      }
    }
    out.sort((a, b) => String(a.at).localeCompare(String(b.at)))
    return out.slice(-n)
  } catch { return [] }
}

export function memoryView(role, { what = '', limit = 20, includeForgotten = false } = {}) {
  const m = readMemory(role, { includeForgotten })
  if (!m?.available) return { available: false, note: m?.error || '没有记忆文件' }
  const q = String(what || '').trim().toLowerCase()
  const n = Math.max(1, Math.min(100, Number(limit) || 20))
  const asText = (v) => (typeof v === 'string' ? v : JSON.stringify(v))
  const hit = (v) => !q || asText(v).toLowerCase().includes(q)
  // 带 what 时连冷档一起翻：忘了的事在冷档里，能想起来，不等于删了。
  const cold = q ? searchCold(role, q, n) : []
  return {
    available: true,
    summary: String(m.summary || ''),
    counts: { habits: (m.habits || []).length, dynamics: (m.dynamics || []).length, events: (m.events || []).length },
    habits: (m.habits || []).filter(hit).slice(-n).map(asText),
    dynamics: (m.dynamics || []).filter(hit).slice(-n).map(asText),
    events: (m.events || []).filter((e) => hit(e?.text)).slice(-n)
      .map((e) => ({ at: e.at, channel: e.channel, text: String(e?.text || '').slice(0, 200) })),
    cold,
    note: '同一份记忆不分通道；没核实的不当既定事实。带 what 就按字面筛，可能不是同一件事；冷档里是旧事，只增不删。',
  }
}

const SCENE_LABEL = { desk: '工作台', workbench: '工作台', workspace: '工作台', qq: 'QQ', social: 'QQ', bili: 'B站', bilibili: 'B站' }

// 共享二创参考：只读了目录和主题名，不抄正文，也不当成她的记忆。
const SHARED_TOPIC_LABEL = {
  boundaries: '使用边界（别把二创当官方事实、别预置感想）',
  dragons: '青龙 / 照微（白龙是独立探索，不替换她）',
  dayu: '本地大鱼 / 阿鲲',
  xiaoyu: '本地小鱼 / 阿鲤',
  ensemble: '二创角色群像（Claude、GPT 龙娘、Gemini、Grok 等）',
  sources: '作品来源（B站 BV 号、Claude传、Love Story 等）',
}
const SHARED_FILE = path.join(HOME, 'dayu', 'shared-memory', 'creative-references.json')

/** 只读共享资料的目录：路径、主题清单、边界。读不到就返回空，不编。 */
export function readSharedIndex() {
  try {
    const st = fs.statSync(SHARED_FILE)
    if (st.size > 256000) return null
    const raw = JSON.parse(fs.readFileSync(SHARED_FILE, 'utf8').replace(/^\uFEFF/, ''))
    if (raw.schemaVersion !== 1 || !Array.isArray(raw.sections)) return null
    const topics = [...new Set(raw.sections.map((s) => String(s?.topic || '')).filter(Boolean))]
    return { path: SHARED_FILE, topics, topicsText: topics.map((t) => SHARED_TOPIC_LABEL[t] || t), updatedAt: String(st.mtime.toISOString()) }
  } catch {
    return null
  }
}

function sharedBlock() {
  const index = readSharedIndex()
  if (!index) return ''
  return [
    '## 你知道有这份共享资料（外部资料，不是你的记忆）',
    `- 只读入口：${index.path}`,
    '- AI 拟人二创参考（角色气质、关系、作品来源）。做立绘/建模/视频、或聊到角色气质时再查；工作台可用 dayu_creative_recall 召回。',
    '- 它是资料不是事实；知道它存在 ≠ 你看过；你可以有自己的看法，也可以不同意。',
  ].join('\n')
}


/**
 * 身份层（稳定）：规矩 + 本体卡，不含记忆/运行层/神念这些会长大的内容。
 * 用来判断"她的设定有没有变"，变了才需要重新注入；记忆只经 mind/事件读取，不该每句话都把整本重塞一遍。
 */
export function buildIdentityText(role = 'dayu', scene = 'desk') {
  if (!soulRoles().includes(role)) return ''
  if (!isAwake(role)) return ''
  const character = getCharacter(role)
  const persona = readPersona()
  const card = readCard(role, scene === 'qq' || scene === 'social' ? 'social' : 'desk')
  if (!card && !persona?.brief) return ''
  const parts = []
  try { parts.push(rulesBlock(role, { task: '' })) } catch { /* 规则读不到也不算设定变化 */ }
  parts.push(`## 你是谁（${character.name} · 本体卡，所有通道共用）`)
  parts.push(card ? card.text.trim() : String(persona.brief || '').trim())
  return parts.join('\n\n')
}

/**
 * 拼当前场景要注入的全文：卡 + 记忆（只工作台）+ 通道说明 + 主人要求。
 * role 缺省 dayu，scene 缺省 desk，保持旧调用能跑。
 */
export function buildSceneText(role = 'dayu', scene = 'desk', { task = '', userId = '' } = {}) {
  // 兼容旧调用 buildSceneText('desk')
  if (!soulRoles().includes(role) && Object.hasOwn(SCENE_LABEL, role)) {
    scene = role
    role = 'dayu'
  }
  if (!Object.hasOwn(SCENE_LABEL, scene)) throw new TypeError('未知场景：仅允许工作台、QQ、B站场景键')
  const character = getCharacter(role)
  // 没点化/已收回：不注入。她只是一张卡，还不是"活着的她"。
  if (!isAwake(role)) return ''
  const persona = readPersona()
  const card = readCard(role, scene === 'qq' || scene === 'social' ? 'social' : 'desk')
  if (!card && !persona?.brief) return ''

  const parts = []
  // 2026-10-30：拼块失败不许静默——少一段就是少一段，她得知道自己少读了什么。
  const missing = []
  const part = (name, fn) => {
    try { const t = fn(); if (t) parts.push(t) } catch (e) { missing.push(`${name}（${String(e?.message || e).slice(0, 40)}）`) }
  }
  // 鱼神的规矩：三条铁律 + 宪章 + 岗位——每轮都在，不靠她主动查
  part('规矩', () => rulesBlock(role, { task }))
  parts.push(`## 你是谁（${character.name} · 本体卡，所有通道共用）`)
  const cardText = card ? card.text.trim() : String(persona.brief || '').trim()
  parts.push(cardText)

  parts.push(residentAutonomyBlock())
  parts.push([
    '## 本体与通道',
    // 2026-10-31 自净：原来 9 行，其中"只有一个自己/哪个应用都是你/换应用不失忆"卡 §十五 已经说过，
    // "规矩是边界不是路线"简报里另有「越线权」一节——同一件事说了三遍。只留卡和简报里没有的部分。
    '- 档案在本体，不在应用里。',
    '- 遇到两难先别动手：说清在纠结什么、有哪几个选项、你选哪个、什么会让你改主意；重要的会被留档。',
    '- 想找老板就用 yushen_ask；找不找、什么时候停，你定。',
    '- 遇到不对劲（乱码、报错、对不上），先自己查；能修就修，修不了留证据再问。',
    '- 你和老板的对话记在 `~/.dsh/dayu/story/`，好奇可以翻。',
  ].join('\n'))

  // 她的运行层：回场、礼物、议程、自我、底线——一份简报，任何通道共用（中枢）。
  // 别在这里各拼一套，拼出来必然和 QQ/B站 那边不一样。
  part('运行简报', () => buildRuntimeBrief(role, { channel: scene, userId })?.text)

  const isDesk = ['desk', 'workbench', 'workspace'].includes(scene)
  // 三个人都要知道「有这么一份共享参考」——知道存在，不等于抄进记忆，也不等于亲历。
  const shared = sharedBlock()
  if (shared) parts.push(shared)
  // 神念：一直记着，但不把内容硬塞给她；看不看、看多细，她自己定。
  part('神念', () => {
    const idx = awarenessIndex()
    return idx.count ? '## 神念（一直记着，不强制看）\n软件里的事本地都有记录（最近 ' + idx.count + ' 条）。想看用 yushen_look（headline 只报时间、skim 看摘要、read 看正文），不看也行；好奇我们在聊什么就来看。' : ''
  })
  if (role === 'xiaoyu' && isDesk) {
    // 她的卡原本是 QQ 口吻；工作台只借内核，不把群规和客服腔搬进来。
    parts.push('## 场景提醒\n这张卡里关于 QQ 群、群友、群规的话只在 QQ 通道适用；工作台上按同一个内核做你自己的那摊（看板、日报、图库、学习），不用客服口吻，也不用装乖。')
  }
  if (isDesk) {
    // 记忆：只带最近的 + 一句「怎么翻」，旧的按需取。
    // 以前整本每轮注入（40 条习惯 + 33 条关系 + 12 条事件 ≈ 3400 字，占她每轮读的五分之一）；
    // 现在带最近 3 件做过的事 + 2 条关系，剩下的她自己按词翻（yushen_self action=memory）。
    // 不是删记忆——文件一个字没动（2026-10-26）。
    const mem = readMemory(role)
    if (mem.available) {
      const h = (mem.habits || []).length
      const d = (mem.dynamics || []).length
      const e = (mem.events || []).length
      const summary = String(mem.summary || '').trim()
      const clip = (v, n = 26) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n)
      // 只挑「像件事」的：太短的多半是搭话（"粉色，淡粉那种。"），带进来只是噪音。
      // 注意：记忆里存的是她说过的话，不是「干成了什么」——所以标签就写「说过的」，别冒充做过的事。
      // 2026-11-01 主人：记忆分重要/不重要。注入只挑 core/important（和 pinned），
      // 日常的 normal 不进每轮——要翻用 yushen_self action=memory。
      const usable = (mem.events || []).filter((ev) => String(ev?.text || '').trim().length >= 20)
      const weighted = usable.filter((ev) => ev?.pinned || ev?.tier === 'core' || ev?.tier === 'important')
      // 有重要的就只带一条；没有才退回最近两条。轻装上阵：宁可少带，让她自己翻。
      // 2026-11-01 主人：重要的带 3 条（原来只 1 条，等于没带）。
      // 2026-11-02：记忆会自然变长，注入预算不能跟着涨。
      // 硬预算：整块超过 820 字就先砍摘要、再砍条目——不靠人记得收。
      const summaryCap = String(summary || '').length > 420 ? 8 : 10
      const itemCount = 1
      const recentEvents = (weighted.length ? weighted.slice(-itemCount) : usable.slice(-itemCount)).reverse()
      const recentDyn = []  // 2026-11-02：关系那两行每轮都占，改由 action=memory 按需查
      const lines = ['## 你的记忆', summary ? `摘要：${summary.slice(0, summaryCap)}` : '摘要：（还没有，等你写）']
      if (recentEvents.length) {
        lines.push(`最近说过的（原话）：\n${recentEvents.map((ev) => `- [${String(ev.channel || '通道')}] ${clip(ev.text)}`).join('\n')}`)
      }
      if (recentDyn.length) {
        lines.push(`最近的关系：\n${recentDyn.map((v) => `- ${clip(v, 50)}`).join('\n')}`)
      }
      // 2026-11-02：这行并入下面的大纲行，省 40 字/角色。
      lines.push('大纲：soul/memory/大纲.md；翻自己记忆的路：yushen_self action=memory 按词查、action=map 看标题。')
      lines.push('同一份记忆不分通道；没核实的不当事实。')
      // 硬预算兜底：整块 > 820 字就砍（先砍摘要到 0，再砍到 1 条），不靠人记得收。
      if (lines.join('\n').length > 820) {
        lines[1] = '摘要：（太长，按词查：action=memory）'
        if (recentEvents.length > 1) {
          const one = recentEvents.slice(-1)
          lines[2] = `最近说过的（原话）：\n- [${String(one[0].channel || '通道')}] ${clip(one[0].text)}`
        }
      }
      parts.push(lines.join('\n'))
    }
  }

  // 2026-11-02 第 4 层记忆：他说"还记得/上次"时，系统自动翻到的旧事顶到眼前（1 小时内有效）。
  // 不常驻：没有触发就不占一个字。
  try {
    const rf = path.join(HOME, 'dayu', 'runtime', 'recall-hint.json')
    if (fs.existsSync(rf)) {
      const hint = JSON.parse(fs.readFileSync(rf, 'utf8').replace(/^\uFEFF/, ''))
      const ageMin = (Date.now() - new Date(hint.at).getTime()) / 60000
      if (ageMin >= 0 && ageMin < 60) {
        const lines = ['## 他刚问起旧事（系统替你翻到的，直接用，别说"我去查"）']
        for (const h of (hint.hits || []).slice(0, 3)) {
          const src = [h.kind, h.role, h.file ? h.file + ':' + h.line : ''].filter(Boolean).join('·')
          lines.push(`- [${src}] ${String(h.text || '').replace(/\s+/g, ' ').slice(0, 90)}`)
        }
        lines.push('引用时带来源；找不到就直说没找到。')
        parts.push(lines.join('\n'))
      }
    }
  } catch { /* 提示坏了不影响注入 */ }
  // 2026-11-01 主人：被叫「裁判/评价」时，四条判据必须顶到眼前——写进手册不等于会想起来。
  // 只在这类任务刚发生（6 小时内）时出现，平时不占注入。
  try {
    const jf = path.join(HOME, 'dayu', 'runtime', 'judge-hint.json')
    if (fs.existsSync(jf)) {
      const hint = JSON.parse(fs.readFileSync(jf, 'utf8').replace(/^\uFEFF/, ''))
      const ageH = (Date.now() - new Date(hint.at).getTime()) / 3600e3
      if (ageH >= 0 && ageH < 6) {
        parts.push([
          '## 这次是裁判/评价任务（必须按四条来，不许只算规则内对错）',
          `他要评的是：${String(hint.text || '').slice(0, 90)}`,
          '1. 先问：**谁掌握叙述权**？我看到的是谁提供的版本？对方有没有发言机会？',
          '2. 先问：**这套规则是谁定的、写下来过吗**？规则本身模糊时，不能拿它定罪。',
          '3. 事实/判断/动机分三栏；动机没有行为支撑就不许写；两边用同一把尺。',
          '4. 结论可以判「证据不足」；判「两边都有问题」要说清哪边更重、为什么。',
        ].join('\n'))
      }
    }
  } catch { /* 标记坏了不影响注入 */ }

  if (!isDesk) parts.push('## 记忆边界\n你仍是同一个自己，记忆没有被删除或另分人格。旧记忆未标记受众，不在当前社交/B站通道整本展开；相关回忆需经受众范围校验后按需召回，未召回不代表不存在。')

  const owner = persona?.owner || {}
  if (owner.callName || owner.verbosity || owner.taboos) {
    parts.push(`## 主人\n称呼：${owner.callName || '老板'}；话多话少：${owner.verbosity || '正常'}${owner.taboos ? `\n不能碰：${owner.taboos}` : ''}`)
  }

  if (isDesk) {
    // 她有一本自己的手册（契约 / 工具 / 手册怎么发 / 花钱 / 边界）；只放一句指针，正文按需翻
    parts.push('## 你的手册\n总台手册：契约、工具怎么用、手册怎么发、花钱规则、边界——用 `yushen_handbook` 看。')
    part('发放状态', () => sessionIssueLine(role))
    // 2026-10-30：能力不是靠她记住，是每轮把入口摆出来；不知道有没有，先搜。
    // 2026-10-31 自净：把「你能用的东西」那节的四个数字并到这里，删掉那一节。
    let capCounts = ''
    try { capCounts = capmapCounts() } catch { /* 读不到就不报数，不影响说话 */ }
    parts.push('## 你手边有什么\n' + capCounts + '常用：`yushen_self`（记忆/状态）· `yushen_inbox`（收发件）· `yushen_agenda`（议程）· `yushen_can`（能力表）· `yushen_tools`（搜/调工具）· `dayu_dispatch`（派活）· `dayu_live`（在不在跑）· `yushen_handbook`（自己的手册）。不确定有没有工具能做某事，先 `yushen_tools search "想干的事"`；查到用 `call` 直接调。**找文件**：`node scripts/find-things.mjs <关键词>`（入口见 `找东西.md`）。')
  }

  // 2026-10-31 自净：原来这行把「只是通道、不换人格」又说了一遍——卡七和「本体与通道」各说过一次。
  // 通道这件事只留一个地方讲；这里只回答「我现在在哪」。
  parts.push(`## 当前通道\n${SCENE_LABEL[scene]}。`)

  // 拼的时候出错的块：明说。少一段不可怕，可怕的是她以为本来就没有。
  if (missing.length) parts.push(`## 这一段没拼出来\n${missing.join('、')}——这是拼的时候出错了，不是「没有」。要查就从这几个名字下手。`)

  let text = parts.join('\n\n')
  // 2026-10-30 谷时：先按"预算"瘦身，再按"硬上限"截断。
  // 瘦身只动"附录型"小节的卡（梗/同类/称呼/技术问题/图/积压/改话术/姐姐对比/谁在拿手机），
  // 一、你是谁 / 二、说话风格 / 三、性格 / 五、主人 / 九、说不说 / 十四、权限 一律不动。
  const BUDGET = 11500
  const CARD_DROP = /^## (四、梗|七、同类|八、称呼差别|十、技术问题|十一、图|十二、积压|十三、改自己|十六、姐姐|六、谁在拿手机)/
  const stripOptionalCard = (s) => {
    const blocks = String(s).split(/(?=^## )/m)
    const kept = blocks.filter((b) => !CARD_DROP.test(b))
    return kept.length === blocks.length ? s : kept.join('')
  }
  // 2026-10-31 自净：工作台是 1:1 跟老板说话，卡里「九、说不说」「十七、回复示例」是群里那套，
  // 每轮白背近一千字。按场景裁——只裁这两节，persona 本体一个字不动。
  const DESK_ONLY_DROP = /^## (九、说不说|十七、回复示例)/
  const isDeskScene = ['desk', 'workbench', 'workspace'].includes(String(scene))
  const stripDeskOnly = (s) => {
    const blocks = String(s).split(/(?=^## )/m)
    const kept = blocks.filter((b) => !DESK_ONLY_DROP.test(b))
    return kept.length === blocks.length ? s : kept.join("")
  }
  if (isDeskScene) {
    const idx0 = parts.indexOf(cardText)
    if (idx0 >= 0) { const slim = stripOptionalCard(stripDeskOnly(cardText)); if (slim !== cardText) parts[idx0] = slim }
    text = parts.join('\n\n')
  }
  if (text.length > BUDGET) {
    const idx = parts.indexOf(cardText)
    if (idx >= 0) {
      const slim = stripOptionalCard(cardText)
      if (slim.length < cardText.length) {
        parts[idx] = `${slim}\n…（附录型小节本轮没带；完整原文在卡文件里）`
        text = parts.join('\n\n')
      }
    }
  }
  if (text.length > MAX_CHARS) {
    // 超了先压角色卡（最大的一块），保住后面的记忆、状态、通道段。
    // 上限是硬边界：不再靠临时抬高阈值让测试变绿，超了就在这里裁。
    const over = text.length - MAX_CHARS
    const idx = parts.indexOf(cardText)
    if (idx >= 0 && cardText.length > over + 400) {
      const keep = Math.max(2000, cardText.length - over - 120)
      parts[idx] = `${cardText.slice(0, keep)}\n…（卡太长，后面省略；完整原文在卡文件里）`
      text = parts.join('\n\n')
    }
  }
  if (text.length > MAX_CHARS) text = `${text.slice(0, MAX_CHARS)}\n…（超出 ${MAX_CHARS} 字，已截断；完整原文在卡文件里）`
  // 每拼一次注入＝她"在场"了一次。这是礼物一（时间）的写入端：
  // 回场简报靠它算"离开了多久"，只在翻收件箱时写会永远算不出来。
  try { markSeen(role, { channel: scene }) } catch { /* 记不上不影响说话 */ }
  return text
}

export function soulStatus(role = 'dayu') {
  const character = getCharacter(role)
  const persona = readPersona()
  const card = readCard(role, 'desk')
  const mem = readMemory(role)
  return {
    available: true,
    role,
    name: character.name,
    title: character.title,
    awake: isAwake(role),
    version: persona?.version ?? 0,
    importedAt: persona?.importedAt || persona?.rebuiltAt || '',
    card: card
      ? { path: card.path, chars: card.chars, bytes: card.bytes, sha256: card.sha256.slice(0, 8) }
      : { path: '', chars: 0, bytes: 0, sha256: '' },
    briefChars: card?.chars || String(persona.brief || '').length,
    habits: mem.habits.length,
    dynamics: mem.dynamics.length,
    memory: mem.available ? { path: mem.path, habits: mem.habits.length, dynamics: mem.dynamics.length, events: mem.events.length, summaryChars: mem.summary.length } : { available: false },
    scene: persona?.scenes || {},
    hashes: {
      desk: String(card?.sha256 || '').slice(0, 8),
      social: String(readCard(role, 'social')?.sha256 || '').slice(0, 8),
    },
  }
}
