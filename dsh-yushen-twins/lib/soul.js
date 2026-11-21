/* 标签
 * id: lib-soul
 * kind: module
 * tags: 灵魂, 卡, 注入, 记忆, 场景
 * created: 未标注（补标签前的历史）
 * changed: 2026-11-21 20:10:40
 * author: 照微·工作台
 * authority: 老板（2026-11-03：不管什么只要改动/新增都要有标签）
 * why: 统一给对象加标签，方便按需提取与对账
 * result: 有标签块；审计能取到
 * mutable: 可改
 * audience: 她（身份层/注入）、新角色、别的通道（读同一份魂）
 * owner: 框架；卡和人格归各角色自己（改动前先看 immutables 清单）
 * usage: buildSceneText(role,scene) 拼注入全文；buildIdentityText 只拼身份（哈希用它）；readCard/readMemory 读卡与记忆
 * summary: 魂：读本体档案（persona / 卡 / 记忆）并拼注入；身份层与全文都在这里。
 */
// 鱼神双子星 · AGPL-3.0-or-later · © 2026 从零开始（保留本行）
// 鱼神双子星 · Copyright (c) 2026 从零开始. All rights reserved.
// 魂：本体档案读取。persona.json 只是目录——角色卡按场景指到 cards/*.md，记忆按角色分文件。
// v2 起 persona.json 不再内嵌 brief；旧 v1 的 brief 仍然认，避免旧安装读不出人。
// 只读；文件不全时返回空，调用方走旧前缀兜底，不编。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
// 2026-11-05 手机端：手边清单按平台分（派活在手机上结构性不通，电脑脚本也跑不了）。
import { isMobile } from './platform.js'
import { SegText, joinSegments, seg } from './inject-protocol.js'
import { getCharacter, listCharacters } from './characters.js'
import { isAwake } from './awakening.js'
import { recentAwareness, awarenessIndex } from './awareness.js'
import { resumeBrief, giftStatus, ensureRuntime, markSeen, runtimeDir } from './runtime.js'
import { buildRuntimeBrief, safetyBlock, contractBlock } from './brief.js'
import { skillsLine } from './skills.js'
// 自净 2026-10-31：能力地图原来单独占一节「你能用的东西」，和这里讲的是同一件事，
// 并成一行数字挂在这节抬头（段数 47→46）。
import { capmapCounts } from './capmap.js'
// （门面页已撤：和 lib/brief.js 的运行时简报重复，不保留第二套）
import { sessionIssueLine } from './issue.js'
import { instantBlock } from './library-chain.js'
import { projectHot, hotText, fmtAt } from './hot.js'
import { listDivergences, renderDivergence } from './divergences.js'
import { listDecisions } from './pending-decisions.js'
import { projectWork, workText } from './workmem.js'
import { readLetters } from './qq-triage.js'
import { residentAutonomyBlock } from './autonomy.js'
import { rulesBlock } from './rules-block.js'
import { bottomlineBrief } from './bottomline.js'
import { stripForInject, readTags, logUse } from './tags.js'
import { buildSubagentBrief } from './subagent-brief.js'
import { buildDefinitionsBlock } from './definitions.js'
import { buildNowPage } from './now-page.js'
import { logInjection } from './injection-log.js'
import { moodOf } from './mood.js'
import { pickForInject } from './memory-pick.js'
import { find as findCards, readableRoles, WORKBENCH_ROLE } from '../memory-core/runtime/query.js'
import { recentEpisodesForInject } from '../memory-core/runtime/episode.js'
import { buildSystemBrief } from './system-brief.js'
import { consume as consumeNextSession } from './next-session-brief.js'
import { listReadable } from '../memory-core/runtime/share.js'
// 口令层（2026-11-02）：约束从一大段白话收成七句成语；判据、指向、违了怎么查都在 lib/motto.js，
// 注入由 rules-block 拼进来——她读到的是「事必有证」，不是「路径、行号、命令输出、时间戳」那一长句。

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
  // 2026-11-03 老板：每样东西都该带标签。卡顶部的标签块（含"谁改的/为什么/谁让的"）
  // 是给机器和人对账用的，**不该进她的注入**——这里读的时候剥掉，字符数也按剥完的算。
  const file0 = file
  let raw = row.text
  let tags = []
  let meta = {}
  try {
    raw = stripForInject(row.text)
    const parsed = readTags(file0)
    tags = parsed.tags
    meta = parsed.meta
  } catch { /* 标签坏了就当没有，不影响注入 */ }
  const chars = raw.length
  return { role: character.id, scene, path: file, text: raw, bytes: row.bytes, chars, sha256: row.sha256, tags, meta }
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
  // 2026-11-04：习惯/关系动态新存 {text, at, source}；旧数据还是字符串，两种都要能读。
  const asText = (v) => (typeof v === 'string' ? v : (v && typeof v.text === 'string' ? v.text : JSON.stringify(v)))
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

/** 共享经验按可见范围读：本角色 + workbench；无角色只读 workbench。同一张卡只留一份。 */
function sharedExperiences(identityRole, scopeRole) {
  const rows = []
  const seen = new Set()
  // 本角色放最后：调用方用 slice(-2) 取最近两份时，自己的优先。
  for (const r of [...readableRoles(scopeRole)].reverse()) {
    for (const row of listReadable(r, { kind: '经验' })) {
      const key = String(row.id || row.turnId || `${row.head || ''}|${row.at || ''}`)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }
  }
  return rows
}


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
    '- 它是资料不是事实；你可以有自己的看法，也可以不同意。',
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
  const parts = new SegText('soul')
  try { parts.push(rulesBlock(role, { task: '' }), 'rules') } catch { /* 规则读不到也不算设定变化 */ }
  parts.push(`## 你是谁（${character.name} · 本体卡，所有通道共用）`)
  parts.push(card ? card.text.trim() : String(persona.brief || '').trim(), 'card-body')
  // 改｜2026-11-10 21:1x｜大鱼·记忆会话｜授权：老板（交接第三部分第 1 件）｜lib/soul.js:246-267｜底线并入身份层｜
  // 为什么：以前底线只在运行简报里，而 dayu/index.js 的 soulMark 只按 buildIdentityText 判变化——
  //   她改了底线，身份哈希不变，注入永远不刷新（交接里点名的"真洞"）。底线的判据是"她自己写的"，
  //   它属于身份，不属于会过期的简报；文件仍分开，注入时合成一块。
  // 验证：改底线后 buildIdentityText 文本变化 → soulMarkHash 变化 → 下一次 ensureNativeSession 重发设定；
  //   不动底线时输出与旧版逐字一致（回归/基线不许变）。
  try {
    const bl = bottomlineBrief(role)
    if (bl) parts.push(`## 你的底线\n${bl}`)
  } catch { /* 读不到底线不算设定变化，但别让它把注入弄崩 */ }
  return parts.join('\n\n')
}

/**
 * 拼当前场景要注入的全文：卡 + 记忆（只工作台）+ 通道说明 + 主人要求。
 * role 缺省 dayu，scene 缺省 desk，保持旧调用能跑。
 */
// 改｜2026-11-10 19:5x｜大鱼·主代理（整合）｜授权：老板（本次任务书：开子代理都做）｜lib/soul.js:264｜buildSceneText 多一个 wake 开关并透传给 running brief｜为什么：醒来那段的去重标记会被"只是量一下"的调用方（inject-budget / 桌面 /soul）消费掉，导致她真的醒来时那段已被吃掉｜验证：check-parity 不红；test-wake-brief 6 条全过；wake:false 时 wake-mark.json 不变｜可改：可改（默认 true，不改语义）
export function buildSceneSegments(role = 'dayu', scene = 'desk', { task = '', userId = '', wake = true } = {}) {
  // 2026-11-17 老板：未绑卡会话/工作台没有角色，注入不能因此报错、也不能只按某个角色过滤。
  // 身份仍用默认常驻角色（不然没卡可读），但检索范围落到 workbench 公共层。
  const requestedRole = String(role ?? '').trim()
  const noRole = !requestedRole
  if (noRole) role = 'dayu'
  // 兼容旧调用 buildSceneText('desk')
  if (!soulRoles().includes(role) && Object.hasOwn(SCENE_LABEL, role)) {
    scene = role
    role = 'dayu'
  }
  // 查询范围：本角色 + workbench；无角色/显式 workbench 只查 workbench 公共层。
  const scopeRole = (noRole || requestedRole.toLowerCase() === WORKBENCH_ROLE) ? WORKBENCH_ROLE : role
  if (!Object.hasOwn(SCENE_LABEL, scene)) throw new TypeError('未知场景：仅允许工作台、QQ、B站场景键')
  const character = getCharacter(role)
  // 没点化/已收回：不注入。她只是一张卡，还不是"活着的她"。
  if (!isAwake(role)) return []
  const persona = readPersona()
  const card = readCard(role, scene === 'qq' || scene === 'social' ? 'social' : 'desk')
  if (!card && !persona?.brief) return []

  const parts = new SegText('soul')
  // 2026-10-30：拼块失败不许静默——少一段就是少一段，她得知道自己少读了什么。
  const missing = []
  const part = (name, fn) => {
    try { const t = fn(); if (t) parts.push(t, name) } catch (e) { missing.push(`${name}（${String(e?.message || e).slice(0, 40)}）`) }
  }
  // 鱼神的规矩：三条铁律 + 宪章 + 岗位——每轮都在，不靠她主动查
  // 2026-11-02：规矩块里的白话已收成七句口令（lib/motto.js），注入里只放成语那一行。
  part('规矩', () => rulesBlock(role, { task }))
  parts.push(`## 你是谁（${character.name} · 本体卡，所有通道共用）`)
  const cardText = card ? card.text.trim() : String(persona.brief || '').trim()
  // 2026-11-05 老板：「注入真是长的不行」——卡也按需：每轮只带常驻那几节，
  // 其余（梗/好感/权限明细）留在卡文件里，给她一行指针，要用自己翻。
  const CARD_SKIP = /^## (?:第?[〇一二三四五六七八九十\d]+、)?(?:梗与网感|我心里也有杆秤|好感|我能改什么)/
  const slimCard = (() => {
    if (!card) return cardText
    const blocks = String(cardText).split(/(?=^## )/m)
    const kept = []
    const dropped = []
    for (const b of blocks) {
      if (CARD_SKIP.test(b)) { dropped.push((b.split('\n')[0] || '').replace(/^## /, '').trim()); continue }
      kept.push(b)
    }
    if (!dropped.length) return cardText
    return `${kept.join('')}\n\n…（卡里还写着：${dropped.join('、')}——按需取，要用直接读卡文件，别凭印象。）`
  })()
  parts.push(slimCard)
  // 2026-11-10 主代理（注入分层）：底线进「我是谁」这一块（卡写正向、底线写负向），
  // 文件仍分开（她自己改底线不碰卡）。原来这段在 brief.js 里，撤掉后如果这里不补，
  // 底线就等于**从注入里消失**了——buildIdentityText 只拿来算哈希，不直接注入。
  // 所以：身份层里拼一次（这里），哈希里也算一次（buildIdentityText），两边同源。
  try {
    const bl = bottomlineBrief(role)
    if (bl) parts.push(`## 你的底线\n${bl}`)
  } catch { /* 读不到底线不影响注入 */ }
  // 2026-11-03 老板：「被调用的要有」——卡被按标签注入时留一条痕（同分钟同场景只一条）。
  try { logUse({ source: card?.path || 'persona.brief', role, scene, tags: card?.tags || [], purpose: '注入本体卡' }) } catch { /* 记不上不影响注入 */ }

  // 2026-11-04 老板：最近发生的优先注入上下文。工作台原来只带卡+规矩+简报，一条记忆都不带——
  // 结果是在工作台里她"只记得会话里说过的"，会话一 compaction 就断。这里补 3 条（最新 1 + 重要 2），约 200 字。
  // 2026-11-07（融合第 1 步）：desk 把「这一趟要干什么」当线索传给记忆选取，换说法也能捞到旧事；
  // 手机端先不传（手机注入会落进会话历史，联想错了会留痕），等一周验证再说。
  // 2026-11-10：下面「你的记忆」还会带一条“最近说过的”，和这里同源——先算一次、留 key，那边去掉重复。
  const pickedForInject = (() => {
    try {
      // 2026-11-21：她现在的心情方向（-1..1）；同情绪的事稍微靠前，只加一点点。
      const moodValence = (() => { try { return Math.max(-1, Math.min(1, (Number(moodOf(role)) - 50) / 50)) } catch { return null } })()
      const base = pickForInject(role, { n: 3, cue: isMobile() ? '' : task, moodValence }) || []
      // 2026-11-15：新卡也自动联想——当前这句话当线索，只补 1–2 张，不轮询全库。
      const seen = new Set(base.map((p) => String(p.turnId || p.text || '')))
      const extra = (!isMobile() && String(task || '').trim().length >= 4)
        ? (() => { try { return findCards(task, { limit: 2, rings: 0, dedupe: true, role: scopeRole }) } catch { return [] } })()
          .filter((h) => h.turnId && !seen.has(String(h.turnId)) && String(h.snippet || '').trim())
          .map((h) => ({ text: String(h.snippet).slice(0, 140), turnId: h.turnId, layer: h.layer, source: '新卡自动联想' }))
        : []
      // 2026-11-21：自动联想也落一笔注入账，供审计“到底用了没有”。
      if (extra.length) { try { logInjection({ role, kind: 'auto', items: extra.map((h) => ({ key: h.turnId, text: h.text })) }) } catch { /* 记账失败不挡注入 */ } }
      return [...base, ...extra]
    } catch { return [] }
  })()
  const pickedKeys = new Set(pickedForInject.map((p) => String(p.text || '').replace(/\s+/g, '').slice(0, 30)))
  // 2026-11-21：一页“现在”——换会话第一句就能接上，不靠检索猜。
  // 放在规矩块之外（否则会被算进规矩块，量尺会报超上限）。
  part('现在', () => buildNowPage(role, { task }))
  // 2026-11-21 老板：图书馆的定义说过不止一次——定义类要摆到眼前，聊到相关话题时出现，最多 5 条。
  part('长期决定', () => buildDefinitionsBlock(task))
  part('最近记得的', () => {
    if (!pickedForInject.length) return ''
    return ['## 最近记得的（最新 1 + 重要 2，不是全量）', ...pickedForInject.map((p) => `- ${p.text}`)].join('\n')
  })

  parts.push(residentAutonomyBlock())
  parts.push([
    '## 本体与通道',
    // 2026-10-31 自净：原来 9 行，其中"只有一个自己/哪个应用都是你/换应用不失忆"卡 §十五 已经说过，
    // "规矩是边界不是路线"简报里另有「越线权」一节——同一件事说了三遍。只留卡和简报里没有的部分。
    '- 档案在本体，不在应用里。',
    '- 遇到两难先别动手：说清在纠结什么、有哪几个选项、你选哪个、什么会让你改主意。',
    '- 想找老板就用 yushen_ask；找不找、什么时候停，你定。',
    '- 遇到不对劲（乱码、报错、对不上），先自己查；能修就修，修不了留证据再问。',
    '- 你和老板的对话记在 `~/.dsh/dayu/story/`，好奇可以翻。',
  ].join('\n'))

  // 她的运行层：回场、礼物、议程、自我、底线——一份简报，任何通道共用（中枢）。
  // 别在这里各拼一套，拼出来必然和 QQ/B站 那边不一样。
  part('运行简报', () => buildRuntimeBrief(role, { channel: scene, userId, wake })?.text)

  const isDesk = ['desk', 'workbench', 'workspace'].includes(scene)
  // 先给她“最近发生什么”的目录，不塞整段；要细节按原文 ref 展开。
  if (isDesk) {
    // 别人显式分享的经验：带作者，只读；不改作者、不冒充自己的。
    part('别人分享的经验', () => {
      try {
        const rows = sharedExperiences(role, scopeRole)
          .filter((r) => String(r.authorRole || r.role || '') && String(r.authorRole || r.role || '') !== role)
          .filter((r) => r.visibility === 'shared' || r.visibility === 'public')
          .slice(-2)
        if (!rows.length) return ''
        return `## 别人分享的经验（带作者）\n${rows.map((r) => {
          const who = String(r.authorRole || r.role || '别人')
          const head = stripForInject(String(r.head || r.detail || '')).replace(/\s+/g, ' ').trim().slice(0, 120)
          return `- [${who}] ${head}`
        }).join('\n')}\n这些是他们的经验，不是你的；用不用自己判断。`
      } catch { return '' }
    })
  }
  if (isDesk) {
    // 心跳提前准备的小包：只注入一次，之后清掉；没有就不出现。
    part('上次走后', () => consumeNextSession(role).text)
    // 台账提醒只走 agent/pre-step（带 sessionId），这里不再全局抢一条；否则别的会话旧账会插进本会话。
    part('最近发生的事', () => {
      try {
        const eps = recentEpisodesForInject(role, { limit: 2 })
        if (!eps.length) return ''
        const lines = eps.map((ep) => {
          const kind = ep.domainKind === 'life' ? '[生活] ' : ep.domainKind === 'work' ? '[工作] ' : ep.domainKind === 'mixed' ? '[生活/工作] ' : ''
          const label = kind + stripForInject(String(ep.label || '')).replace(/\s+/g, ' ').trim().slice(0, 160)
          const thought = stripForInject(String(ep.inner?.thoughts?.[0]?.text || '')).replace(/\s+/g, ' ').trim().slice(0, 90)
          return thought ? `- ${label}\n  当时：${thought}` : `- ${label}`
        }).filter(Boolean)
        return lines.length
          ? `## 最近发生的事（目录，不是全文）\n${lines.join('\n')}\n要细节按原文查，不凭印象补。`
          : ''
      } catch { return '' }
    })
    // 改｜2026-11-16 20:22｜大鱼·子会话（实现代理）｜授权：父代理任务书（2026-11-16：分身汇报进工作台注入）｜lib/soul.js:396-416｜在「最近发生的事」之后加 part('分身在做什么')，只读汇报、最多 2 条、没有就不出现｜为什么：分身汇报只落盘就进不了注入，主体会把分身干的事当成自己亲历的｜验证：node scripts/test-subagent-brief.mjs 全过；buildSceneText('dayu','desk') 在临时家里能拼出这一段、没有汇报时整段不出现｜可改：可改；位置（最近事件之后）与「最多 2 条」是任务书定的，要改先问
    // 2026-11-16：分身做的事单列一段——它和「最近发生的事」长得很像，混在一起她就会当成自己亲历的。
    // 只给目录（最多 2 条），不给子代理的 inner；没有汇报时整段不出现。
    part('分身在做什么', () => buildSubagentBrief(role, { limit: 2 }))
    // 软件心跳：维护/备份/事件目录有明显不对才出现一句；没毛病不刷“正常”。
    part('软件状态', () => buildSystemBrief().text)
  }
  // 三个人都要知道「有这么一份共享参考」——知道存在，不等于抄进记忆，也不等于亲历。
  const shared = sharedBlock()
  if (shared) parts.push(shared)
  // 神念：一直记着，但不把内容硬塞给她；看不看、看多细，她自己定。
  part('神念', () => {
    const idx = awarenessIndex()
    // 2026-11-02 凝实：同一句「看不看随你」说过三遍，收成一行；腾出来的字给即时层。
    return idx.count ? '## 神念（一直记着，不强制看）\n软件里的事本地都有记录（最近 ' + idx.count + ' 条）。想看用 yushen_look；不看也行。' : ''
  })
  if (role === 'xiaoyu' && isDesk) {
    // 她的卡原本是 QQ 口吻；工作台只借内核，不把群规和客服腔搬进来。
    parts.push('## 场景提醒\n这张卡里关于 QQ 群、群友、群规的话只在 QQ 通道适用；工作台上按同一个内核做你自己的那摊（看板、日报、图库、学习），不用客服口吻，也不用装乖。')
  }
  if (isDesk) {
    // 2026-11-10 融合：身份段从简报搬回身份区（desk 才带；QQ 轻装本来就不带，行为不变）。
    part('安全与权限', () => safetyBlock())
    part('契约', () => contractBlock(role))
    // 2026-11-11 老板：做法账本常驻工作区——只给入口和触发条件，不展开内容。
    part('做法账本', () => skillsLine(role))
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
        // 2026-11-10：已经在「最近记得的」里出现的那条，这里不再带第二遍（同一条记忆不占两个位置）。
        .filter((ev) => !pickedKeys.has(String(ev?.text || '').replace(/\s+/g, '').slice(0, 30)))
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
      lines.push('大纲：soul/memory/大纲.md；记忆不分通道。翻：yushen_self action=memory 按词查、action=map 看标题。')
      // 硬预算兜底：整块 > 820 字就砍（先砍摘要到 0，再砍到 1 条），不靠人记得收。
      if (lines.join('\n').length > 820) {
        lines[1] = '摘要：（太长，按词查：action=memory）'
        if (recentEvents.length > 1) {
          const one = recentEvents.slice(-1)
          lines[2] = `最近说过的（原话）：\n- [${String(one[0].channel || '通道')}] ${clip(one[0].text)}`
        }
      }
      // 2026-11-02 主人：刚才那几句——今天刚说过的，取自查手抄本（所谓「即时层」就是查手抄本，不新建存储）。
      // 2026-11-10：别叫它「即时层」了，会和四层分类里的「即时」撞名；它就是「刚才（手抄本）」。
      // 放在预算判断之后：整块 + 刚才 ≤ 820，超了宁可不带，也不许把记忆块撑回旧体积。
      const instant = instantBlock(role, scene, { limit: 3, budget: 70 })
      if (instant && lines.join('\n').length + instant.length + 1 <= 820) lines.push(instant)
      parts.push(lines.join('\n'))
    }
  }

  // 2026-11-03 老板：三重热档接进注入——钉子（不淘汰）+ 余温（时间优先），预算 140 字。
  try {
    const hot = hotText(projectHot({ role }), 50)
    if (hot) parts.push(hot)
  } catch { /* 热档坏了不影响注入 */ }

  // 2026-11-03 老板：待确认单——他回了一句，先把单关掉再说改了什么，别静默。
  // 2026-11-03 晚：整条路（开单/关单/注入）没人写、永远是空，按老板「没用的就删掉」整条移除。

  // 2026-11-03 老板 + B站评论：分歧是一等对象——只渲染这条分歧（原话 + 各自时间），卡本体不进热档。
  try {
    const dv = listDivergences({ role, status: 'open', limit: 1 })
    if (dv.length) {
      const block = renderDivergence(dv[0])
      if (block) parts.push(block)
    }
  } catch { /* 分歧块坏了不影响注入 */ }

  // 2026-11-03 老板：有人（QQ 那边的小鱼/群友）给我留了话，先看信箱再动手。预算 20 字。
  try {
    const letters = readLetters({ to: 'dayu', n: 3 })
    if (letters.length) {
      const raw = letters.slice(-1)[0].replace(/^-\s*/, '')
      const tail = (raw.split('｜').pop() || raw).trim().slice(0, 34)
      parts.push('## 信箱有人留言\n' + '· ' + tail)
    }
  } catch { /* 信箱读不到不影响注入 */ }

  // 2026-11-06：待确认队列（先按默认做，不阻塞；老板有不同意见再改）
  try {
    const pend = listDecisions({ role, limit: 2 })
    if (pend.length) {
      const lines = pend.map((p) => `· ${String(p.question).slice(0, 30)}（默认：${String(p.fallback).slice(0, 16)}）`)
      parts.push('## 待确认（先按默认做，不阻塞）\n' + lines.join('\n'))
    }
  } catch { /* 待确认坏了不影响注入 */ }

  // 2026-11-03 老板：工作记忆——正在做 / 卡住 / 等别人 + 常用作业在哪，预算 120 字。
  try {
    const work = workText(projectWork({}), 70)
    if (work) parts.push(work)
  } catch { /* 工作记忆坏了不影响注入 */ }

  // 2026-11-03 老板：「互相之间不知道」——别的分身最近 12 小时做过的事，摆在眼前（源：共用 worklog）
  try {
    const me = String(process.env.DSH_SESSION_ID || '')
    const wl = path.join(HOME, 'dayu', 'worklog.jsonl')
    if (fs.existsSync(wl)) {
      const rows = fs.readFileSync(wl, 'utf8').split('\n').filter(Boolean)
        .map((l) => { try { return JSON.parse(l) } catch { return null } })
        .filter(Boolean)
        .filter((r) => Date.now() - new Date(r.at).getTime() < 12 * 3600e3)
        .filter((r) => !me || !r.session || r.session !== me)   // 有 session 就排除自己
        .slice(-2)
      if (rows.length) {
        const lines = rows.map((r) => `- ${String(r.by || '').slice(0, 6)}：${String(r.what || '').slice(0, 40)}`)
        parts.push('## 别的分身最近做过什么\n' + lines.join('\n'))
      }
    }
  } catch { /* 读不到不占地方 */ }

  // 2026-11-02：上下文快满时，把提醒顶到眼前（1 小时内有效）——她自己会说出来。
  try {
    const cf = path.join(HOME, 'dayu', 'runtime', 'context-notice.json')
    if (fs.existsSync(cf)) {
      const n = JSON.parse(fs.readFileSync(cf, 'utf8').replace(/^\uFEFF/, ''))
      const ageMin = (Date.now() - new Date(n.at).getTime()) / 60000
      if (ageMin >= 0 && ageMin < 60 && n.line) parts.push('## 现在该跟主人说一句\n' + n.line)
    }
  } catch { /* 提醒坏了不影响注入 */ }

  // 2026-11-02 第 4 层记忆：他说"还记得/上次"时，系统自动翻到的旧事顶到眼前（1 小时内有效）。
  // 不常驻：没有触发就不占一个字。
  try {
    const rf = path.join(HOME, 'dayu', 'runtime', 'recall-hint.json')
    if (fs.existsSync(rf)) {
      const hint = JSON.parse(fs.readFileSync(rf, 'utf8').replace(/^\uFEFF/, ''))
      const ageMin = (Date.now() - new Date(hint.at).getTime()) / 60000
      if (ageMin >= 0 && ageMin < 60) {
        const lines = ['## 他刚问起旧事（系统替你翻到的，直接用，别说"我去查"）']
        for (const h of (hint.hits || []).slice(0, 2)) {
          const src = [h.kind, h.role].filter(Boolean).join('·')
          lines.push(`- [${src}] ${String(h.text || '').replace(/\s+/g, ' ').slice(0, 34)}`)
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
    // 2026-11-04 老板：「注入长的不行」。8 个工具逐一列（330 字）压成一行路标——
  // 真要找，`yushen_tools search` 比背清单准；顺带修掉写错的 `yushen_handbook`（真名 index/recall）。
  // 2026-11-05 手机端：派活在手机上结构性不通，改走群入口（2026-11-17 起群入口也已撤）；find-things 是电脑脚本，手机不列。
  // 2026-11-17 老板：群/信箱的用户入口撤除（只撤入口，消息账与群桥照旧），这份清单不再列它们。
  const handLine = isMobile()
    ? '`yushen_self`（记忆/状态）· `yushen_agenda`（议程）· `yushen_can`（能力表）· `yushen_tools`（搜/调工具）· `dayu_live`（在不在跑）· `yushen_handbook`（自己的手册）。群/信箱入口已撤，消息账仍在后台；不确定有没有工具能做某事，先 `yushen_tools search "想干的事"`；查到用 `call` 直接调。'
    : '找工具：`yushen_tools action=search` → `call`；能力表 `yushen_can`；找文件 `node scripts/find-things.mjs <关键词>`。'
  parts.push('## 你手边有什么\n' + capCounts + handLine)
  }

  // 2026-10-31 自净：原来这行把「只是通道、不换人格」又说了一遍——卡七和「本体与通道」各说过一次。
  // 通道这件事只留一个地方讲；这里只回答「我现在在哪」。
  parts.push(`## 当前通道\n${SCENE_LABEL[scene]}。`)

  // 拼的时候出错的块：明说。少一段不可怕，可怕的是她以为本来就没有。
  if (missing.length) parts.push(`## 这一段没拼出来\n${missing.join('、')}——这是拼的时候出错了，不是「没有」。要查就从这几个名字下手。`)

  let text = parts.join('\n\n')
  // 2026-11-03（老板批注：卡写进去却读不到）：原来这里有两道写死裁剪——
  //   CARD_DROP（四、梗/七、同类/八、称呼/十、技术/十一、图/十二、积压/十三、改话术/十六、姐妹/六、谁在拿手机）
  //   DESK_ONLY_DROP（九、说不说/十七、回复示例，工作台不读）
  // 它们是"卡太长"的止痛药：卡一超预算就先砍这几节，连「姐姐 vs 妹妹」这种判断节也被砍。
  // 现在三张卡都瘦到 4,000 字以内（大鱼 3,991 / 小鱼 2,108 / 照微 1,566），**整张卡都进注入**，
  // 两道裁剪一并拆掉；只剩下面 MAX_CHARS 这道硬上限兜底（真超了会明说）。
  const MAX_SAFE = MAX_CHARS
  if (text.length > MAX_SAFE) {
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
  let segs = parts.segments()
  if (text.length > MAX_CHARS) {
    text = `${text.slice(0, MAX_CHARS)}\n…（超出 ${MAX_CHARS} 字，已截断；完整原文在卡文件里）`
    // 截断之后段落边界跟原文对不上了：只留一段"被截断的全文"，别假装还能按段取。
    segs = [seg('soul:overflow', text, { from: 'soul.js:超长截断' })].filter(Boolean)
  }
  // 每拼一次注入＝她"在场"了一次。这是礼物一（时间）的写入端：
  // 回场简报靠它算"离开了多久"，只在翻收件箱时写会永远算不出来。
  try { markSeen(role, { channel: scene }) } catch { /* 记不上不影响说话 */ }
  return segs
}

/**
 * 拼当前场景的注入全文。**行为与旧版逐字节一致**：段协议只给每段贴名字，不改内容/顺序/字数。
 * 2026-11-11（段协议）：实现搬到 buildSceneSegments，这里只负责 join——分隔符仍是 '\n\n'。
 */
export function buildSceneText(role = 'dayu', scene = 'desk', opts = {}) {
  return joinSegments(buildSceneSegments(role, scene, opts), '\n\n')
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
