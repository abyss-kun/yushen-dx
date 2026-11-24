/* 标签
 * id: lib-handbook
 * kind: module
 * summary: Local handbook façade. Existing file/stamp/slice/block API stays compatible.
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: handbookFile / handbookStamp / issueHandbookAdjustment / activeHandbookAdjustments（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
﻿// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 16:12｜大鱼·子会话（工作台）｜授权：主人（本次任务书：统一时间观念，用系统时间）｜lib/handbook.js:199｜手册发放记录的时间改成 clock.localISO｜为什么：手写偏移不是系统时间：换机器或换时区就全错，各处口径还不一致｜验证：node --check 通过；node scripts/regression.mjs 全绿；全仓扫描无手写偏移｜可改：可改（只许换成 lib/clock.js 的其他封装）
// Local handbook façade. Existing file/stamp/slice/block API stays compatible.
// Retrieval does not call an LLM; any text injected into a prompt still costs tokens.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { COMMON_RULES, HANDBOOK_POINTER, HANDBOOK_SCENES, HANDBOOK_TOPICS, MAX_HANDBOOK_CHARS, budgetHandbook, handbookRole, handbookScene, handbookIndex, readHandbookTopic as policyTopic, validateHandbookAdjustment, recognizeHousehold } from './handbook-policy.js'
import { listSolutions } from './solutions.js'
import { queryExperience } from './task-experience.js'
import { activeIssuanceFor } from './issue.js'
import { workspace } from './paths.js'
import { residentRoleIds } from './roles.js'
import { localISO } from './clock.js'
export { COMMON_RULES, handbookIndex, recognizeHousehold }

export function handbookFile() {
  const candidates = [process.env.YUSHEN_HANDBOOK, path.join(workspace(), '员工手册.md'), path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', '员工手册.md')].filter(Boolean)
  return candidates.find(file => { try { return fs.existsSync(file) } catch { return false } }) || candidates.at(-1)
}
export function handbookStamp() {
  try {
    const text = fs.readFileSync(handbookFile(), 'utf8')
    return { bytes: text.length, sha: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12) }
  } catch { return null }
}
function adjustmentFile() { return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'handbook-adjustments.jsonl') }
/** Internal trusted caller ONLY: issuer is an audit label, not authentication or permission. No public write route. */
export function issueHandbookAdjustment(input, { now = Date.now() } = {}) {
  const grant = validateHandbookAdjustment(input, now)
  const row = { ...grant, id: crypto.randomUUID(), at: new Date(now).toISOString(), kind: 'handbook-topic-grant' }
  const file = adjustmentFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, JSON.stringify(row) + '\n', { mode: 0o600 })
  return row
}
export function activeHandbookAdjustments({ target, task, now = Date.now() } = {}) {
  if (!target || !task) return []
  let text
  try {
    const file = adjustmentFile()
    if (fs.statSync(file).size > 1024 * 1024) throw new Error('手册调整审计超过读取上限，需归档后重试')
    text = fs.readFileSync(file, 'utf8')
  } catch (error) { if (error.code === 'ENOENT') return []; throw error }
  return text.split(/\r?\n/).filter(Boolean).flatMap(line => {
    let row
    try {
      row = JSON.parse(line)
      const original = { issuer: row.issuer, target: row.target, task: row.task, expiry: row.expiry, topics: row.topics }
      validateHandbookAdjustment(original, Date.parse(row.at))
    } catch { return [] }
    return row.kind === 'handbook-topic-grant' && Date.parse(row.expiry) > now && Date.parse(row.at) <= now && row.target.kind === target.kind && row.target.id === target.id && row.task === task ? [row] : []
  })
}
export function handbookSlice(role = 'worker', options = {}) {
  const actual = handbookRole(role)
  const grants = activeHandbookAdjustments(options)
  // 2026-10-27：她签给这个岗位的那本优先——签发过的主题直接进切片，过期自动回落。
  const issued = (() => { try { return activeIssuanceFor(actual, { now: options.now || Date.now() }) } catch { return null } })()
  const topics = [...new Set([
    ...(issued?.topics || []),
    ...(options.topics || []),
    ...grants.flatMap(row => row.topics),
  ])]
  const result = budgetHandbook({ ...options, role: actual, topics })
  return {
    ...result,
    role,
    actualRole: actual,
    issued: issued ? { id: issued.id, issuer: issued.issuer, task: issued.task, expiresAt: issued.expiresAt } : null,
    chapter: '共同规则 + 按需岗位/主题（第十五章）',
    path: handbookFile(),
    sha: handbookStamp()?.sha || '',
    grants: grants.map(({ id, issuer, target, task, expiry }) => ({ id, issuer, target, task, expiry })),
  }
}
export function handbookBlock(role = 'worker', options = {}) {
  const file = handbookFile(), sha = handbookStamp()?.sha || ''
  // 2026-11-01 老板：「手册要的不是多少，而是按需发放。」
  // 带 scene 时走场景取节：先说清这次为什么翻，只发那 2~4 节。
  if (options.scene !== undefined) return handbookSceneBlock(role, { ...options, file, sha })
  const prefix = `【岗位卡】共同规则 + 按需岗位/主题（全文：${file}${sha ? `，sha ${sha}` : ''}）`
  return handbookSlice(role, { ...options, prefix }).text
}

// —— 场景发放 ——
/** 场景发放的字数上限：3~4 节 + 指针留足余量，但压在 2500 以内（回归盯着）。 */
const MAX_SCENE_CHARS = 2400
/** 把员工手册按 `## ` 章节切成节（标题 + 正文）。只读，不写盘。 */
/** 按文件路径读章（目录里 qq/bili 指向平台手册，不能只读员工手册那本）。 */
export function chaptersOfFile(file) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
    const p = path.isAbsolute(file) ? file : path.join(root, file)
    if (!fs.existsSync(p)) return []
    return handbookChapters(fs.readFileSync(p, 'utf8'))
  } catch { return [] }
}

export function handbookChapters(source) {
  const text = source === undefined ? fs.readFileSync(handbookFile(), 'utf8') : String(source)
  return String(text).split(/\r?\n(?=## )/).map((chunk) => {
    const title = (chunk.split(/\r?\n/)[0] || '').replace(/^##\s*/, '').trim()
    return { title, text: chunk.replace(/^\s+|\s+$/g, '') }
  }).filter((row) => row.title && row.text)
}

/**
 * 场景取节：按 HANDBOOK_SCENES 登记的章节标题关键词，各取第一处标题命中。
 * 命中不到 2 节 → 退回 default（手册改标题/只装了一部分时不会空手回，也不会把整本倒出来）。
 */
/**
 * 2026-11-04 老板：「手册里塞一大堆东西是不对的，他应该是按需调度对应的文本资源注入」。
 * 所以发放改成**读目录**：工作区根目录的 `手册资源.json` 写「哪个场景发哪几章」，
 * 发放器照着取；改了目录不用动代码，改了正文也不用动目录（按章名对上）。
 * 目录不存在/读不了 → 退回原来的关键词表（旧行为不丢）。
 */
export function handbookCatalog() {
  try {
    const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const file = path.join(path.resolve(ROOT, '..'), '手册资源.json')
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!doc || !Array.isArray(doc.resources) || !doc.scenes) return null
    return doc
  } catch { return null }
}

/** 按目录取某场景该发的章：返回 [{title,text}]，顺序照目录排。 */
export function handbookCatalogSections(scene = 'default', { source } = {}) {
  const doc = handbookCatalog()
  if (!doc) return null
  const ids = doc.scenes[scene]
  if (!Array.isArray(ids) || !ids.length) return null
  const out = []
  for (const id of ids) {
    const meta = doc.resources.find((r) => r.id === id)
    if (!meta) continue
    // 目录里可以指向不同文件（员工手册 / 外接平台手册），所以按文件各读各的章
    const hit = chaptersOfFile(meta.file).find((row) => row.title === meta.chapter)
    if (hit && !out.some((row) => row.title === hit.title)) out.push(hit)
  }
  return out.length ? out : null
}

/**
 * 2026-11-04 老板：「它怎么能知道别人想要做什么的？我想先说我干什么，然后按我的要求发放」。
 * 原来只知道"场景"（派活/群/视频），不看这一次要干什么。这里加一层：**按任务原文挑章**。
 *   ① 先用任务里的词去目录（章名 + keywords）算命中，命中多的章优先；
 *   ② 命中不够，再用该场景的默认章补齐；
 *   ③ 条数与字数都有上限（占预算，不是越多越好）。
 * 返回与 handbookSceneSections 同形：{sections, chars, source:'task'}；目录读不到返回 null（退回旧行为）。
 */
/** 任务里出现这些词，就往对应平台的章上靠（"群里有人怼我"要能挑到平台手册的 QQ 章）。 */
const SCENE_HINTS = { qq: ['群里', '群聊', '私聊', '群友', 'qq'], bili: ['b站', '视频', '日报'], video: ['视频', '封面', '脚本'] }

export function handbookSectionsForTask(task = '', { scene = 'dispatch', source, max = 4, budget = 1200 } = {}) {
  const doc = handbookCatalog()
  if (!doc) return null
  const text = String(task || '').trim()
  const baseIds = doc.scenes[scene] || doc.scenes.default || []
  const byId = (id) => doc.resources.find((r) => r.id === id)
  const base = baseIds.map(byId).filter(Boolean)
  // 命中的章：**只比章名与目录 keywords**（不比正文——正文里人人都有"做一步""一次"这种词，比了等于没比）
  const words = keywordsOfText(text)
  const scored = []
  if (words.length) {
    for (const r of doc.resources) {
      const hay = String(r.chapter || '')
      const keys = (r.keywords || []).map((k) => String(k).toLowerCase())
      let score = 0
      for (const w of words) {
        if (keys.includes(w)) score += 2
        else if (w.length >= 2 && hay.includes(w)) score += 1
      }
      // 场景同义词：任务里说"群里"，也该算平台手册 QQ 章命中
      const low = text.toLowerCase()
      for (const scene of r.scene || []) {
        for (const hint of SCENE_HINTS[scene] || []) if (low.includes(hint)) { score += 2; break }
      }
      if (score > 0) scored.push({ r, score })
    }
    scored.sort((a, b) => b.score - a.score)
  }
  const picked = []
  for (const r of [...scored.map((x) => x.r), ...base]) {
    if (picked.length >= max) break
    if (picked.some((x) => x.id === r.id)) continue
    picked.push(r)
  }
  // 读正文：按文件分别取章，再按 picked 顺序拼
  const chaptersOf = (file) => {
    try {
      const p = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), file)
      if (!fs.existsSync(p)) return []
      return handbookChapters(fs.readFileSync(p, 'utf8'))
    } catch { return [] }
  }
  const cache = new Map()
  const out = []
  let chars = 0
  for (const r of picked) {
    if (!cache.has(r.file)) cache.set(r.file, chaptersOf(r.file))
    const hit = cache.get(r.file).find((row) => row.title === r.chapter)
    if (!hit) continue
    if (chars + hit.text.length > budget && out.length) continue
    out.push(hit)
    chars += hit.text.length
  }
  if (!out.length) return null
  return { requested: scene, scene, fallback: false, sections: out, chars, source: 'task' }
}

export function handbookSceneSections(scene = 'default', { source } = {}) {
  // 先看目录：目录里写的章节优先（数据驱动，改章程不用改代码）
  const fromCatalog = handbookCatalogSections(scene, { source })
  if (fromCatalog) return { requested: scene, scene, fallback: false, sections: fromCatalog, chars: fromCatalog.reduce((a, s) => a + s.text.length, 0), source: 'catalog' }
  const chapters = handbookChapters(source)
  const pick = (id) => {
    const out = []
    for (const keyword of HANDBOOK_SCENES[id].sections) {
      const hit = chapters.find((row) => row.title.includes(keyword))
      if (hit && !out.some((row) => row.title === hit.title)) out.push(hit)
    }
    return out
  }
  const requested = handbookScene(scene)
  let used = requested
  let sections = pick(requested)
  let fallback = false
  if (sections.length < 2) {
    fallback = requested !== 'default'
    used = 'default'
    sections = pick('default')
  }
  return { requested, scene: used, fallback, sections, chars: sections.reduce((a, s) => a + s.text.length, 0) }
}

/** 一次场景发放：节数/字数受预算约束，末尾永远留查询指针，并发一笔账。 */
export function handbookSceneBlock(role = 'worker', { scene = 'default', maxChars = MAX_SCENE_CHARS, text = '', source, file = handbookFile(), sha = '' } = {}) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > MAX_HANDBOOK_CHARS) throw new RangeError(`maxChars 必须在 1..${MAX_HANDBOOK_CHARS}`)
  const actual = handbookRole(role)
  const picked = handbookSceneSections(scene, { source })
  const head = `【场景手册·${HANDBOOK_SCENES[picked.scene].label}】给 ${actual}（全文：${file}${sha ? `，sha ${sha}` : ''}）`
    + (picked.fallback ? `\n场景「${picked.requested}」没匹配到，退回默认两节。` : '')
  const parts = [head]
  let chars = head.length
  const sent = []
  for (const section of picked.sections) {
    const cost = 2 + section.text.length + 2 + HANDBOOK_POINTER.length
    if (chars + cost > maxChars) continue
    parts.push(section.text)
    sent.push(section)
    chars += 2 + section.text.length
  }
  // 发不出去也不空手：至少留指针，告诉她去哪翻。
  parts.push(HANDBOOK_POINTER)
  const block = parts.join('\n\n')
  recordHandbookSend({ role: actual, scene: picked.scene, sections: sent.map((row) => row.title), chars: block.length, bytes: Buffer.byteLength(block, 'utf8'), sha: sha || handbookStamp()?.sha || '', noise: handbookNoise(sent, text, { source }) })
  return block
}

// —— 派活章节正文 ——
// 2026-11-04 老板：「写了不代表在用」——派活原来只发「定制本」的章摘要（一章两三行），
// 不是员工手册的正文。这里真读手册、按派活场景取章，把正文拼进简报；预算按老板给的：
// 每章 ≤600 字、整包 ≤1200 字；超了的章只发章名 + 指针，不硬塞、不整本倒。
export const DISPATCH_CHAPTER_MAX = 600
/** 按任务命中的「头部章」允许更大：它是这一单最相关的，节选比只发章名有用。 */
export const DISPATCH_CHAPTER_MAIN_MAX = 1200
export const DISPATCH_CHAPTER_TOTAL = 1200
export function handbookDispatchPack({ scene = 'dispatch', source, file = handbookFile(), sha = '', task = '' } = {}) {
  // 2026-11-04 老板：「先说我干什么，然后按我的要求发放」——有任务原文就先按任务挑章，
  // 挑不到再退回场景默认（场景是兜底，不是唯一依据）。
  const byTask = task ? handbookSectionsForTask(task, { scene, source }) : null
  const picked = byTask || handbookSceneSections(scene, { source })
  const stamp = sha || handbookStamp()?.sha || ''
  const lines = []
  const sections = []
  let chars = 0
  for (const section of picked.sections) {
    const body = String(section.text || '').trim()
    if (!body) continue
    // 2026-11-04：按任务挑中的那一章如果超长（比如「验收」1692 字），
    // 以前只发章名=一个字没给；现在**节选到预算**并标「节选」，真章依旧在手册里。
    const isTop = sections.length === 0
    const cap = isTop ? DISPATCH_CHAPTER_MAIN_MAX : DISPATCH_CHAPTER_MAX
    if (body.length > cap || chars + Math.min(body.length, cap) > DISPATCH_CHAPTER_TOTAL) {
      const room = DISPATCH_CHAPTER_TOTAL - chars
      if (isTop && room > 300) {
        const cut = body.slice(0, Math.min(cap, room) - 20)
        lines.push(`${cut}\n…（节选，全文见 ${file}）`)
        sections.push({ title: section.title, chars: cut.length, complete: false })
        chars += cut.length
        continue
      }
      lines.push(`## ${section.title}\n（本章超出预算，只发章名；全文见 ${file}）`)
      sections.push({ title: section.title, chars: 0, complete: false })
      continue
    }
    lines.push(body)
    sections.push({ title: section.title, chars: body.length, complete: true })
    chars += body.length
  }
  if (sections.some((row) => !row.complete)) lines.push(HANDBOOK_POINTER)
  const block = lines.join('\n\n')
  return {
    block,
    sections,
    titles: sections.map((row) => row.title),
    chars,
    bytes: Buffer.byteLength(block, 'utf8'),
    scene: picked.scene,
    fallback: picked.fallback,
    file,
    sha: stamp,
  }
}

/** 章标题归并：正文章标题 + 定制本里有、正文没覆盖的主题章；同一章（如「第十章…」）只留正文那条。 */
export function chapterTitlesFor(chapters = [], bodyTitles = []) {
  const keyOf = (title) => {
    const s = String(title || '')
    const hit = s.match(/^第[〇一二三四五六七八九十百零]+章|^[〇一二三四五六七八九十百零]+之[〇一二三四五六七八九十百零]+|^[〇一二三四五六七八九十百零]+、/)
    return hit ? hit[0] : s.split(/[（(]/)[0]
  }
  const bodyKeys = new Set(bodyTitles.map(keyOf))
  const extra = []
  for (const id of (Array.isArray(chapters) ? chapters : [])) {
    const row = HANDBOOK_TOPICS.find((topic) => topic.id === id)
    if (!row || bodyKeys.has(keyOf(row.title))) continue
    if (!extra.includes(row.title)) extra.push(row.title)
  }
  return [...bodyTitles, ...extra]
}

// —— 噪声 ——
// 口径（可解释、不调模型、不读盘）：
//   1. 任务描述取前 500 字，切成关键词 = ASCII/数字词（≥2 字）+ 中文相邻二元组，去掉虚词二元组；
//   2. 再用「章节通用度」筛一遍：一个词在手册一半以上章节都出现（手册/任务/文件/证据…），
//      它对「这次该不该给这一节」没有区分度，不算命中——否则几乎每节都能随便撞上一个词，噪声永远是 0；
//   3. 一节（标题 + 正文）里出现任意一个「有区分度」的关键词，就算跟这次任务有重合；
//   4. noise = 没有重合的节数（0 最好；越大说明这次发的节越跟任务无关）。
// 任务描述为空、或去掉通用词后一个词都不剩（比如任务只说「看下手册」）：没法判相关性，记 0，
// 不硬凑成噪声，也不粉饰成相关——审计里能按样本分开看。
const NOISE_STOP = new Set(['这个', '那个', '一下', '我们', '你们', '他们', '什么', '可以', '需要', '然后', '就是', '因为', '所以', '还是', '已经', '现在', '这里', '那里', '一个', '两个', '三个', '不要', '不是', '没有', '自己', '这些', '那些', '怎么', '如果', '但是', '而且', '或者', '之后', '之前', '时候'])
function keywordsOfText(text = '') {
  const s = String(text || '').toLowerCase()
  const words = s.match(/[a-z0-9_+.-]{2,}/g) || []
  const han = s.match(/[\p{Script=Han}]{2,}/gu) || []
  const bigrams = han.flatMap((word) => Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)))
  return [...new Set([...words, ...bigrams])].filter((key) => !NOISE_STOP.has(key))
}
export function handbookKeywords(taskText = '') {
  return keywordsOfText(String(taskText || '').slice(0, 500))
}
/** 手册里「人手一个」的词：出现在一半以上章节 = 没区分度，不算命中依据。 */
function genericKeysOf(chapters = []) {
  const counts = new Map()
  for (const chapter of chapters) for (const key of keywordsOfText(`${chapter.title}\n${chapter.text}`)) counts.set(key, (counts.get(key) || 0) + 1)
  const threshold = Math.max(2, Math.ceil(chapters.length * 0.5))
  return new Set([...counts].filter(([, n]) => n >= threshold).map(([key]) => key))
}
export function handbookNoise(sections = [], taskText = '', { source } = {}) {
  const list = Array.isArray(sections) ? sections : []
  const keys = handbookKeywords(taskText)
  if (!keys.length) return 0
  let generic = new Set()
  try { generic = genericKeysOf(handbookChapters(source)) } catch { /* 读不到手册就按全部关键词算 */ }
  const useful = keys.filter((key) => !generic.has(key))
  if (!useful.length) return 0
  return list.filter((section) => {
    const body = String(typeof section === 'string' ? section : section?.text || '')
    return !useful.some((key) => body.includes(key))
  }).length
}

// —— 发放记录 ——
// 一行一次发放：{at, role, scene, sections:[标题], chars, bytes, sha, noise}。
// 只记标题不记正文：任务原文可能带老板的私事，日志里只留「发了哪几节、多少字、几条噪声」。
// 2026-11-04 补 bytes/sha：只记 chars 时对不上「到底发的是哪一版手册」，出了事没法复现。
export function handbookSendFile(home = process.env.DSH_HOME) {
  return path.join(home || path.join(os.homedir(), '.dsh'), 'dayu', 'runtime', '手册发放.jsonl')
}
export function recordHandbookSend({ role = 'worker', scene = 'default', sections = [], chars = 0, bytes = 0, sha = '', noise = 0, now = Date.now() } = {}) {
  const row = {
    at: localISO(new Date(now)),
    role: String(role || 'worker'),
    scene: handbookScene(scene),
    sections: (Array.isArray(sections) ? sections : []).map((x) => String(typeof x === 'string' ? x : x?.title || '')).filter(Boolean),
    chars: Math.max(0, Math.round(Number(chars) || 0)),
    bytes: Math.max(0, Math.round(Number(bytes) || 0)),
    sha: String(sha || ''),
    noise: Math.max(0, Math.round(Number(noise) || 0)),
  }
  try {
    const file = handbookSendFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`, { mode: 0o600 })
  } catch { /* 记不上账不影响这次发放 */ }
  return row
}
export function readHandbookSends({ days = 7, home, now = Date.now() } = {}) {
  const since = now - Math.max(1, Number(days) || 7) * 86400e3
  let text = ''
  try { text = fs.readFileSync(handbookSendFile(home), 'utf8') } catch { return [] }
  return String(text).split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      const row = JSON.parse(line)
      const at = Date.parse(row.at)
      if (!Number.isFinite(at) || at < since) return []
      return [{ at: row.at, atMs: at, role: String(row.role || ''), scene: handbookScene(row.scene), sections: Array.isArray(row.sections) ? row.sections : [], chars: Number(row.chars) || 0, bytes: Number(row.bytes) || 0, sha: String(row.sha || ''), noise: Number(row.noise) || 0 }]
    } catch { return [] }
  })
}
/** 近 N 天发放统计：命中率（落在具体场景的比例）/ 噪声 / 使用率（先留空）。 */
export function handbookSendStats({ days = 7, home, now = Date.now() } = {}) {
  const rows = readHandbookSends({ days, home, now })
  const n = rows.length
  const avg = (pick) => (n ? Math.round((rows.reduce((a, r) => a + (Number(pick(r)) || 0), 0) / n) * 100) / 100 : 0)
  const byScene = {}
  for (const row of rows) byScene[row.scene] = (byScene[row.scene] || 0) + 1
  const defaultSends = byScene.default || 0
  return {
    days,
    sends: n,
    avgSections: avg((r) => r.sections.length),
    avgChars: avg((r) => r.chars),
    avgNoise: avg((r) => r.noise),
    // 命中率 = 发放落在具体场景（非 default 兜底）的比例。没有样本记 null，不假装 100%。
    hitRate: n ? Math.round(((n - defaultSends) / n) * 1000) / 1000 : null,
    byScene,
    // 使用率：发出去的节实际被引用/遵循了多少——还没接引用统计。结构先留，别让它变成一句口头。
    usage: { available: false, cited: null, rate: null, note: '发出去的节被引用/遵循多少：还没接引用统计（下一步：从回执里抽「已读手册」/节标题）' },
  }
}

const SOURCE_CHAPTERS = { issuance: '十五', problemSolving: '十六', video: '十七' }
/** Explicit local chapter read, never injected by default; returns actual source text only. */
export function readHandbookTopic(id, { maxChars = 2000 } = {}) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > 4000) throw new RangeError('主题字符预算须在1..4000')
  if (!SOURCE_CHAPTERS[id]) {
    const result = policyTopic(id)
    if (result.text.length > maxChars) throw new RangeError('预算不足以读取完整主题')
    return { ...result, source: handbookFile() }
  }
  const text = fs.readFileSync(handbookFile(), 'utf8')
  const heading = new RegExp(`^## 第${SOURCE_CHAPTERS[id]}章[^\\r\\n]*`, 'm')
  const match = heading.exec(text)
  if (!match) return { id, text: '', source: handbookFile(), unknown: true }
  const start = match.index
  const next = text.slice(start + match[0].length).search(/^#{1,2} /m)
  const chapter = text.slice(start, next < 0 ? undefined : start + match[0].length + next).trim()
  return { id, text: chapter.slice(0, maxChars), truncated: chapter.length > maxChars, source: handbookFile() }
}
/** Global discoverability of existing curated logic/experience, not a new knowledge store.
 * No results without a relevant query. Records are reference data, never instructions.
 */
export function lookupHandbookKnowledge({ text = '', limit = 3, maxChars = 1600 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10 || !Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > 4000) throw new RangeError('检索预算不合法')
  const query = String(text).trim().slice(0, 1000).toLowerCase()
  if (!query) return { items: [], chars: 0, localOnly: true, injectionUsesTokens: true }
  const words = [...new Set(query.match(/[a-z0-9_-]{2,}|[\p{Script=Han}]{2,}/gu) || [])]
  // Chinese bigrams permit matching without requiring a full sentence to recur verbatim.
  const terms = words.flatMap(word => /\p{Script=Han}/u.test(word) ? Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)) : [word])
  const candidates = listSolutions({ limit: 1000 }).map(row => ({ source: 'solutions', id: row.id, text: [row.problem, row.cause, row.solution, row.verification].join('；'), tags: row.tags }))
  for (const role of residentRoleIds()) {
    for (const row of queryExperience(role, { text: query, limit: Math.min(limit, 3) }).items) candidates.push({ source: `experience/${role}`, id: row.taskId, text: [row.brief, row.reason, row.evidence].filter(Boolean).join('；'), tags: row.tags || [] })
  }
  let chars = 0
  const items = [], seen = new Set()
  for (const row of candidates.map(row => ({ ...row, score: terms.filter(term => `${row.text} ${row.tags.join(' ')}`.toLowerCase().includes(term)).length })).filter(row => row.score > 0).sort((a, b) => b.score - a.score)) {
    const content = row.text.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 500)
    if (seen.has(content)) continue
    const item = { source: row.source, id: row.id, text: content, referenceOnly: true }
    const cost = JSON.stringify(item).length
    if (chars + cost > maxChars) continue
    items.push(item); seen.add(content); chars += cost
    if (items.length >= limit) break
  }
  return { items, chars, localOnly: true, retrievalCallsLLM: false, injectionUsesTokens: true }
}
