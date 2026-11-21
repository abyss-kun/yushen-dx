// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-16 20:55｜大鱼·子会话（实现代理；父会话 c5b1cd18 委派）｜授权：老板（本次任务书：事件段 ↔ 卡片这条边）｜scripts/refine.mjs 导入 + commitOne 前｜写卡前按 row.role + row.turnId 查事件段索引，把 episodeId 写进卡；查不到写空，不硬编；索引按角色缓存，不调模型｜为什么：事件段和卡之前只有时间先后，没有指针，翻段/翻卡接不上｜验证：node --check；test-episode / test-refine-quality / test-query / test-cards 全过｜可改：可改（红线别动：只写卡上一个指针；不新建存储、不改判据）
// 改｜2026-11-16 20:1x｜大鱼·子会话（实现代理；父会话 c5b1cd18 委派）｜授权：老板（本次任务书：反馈进精提炼，未完成清单 P1-3）｜scripts/refine.mjs 全文若干处｜把反馈接进提炼：写卡前按 turnId/ref 查 feedback → scoreFeedback 算 score/action；drop 不写卡、只把队列行标 skipped 留 why；review 照常写卡但带 feedbackReview/feedbackWhy，且不计入“正常通过”；keep 照旧｜为什么：反馈一直只影响排序/晋升，用坏了/被纠正过的内容下次还会被重新炼成卡｜验证：node --check 通过；--selftest 全过；node scripts/test-refine-feedback-wire.mjs 全过；test-refine-feedback / test-refine-quality 全过｜可改：可改（红线别动：反馈只给建议、不删旧卡；不调模型；预算/去重/校验一行不动）
// 改｜2026-11-02 23:5x｜大鱼·子会话（工作台）｜授权：老板（本次任务书：实现「精提炼」，先跑 20 条试跑）｜scripts/refine.mjs:1-540｜新增：待提炼指针 → 按 ref 回 live 只读那一段 → 便宜模型炼成一条 → 写 在用/，并把指针标 done；带冷却、条数上限、预算闸｜为什么：粗提炼不花钱但只是索引卡；「在用」一直是空的，她平常读不到提炼过的结论｜验证：node --check；--selftest 13/13；--dry 与 --limit 20 真跑各一次（结果见 docs/精提炼.md）｜可改：可改（红线别动：只写 在用/ + 待提炼 的 state + meta/digest-state.json）
// 改｜2026-11-02 23:51｜大鱼·子会话（工作台）｜授权：主人（2026-11-02 23:36 任务书：精提炼改批量、回归收尾）｜scripts/refine.mjs:1-1310｜精提炼改批量：按(通道,日期)分批、每批10-20段、JSON数组+id对齐、缺的补跑一次、整批解析失败才退化逐条；写库前严格校验五条红线(head空/<4字、detail<10字、无fromRef、kind不在三类、同fromRef重复)；清掉空head的旧测试行(l-20261102-memchain)并备份到 library/.trash/；出厂白名单补 refine.mjs｜为什么：老板问「为什么每条都要回原文找，不能一次提取出来吗」——逐条是 20 次往返，批量是 3 次｜验证：--selftest 27/27；test-library-chain 7/7；--dry 40条→4批 估算¥0.363；真跑 40条/4批/¥0.3948/79.6s/通过40 丢弃0；regression 224 通过 0 失败｜可改：可改（红线别动：只写 在用/ + 待提炼 的 state + meta/digest-state.json）
//
// 改｜2026-11-03 01:2x｜大鱼·子会话（工作台）｜授权：老板（本次任务书：10 轮精提炼，每轮对比+总结+优化）｜scripts/refine.mjs:372-640、1108-1215｜只动判据/提示/校验：①批量提示与 judge 对齐（知识必须外部+带出处、没出处不许判知识、过程/派发/口头计划/纯链接不算记忆、经验形状定死「下次/以后/遇到」）②judge 加近似重复闸（head 二字组 Jaccard≥0.6 → 记 skipped，不回 pending）③importance 落库（judge 判了 commitOne 没写）④出口日志闸（结论里带 exit code/作业流水 → skipped）⑤知识两道闸改「降级留痕」reKind（不再整条丢）⑥认 kind:"skip"、全等重复改 skipped｜为什么：10 轮里丢弃最多的一直是「知识没出处/预判不符/经验没形状」，丢整条既浪费又把好内容退回 pending 反复重跑｜验证：--selftest 27/27（10 轮每次改动后都跑）；10 轮×50 条真跑：写入 435、丢弃 52、花费 ¥0.5182；知识有出处 34/34、经验成形状 138/138、日志混入 0（本轮）、纯路径 0（本轮）；逐轮记录见 档案/精提炼-10轮-2026-11-03.md｜可改：可改（红线别动：只写 在用/ + 待提炼 的 state + meta/digest-state.json）
//
// 改｜2026-11-03 01:53｜大鱼·子会话（工作台；父会话 c82f4345 委派）｜授权：老板（本次任务书：精炼加计数与阈值）｜scripts/refine.mjs:1-1508｜新增：一轮跑完后追加一行指标到 <home>/dayu/runtime/refine-metrics.jsonl（写入/丢弃/跳过/降级/知识出处/经验形状/日志/路径/花费/耗时/调用/补跑/退化/语料），写失败 try/catch 吞掉｜为什么：10 轮全靠人肉记账，跌到阈值没人报警；闸要的是每轮可复算的计数，不是又一份报告｜验证：node --check 通过；--selftest 27/27（离线，不写盘）；指标字段由 scripts/test-refine-quality.mjs 的契约检查覆盖；真跑本轮不触发（不花钱）｜可改：可改（只许在轮末追加写指标；判据/提示/校验一行不动）
//
// 精提炼 = 花钱的那一层，所以三件事必须写在明面上：
//   ① 什么时候跑：默认 6 小时冷却（--force 跳过）；
//   ② 花多少：按 token 估，累计超过 --budget（默认 1 元）立刻停，不偷偷烧；
//   ③ 写什么：只写 在用/<类别>/<日期>.jsonl、待提炼/ 的 state、meta/digest-state.json。
//
// 批量口径（2026-11-02 老板要的）：
//   · 按 (通道, 日期) 分批，每批 10–20 段（--batch-size，默认 15；夹在 10–20 之间）；
//   · 输入拼成「段落1（id=xxx）: …\n段落2（id=yyy）: …」，要求模型返回 JSON 数组，每条必须带 id；
//   · id 对不上的段：只拿缺的那几条补跑一次；批量整体解析失败才退化成逐条（并打印原因）；
//   · 写库前严格校验：head 空/<4 字、detail <10 字、没有 fromRef、kind 不是三类、同一 fromRef 重复
//     → 一律不写，并把指针标回 pending（下次重跑）。
//
// 用法：
//   node scripts/refine.mjs --dry --limit 40                  # 干跑：多少批、每批几条、估算 token/钱（不调模型）
//   node scripts/refine.mjs --limit 40                        # 真跑（批量）
//   node scripts/refine.mjs --limit 40 --batch-size 20        # 每批 20 段（夹在 10–20）
//   node scripts/refine.mjs --limit 20 --per-item             # 老口径：一条一调（用于对比速度）
//   node scripts/refine.mjs --limit 40 --mix 记忆:8,经验:7,知识:5
//   node scripts/refine.mjs --limit 40 --budget 1 --force     # 跳过 6 小时冷却、花费上限 1 元
//   node scripts/refine.mjs --status                         # 看冷却/上次跑了什么
//   node scripts/refine.mjs --selftest                       # 离线自检（不联网、不写盘）
//
// 模型（2026-11-03 老板定）：平时用 DeepSeek（便宜）；Claude/Codex 是给她跑重大事情的，不许拿来提炼；
// 生图和阶跃按需用。默认 base https://api.deepseek.com，key 用 keys.env 的 DEEPSEEK_API_KEY，模型 deepseek-flash。
// 钥匙只在进程内用：不打印、不写日志、不写进 在用。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import { LIVE, LIB, KINDS, readState, writeState } from '../lib/library-chain.js'
import { roleFromRef } from '../lib/role-of.js'
import { isNoise, preJudge, LOGGY } from '../lib/transition-filter.js'
import { queuedRows, ownerMap } from '../memory-core/runtime/refine-queue.js'
import { appendInUse } from '../memory-core/runtime/shallow.js'
import { judge, buildInUseRow } from '../memory-core/runtime/refine-judge.js'
import { episodeIndex } from '../memory-core/runtime/episode.js'
import { mechanismsForText } from '../lib/mechanism-registry.js'
import { markSuperseded, isConflict, markConflict } from '../memory-core/runtime/supersede.js'
import { feedbackIndex, readFeedback } from '../memory-core/runtime/feedback.js'
import { scoreFeedback } from '../lib/refine-feedback.js'
import { relinkTurns, relinkTopics, relinkSameEvent } from '../memory-core/runtime/relink.js'
import { isManualDone } from '../lib/manual-done.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const KEYS_FILE = path.join(HOME, 'keys.env')
const arg = (n, d = '') => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? String(process.argv[i + 1] || '') : d }
const has = (n) => process.argv.includes(`--${n}`)
const isQueuedState = (s) => s === 'pending' || s === 'queued'

// ── 口径（改这里等于改成本，别乱动） ──
const COOLDOWN_H = 6            // 冷却：6 小时内默认不再跑
const DEFAULT_LIMIT = 20        // 一次挑多少条（--limit）
const MAX_CHARS = 1500          // 一段原文最多送多少字（超了截断，钱是按字算的）
const MIN_CHARS = 40            // 少于这个字不值得提炼（"睡下了。"这种）
const MAX_TOKENS = 380          // 一条结论用不了这么多，防跑飞
const RATE_CNY = 7.2            // USD → CNY，只用于估算
// 批量：一批几段（10–20）。太少等于回到逐条，太多模型会漏 id、输出被截断
const BATCH_MIN = 4
const BATCH_MAX = 8
const DEFAULT_BATCH = 6
const BATCH_TIMEOUT_MS = 180000 // 一次批量调用的超时（逐条是 90 秒）
const MAX_TOKENS_BATCH = 8000   // 一批最多要多少输出 token（再高会被服务端夹住）
const DEFAULT_BUDGET = 1        // 一次真跑的花钱上限（元）；超了立刻停
// 每百万 token 的美元价（Anthropic 公开价，只用于估算；真实扣费以服务商账单为准）
const PRICE_USD = {
  'deepseek-flash': { in: 0.15, out: 0.6 },        // 谷时（官方价目表，2026-11）；峰时翻倍
  'deepseek-v4-pro': { in: 0.66, out: 1.98 },      // 谷时；贵 4 倍，别用它做提炼

  'claude-haiku-4-5': { in: 1.0, out: 5.0 },
  'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0 },
  'claude-sonnet-4-5': { in: 3.0, out: 15.0 },
  'gpt-5.6': { in: 3.0, out: 15.0 },
}

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/**
 * 时间串归一：粗提炼那边有的 at 带多余秒（`…T19:28:18:00`），别原样带进「在用」，
 * 否则后面按 at 排序/比较的地方都会把它当坏时间。只认「日期T时分秒(可选:秒)」，别的原样留。
 */
function normAt(s) {
  const t = String(s || '').trim()
  const m = t.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?::\d{2})?$/)
  return m ? `${m[1]}T${m[2]}` : t
}

/** 截到 n 字，但尽量停在句号上——截半句比截断更难看。 */
function clipDetail(s, n = 120) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  const head = t.slice(0, n)
  const cut = head.match(/^[\s\S]*[。；！？]/)
  if (cut && cut[0].length >= n * 0.6) return cut[0].trim()
  return `${t.slice(0, n - 1).replace(/[，、,;；]$/, '')}…`
}
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10)
const fmt = (n) => Number(n).toLocaleString('en-US')
const nowISO = () => {
  const d = new Date()
  const p = (x) => String(x).padStart(2, '0')
  const tz = -d.getTimezoneOffset()
  const sign = tz >= 0 ? '+' : '-'
  const abs = Math.abs(tz)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
}

/** 把任何可能带 key 的文本抹掉——错误信息只说明"失败"，不把凭据带出去。 */
const redact = (s, key = '') => {
  let t = String(s ?? '')
  if (key) t = t.split(key).join('****')
  return t.replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-****').replace(/Bearer\s+\S+/gi, 'Bearer ****')
}

/** 读 keys.env → Map。只返回值给进程用，值绝不打印。 */
function loadKeys(file = KEYS_FILE) {
  const map = new Map()
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return map }
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    map.set(t.slice(0, i).trim(), t.slice(i + 1).trim())
  }
  return map
}

// ── 读原文那一段：从 ### 那行读到下一个 ### 之前（分块读，不整篇进内存） ──
const HEAD = /^###+/
function headInfo(line) {
  const s = String(line || '').replace(/^###+\s*/, '')
  const old = /^(\d{1,2}:\d{2}(?::\d{2})?)\s*·\s*(.+)$/.exec(s)
  if (old) return { time: old[1], who: old[2].trim() }
  const parts = s.split('·').map((x) => x.trim()).filter(Boolean)
  const time = parts.find((x) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(x)) || ''
  return { time, who: parts[0] || '' }
}

/** ref = dayu/live/<年>/<周>/<通道>/<文件>.md:123 → {file,line}；不是 live 里的就返回 null。 */
function parseRef(ref) {
  const s = String(ref || '')
  const i = s.lastIndexOf(':')
  if (i <= 0) return null
  const rel = s.slice(0, i)
  const line = Number(s.slice(i + 1))
  if (!Number.isFinite(line) || line < 1) return null
  if (!/^dayu\/live\//.test(rel)) return null
  const file = path.join(HOME, rel.split('/').join(path.sep))
  if (!file.startsWith(LIVE + path.sep)) return null
  return { file, line }
}

/**
 * 只取第 lineNo 行开始的那一轮：读到下一个 ### 就停。
 * 用分块读 + StringDecoder，避免把整天的 live（几十上百 KB）读进来。
 * 返回 {text, who, time}；取不到（行不对/文件没了）返回 null——宁可不提炼也不乱取。
 */
function readTurn(file, lineNo, { maxLines = 220, maxBytes = 8 * 1024 * 1024 } = {}) {
  let fd = 0
  try { fd = fs.openSync(file, 'r') } catch { return null }
  try {
    const dec = new StringDecoder('utf8')
    const buf = Buffer.alloc(65536)
    let carry = ''
    let idx = 0
    let started = false
    let done = false
    let bytes = 0
    let bad = false
    const out = []
    while (!done && bytes < maxBytes) {
      let n = 0
      try { n = fs.readSync(fd, buf, 0, buf.length, null) } catch { break }
      if (!n) { carry += dec.end(); break }
      bytes += n
      carry += dec.write(buf.subarray(0, n))
      const parts = carry.split('\n')
      carry = parts.pop()
      for (const t of parts) {
        idx += 1
        if (!started) {
          if (idx < lineNo) continue
          if (!HEAD.test(t)) { bad = true; break }   // 那一行不是轮次头（ref 飘了）
          started = true
          out.push(t)
          continue
        }
        if (/^###/.test(t) || out.length >= maxLines) { done = true; break }
        out.push(t)
      }
      if (bad) break
    }
    if (bad) return null
    if (started && !done && carry && out.length < maxLines) out.push(carry)
    if (!out.length) return null
    const h = headInfo(out[0])
    return { text: out.join('\n').replace(/\s+$/, ''), who: h.who, time: h.time }
  } catch {
    return null
  } finally {
    try { fs.closeSync(fd) } catch { /* 已经关了 */ }
  }
}

// ── 文件与 JSONL ──
function filesUnder(dir, out = []) {
  let ents = []
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) filesUnder(p, out)
    else if (e.name.endsWith('.jsonl')) out.push(p)
  }
  return out
}
function readJsonl(file) {
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  const rows = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过，不吵 */ }
  }
  return rows
}

// ── 反馈里“被纠正”的计数（2026-11-16：反馈进提炼） ──
// feedbackIndex 只汇总 好/坏/用上/没用，没有“被纠正”；scoreFeedback 里纠正比“坏”更重，
// 所以这里按同一份 feedback.jsonl 单独数一遍。只认 outcome/note 里明确的纠正/改口，不猜；
// 读不到就当 0（没证据不罚）。键与 feedbackIndex 一致：turnId 和 ref 各记一次。
const CORRECTED_WORD = /纠正|改口|说错|记错|更正|不是这样/
function correctedIndex({ limit = 5000 } = {}) {
  const map = new Map()
  for (const row of readFeedback({ limit })) {
    const text = `${row?.outcome || ''} ${row?.note || ''}`
    if (!CORRECTED_WORD.test(text)) continue
    for (const key of [String(row?.turnId || ''), String(row?.ref || '')]) {
      if (!key) continue
      map.set(key, (map.get(key) || 0) + 1)
    }
  }
  return map
}

// ── 选谁：待提炼里 pending，优先 worth 高；没有 worth 就按时间新→旧 ──
const WORTH_RANK = { 高: 0, 中: 1, 低: 2 }

/** 去掉索引卡自带的两行元数据、每轮注入的时间戳、以及子会话投递的信封行，只留人说的话。 */
function cleanBody(seg) {
  const body = String(seg || '').split('\n').slice(1)   // 第一行是 ### HH:MM:SS · 谁
    .filter((l) => !/^-+\s*(发生了什么|关键)[:：]/.test(l.trim()))
    .filter((l) => !/^<!--.*-->\s*$/.test(l.trim()))   // 新投影的 msg/p/s/thinkDigest 标记不送模型
    .filter((l) => !/^【当前时间】/.test(l.trim()))
    // 「Agent session-xxxx sent a message:」只是信封，底下那行才是内容——去信封、留内容
    .filter((l) => !/^(Agent session-|Background subagent )[0-9a-f-]{6,}/i.test(l.trim()))
  return body.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 类别归一：手抄本里有 经历/群消息/心跳 这些杂项，提炼只认三类。 */
function normKind(kind) {
  const k = String(kind || '')
  if (KINDS.includes(k)) return k
  if (k === '经历') return '经验'
  return '记忆'
}

/** 扫 待提炼 + 手抄本，筛出这一轮真正值得送的候选（按类别分池）。 */
function collect(pending, { minChars = MIN_CHARS, maxChars = MAX_CHARS, onSkip = null } = {}) {
  const skipIt = (p, why) => { try { if (onSkip) onSkip(p, why) } catch { /* 记原因失败不影响筛选 */ } }
  const cards = new Map()
  for (const f of filesUnder(path.join(LIB, '手抄本'))) {
    for (const r of readJsonl(f)) if (r?.id && !cards.has(String(r.id))) cards.set(String(r.id), r)
  }
  const done = new Set()   // 已经在「在用」里的指针不再花钱提炼
  for (const f of filesUnder(path.join(LIB, '在用'))) {
    for (const r of readJsonl(f)) if (r?.fromRef) done.add(String(r.fromRef))
  }
  const seenBody = new Set()
  const rows = []
  const stat = { pending: 0, refBad: 0, noise: 0, short: 0, long: 0, already: 0, dup: 0 }
  for (const p of pending) {
    stat.pending += 1
    const pos = parseRef(p.ref)
    if (!pos) { stat.refBad += 1; skipIt(p, 'ref 不是原文轮次'); continue }
    if (done.has(String(p.id))) { stat.already += 1; skipIt(p, '已经在用（提炼过了）'); continue }
    const turn = readTurn(pos.file, pos.line)
    if (!turn) { stat.refBad += 1; skipIt(p, '原文里找不到这一轮（空壳/文件没了）'); continue }
    const body = cleanBody(turn.text)
    if (isNoise(body)) { stat.noise += 1; skipIt(p, '自动叫醒/简报（噪声）'); continue }
    const chars = body.length
    if (chars < minChars) { stat.short += 1; skipIt(p, `太短（不到 ${minChars} 字）`); continue }
    if (chars > maxChars * 2) { stat.long += 1; skipIt(p, `太长（超 ${maxChars * 2} 字）`); continue }
    const key = sha(body)
    if (seenBody.has(key)) { stat.dup += 1; skipIt(p, '重复（同正文已有一份）'); continue }
    seenBody.add(key)
    const card = cards.get(String(p.id)) || {}
    const at = String(p.at || card.at || '')
    rows.push({
      id: String(p.id),
      kind: normKind(p.kind),
      srcKind: String(p.kind || ''),
      at,
      day: at.slice(0, 10) || nowISO().slice(0, 10),
      ref: String(p.ref || ''),
      worth: String(card.worth || ''),
      channel: String(card.channel || (String(p.ref).split('/')[4] || '')),
      session: String(card.session || ''),
      sessionId: String(card.sessionId || p.sessionId || ''),
      turnId: String(card.turnId || p.turnId || ''),
      turn: Number(card.turn || p.turn || 0) || 0,
      rawRef: String(card.rawRef || p.rawRef || ''),
      fp: String(card.fp || p.fp || ''),
      filterVersion: String(card.filterVersion || p.filterVersion || ''),
      who: turn.who,
      time: turn.time,
      chars,
      sourceLevel: String(card.sourceLevel || ''),   // 卡上的出处：别人说的 / 书上 / 她说的 / 老板说的
      body: chars > maxChars ? body.slice(0, maxChars) : body,
    })
    // 2026-11-03：清单阶段先判一次——路径/太短的直接不炼（省一次调用）
    const pre = preJudge(rows[rows.length - 1])
    if (pre.skip) {
      rows.pop(); stat.preSkip = (stat.preSkip || 0) + 1
      skipIt(p, `预判不值得（${pre.why || '规则判的'}）`)
      continue
    }
    rows[rows.length - 1].preKind = pre.kind
    rows[rows.length - 1].preConfident = pre.confident
  }
  return { rows, stat }
}

/** 每个 kind 内部：worth 高的在前，同 worth 按时间新→旧。 */
function orderPool(list) {
  const rank = (r) => (WORTH_RANK[r.worth] ?? 3)
  return list.slice().sort((a, b) => (rank(a) - rank(b)) || String(b.at).localeCompare(String(a.at)))
}

/**
 * 选这批要炼的：默认纯按 worth→时间；给了 --mix 就按类别配额（不够的从别的类别补）。
 * 有配额时轮转交错，输出不会一屏全是同一类。
 */
function pickBatch(pool, { limit = DEFAULT_LIMIT, mix = '' } = {}) {
  const byKind = new Map()
  for (const k of KINDS) byKind.set(k, [])
  for (const r of pool) {
    if (!byKind.has(r.kind)) byKind.set(r.kind, [])
    byKind.get(r.kind).push(r)
  }
  for (const [k, list] of byKind) byKind.set(k, orderPool(list))
  const chosen = []
  const used = new Set()
  const quota = new Map()
  for (const part of String(mix || '').split(',')) {
    const m = part.trim().match(/^([^\s:：]+)\s*[:：]\s*(\d+)$/)
    if (m) quota.set(m[1], Math.max(0, Number(m[2]) || 0))
  }
  for (const [k, n] of quota) {
    for (const r of (byKind.get(k) || []).slice(0, n)) {
      if (chosen.length >= limit) break
      chosen.push(r)
      used.add(r.id)
    }
  }
  for (const r of orderPool(pool)) {
    if (chosen.length >= limit) break
    if (used.has(r.id)) continue
    chosen.push(r)
    used.add(r.id)
  }
  if (!quota.size) return chosen.slice(0, limit)
  const groups = new Map()
  for (const r of chosen) {
    if (!groups.has(r.kind)) groups.set(r.kind, [])
    groups.get(r.kind).push(r)
  }
  const order = [...quota.keys()].filter((k) => groups.has(k))
    .concat([...groups.keys()].filter((k) => !quota.has(k)))
  const out = []
  let more = true
  while (more && out.length < chosen.length) {
    more = false
    for (const k of order) {
      const g = groups.get(k) || []
      if (!g.length) continue
      out.push(g.shift())
      if (g.length) more = true
    }
  }
  return out.slice(0, limit)
}

// ── 模型调用（钥匙只在进程内；错误信息一律 redact） ──
function priceOf(model) {
  return PRICE_USD[String(model || '')] || { in: 1.0, out: 5.0 }
}
const costOf = (model, inTok, outTok) => {
  const p = priceOf(model)
  const usd = (Number(inTok) || 0) / 1e6 * p.in + (Number(outTok) || 0) / 1e6 * p.out
  return Number((usd * RATE_CNY).toFixed(4))
}
/** 估算 token：中文约 1.15 字/token（保守低估字数、高估钱）。 */
const estTokens = (chars, perTok = 1.15) => Math.ceil((Number(chars) || 0) / perTok)

const SYSTEM = [
  '你把「她」的会话原文里的一段，提炼成一条以后能用的记录。只输出一个 JSON 对象，不要解释、不要代码块。',
  '',
  '三种类别（输入里的【预判类别】是清单先判好的，默认照它写；只有明确反证才改，并写 why）：',
  '· 记忆：发生过的事实（谁在什么时候定了什么、答应了什么、发生了什么）。**只有结论/决定/承诺/定稿参数算记忆**；「她交付了 X」「她发现问题并改」「她按原话复述一遍」这类过程与复述是动作流水，没有结论就 skip；**一次性任务派发/临时分工/进度汇报、动手前的口头计划也不记**；同一件事只写一条。',
  '· 经验：可复用的做法或教训，**必须**写成「下次遇到 X 要 Y」——head 或 detail 里一定要出现「下次」「以后」「遇到」其中一个词（校验只认这几个词；只写「…前先…」「要…别…」一律被挡）。',
  '· 知识：**只能**是外部来的（书、文档、论文、别人的话、报错原文）。**自己和他人的对话结论不算知识**——那是经验或记忆。必须带出处，并把书名/文档名/链接/报错原文写进 detail；没有出处就不许写知识。',
  '',
  '要求：',
  '1. head ≤40 字，一句话结论，不要复述场景。',
  '2. detail ≤120 字：是什么 + 为什么 / 怎么做。',
  '3. tags ≤4 个短词；people 只写原文里出现的人（老板 / 她 / 对方）。',
  '4. appliesTo：以后什么情况用得上（可选，一句话）。',
  '5. 不编造：原文没写的数字、文件名、结论一律不许补。',
  '7. importance：这条以后还会用到吗？承诺/决定/教训=高；一般事实=中；闲聊、寒暄、有点水=水。',
  '8. subject/stance：同一件事以后可能又提到、而且可能改主意的，才写。subject 要能复用（模型选型、备份频率、片子方向）；stance 只写主张，不写解释。写不出就留空。',
  '6. 这段是闲聊、打招呼、没有信息量时，输出 {"skip":true,"why":"一句话原因"}。',
  '9. subject/stance：同一件事以后可能又提到、而且可能改主意的，才写。subject 要能复用（模型选型、备份频率、片子方向），≤10 字；stance 只写主张，≤20 字，不加解释。写不出就两项都留空。',
  '8. 「她准备去做 / 正在做 / 刚做了某步操作」的过程叙述不是记忆（没有结论、没有承诺、没有决定就 skip）；不要把盘符路径、环境变量原样抄进 head/detail；只贴链接/标题、没讲内容的段落别当知识（要么记里面的一句话，要么 skip）。',
  '',
  '输出格式（严格 JSON）：',
  '{"kind":"记忆|经验|知识","head":"…","detail":"…","tags":["…"],"confidence":"确定|推测","people":["…"],"appliesTo":"…","importance":"高|中|水","subject":"这件事的主题（≤10字，例如 模型选型 / 备份频率）","stance":"你的主张（≤20字，只说结论，不加解释）"}',
].join('\n')

// 2026-11-03 老板：「在跑模型之前，清单是不是就能判一次」——能，而且该判。
// 规则已搬到 lib/transition-filter.js 的 preJudge，和投影落地筛选共用一套，别在这里再抄一份。

function buildUser(row) {
  return [
    `【谁说】${row.who || '未知'}　【时间】${row.at || ''}　【预判类别】${row.preKind || row.srcKind || row.kind}`,
    '【原文】',
    row.body,
  ].join('\n')
}

/**
 * 批量版系统提示：同一套口径，但要求一次回一个数组，每条必须照抄输入里的 id。
 * id 是唯一的对齐锚：对不上的段宁可补跑，也不许把两条并成一条。
 */
const BATCH_SYSTEM = [
  '你把「她」的会话原文里的若干段，一次提炼成若干条以后能用的记录。只输出一个 JSON 数组，不要解释、不要代码块。',
  '',
  '三种类别（判错类别的代价是被整条拒收，拿不准就选记忆）：',
  '· 记忆：发生过的事实（谁在什么时候定了什么、答应了什么、发生了什么值得记住的事）。',
  '　 · **只有结论/决定/承诺/定稿参数算记忆**；「她交付了 X」「她发现问题并改」「她按原话复述一遍」这类**过程与复述是动作流水**，没有结论就 skip。',
  '　 · **一次性任务派发、临时分工、进度汇报**（「她派出两个子代理…」「对方要求…」「第 N 步完成」）也不进记忆——只在当时有用；要记就记其中稳定的规则或结论，否则 skip。',
  '　 · **动手前的口头计划**（「我现在改 X 的哪几块」「接下来做 Y」）不是记忆，除非它定下了改不了的边界或验收标准。',
  '　 · 同一件事只写一条最有用的，别把参数、改法、交付各写一条。',
  '· 经验：可复用的做法或教训，**必须**写成「下次遇到 X 要 Y」——head 或 detail 里一定要出现「下次」「以后」「遇到」其中一个词（校验只认这几个词；只写「…前先…」「要…别…」一律被挡）。',
  '· 知识：**只能**是外部来的事实或规则（书、文档、论文、官方页面/公告、别人的原话、报错原文）。',
  '　 · **自己和他人的对话结论不算知识**——那是经验或记忆。',
  '　 · 必须带出处，而且**把出处写进 detail**（书名《…》、文档名、官方名/链接、报错原文、命令原文、别人的原话；校验就看 head/detail 里有没有这些字样）。',
  '　 · 原文没给出处就不许判知识；写成「推测」也不算数，按内容归到记忆或经验。',
  '　 · **只贴链接/标题、没讲内容的段落不算知识**（「老板分享了一个视频《X》+ 链接」等于记了个路标）：一律 skip，别写成「水」知识——水也占一行。',
  '',
  '每段一条记录，必须照抄该段输入里的 id（id= 后面那串），不许自己编、不许把两段并成一条、不许漏段：',
  '· 有信息量：{"id":"…","kind":"记忆|经验|知识","head":"…","detail":"…","tags":["…"],"confidence":"确定|推测","people":["…"],"appliesTo":"…","importance":"高|中|水"}',
  '· 闲聊/打招呼/没有结论的过程叙述：{"id":"…","skip":true,"why":"一句话原因"}',
  '',
  '字段要求：',
  '1. head ≤40 字，一句话结论，不要复述场景。',
  '2. detail ≤120 字：是什么 + 为什么 / 怎么做。',
  '3. tags ≤4 个短词；people 只写原文里出现的人（老板 / 她 / 对方）。',
  '4. appliesTo：以后什么情况用得上（可选，一句话）。',
  '5. 不编造：原文没写的数字、文件名、结论一律不许补。',
  '6. 数组里每条都要有 id；返回条数 = 输入段数（某段确实没信息量，也要带 id 回一条 skip）。',
  '7. importance：承诺/决定/教训=高；一般事实=中；闲聊、寒暄、有点水=水。',
  '8. 「她准备去做 / 正在做 / 刚做了某步操作」的过程叙述**不是记忆**（没有结论、没有承诺、没有决定的一律 skip）；也不要把盘符路径、环境变量原样抄进 head/detail——说清在哪份文件/哪条命令上，别抄整条路径。',
  '',
  '输出格式（严格 JSON 数组，第一个字符是 [，最后一个字符是 ]）：',
  '[{"id":"c-abc123","kind":"经验","head":"…","detail":"…","tags":["…"],"confidence":"确定","people":["她"],"appliesTo":"…","importance":"高"}]',
].join('\n')

/** 一次批量调用的 user 内容：段落1（id=xxx）: …\n段落2（id=yyy）: … */
function buildBatchUser(rows) {
  return rows.map((r, i) => [
    `段落${i + 1}（id=${r.id}）: 【谁说】${r.who || '未知'}　【时间】${r.at || ''}　【预判类别】${r.preKind || r.srcKind || r.kind}`,
    r.body,
  ].join('\n')).join('\n\n')
}

/** 从模型回话里抠出 JSON：容忍 ```json 围栏和前后废话。 */
function extractJson(text) {
  let s = String(text || '').trim()
  s = s.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '')
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try { return JSON.parse(s.slice(a, b + 1)) } catch { return null }
}

/**
 * 从回话里扫出顶层 JSON 对象。返回 {items, closed}：
 * closed=false 说明数组被截断了（max_tokens 不够 / 网络断了），能捞到几条算几条——
 * 比整批废掉再退回逐条便宜得多。
 */
function scanTopObjects(text, from) {
  const items = []
  let closed = false
  let depth = 0
  let inStr = false
  let esc = false
  let start = -1
  for (let i = from; i < text.length; i += 1) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === '{') {
      if (depth === 0) start = i
      depth += 1
      continue
    }
    if (c === '}') {
      if (depth > 0) depth -= 1
      if (depth === 0 && start >= 0) {
        try { items.push(JSON.parse(text.slice(start, i + 1))) } catch { /* 坏对象丢掉，别连坐 */ }
        start = -1
      }
      continue
    }
    if (c === ']' && depth === 0) { closed = true; break }
  }
  return { items, closed }
}

/** 从模型回话里抠 JSON 数组（容忍围栏、前后废话、被截断的尾巴）。 */
function extractJsonArray(text) {
  let s = String(text || '').trim()
  s = s.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '')
  const a = s.indexOf('[')
  if (a < 0) {
    // 也可能包了一层：{"items":[...]} / {"results":[...]}
    const obj = extractJson(s)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const k of ['items', 'results', 'data', 'list', 'records']) {
        if (Array.isArray(obj[k])) return { items: obj[k], truncated: false }
      }
    }
    return { items: [], truncated: false }
  }
  const got = scanTopObjects(s, a + 1)
  return { items: got.items.filter((x) => x && typeof x === 'object'), truncated: !got.closed }
}

/** 模型回显的 id 可能带 id= / 引号 / 空格：只留那串本体。 */
function normId(v) {
  return String(v ?? '')
    .trim()
    .replace(/^id\s*[=:：]\s*/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()
}

/**
 * 近似重复：同一件事被两段原文各写了一遍（「岗位分工与三条铁律」≈「岗位分工与三条禁令」），
 * 全等去重挡不住。按 head 二字组 Jaccard 比，0.6 以上算同一条——实测 520 条里只有 4 对 ≥0.6，
 * 全是真重复，所以这个阈值不会误伤"像但不是同一件"的结论。
 */
const NEAR_DUP = 0.6
function headGrams(s) {
  const t = String(s || '').replace(/\s+/g, '')
  const set = new Set()
  for (let i = 0; i < t.length - 1; i += 1) set.add(t.slice(i, i + 2))
  return set
}
function headJac(a, ga, b, gb) {
  if (!ga || !gb || !ga.size || !gb.size) return 0
  let inter = 0
  for (const g of ga) if (gb.has(g)) inter += 1
  return inter / (ga.size + gb.size - inter)
}

/**
 * 严格校验：写进「在用」之前只认这五条（老板 2026-11-02 定的）。
 *   ① head 空 或 <4 字；② detail <10 字；③ 指不回原卡（没有 fromRef）；
 *   ④ kind 不在 记忆/经验/知识；⑤ 同一个 fromRef 已经写过（去重）。
 * 返回 {skip:true}（模型说是闲聊，不算丢）、{bad:true, why}（校验挡掉，标回 pending 重跑）、
 * {ok:true, ...}（可以写）。这里不做任何"猜一个补上"的兜底——兜底会让坏数据看起来像好数据。
 */
/**
 * 分批：先按 (通道, 日期) 分组，组内均分——40 条 / 15 → 14+13+13，不会留 1 条的小尾巴。
 * 均分后每批尽可能落在 [BATCH_MIN, BATCH_MAX]；整组就不满 10 条时，允许它就是小批（余数，没得拆）。
 */
function planBatches(rows, size = DEFAULT_BATCH) {
  const groups = new Map()
  for (const r of rows) {
    const k = `${r.channel || '未知'}|${r.day || '未知'}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  const out = []
  for (const [key, list] of groups) {
    const n = list.length
    let k = Math.max(1, Math.ceil(n / size))
    while (k > 1 && n / k < BATCH_MIN) k -= 1        // 别拆出 8 条这种小批
    while (n / k > BATCH_MAX && k < n) k += 1        // 也别超 20
    const base = Math.floor(n / k)
    let rem = n % k
    let at = 0
    for (let i = 0; i < k; i += 1) {
      const take = base + (rem > 0 ? 1 : 0)
      if (rem > 0) rem -= 1
      out.push({ key, rows: list.slice(at, at + take) })
      at += take
    }
  }
  return out
}

/** 一次对话调用（不重试、不解析）。逐条与批量共用；钥匙只在进程内，错误信息一律 redact。 */
async function postChat({ base, key, model, system, user, maxTokens = MAX_TOKENS, timeoutMs = 90000 }) {
  const body = {
    model,
    temperature: 0,
    max_tokens: maxTokens,
    // 2026-11-03：DeepSeek 默认开思考，提炼这种活不需要——关掉，输出小一半、快一倍。
    thinking: { type: 'disabled' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }
  const res = await fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(redact(`接口 ${res.status}：${text.slice(0, 140)}`, key))
  let json = null
  try { json = JSON.parse(text) } catch { throw new Error('接口回的不是 JSON') }
  const c = json?.choices?.[0]?.message?.content
  const content = typeof c === 'string'
    ? c
    : Array.isArray(c) ? c.map((x) => (typeof x === 'string' ? x : String(x?.text || ''))).join('') : ''
  return {
    content,
    finish: String(json?.choices?.[0]?.finish_reason || ''),
    model: String(json?.model || model),
    usage: { in: Number(json?.usage?.prompt_tokens) || 0, out: Number(json?.usage?.completion_tokens) || 0 },
  }
}

async function chatOnce({ base, key, model, row, maxTokens = MAX_TOKENS, timeoutMs = 90000, strict = false }) {
  return postChat({
    base,
    key,
    model,
    maxTokens,
    timeoutMs,
    system: strict ? `${SYSTEM}\n\n再强调一次：整段回话必须是一个 JSON 对象，第一个字符是 {，最后一个字符是 }。` : SYSTEM,
    user: buildUser(row),
  })
}

/** 批量调用：一次送 10–20 段，输出 token 按段数留（再多会被服务端夹住）。 */
async function chatBatchOnce({ base, key, model, rows, strict = false, timeoutMs = BATCH_TIMEOUT_MS }) {
  const maxTokens = Math.min(MAX_TOKENS_BATCH, 500 + rows.length * 260)
  return postChat({
    base,
    key,
    model,
    maxTokens,
    timeoutMs,
    system: strict
      ? `${BATCH_SYSTEM}\n\n再强调一次：整段回话必须是一个 JSON 数组，第一个字符是 [，最后一个字符是 ]，每条都要照抄 id。`
      : BATCH_SYSTEM,
    user: buildBatchUser(rows),
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 炼一条：模型链 + 重试。
 * 2026-11-02 实测：中转站上 `claude-haiku-4-5`（别名）时好时坏，404 "not supported by any
 * configured account"；带日期的 `claude-haiku-4-5-20251001` 稳定 200。所以默认用日期版，
 * 404/模型不存在就换下一档，超时/5xx 才原地重试；回了文本但没有 JSON 也算失败，加一句硬话再试。
 */
async function refineOne({ base, key, models, row, onLog = () => {} }) {
  let lastErr = ''
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const got = await chatOnce({ base, key, model, row, strict: attempt > 0 })
        const parsed = extractJson(got.content)
        if (!parsed) {
          lastErr = '模型没给出 JSON'
          if (attempt === 0) { onLog(`     ↻ 没给出 JSON，重试（${model}）`); continue }
        } else {
          return { ok: true, model: got.model || model, got, parsed }
        }
      } catch (e) {
        lastErr = redact(e?.message || e, key)
        const noModel = /\b404\b|not supported|does not exist|no such model|model_not_found/i.test(lastErr)
        if (noModel) { onLog(`     ↻ ${model} 不可用（404），换下一档`); break }
        if (attempt === 0) { onLog(`     ↻ 失败，1.2 秒后重试：${clip(lastErr, 80)}`); await sleep(1200); continue }
      }
    }
  }
  return { ok: false, error: lastErr || '没有可用的模型' }
}

/**
 * 炼一批：模型链 + 重试 + 数组解析。
 * 返回 {ok, items, truncated, model, usage, error}；usage 是这轮所有尝试的累计
 * （失败的尝试也计费，预算闸按这个算，不按"成功了几次"算）。
 */
async function refineBatch({ base, key, models, rows, onLog = () => {} }) {
  let lastErr = ''
  const usage = { in: 0, out: 0 }
  let usedModel = models[0]
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const got = await chatBatchOnce({ base, key, model, rows, strict: attempt > 0 })
        usage.in += got.usage.in
        usage.out += got.usage.out
        usedModel = got.model || model
        const arr = extractJsonArray(got.content)
        if (!arr.items.length) {
          lastErr = '整批 JSON 解析失败'
          if (attempt === 0) { onLog('     ↻ 回话里没有 JSON 数组，重试（加重格式要求）'); continue }
          break
        }
        return { ok: true, items: arr.items, truncated: arr.truncated, finish: got.finish, model: usedModel, usage }
      } catch (e) {
        lastErr = redact(e?.message || e, key)
        const noModel = /\b404\b|not supported|does not exist|no such model|model_not_found/i.test(lastErr)
        if (noModel) { onLog(`     ↻ ${model} 不可用（404），换下一档`); break }
        if (attempt === 0) { onLog(`     ↻ 批量失败，1.2 秒后重试：${clip(lastErr, 80)}`); await sleep(1200); continue }
      }
    }
  }
  return { ok: false, error: lastErr || '没有可用的模型', usage, model: usedModel }
}
// ── 写：只有 在用/、待提炼 的 state、meta/digest-state.json 三处 ──
// appendInUse 已搬到 memory-core/runtime/shallow.js（出厂版也要用）。

/** 把指针标成 done/skipped：只改该 id 那一行，其余原样；期间文件被追加就重来。
 *  _delete: 提炼完一批就把队列行删掉（工作队列不是索引）；删前记一条薄台账，去重/审计用。 */
function markPending(patchByFile) {
  const out = { files: 0, rows: 0, failed: [], dropped: 0 }
  const doneFile = path.join(LIB, 'meta', 'refine-done.jsonl')
  for (const [file, patches] of patchByFile) {
    if (!patches.size) continue
    let wrote = false
    for (let attempt = 0; attempt < 3 && !wrote; attempt += 1) {
      let text = ''
      try { text = fs.readFileSync(file, 'utf8') } catch (e) { out.failed.push({ file, err: clip(e?.message || e, 80) }); break }
      let hit = 0
      const doneRows = []
      const lines = text.split('\n').map((line) => {
        if (!line.trim()) return line
        let r = null
        try { r = JSON.parse(line) } catch { return line }
        const patch = patches.get(String(r.id))
        if (!patch) return line
        hit += 1
        if (patch._delete) {
          doneRows.push({ id: r.id, at: nowISO(), state: patch._state || 'processed', why: clip(patch.why || '已处理', 60), turnId: r.turnId || '', fp: r.fp || '', fromRef: r.id })
          return null
        }
        return JSON.stringify({ ...r, ...patch })
      })
      if (!hit) { wrote = true; break }
      const tmp = `${file}.${process.pid}.refine.tmp`
      try { fs.writeFileSync(tmp, lines.filter((x) => x !== null).join('\n'), 'utf8') } catch (e) { out.failed.push({ file, err: clip(e?.message || e, 80) }); break }
      let again = ''
      try { again = fs.readFileSync(file, 'utf8') } catch { /* 读不到就按原样覆盖 */ }
      if (again && again !== text) { try { fs.unlinkSync(tmp) } catch { /* 下一轮重写 */ } continue }
      try { fs.renameSync(tmp, file) } catch (e) { out.failed.push({ file, err: clip(e?.message || e, 80) }); try { fs.unlinkSync(tmp) } catch { /* 忽略 */ } break }
      if (doneRows.length) {
        try {
          fs.mkdirSync(path.dirname(doneFile), { recursive: true })
          fs.appendFileSync(doneFile, doneRows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
        } catch { /* 台账写不下不挡队列删除 */ }
      }
      out.files += 1
      out.rows += hit
      out.dropped += doneRows.length
      wrote = true
    }
    if (!wrote) out.failed.push({ file, err: '内容在写的过程中变了，已放弃（不覆盖别人的追加）' })
  }
  return out
}

function readCooldown() {
  const st = readState()
  const last = String(st?.refine?.lastAt || '')
  const ms = last ? Date.now() - Date.parse(last) : Infinity
  return { last, hours: ms / 3.6e6, ok: !(ms < COOLDOWN_H * 3.6e6), state: st?.refine || null }
}

// ── 自检：离线跑一遍最关键的五件事（切段、噪声、解析/分批、严格校验、算钱） ──
function selftest() {
  const tmp = path.join(os.tmpdir(), `refine-selftest-${process.pid}.md`)
  fs.writeFileSync(tmp, [
    '# 测试', '', '---',
    '### 10:00:00 · 老板', '- 发生了什么：x', '- 关键：y', '', '第一轮原话在这里。', '',
    '### 10:05:00 · 她', '', '第二轮原话。', '### 10:09:00 · 老板', '第三轮。',
  ].join('\n') + '\n', 'utf8')
  const checks = []
  const add = (name, ok) => checks.push({ name, ok: Boolean(ok) })
  const t1 = readTurn(tmp, 4)
  add('切段：从第 4 行只取到下一个 ###', t1 && t1.text.includes('第一轮原话') && !t1.text.includes('第二轮') && t1.who === '老板')
  add('切段：越界行号不乱取', readTurn(tmp, 9999) === null)
  add('切段：不是轮次头返回 null', readTurn(tmp, 1) === null)
  add('清理：去掉索引元数据', !cleanBody(t1.text).includes('发生了什么'))
  add('清理：去掉子会话信封行、留内容', cleanBody('### 10:00:00 · 对方\nAgent session-abcdef12 sent a message:\n老板问桌宠为什么慢。') === '老板问桌宠为什么慢。')
  add('噪声：兜底定时器整段跳过', isNoise('照微，这一次是兜底定时器按间隔叫你的'))
  add('噪声：真话不误伤', !isNoise('下次遇到并发改文件要先重读'))
  add('类别归一：经历→经验、群消息→记忆', normKind('经历') === '经验' && normKind('群消息') === '记忆')
  const parsed = extractJson('```json\n{"kind":"经验","head":"h","detail":"d"}\n```')
  add('解析：认得 ```json 围栏', parsed && parsed.head === 'h')
  add('解析：不是 JSON 返回 null', extractJson('我觉得可以') === null)
  // 批量：数组解析 + 截断抢救 + id 归一
  const arr1 = extractJsonArray('```json\n[{"id":"c-1","head":"甲"},{"id":"c-2","head":"乙"}]\n```')
  add('批量解析：认得 ```json 围栏里的数组', arr1.items.length === 2 && arr1.items[1].id === 'c-2' && !arr1.truncated)
  const arr2 = extractJsonArray('好的：\n[{"id":"c-1","head":"甲、乙"},{"id":"c-2","head":"乙"},{"id":"c-3","he')
  add('批量解析：截断时捞出完整的那几条（不整批作废）', arr2.items.length === 2 && arr2.truncated === true)
  add('批量解析：包了一层的 {"items":[…]} 也认', extractJsonArray('{"items":[{"id":"c-9"}]}').items.length === 1)
  add('批量解析：id 归一（id=c-x / 引号 / 空格）', normId(' id=c-abc ') === 'c-abc' && normId('"c-def"') === 'c-def')
  // 分批：按 通道+日期 分组、均分、不超 20、不留 1 条小尾巴
  const mk = (n, channel = '工作台', day = '2026-11-02') => Array.from({ length: n }, (_, i) => ({ id: `c-${i}`, channel, day }))
  const p40 = planBatches(mk(40), 6)
  add('分批：40 条 / 6 → 每批 4–8、总数不丢', p40.every((b) => b.rows.length >= 4 && b.rows.length <= 8) && p40.reduce((s, b) => s + b.rows.length, 0) === 40)
  const p41 = planBatches(mk(41), 8)
  add('分批：41 条 / 8 → 每批 4–8、不留 1 条尾巴', p41.every((b) => b.rows.length >= 4 && b.rows.length <= 8) && p41.reduce((s, b) => s + b.rows.length, 0) === 41)
  const pMix = planBatches([...mk(12, '工作台'), ...mk(12, 'QQ')], 6)
  add('分批：不同 通道/日期 不混批', pMix.length === 4 && pMix.every((b) => new Set(b.rows.map((r) => r.channel)).size === 1))
  const bu = buildBatchUser([{ id: 'c-1', who: '老板', at: '2026-11-02T00:00:00', srcKind: '经验', body: '甲' }, { id: 'c-2', who: '她', at: '', srcKind: '', kind: '记忆', body: '乙' }])
  add('批量输入：段落N（id=…）: 拼得上', bu.startsWith('段落1（id=c-1）:') && bu.includes('段落2（id=c-2）:') && bu.includes('\n甲'))
  // 严格校验：五条红线
  const goodRow = { id: 'c-good' }
  const good = judge({ kind: '记忆', head: '很长的标题'.repeat(20), detail: '细'.repeat(300), tags: ['a', 'a', 'b', 'c', 'd', 'e'], confidence: '大概', people: ['老板'] }, goodRow)
  add('校验：head≤40 / detail≤120 / tags≤4 / 置信兜底', good.ok && good.head.length <= 40 && good.detail.length <= 120 && good.tags.length <= 4 && good.confidence === '推测')
  add('校验：skip 认出来', judge({ skip: true, why: '闲聊' }, {}).skip === true)
  add('校验：head 空 → 不写', judge({ kind: '记忆', head: '  ', detail: '够长的细节够长的细节' }, goodRow).why === 'head 空')
  add('校验：head <4 字 → 不写', /head 太短/.test(judge({ kind: '记忆', head: '已确认', detail: '够长的细节够长的细节' }, goodRow).why))
  add('校验：detail <10 字 → 不写', /detail 太短/.test(judge({ kind: '记忆', head: '一句能用的结论', detail: '太短' }, goodRow).why))
  add('校验：kind 不在三类 → 不写（不拿原卡类别兜底）', /kind 不在三类/.test(judge({ kind: '闲聊', head: '一句能用的结论', detail: '够长的细节够长的细节' }, goodRow).why))
  add('校验：没有 fromRef → 不写', /fromRef/.test(judge({ kind: '记忆', head: '一句能用的结论', detail: '够长的细节够长的细节' }, {}).why))
  add('校验：同一 fromRef 已存在 → 不写', /重复/.test(judge({ kind: '记忆', head: '另一条结论也够长', detail: '够长的细节够长的细节' }, goodRow, { seenRefs: new Set(['c-good']) }).why))
  add('花费：haiku 1000in+200out ≈ ¥0.0144', Math.abs(costOf('claude-haiku-4-5', 1000, 200) - 0.0144) < 0.001)
  try { fs.unlinkSync(tmp) } catch { /* 忽略 */ }
  const bad = checks.filter((c) => !c.ok)
  for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}`)
  console.log(`\n自检：${checks.length - bad.length}/${checks.length} 通过`)
  return bad.length === 0
}

// ── 只动「在用」的两件维护活：不调模型、不花钱 ──
/** --repair：把 at 归一、detail 停在句号上；清掉「已经 done 了还挂着旧 failedAt」的痕迹。幂等。 */
function repair() {
  const changed = []
  for (const file of filesUnder(path.join(LIB, '在用'))) {
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split('\n')
    let hit = 0
    const next = lines.map((line) => {
      if (!line.trim()) return line
      let r = null
      try { r = JSON.parse(line) } catch { return line }
      const before = JSON.stringify(r)
      if (r.at) r.at = normAt(r.at)
      if (r.detail) r.detail = clipDetail(r.detail, 120)
      const after = JSON.stringify(r)
      if (before !== after) { hit += 1; return after }
      return line
    })
    if (!hit) continue
    const tmp = `${file}.${process.pid}.repair.tmp`
    fs.writeFileSync(tmp, next.join('\n'), 'utf8')
    fs.renameSync(tmp, file)
    changed.push({ file: path.relative(LIB, file), rows: hit })
  }
  // 指针：状态已经是 done/skipped 的，不该再挂着 lastError/failedAt（上一轮失败、这一轮成功）
  const ptr = { files: 0, rows: 0 }
  for (const file of filesUnder(path.join(LIB, '待提炼'))) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    let hit = 0
    const next = lines.map((line) => {
      if (!line.trim()) return line
      let r = null
      try { r = JSON.parse(line) } catch { return line }
      if (isQueuedState(r.state)) return line
      if (!('failedAt' in r) && !('lastError' in r)) return line
      delete r.failedAt
      delete r.lastError
      hit += 1
      return JSON.stringify(r)
    })
    if (!hit) continue
    const tmp = `${file}.${process.pid}.repair.tmp`
    fs.writeFileSync(tmp, next.join('\n'), 'utf8')
    fs.renameSync(tmp, file)
    ptr.files += 1
    ptr.rows += hit
  }
  console.log(JSON.stringify({
    ok: true,
    repair: true,
    在用: { files: changed.length, rows: changed.reduce((s, x) => s + x.rows, 0), detail: changed },
    指针: ptr,
  }, null, 1))
}

/** --dupcheck：找「疑似同一件事」的两条（只报告，不删——删是判断，不是清洗）。 */
function dupcheck() {
  const grams = (s) => {
    const t = String(s || '').replace(/\s+/g, '')
    const set = new Set()
    for (let i = 0; i < t.length - 1; i += 1) set.add(t.slice(i, i + 2))
    return set
  }
  const jac = (a, b) => {
    const A = grams(a); const B = grams(b)
    if (!A.size || !B.size) return 0
    let inter = 0
    for (const g of A) if (B.has(g)) inter += 1
    return inter / (A.size + B.size - inter)
  }
  const pairs = []
  for (const file of filesUnder(path.join(LIB, '在用'))) {
    const rows = readJsonl(file).filter((r) => r.head)
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i]; const b = rows[j]
        const tagsA = new Set(a.tags || a.keywords || [])
        const shared = (b.tags || b.keywords || []).filter((t) => tagsA.has(t))
        const j2 = jac(a.head, b.head)
        // 同一类、标题字面像（≥0.3）或「共用一个标签且字面也沾边」的，列出来给人看
        if (j2 >= 0.3 || (shared.length >= 1 && j2 >= 0.12)) {
          pairs.push({ 文件: path.relative(LIB, file), a: a.head, b: b.head, 相似度: Number(j2.toFixed(2)), 共用标签: shared })
        }
      }
    }
  }
  console.log(JSON.stringify({ ok: true, dupcheck: true, pairs: pairs.length, detail: pairs }, null, 1))
}

// ── 主流程 ──
async function main() {
  const t0 = Date.now()
  if (has('selftest')) process.exit(selftest() ? 0 : 1)
  if (has('repair')) { repair(); process.exit(0) }
  if (has('dupcheck')) { dupcheck(); process.exit(0) }

  const limit = Math.max(1, Number(arg('limit', String(DEFAULT_LIMIT))) || DEFAULT_LIMIT)
  const dry = has('dry')
  const force = has('force')
  const mix = arg('mix', '')
  const perItem = has('per-item')
  const model = arg('model', 'deepseek-flash')
  const models = [...new Set([model, ...arg('fallback', '').split(',').map((s) => s.trim()).filter(Boolean)])]
  const keyVar = arg('key-var', 'DEEPSEEK_API_KEY')
  const budget = Number(arg('budget', String(DEFAULT_BUDGET))) || DEFAULT_BUDGET
  const batchSizeWanted = Number(arg('batch-size', String(DEFAULT_BATCH))) || DEFAULT_BATCH
  const batchSize = Math.min(BATCH_MAX, Math.max(BATCH_MIN, batchSizeWanted))

  if (has('status')) {
    const cd = readCooldown()
    console.log(JSON.stringify({
      ok: true,
      上次: cd.last || '（还没跑过）',
      距上次小时: Number.isFinite(cd.hours) ? Number(cd.hours.toFixed(2)) : null,
      冷却: cd.ok ? '已过（可以跑）' : `还差 ${(COOLDOWN_H - cd.hours).toFixed(2)} 小时（--force 可跳过）`,
      明细: cd.state,
    }, null, 1))
    process.exit(0)
  }

  const cooldown = readCooldown()
  if (!cooldown.ok && !force && !dry && !has('dispose')) {
    console.log(`精提炼：冷却中（上次 ${cooldown.last}，${cooldown.hours.toFixed(1)} 小时前，默认 ${COOLDOWN_H} 小时）。加 --force 才跑。`)
    process.exit(0)
  }

  let pending = queuedRows()
  // --linked：只炼带 turnId 的新队列，用来验收“新卡链路”；旧卡没身份证，炼了也连不上。
  if (has('linked')) pending = pending.filter((r) => r.turnId)
  // --legacy：只炼没 turnId 的旧队列，用来小批量对比质量和用途；旧卡炼出来仍然连不上轮次。
  if (has('legacy')) pending = pending.filter((r) => !r.turnId)
  // --since：只炼某个日期之后的队列，用来“先拉最近的旧数据”，不一口气翻十年。
  const since = arg('since', '')
  if (since) pending = pending.filter((r) => String(r.at || r.startedAt || '') >= since)
  // 手动已完成了的同一件事，不再从投影炼一遍；只跳过同会话+标题高度相似的，保守。
  pending = pending.filter((r) => !isManualDone(String(r.role || roleFromRef(r.ref || '') || ''), r))
  // ── 本地筛选（不花一分钱）：把「永远炼不了 / 不值得炼」的指针收尸 ──
  // 2026-11-11 老板：「也不用所有的都精炼吧，不是应该本地有筛选机制吗」——筛选一直有，
  // 但筛掉的不收尸，6 千多条里 9 成被筛掉却仍挂在 pending，数字越看越像欠账。
  // 这个模式只做两件事：按同一套规则算出「谁被筛掉、为什么」，再把这些指针标成 skipped（不删，留着能查）。
  if (has('dispose')) {
    const minCharsD = Number(arg('min-chars', String(MIN_CHARS))) || MIN_CHARS
    const maxCharsD = Number(arg('max-chars', String(MAX_CHARS))) || MAX_CHARS
    const skipped = new Map()
    const { stat } = collect(pending, { minChars: minCharsD, maxChars: maxCharsD, onSkip: (p, why) => skipped.set(String(p.id), why) })
    const byWhy = {}
    for (const why of skipped.values()) byWhy[why] = (byWhy[why] || 0) + 1
    const worth = stat.pending - skipped.size
    console.log(`本地筛选（不调模型）：待提炼 ${stat.pending} 条 → 值得炼 ${worth} 条，其余 ${skipped.size} 条可收尸`)
    for (const [why, n] of Object.entries(byWhy).sort((a, b) => b[1] - a[1])) console.log(`  - ${String(n).padStart(5)} 条：${why}`)
    if (!has('yes')) {
      console.log('（dry：只报不写。加 --yes 才把状态写成 skipped；原文一行不删）')
      process.exit(0)
    }
    const stamp = nowISO().replace(/[:.]/g, '-')
    const trash = path.join(LIB, '.trash', `待提炼收尸-${stamp}`)
    let touched = 0
    let marked = 0
    for (const f of filesUnder(path.join(LIB, '待提炼'))) {
      const raw = fs.readFileSync(f, 'utf8')
      const rows = raw.split(/\r?\n/)
      let changed = false
      const out = rows.map((line) => {
        if (!line.trim()) return line
        let row = null
        try { row = JSON.parse(line) } catch { return line }
        if (!row || !row.id || !isQueuedState(row.state) || !skipped.has(String(row.id))) return line
        changed = true
        marked += 1
        return JSON.stringify({ ...row, state: 'skipped', skipWhy: skipped.get(String(row.id)), skippedAt: nowISO(), skippedBy: 'refine --dispose（本地规则）' })
      })
      if (!changed) continue
      touched += 1
      if (touched === 1) fs.mkdirSync(path.dirname(path.join(trash, path.relative(path.join(LIB, '待提炼'), f))), { recursive: true })
      const bak = path.join(trash, path.relative(path.join(LIB, '待提炼'), f))
      fs.mkdirSync(path.dirname(bak), { recursive: true })
      fs.writeFileSync(bak, raw, 'utf8')   // 原样留底，随时能回
      const tmp = `${f}.${process.pid}.tmp`
      fs.writeFileSync(tmp, out.join('\n'), 'utf8')
      fs.renameSync(tmp, f)
    }
    console.log(`已收尸 ${marked} 条（${touched} 个文件）；原件留底：${trash}`)
    process.exit(0)
  }

  const { rows: pool, stat } = collect(pending, {
    minChars: Number(arg('min-chars', String(MIN_CHARS))) || MIN_CHARS,
    maxChars: Number(arg('max-chars', String(MAX_CHARS))) || MAX_CHARS,
  })
  const batch = pickBatch(pool, { limit, mix })
  // 分批只在批量模式下有意义；逐条模式（--per-item）每段自成一"批"，方便同一套日志
  const plan = perItem
    ? batch.map((r) => ({ key: `${r.channel || '未知'}|${r.day || '未知'}`, rows: [r] }))
    : planBatches(batch, batchSize)
  const sysChars = (perItem ? SYSTEM : BATCH_SYSTEM).length
  const estOf = (rows) => {
    const c = rows.reduce((s, r) => s + r.chars, 0)
    const inTok = estTokens(c + rows.length * 40 + sysChars + 40)
    const outTok = rows.length * 160
    return { chars: c, inTok, outTok, cost: costOf(model, inTok, outTok) }
  }
  const estTotal = perItem
    ? batch.reduce((s, r) => {
      const e = estOf([r])
      return { chars: s.chars + e.chars, inTok: s.inTok + e.inTok, outTok: s.outTok + e.outTok }
    }, { chars: 0, inTok: 0, outTok: 0 })
    : plan.reduce((s, b) => {
      const e = estOf(b.rows)   // 每批都要重带一次系统提示，所以按批累加，别按总条数估
      return { chars: s.chars + e.chars, inTok: s.inTok + e.inTok, outTok: s.outTok + e.outTok }
    }, { chars: 0, inTok: 0, outTok: 0 })
  const estCost = costOf(model, estTotal.inTok, estTotal.outTok)
  const byKind = {}
  for (const r of batch) byKind[r.kind] = (byKind[r.kind] || 0) + 1
  const chars = batch.reduce((s, r) => s + r.chars, 0)

  console.log(`精提炼 ${dry ? '干跑（不调模型、不写盘）' : '开跑'}：pending ${stat.pending} → 可用 ${pool.length} → 本次 ${batch.length} 条${mix ? `（配额 ${mix}）` : '（按 worth→时间）'}${perItem ? ' · 逐条模式（一条一调）' : ` · 批量模式（每批 ${BATCH_MIN}–${BATCH_MAX} 段）`}`)
  console.log(`  过滤：ref 坏 ${stat.refBad}、自动叫醒/简报 ${stat.noise}、太短 ${stat.short}、太长 ${stat.long}、已在用 ${stat.already}、重复 ${stat.dup}`)
  console.log(`  模型 ${models.join(' → ')}（key：${keyVar}）· 类别 ${JSON.stringify(byKind)} · 冷却 ${cooldown.ok ? '已过' : `中 ${cooldown.hours.toFixed(1)}h${dry ? '（干跑不受限）' : '（需 --force）'}`}`)
  if (batchSizeWanted !== batchSize) console.log(`  ⚠ --batch-size ${batchSizeWanted} 不在 ${BATCH_MIN}–${BATCH_MAX} 里，按 ${batchSize} 算`)
  if (batch.length && !perItem) {
    console.log(`  分批（按 通道+日期 分组，组内均分）：${batch.length} 条 → ${plan.length} 批`)
    plan.forEach((b, i) => {
      const e = estOf(b.rows)
      const small = b.rows.length < BATCH_MIN ? `　（${b.key.replace('|', '/')} 这一组只有 ${b.rows.length} 段，没得拆，不跟别的通道混批）` : ''
      console.log(`    批${String(i + 1).padStart(2, '0')}  ${b.key.replace('|', ' / ')}  ${String(b.rows.length).padStart(2)} 段  输入 ${fmt(e.chars)} 字符 ≈ ${fmt(e.inTok)} tok  输出 ≈ ${fmt(e.outTok)} tok  ≈ ¥${e.cost.toFixed(3)}${small}`)
    })
  }
  if (batch.length) {
    console.log(`  估算：输入 ${fmt(estTotal.chars)} 字符 ≈ ${fmt(estTotal.inTok)} token；输出 ≈ ${fmt(estTotal.outTok)} token；≈ ¥${estCost.toFixed(3)}（上限 ¥${budget}）${perItem ? ` · 调用 ${batch.length} 次` : ` · 调用 ≈ ${plan.length} 次`}\n`)
  }

  if (dry) {
    let bi = 0
    for (const b of plan) {
      bi += 1
      for (const r of b.rows) {
        const e = estOf([r])
        const tag = perItem ? '' : `批${String(bi).padStart(2, '0')} `
        console.log(`${tag}[${r.kind}] worth=${r.worth || '-'} ${String(r.chars).padStart(4)}字 ¥${e.cost.toFixed(4)}  ${r.ref.replace('dayu/live/', '')}`)
        console.log(`     「${clip(r.body, 62)}」`)
      }
    }
    console.log(`\n合计：${batch.length} 条 · ${perItem ? `${batch.length} 次调用` : `${plan.length} 批`} · 输入 ${fmt(chars)} 字符 · 估算 ¥${estCost.toFixed(3)} · 干跑耗时 ${((Date.now() - t0) / 1000).toFixed(2)}s`)
    process.exit(0)
  }

  if (!batch.length) {
    console.log('精提炼：没有可提炼的（都做过了或都被过滤）。')
    process.exit(0)
  }

  const keys = loadKeys()
  const key = keys.get(keyVar) || process.env[keyVar] || ''
  const base = arg('base', 'https://api.deepseek.com').replace(/\/$/, '')
  if (!key || !base) {
    console.error(`精提炼：缺 ${keyVar}（在 ${KEYS_FILE}）——没钥匙不跑，也不猜。`)
    process.exit(2)
  }

  const stats = {
    ok: 0, dup: 0, dupNear: 0, skip: 0, drop: 0, fail: 0, stoppedBudget: 0,
    feedbackReview: 0, feedbackDrop: 0,
    inTok: 0, outTok: 0, cost: 0, ms: 0,
    calls: 0, batches: 0, retries: 0, fallback: 0, batchSizes: [], dropReasons: new Map(),
  }
  const patches = new Map()       // 待提炼文件 → (id → patch)
  const pendingOwner = ownerMap()  // id → 文件（中层或旧待提炼）
  const patch = (id, p) => {
    const f = pendingOwner.get(String(id))
    if (!f) return false
    if (!patches.has(f)) patches.set(f, new Map())
    patches.get(f).set(String(id), p)
    return true
  }
  const written = []
  const failedIds = new Set()

  // 严格校验要"同一 fromRef 已存在就不写"：先把「在用」现有的 fromRef / head 读进来
  const seenRefs = new Set()
  const seenHeads = new Set()
  const seenHeadSets = []          // 近似重复用：{head, g:二字组集合}
  for (const f of filesUnder(path.join(LIB, '在用'))) {
    for (const r of readJsonl(f)) {
      if (r?.fromRef) seenRefs.add(String(r.fromRef))
      const h = String(r?.head || '').trim()
      if (h && !seenHeads.has(h)) { seenHeads.add(h); seenHeadSets.push({ head: h, g: headGrams(h) }) }
    }
  }

  const drop = (why, local) => {
    stats.drop += 1
    stats.dropReasons.set(why, (stats.dropReasons.get(why) || 0) + 1)
    if (local) local.set(why, (local.get(why) || 0) + 1)
  }
  const addUsage = (modelUsed, usage) => {
    stats.inTok += Number(usage?.in) || 0
    stats.outTok += Number(usage?.out) || 0
    stats.cost = Number((stats.cost + costOf(modelUsed, usage?.in, usage?.out)).toFixed(4))
  }

  /**
   * 写一条进 在用/；文件里已有时不重复写（另算重复，不算通过）。
   * 2026-11-16：写卡前先看回写（纯本地、不调模型）——
   *   drop  → 不写卡，只把这个队列行标 skipped 留一行 why（不删旧卡，队列清理照旧）；
   *   review→ 照常写，但卡上带 feedbackReview/feedbackWhy，且不计入“正常通过”；
   *   keep  → 和以前完全一样。
   */
  const feedbackMap = feedbackIndex()
  const correctedMap = correctedIndex()

  /** 一条队列行的反馈判断：取值顺序和以前 buildInUseRow 的 fb 一致（先 turnId、再 ref）。 */
  const feedbackOf = (r) => {
    const byTurn = feedbackMap.get(String(r.turnId || ''))
    const byRef = feedbackMap.get(String(r.ref || ''))
    const fb = byTurn || byRef || null
    const key = byTurn ? String(r.turnId || '') : (byRef ? String(r.ref || '') : '')
    const verdict = scoreFeedback({
      used: fb?.used,
      good: fb?.good,
      bad: fb?.bad,
      corrected: key ? (correctedMap.get(key) || 0) : 0,
      lastAt: fb?.lastAt,
    })
    return { fb, verdict }
  }

  /**
   * 事件段 ↔ 卡：按 row.role + row.turnId 查 episodeId 写进卡。
   * 索引按角色缓存（一次跑里重复写很多卡，不重复读 episodes 文件）；查不到返回空，不硬编。
   */
  const episodeIndexCache = new Map()
  const episodeIdOf = (r) => {
    const tid = String(r?.turnId || '').trim()
    if (!tid) return ''
    const role = String(r?.role || roleFromRef(r?.ref) || 'unknown')
    if (!episodeIndexCache.has(role)) episodeIndexCache.set(role, episodeIndex(role))
    return episodeIndexCache.get(role).get(tid) || ''
  }

  const commitOne = (r, j, modelUsed) => {
    const { fb, verdict } = feedbackOf(r)
    if (verdict.action === 'drop') {
      stats.feedbackDrop += 1
      console.log(`     ✗ 反馈判 drop，不写卡：${verdict.why}`)
      patch(r.id, { _delete: true, _state: 'skipped', why: `反馈判 drop（${clip(verdict.why, 40)}）` })
      return 'fbDrop'
    }
    const row = buildInUseRow(r, j, modelUsed, fb, verdict, episodeIdOf(r))
    // 卡 → 机制：只认卡里明确写到的机制 id/全名/文件名，不从泛词硬连。
    try {
      row.mechanismIds = mechanismsForText(`${row.head || ''} ${row.detail || ''}`, { limit: 3 }).map((m) => m.mechanismId)
    } catch { row.mechanismIds = [] }
    // 明确改口才覆盖旧卡；没明说只留两张，不替她选边。
    try {
      const sup = markSuperseded(String(r.role || roleFromRef(r.ref) || ''), row)
      if (sup.changed) console.log(`     ↳ 覆盖旧卡 ${sup.changed} 张`)
      if (isConflict(`${row.head || ''} ${row.detail || ''}`)) {
        const cf = markConflict(String(r.role || roleFromRef(r.ref) || ''), row)
        if (cf.changed) console.log(`     ↳ 标冲突 ${cf.changed} 张，不选边`)
      }
    } catch { /* 覆盖/标冲突失败不挡写入 */ }
    const w = appendInUse(j.kind, r.day, row)
    if (w.skipped) {
      stats.dup += 1
      console.log(`     = ${w.why}，不重复写：「${j.head}」`)
      patch(r.id, { _delete: true, _state: 'refined', why: `已在用（${w.why}）` })
      return 'dup'
    }
    written.push(row)
    seenRefs.add(String(row.fromRef))
    seenHeads.add(row.head)
    seenHeadSets.push({ head: row.head, g: headGrams(row.head) })
    if (verdict.action === 'review') {
      stats.feedbackReview += 1
      console.log(`     ⚑ ${j.kind} 「${j.head}」（反馈 review：写卡但标记，不计入正常通过）`)
    } else {
      stats.ok += 1
      console.log(`     ✓ ${j.kind} 「${j.head}」`)
    }
    patch(r.id, { _delete: true, _state: 'refined', why: `已精提炼（${j.kind}/${r.day}）` })
    return verdict.action === 'review' ? 'fbReview' : 'ok'
  }

  /** 判定一条：跳过 / 校验挡掉（标回 pending 重跑）/ 写进 在用。 */
  const handleOne = (r, parsed, modelUsed, localDrops) => {
    const j = judge(parsed, r, { seenRefs, seenHeads, seenHeadSets })
    if (j.skip) {
      if (j.dup) {
        stats.dupNear += 1
        console.log(`     ≡ 跳过（${j.why}）—— 这事库里已有结论`)
        patch(r.id, { _delete: true, _state: 'skipped', why: `已有结论（${j.why}）` })
        return 'dupNear'
      }
      stats.skip += 1
      console.log(`     · 跳过（模型说没信息量）：${j.why}`)
      patch(r.id, { _delete: true, _state: 'skipped', why: `跳过（${j.why}）` })
      return 'skip'
    }
    if (j.bad) {
      drop(j.why, localDrops)
      const peek = clip(parsed?.head || parsed?.title || '', 40)
      console.log(`     ✗ 校验挡掉：${j.why}${peek ? ` ｜ 被挡的是「${peek}」` : ''} —— 不写，标回 pending`)
      patch(r.id, { failedAt: nowISO(), lastError: `校验：${j.why}` })
      return 'bad'
    }
    return commitOne(r, j, modelUsed)
  }

  /** 逐条调一次（退化路径 / --per-item 对比用）。返回 {parsed, model} 或 null。 */
  const callOne = async (r) => {
    if (stats.cost >= budget) return null
    stats.calls += 1
    const one = await refineOne({ base, key, models, row: r, onLog: (m) => console.log(m) })
    if (one?.got?.usage) addUsage(one.model, one.got.usage)
    if (!one.ok) {
      stats.fail += 1
      failedIds.add(String(r.id))
      console.log(`     ✗ 逐条也没成，留 pending：${clip(one.error, 110)}`)
      patch(r.id, { failedAt: nowISO(), lastError: clip(one.error, 120) })
      return null
    }
    return { parsed: one.parsed, model: one.model }
  }

  /** 批量调一次（计入 token/花费，失败的尝试也算钱）。 */
  const callBatch = async (rows) => {
    stats.calls += 1
    const got = await refineBatch({ base, key, models, rows, onLog: (m) => console.log(m) })
    if (got.usage) addUsage(got.model || models[0], got.usage)
    return got
  }

  /**
   * 跑一批：批量调 → 用 id 对齐 → 缺的补跑一次 → 补不齐的退化逐条 → 逐条判定/写。
   * 打印：条数、输入字符、返回条数、通过校验数、丢弃数（含原因分类）、本批耗时。
   */
  const processBatch = async (rows, label) => {
    const tb = Date.now()
    stats.batches += 1
    stats.batchSizes.push(rows.length)
    const charsB = rows.reduce((s, r) => s + r.chars, 0)
    console.log(`${label} ${rows[0].channel || '未知'}/${rows[0].day || '未知'} · ${rows.length} 段 · 输入 ${fmt(charsB)} 字符`)
    const localDrops = new Map()
    const answers = new Map()
    let budgetHit = false

    if (stats.cost >= budget) {
      stats.stoppedBudget += rows.length
      console.log(`     预算闸：已花 ¥${stats.cost.toFixed(3)} ≥ 上限 ¥${budget}，这批原样不动（留在 pending）。`)
      return
    }

    const got = await callBatch(rows)
    if (!got.ok) {
      // 兜底：整批解析失败就退化逐条，并打印退化原因
      stats.fallback += 1
      console.log(`     ✗ 批量失败（${clip(got.error, 100)}）→ 退化为逐条（${rows.length} 段，原因：整批没拿到可用的 JSON 数组）`)
      for (const r of rows) {
        if (stats.cost >= budget) { budgetHit = true; break }
        const a = await callOne(r)
        if (a) answers.set(r.id, a)
      }
    } else {
      if (got.truncated) console.log(`     ! 回话被截断（finish=${got.finish || '?'}），只捞到 ${got.items.length} 条（能用的先算）`)
      console.log(`     返回 ${got.items.length} 条（${got.model} · in ${fmt(got.usage.in)} / out ${fmt(got.usage.out)} tok · 累计 ¥${stats.cost.toFixed(4)}）`)
      for (const it of got.items) {
        const id = normId(it?.id)
        if (!id) { drop('模型没给 id', localDrops); continue }
        if (!rows.some((r) => r.id === id)) { drop('id 对不上（模型编的 id）', localDrops); continue }
        if (answers.has(id)) { drop('同一个 id 回了两次', localDrops); continue }
        answers.set(id, { parsed: it, model: got.model })
      }
      let missing = rows.filter((r) => !answers.has(r.id))
      if (missing.length) {
        console.log(`     ↻ id 没对上/漏了 ${missing.length} 段（${missing.map((r) => r.id).join('、')}）→ 只补跑这些`)
        stats.retries += 1
        if (stats.cost < budget) {
          const got2 = await callBatch(missing)
          if (got2.ok) {
            console.log(`     补跑返回 ${got2.items.length} 条（in ${fmt(got2.usage.in)} / out ${fmt(got2.usage.out)} tok · 累计 ¥${stats.cost.toFixed(4)}）`)
            for (const it of got2.items) {
              const id = normId(it?.id)
              if (!id) { drop('补跑没给 id', localDrops); continue }
              if (answers.has(id)) { drop('补跑回了已有的 id', localDrops); continue }
              if (!missing.some((r) => r.id === id)) { drop('补跑给了本批之外的 id', localDrops); continue }
              answers.set(id, { parsed: it, model: got2.model })
            }
          } else {
            console.log(`     ✗ 补跑失败（${clip(got2.error, 90)}）→ 缺的这几条退回逐条`)
            stats.fallback += 1
          }
        }
        // 补跑之后还缺的：逐条收尾（一次补跑只补一次，不无限重试）
        missing = rows.filter((r) => !answers.has(r.id))
        for (const r of missing) {
          if (stats.cost >= budget) { budgetHit = true; break }
          const a = await callOne(r)
          if (a) answers.set(r.id, a)
        }
      }
    }

    // 判定 + 写（预算停下的段原样不动，不标任何状态）
    let pass = 0
    let skipN = 0
    let nearN = 0
    let badN = 0
    let reviewN = 0
    let fbDropN = 0
    for (const r of rows) {
      const a = answers.get(r.id)
      if (!a) {
        if (budgetHit || stats.cost >= budget) continue
        if (failedIds.has(String(r.id))) continue
        drop('批量没返回这一条（补跑后仍缺）', localDrops)
        patch(r.id, { failedAt: nowISO(), lastError: '批量没返回这一条' })
        badN += 1
        continue
      }
      const st = handleOne(r, a.parsed, a.model, localDrops)
      if (st === 'ok' || st === 'dup') pass += 1
      else if (st === 'fbReview') reviewN += 1
      else if (st === 'fbDrop') fbDropN += 1
      else if (st === 'dupNear') nearN += 1
      else if (st === 'skip') skipN += 1
      else if (st === 'bad') badN += 1
    }
    const reasons = [...localDrops.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}×${v}`).join('、')
    const fbN = reviewN || fbDropN ? ` · 反馈 review ${reviewN} / drop ${fbDropN}` : ''
    console.log(`     ✓ 通过 ${pass} · 跳过 ${skipN}${nearN ? `（其中近似重复 ${nearN}）` : ''} · 丢弃 ${badN}${reasons ? `（${reasons}）` : ''}${fbN} · 本批 ${((Date.now() - tb) / 1000).toFixed(1)}s`)
  }

  if (perItem) {
    // 老口径：一条一调。留着是为了和批量比速度，也是批量整体失败时的兜底形状。
    for (let i = 0; i < batch.length; i += 1) {
      const r = batch[i]
      const n = `[${String(i + 1).padStart(2, '0')}/${batch.length}]`
      const tb = Date.now()
      stats.batches += 1
      stats.batchSizes.push(1)
      if (stats.cost >= budget) {
        stats.stoppedBudget = batch.length - i
        console.log(`${n} 预算闸：已花 ¥${stats.cost.toFixed(3)} ≥ 上限 ¥${budget}，停。剩 ${stats.stoppedBudget} 条原样不动。`)
        break
      }
      console.log(`${n} ${r.kind} · ${model} · 输入 ${r.chars} 字符`)
      const localDrops = new Map()
      const a = await callOne(r)
      if (a) handleOne(r, a.parsed, a.model, localDrops)
      const reasons = [...localDrops.entries()].map(([k, v]) => `${k}×${v}`).join('、')
      console.log(`     ${reasons ? `丢弃（${reasons}）· ` : ''}本批 ${((Date.now() - tb) / 1000).toFixed(1)}s`)
      await sleep(250)
    }
  } else {
    for (let i = 0; i < plan.length; i += 1) {
      await processBatch(plan[i].rows, `[批 ${String(i + 1).padStart(2, '0')}/${plan.length}]`)
    }
  }
  stats.ms = Date.now() - t0

  const marked = markPending(patches)
  const st = readState()
  const prev = st.refine || {}
  const prevTotal = Number(prev.totalOk) || 0
  const processed = stats.ok + stats.feedbackReview + stats.feedbackDrop + stats.dup + stats.dupNear + stats.skip + stats.drop + stats.fail
  // 逐条基线：只在"上一次是真逐条跑"时才有得比；这次本身是逐条，就直接拿这次的当基线
  const perItemBaseline = perItem
    ? { ms: stats.ms, rows: processed, at: nowISO(), model: models[0] }
    : (prev.mode !== 'batch' && prev.ms && prev.processed
      ? { ms: Number(prev.ms), rows: Number(prev.processed), at: String(prev.lastAt || ''), model: String(prev.model || '') }
      : (prev.perItemBaseline || null))
  st.refine = {
    ...prev,
    mode: perItem ? 'per-item' : 'batch',
    lastAt: nowISO(),
    processed,
    ok: stats.ok,
    feedbackReview: stats.feedbackReview,
    feedbackDrop: stats.feedbackDrop,
    totalOk: prevTotal + stats.ok,
    fail: stats.fail,
    skip: stats.skip,
    dupNear: stats.dupNear,
    drop: stats.drop,
    dup: stats.dup,
    dropReasons: Object.fromEntries(stats.dropReasons),
    model: models[0],
    models,
    tokens: { in: stats.inTok, out: stats.outTok },
    costCNY: stats.cost,
    limit,
    mix: mix || '',
    ms: stats.ms,
    batchSize: perItem ? 1 : batchSize,
    batches: stats.batches,
    batchSizes: stats.batchSizes,
    retries: stats.retries,
    fallback: stats.fallback,
    perItemBaseline,
  }
  writeState(st)

  // 同一会话相邻轮自动连“上一轮/下一轮”；只改线，不动正文。
  try {
    const rl = relinkTurns()
    if (rl.changed) console.log(`自动连线：${rl.changed} 张纸补上上一轮/下一轮`)
    const rt = relinkTopics()
    if (rt.changed) console.log(`自动话题线：${rt.changed} 张纸补上同一话题`)
    const re = relinkSameEvent()
    if (re.changed) console.log(`显式同事件线：${re.changed} 张纸补上 same_event`)
  } catch (e) { console.log(`自动连线跳过：${e?.message || e}`) }

  const files = {}
  for (const row of written) {
    const k = `在用/${row.kind}/${row.day}.jsonl`
    files[k] = (files[k] || 0) + 1
  }
  const reasons = [...stats.dropReasons.entries()].sort((a, b) => b[1] - a[1])
  const perRowMs = (stats.ms / 1000 / Math.max(1, processed)).toFixed(2)
  console.log('\n──────── 汇总 ────────')
  if (perItem) console.log(`模式：逐条（一条一调）· 调用 ${stats.calls} 次`)
  else console.log(`模式：批量（每批 ${BATCH_MIN}–${BATCH_MAX} 段，实际 ${stats.batchSizes.join('/')}）· ${stats.batches} 批 · 调用 ${stats.calls} 次（补跑 ${stats.retries} 次、退化 ${stats.fallback} 批）`)
  console.log(`通过校验并写入 ${stats.ok} 条 · 反馈 review ${stats.feedbackReview} 条（写卡但标记，不计入通过）· 反馈 drop ${stats.feedbackDrop} 条（不写卡）· 模型跳过 ${stats.skip} 条 · 近似重复跳过 ${stats.dupNear} 条 · 校验丢弃 ${stats.drop} 条 · 重复不写 ${stats.dup} 条 · 失败留 pending ${stats.fail} 条${stats.stoppedBudget ? ` · 预算停下 ${stats.stoppedBudget} 条` : ''}（计划 ${batch.length} 条）`)
  if (reasons.length) console.log(`丢弃原因：${reasons.map(([k, v]) => `${k} ×${v}`).join('、')}`)
  console.log(`token：in ${fmt(stats.inTok)} / out ${fmt(stats.outTok)} · 花费 ≈ ¥${stats.cost.toFixed(4)}（上限 ¥${budget}）`)
  console.log(`耗时：${(stats.ms / 1000).toFixed(1)}s（${perRowMs} s/条）`)
  if (!perItem && perItemBaseline?.ms && perItemBaseline?.rows) {
    const bMs = Number(perItemBaseline.ms)
    const bRows = Number(perItemBaseline.rows)
    const bPerRow = bMs / 1000 / bRows
    const nowS = stats.ms / 1000
    const equiv = bPerRow * batch.length
    console.log(`对比：逐条 ${bRows} 条 = ${(bMs / 1000).toFixed(1)}s（${bPerRow.toFixed(2)} s/条，${perItemBaseline.at || '上一次真跑'} 的记录）`)
    console.log(`      批量 ${batch.length} 条 = ${nowS.toFixed(1)}s（${(nowS / Math.max(1, batch.length)).toFixed(2)} s/条）`)
    console.log(`      同样 ${batch.length} 条折算：逐条约 ${equiv.toFixed(0)}s vs 批量 ${nowS.toFixed(0)}s，快 ${(equiv / Math.max(1, nowS)).toFixed(1)}×`)
  } else if (perItem) {
    console.log('对比基线已记进 digest-state.json 的 refine.perItemBaseline，下次批量跑会打印对比。')
  }
  console.log(`写入：${Object.keys(files).length ? Object.entries(files).map(([k, v]) => `${k} +${v}`).join('、') : '无'}`)
  console.log(`指针：删队列 ${marked.dropped} 行（其中反馈 drop ${stats.feedbackDrop}）、校验挡回 pending ${stats.drop}、失败留 pending ${stats.fail}（共改 ${marked.rows} 行 / ${marked.files} 个文件）${marked.failed.length ? `；${marked.failed.length} 个文件没写进去：${marked.failed.map((f) => clip(`${path.basename(f.file)} ${f.err}`, 60)).join('；')}` : ''}`)
  console.log(`状态：digest-state.json → refine.mode=${st.refine.mode}、lastAt=${st.refine.lastAt}、processed=${st.refine.processed}、totalOk=${st.refine.totalOk}`)
  // 质量闸的原料：一轮真跑结束才写，且只追加（scripts/refine-quality.mjs 读它判阈值）
  appendRoundMetrics({ written, stats, batch, mode: perItem ? 'per-item' : 'batch', model: models[0] })
  process.exit(stats.fail && !stats.ok ? 1 : 0)
}

/**
 * 一轮跑完后，往 <home>/dayu/runtime/refine-metrics.jsonl 追加一行指标。
 * 只写这一份；写失败（没权限/盘满/目录没了）一律吞掉——指标不能反过来把提炼弄挂。
 * 读的人是 scripts/refine-quality.mjs，字段口径与阈值在那边文件头写明。
 */
function appendRoundMetrics({ written, stats, batch, mode, model }) {
  try {
    const rows = Array.isArray(written) ? written : []
    const textOf = (r) => `${r?.head || ''} ${r?.detail || ''}`
    const METRIC_CITE = /(《[^》]+》|文档|论文|官方|https?:\/\/|报错|命令|API|书上|别人说)/i
    const METRIC_SHAPE = /(下次|以后|遇到|别再|不要再|先.{0,8}再)/i
    const METRIC_DRIVE = /[A-Za-z]:\\/g
    const kn = rows.filter((r) => r.kind === '知识')
    const ex = rows.filter((r) => r.kind === '经验')
    const rec = {
      at: nowISO(),
      written: stats.ok,
      dropped: stats.drop,
      skipped: stats.skip + stats.dupNear,
      reKind: rows.filter((r) => Boolean(r.reKind)).length,
      knowledge: { total: kn.length, cited: kn.filter((r) => METRIC_CITE.test(textOf(r))).length },
      experience: { total: ex.length, shaped: ex.filter((r) => METRIC_SHAPE.test(textOf(r))).length },
      loggy: rows.filter((r) => LOGGY.test(textOf(r))).length,
      paths: rows.filter((r) => (textOf(r).match(METRIC_DRIVE) || []).length >= 2).length,
      droppedReasons: Object.fromEntries(stats.dropReasons || []),
      costYuan: Number(Number(stats.cost || 0).toFixed(4)),
      ms: Number(stats.ms) || 0,
      calls: Number(stats.calls) || 0,
      retried: Number(stats.retries) || 0,
      degraded: Number(stats.fallback) || 0,
      // 反馈进提炼（2026-11-16）：review 写卡但不计入 written/通过；drop 一条卡都没写。
      feedback: {
        review: Number(stats.feedbackReview) || 0,
        drop: Number(stats.feedbackDrop) || 0,
      },
      corpus: {
        channels: [...new Set(batch.map((r) => r.channel).filter(Boolean))].sort(),
        days: [...new Set(batch.map((r) => r.day).filter(Boolean))].sort(),
        count: batch.length,
      },
      mode,
      model,
    }
    const file = path.join(HOME, 'dayu', 'runtime', 'refine-metrics.jsonl')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${JSON.stringify(rec)}\n`, 'utf8')
  } catch { /* 指标写不进去不许影响提炼 */ }
}

main().catch((e) => {
  // 顶层兜底：先把钥匙抹掉再报（不许因为一个异常把 key 打到终端/日志里）
  console.error(`精提炼挂了：${redact(e?.stack || e?.message || e)}`)
  process.exit(1)
})
