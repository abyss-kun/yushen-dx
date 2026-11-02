// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 两端记忆合并（2026-11-02，方案 v1 §2）——P1 合并核心：水位、幂等、三类分开、分歧清单。
//
// 为什么存在：两台设备各有一个完整的她。事实可以拼（她那天真的说了那句话），
// 承诺与判断不能拼（"以后都用蓝色"遇上"以后都用白色"，程序没有资格替她选边）。
// 所以这里只做三件事：**按 (device, seq) 把事实拼起来**、**状态取最后确认者并留痕**、
// **把同一件事的两个结论都留着并记进分歧清单**。传输（信封）、前台自动交账是 P2/P3 的事，本文件不碰网络、不调模型。
//
// 红线：
//   · 只增不改：已有事件的正文/时间/设备一个字都不动；唯一允许的改动是加 supersededBy 这类留痕字段；
//   · 状态类冲突不静默取胜：选最后确认者的同时，两个结论都进 disputes.jsonl；
//   · 先写 merge.log 再推水位：被杀在中间最多重跑一次增量（幂等键 (device, seq) 挡住重复入库）；
//   · 水位已最新 → 直接返回"无新增"，不写日志、不读记忆文件；
//   · 定型文档（宪章/手册/已定稿 md）不参与合并——它们走 hash+mtime 文件同步，这里只搬"关于它的变更事件"。
//
// 数据落在 dayu/sync/（方案 v1 §2.2、§9）：
//   watermark.json   { "pc": 1234, "phone": 987, "lastNightMerge": "2026-11-01" }
//   merge.log        JSONL：谁、何时、水位从哪到哪、多少条、多少冲突
//   disputes.jsonl   分歧清单：两侧原文/时间/设备，不选边
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { getCharacter } from '../lib/characters.js'
import { withLock, MAX_EVENTS, archiveDropped } from '../lib/memory.js'
import { noteWrite } from '../lib/memory-audit.js'
import { device } from '../lib/platform.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
export const SYNC_DIR = path.join(DATA, 'sync')
export const WATERMARK_FILE = path.join(SYNC_DIR, 'watermark.json')
export const MERGE_LOG = path.join(SYNC_DIR, 'merge.log')
export const DISPUTES_FILE = path.join(SYNC_DIR, 'disputes.jsonl')
export const SEQ_FILE = path.join(SYNC_DIR, 'seq.json')
/** watermark.json 里不是对端的保留键（方案 v1 §2.2 的 lastNightMerge）。 */
const RESERVED_KEYS = new Set(['lastNightMerge'])
/** 状态类：关系、承诺、当前计划（方案 v1 §2.3）。 */
export const STATE_KINDS = Object.freeze(['commit', 'promise', 'plan'])

const sha1 = (s) => crypto.createHash('sha1').update(String(s)).digest('hex')
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')) } catch { return fb } }
const atMs = (r) => { const t = Date.parse(String(r && r.at || '')); return Number.isFinite(t) ? t : 0 }
const norm = (t) => String(t || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`
  fs.writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

// ── 水位 ──────────────────────────────────────────────────────────
export function readWatermark() {
  const wm = readJson(WATERMARK_FILE, {})
  return wm && typeof wm === 'object' && !Array.isArray(wm) ? wm : {}
}
export function watermarkOf(peer) {
  const v = Number(readWatermark()[String(peer || '')])
  return Number.isFinite(v) && v > 0 ? v : 0
}
function pushWatermark(peer, seq, night = '') {
  return withLock(WATERMARK_FILE, () => {
    const wm = readWatermark()
    const next = { ...wm, [peer]: Math.max(Number(wm[peer]) || 0, Number(seq) || 0) }
    if (night) next.lastNightMerge = String(night)
    writeAtomic(WATERMARK_FILE, JSON.stringify(next, null, 1) + '\n')
    return next
  })
}

// ── 身份：只认 (device, seq) ───────────────────────────────────────
// 有 seq：幂等键 = device + seq（方案 v1 §2.2）。
// 没 seq（2026-11-01 之前的老导出）：退回内容键——同一天同通道同文本算同一条，
// 这样老数据重复导入不会堆副本，也不需要给它编一个可能是错的序号。
function seqOf(r) {
  const n = Number(r && r.seq)
  return Number.isFinite(n) && n > 0 ? n : 0
}
function contentKey(r) {
  return 'c:' + sha1(`${r.device || ''}|${r.at || ''}|${r.channel || ''}|${r.kind || ''}|${norm(r.text)}`).slice(0, 16)
}
function keysOf(r) {
  const s = seqOf(r)
  return [s ? `s:${String(r.device || 'unknown')}:${s}` : '', contentKey(r)].filter(Boolean)
}

// ── 三类：事实 / 状态 / 定型文档 ───────────────────────────────────
const isState = (r) => Boolean(r) && (STATE_KINDS.includes(String(r.kind || '')) || Boolean(r.supersede || r.supersededBy || r.superseding))
/** 状态类的「同一件事」：优先 about；没有 about 时同文本才算同一件（不同文本不硬凑）。 */
function stateKey(r) {
  const about = String(r && r.about || '').trim()
  if (about) return `about:${about}`
  return isState(r) ? `text:${sha1(norm(r && r.text)).slice(0, 12)}` : ''
}
/** 定型文档不是事件：它们不进合并。这里只兜住「事件里提到了定型文档」这种（照常当事实/状态处理）。 */
export function isSealedDoc(row) {
  const t = String(row && (row.docClass || row.file || '') || '')
  return /^(doc|sealed|charter|handbook):/i.test(t) || row?.sealed === true
}

// ── 文本相似（只用来认「像同一件事的两个结论」，不做语义） ─────────
function bigrams(s) {
  const v = String(s || '')
  const out = new Set()
  for (let i = 0; i < v.length - 1; i++) out.add(v.slice(i, i + 2))
  return out
}
function similar(a, b) {
  const x = norm(a)
  const y = norm(b)
  if (x.length < 8 || y.length < 8) return false
  if (x === y) return false
  const A = bigrams(x)
  const B = bigrams(y)
  let hit = 0
  for (const g of A) if (B.has(g)) hit += 1
  const union = A.size + B.size - hit
  return union > 0 && hit / union >= 0.62
}

// ── 分歧清单 ──────────────────────────────────────────────────────
const sameDay = (a, b) => String(a && a.at || '').slice(0, 10) !== '' && String(a && a.at || '').slice(0, 10) === String(b && b.at || '').slice(0, 10)

/**
 * 两个事件是不是「同一件事两个结论」。规则只有四条，写得死一点，宁可少报：
 *   R1 两边都是状态类、about 相同、结论（文本）不同 → 状态冲突；
 *   R2 两边 about 相同（非状态类）且文本不同 → 同一件事两个说法；
 *   R3 不同设备、同通道同 kind、同一天、文本相似但不同 → 两条事实对不上；
 *   R4 同一台设备、同通道同 kind、10 分钟内、文本相似但不同 → 同设备自己前后矛盾。
 * 不选边：命中的两条都留在记忆里，这里只记账。
 */
function conflictOf(a, b) {
  const sameAbout = String(a.about || '').trim() && String(a.about || '').trim() === String(b.about || '').trim()
  const diffText = norm(a.text) !== norm(b.text)
  if (sameAbout && diffText && (isState(a) || isState(b))) return 'state-conflict'
  if (sameAbout && diffText) return 'about-conflict'
  if (String(a.channel || '') !== String(b.channel || '')) return ''
  if (String(a.kind || '') !== String(b.kind || '')) return ''
  const da = String(a.device || 'unknown')
  const db = String(b.device || 'unknown')
  if (da !== db && sameDay(a, b) && similar(a.text, b.text)) return 'fact-conflict'
  if (da === db && Math.abs(atMs(a) - atMs(b)) <= 10 * 60e3 && similar(a.text, b.text)) return 'fact-conflict'
  return ''
}

function disputePairKey(a, b) {
  const ka = keysOf(a).join('+')
  const kb = keysOf(b).join('+')
  return [ka, kb].sort().join('||')
}

function readDisputes() {
  const out = []
  try {
    for (const line of fs.readFileSync(DISPUTES_FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try { out.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
    }
  } catch { /* 还没有分歧文件 */ }
  return out
}

// ── 合并本体 ──────────────────────────────────────────────────────
const side = (r) => ({
  device: String(r.device || 'unknown'),
  at: String(r.at || ''),
  text: String(r.text || '').slice(0, 300),
  id: String(r.id || ''),
  seq: seqOf(r) || null,
  kind: String(r.kind || ''),
})

/** 本机事件里那些没有 seq 的（2026-11-01 之前写的，或对端按老格式导过来的）：
 *  按 at 排序当成 seq 从 1 起算，并标 seqInferred——只加字段，正文一个字不动。
 *  已经有一半带号时接着最大值往下排，免得补出来的号撞上真的号（撞了会被当成同一条跳过）。 */
function inferSeq(events) {
  const missing = events.filter((e) => e && typeof e === 'object' && !seqOf(e))
  if (!missing.length) return 0
  const maxExisting = events.reduce((m, e) => Math.max(m, seqOf(e)), 0)
  const order = [...missing].sort((a, b) => (atMs(a) - atMs(b)) || String(a.id || '').localeCompare(String(b.id || '')))
  order.forEach((e, i) => { e.seq = maxExisting + i + 1; e.seqInferred = true })
  return missing.length
}

function planMerge({ events, scope, peer, when, role }) {
  const localKeys = new Set()
  for (const e of events) for (const k of keysOf(e)) localKeys.add(k)
  const accepted = []
  let skipped = 0
  for (const row of scope) {
    const ks = keysOf(row)
    if (ks.some((k) => localKeys.has(k))) { skipped += 1; continue }
    for (const k of ks) localKeys.add(k)
    accepted.push(row)
  }

  // 分歧：只拿「这次要入库的」去和本机已有的 + 本批已收的比，不两两扫全库（会炸）。
  const oldDisputes = readDisputes()
  const seenPairs = new Set(oldDisputes.map((d) => String(d.pair || '')))
  const disputes = []
  for (let i = 0; i < accepted.length; i++) {
    const a = accepted[i]
    const others = [...events, ...accepted.slice(0, i)]
    for (const b of others) {
      if (!a || !b || keysOf(a).join() === keysOf(b).join()) continue
      const kind = conflictOf(a, b)
      if (!kind) continue
      const pair = disputePairKey(a, b)
      if (seenPairs.has(pair)) continue
      seenPairs.add(pair)
      disputes.push({
        at: when, role, kind, pair,
        a: side(a), b: side(b),
        note: kind === 'state-conflict'
          ? '同一件事两个结论：都保留，按最后确认者排先后，由她下次自己解释——程序不选边'
          : '两边说法对不上：都保留，进清单等她自己解释——程序不选边',
      })
    }
  }

  // 状态：取最后确认者（at 优先，同秒按 device 字典序），给落选的那条写 supersede 留痕。
  const groups = new Map()
  for (const e of [...events, ...accepted]) {
    const key = stateKey(e)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(e)
  }
  let superseded = 0
  for (const [, list] of groups) {
    const texts = new Set(list.map((e) => norm(e.text)))
    if (texts.size <= 1) continue // 同一个结论说了两遍，不用留痕
    const winner = [...list].sort((x, y) => (atMs(x) - atMs(y)) || String(x.device || '').localeCompare(String(y.device || ''))).at(-1)
    const wid = String(winner.id || contentKey(winner))
    for (const e of list) {
      if (e === winner) continue
      if (norm(e.text) === norm(winner.text)) continue
      if (String(e.supersededBy || '') === wid) continue
      e.supersededBy = wid
      e.supersededAt = when
      e.supersedeReason = `merge:${peer}｜最后确认者 ${winner.device || 'unknown'}@${winner.at || ''}`
      superseded += 1
    }
  }

  const next = [...events, ...accepted]
  const inferred = inferSeq(events) // 只给本机老事件补号，不动正文
  // 拼进来的事件可能比本机最后一条还早：按 at / seq 排一次序，好让「热档只留最近 200 条」裁得对。
  // 只排序，正文一个字不动。
  const ordered = [...next].sort((a, b) => (atMs(a) - atMs(b)) || (seqOf(a) - seqOf(b)))
  const overflow = Math.max(0, ordered.length - MAX_EVENTS)
  const dropped = overflow ? ordered.slice(0, overflow) : []
  const kept = overflow ? ordered.slice(-MAX_EVENTS) : ordered
  const maxSeq = scope.reduce((m, r) => Math.max(m, seqOf(r)), 0)
  return { added: accepted.length, skipped, disputes, superseded, inferred, dropped, kept, maxSeq, accepted }
}

/**
 * 合并一个对端交来的事件增量。
 * @param {string} role dayu | xiaoyu | dragon
 * @param {{peer:string, sinceSeq?:number|null, rows?:object[], dry?:boolean, manifest?:object, night?:string, now?:string}} opts
 *   peer：对端名字（watermark.json 的键，比如 pc / phone）；sinceSeq：不传就用水位；
 *   rows：对端的事件行；manifest：信封清单（有它就能在水位已最新时**不读文件**）；
 *   night：睡眠窗口合并时传 'YYYY-MM-DD'，同一晚只跑一次；dry：只算不写。
 * @returns {{ok:boolean, peer?:string, added?:number, skipped?:number|string, disputes?:number, superseded?:number, watermark?:{from:number,to:number}}}
 */
export function merge(role = 'dayu', { peer = '', sinceSeq = null, rows = [], dry = false, manifest = null, night = '', now = '' } = {}) {
  const peerName = String(peer || '').trim().slice(0, 40)
  if (!peerName) return { ok: false, reason: '要给对端名字（peer），比如 pc / phone' }
  if (RESERVED_KEYS.has(peerName)) return { ok: false, reason: `「${peerName}」是水位文件里的保留键，换个对端名` }
  const roleId = String(role || 'dayu')
  const when = String(now || new Date().toISOString())
  const wm = readWatermark()
  const wmSeq = Number(wm[peerName]) || 0
  const since = (sinceSeq === null || sinceSeq === undefined) ? wmSeq : Math.max(0, Number(sinceSeq) || 0)
  const base = { ok: true, peer: peerName, role: roleId, added: 0, skipped: 0, disputes: 0, superseded: 0, dry: Boolean(dry), watermark: { from: since, to: wmSeq } }

  // 睡眠窗口：同一晚只合并一次（方案 v1 §2.1）。
  if (night && String(wm.lastNightMerge || '') === String(night)) return { ...base, skipped: 'night-done' }

  // 清单快速通道：seq 范围完全没越过水位 → 不解压、不读文件（方案 v1 §2.2）。
  const mTo = Number(manifest && (manifest.seqTo ?? manifest.to))
  if (manifest && Number.isFinite(mTo) && mTo <= since) return { ...base, skipped: 'no-new' }

  // 只处理 seq > 水位；没有 seq 的老行靠内容键去重，照样收。
  const scope = []
  let ignored = 0
  for (const raw of Array.isArray(rows) ? rows : []) {
    if (!raw || typeof raw !== 'object') { ignored += 1; continue }
    if (raw.role && String(raw.role) !== roleId) { ignored += 1; continue }
    if (typeof raw.text !== 'string' || !raw.text.trim()) { ignored += 1; continue }
    if (isSealedDoc(raw)) { ignored += 1; continue } // 定型文档不进合并
    const s = seqOf(raw)
    if (s && s <= since) continue
    // 信封里的 role / cold 标记是「这份文件怎么来的」，不是事件本身：入库前摘掉，别把运输标记写进她的记忆。
    const { role: _dropRole, cold: _dropCold, coldFile: _dropColdFile, ...ev } = raw
    scope.push({ ...ev, device: String(raw.device || peerName).slice(0, 16) })
  }
  if (!scope.length) {
    // 水位已最新：不写日志、不读记忆文件（方案 v1 §2.2「不做无意义的事」）。
    return { ...base, ignored, skipped: 'no-new' }
  }

  const file = getCharacter(roleId).memory
  const persist = () => {
    const doc = readJson(file, null) || { version: 1, summary: '', habits: [], dynamics: [], impressions: {} }
    const events = Array.isArray(doc.events) ? doc.events : []
    const plan = planMerge({ events, scope, peer: peerName, when, role: roleId })
    const canPush = plan.maxSeq > 0
    // 真干了活：拼进新事件、或给落选的状态留了取代痕迹。
    const realWork = plan.added > 0 || plan.superseded > 0
    // 全是重放（上次被杀在推水位之前）：号在水位之上，把水位推上去，省得每次开机重放同一份。
    const replay = !realWork && canPush && plan.skipped > 0
    const logged = realWork || replay
    // 补号（seqInferred）是给本机老事件加一个字段，不算一次合并，不写 merge.log。
    const changed = realWork || plan.inferred > 0
    if (!logged && !changed) return { ...plan, noop: true }
    const to = Math.max(since, plan.maxSeq)
    // 方案 v1 §2.2：**先写 merge.log 再推水位**；被杀在中间最多重跑一次增量（幂等键挡住重复）。
    if (logged) {
      const logRow = { at: when, who: 'merge', device: device(), role: roleId, peer: peerName, from: since, to, incoming: scope.length, added: plan.added, skipped: plan.skipped, disputes: plan.disputes.length, superseded: plan.superseded, seqInferred: plan.inferred, replay }
      fs.mkdirSync(SYNC_DIR, { recursive: true })
      fs.appendFileSync(MERGE_LOG, JSON.stringify(logRow) + '\n', 'utf8')
    }
    if (changed) {
      if (plan.dropped.length) archiveDropped(roleId, plan.dropped)
      const sizeBefore = (() => { try { return fs.statSync(file).size } catch { return -1 } })()
      writeAtomic(file, JSON.stringify({ ...doc, version: doc.version ?? 1, updatedAt: when, events: plan.kept }, null, 2) + '\n')
      noteWrite({ role: roleId, file, op: 'merge', before: sizeBefore, after: (() => { try { return fs.statSync(file).size } catch { return -1 } })(), who: `merge:${peerName}`, why: `+${plan.added} 条，${plan.disputes.length} 条分歧，水位 ${since}→${to}` })
    }
    if (plan.disputes.length) {
      fs.appendFileSync(DISPUTES_FILE, plan.disputes.map((d) => JSON.stringify(d)).join('\n') + '\n', 'utf8')
    }
    if (logged && canPush) pushWatermark(peerName, to, night)
    return plan
  }

  if (dry) {
    const doc = readJson(file, null) || {}
    const events = Array.isArray(doc.events) ? doc.events : []
    const plan = planMerge({ events, scope, peer: peerName, when, role: roleId })
    return { ...base, added: plan.added, skipped: plan.skipped, disputes: plan.disputes.length, superseded: plan.superseded, seqInferred: plan.inferred, ignored, watermark: { from: since, to: Math.max(since, plan.maxSeq) } }
  }
  const plan = withLock(file, persist)
  if (plan.noop) return { ...base, added: 0, skipped: plan.skipped, ignored, note: '对端这些条本机都有，没有可写入的', watermark: { from: since, to: since } }
  return { ...base, added: plan.added, skipped: plan.skipped, disputes: plan.disputes.length, superseded: plan.superseded, seqInferred: plan.inferred, ignored, watermark: { from: since, to: Math.max(since, plan.maxSeq) } }
}

/** 从一份 jsonl（信封的 events.jsonl）读出行再合并。读不到就当成空（不抛）。 */
export function mergeFromFile(role = 'dayu', { peer = '', file = '', dry = false, sinceSeq = null, manifest = null, manifestFile = '', night = '', now = '' } = {}) {
  const mf = manifestFile ? readJson(manifestFile, null) : (manifest || null)
  if (!file || !fs.existsSync(file)) {
    // 没有文件也没关系：清单说没新东西就是没新东西（不解压、不读文件）。
    if (mf) return merge(role, { peer, sinceSeq, rows: [], dry, manifest: mf, night, now })
    return { ok: false, reason: '要一份事件 jsonl（--file）' }
  }
  const rows = []
  let badLines = 0
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const r = JSON.parse(line)
      if (r && typeof r === 'object') rows.push(r)
      else badLines += 1
    } catch { badLines += 1 }
  }
  const r = merge(role, { peer, sinceSeq, rows, dry, manifest: mf, night, now })
  return { ...r, file, rows: rows.length, badLines }
}

export function syncStatus() {
  const wm = readWatermark()
  const disputes = readDisputes()
  let logLines = 0
  try { logLines = fs.readFileSync(MERGE_LOG, 'utf8').split('\n').filter(Boolean).length } catch { /* 还没合并过 */ }
  return { ok: true, home: HOME, dir: SYNC_DIR, watermark: wm, watermarkFile: WATERMARK_FILE, mergeLog: MERGE_LOG, mergeLogLines: logLines, disputes: disputes.length, disputesFile: DISPUTES_FILE }
}

// ── CLI ────────────────────────────────────────────────────────────
export function main(argv = process.argv.slice(2)) {
  const cmd = argv[0] || ''
  const val = (n, d = '') => { const i = argv.indexOf('--' + n); return i >= 0 ? String(argv[i + 1] || '') : d }
  const has = (n) => argv.includes('--' + n)
  if (cmd === 'status' || !cmd) {
    console.log(JSON.stringify(syncStatus(), null, 1))
    return 0
  }
  if (cmd.startsWith('--')) {
    console.error('用法：node sync/merge.mjs <peer> --role dayu --file <事件.jsonl> [--dry] [--since N] [--manifest m.json] [--night YYYY-MM-DD]')
    return 2
  }
  const sinceArg = val('since', '')
  const r = mergeFromFile(val('role', 'dayu'), {
    peer: cmd,
    file: val('file', ''),
    dry: has('dry'),
    sinceSeq: sinceArg === '' ? null : Number(sinceArg) || 0,
    manifestFile: val('manifest', ''),
    night: val('night', ''),
  })
  console.log(JSON.stringify(r, null, 1))
  if (r.ok) {
    const w = r.watermark || { from: 0, to: 0 }
    console.log(`合并 ${r.peer}：新增 ${r.added}，跳过 ${r.skipped}${r.ignored ? `，忽略 ${r.ignored}` : ''}，分歧 ${r.disputes}${r.superseded ? `，取代留痕 ${r.superseded}` : ''}，水位 ${w.from}→${w.to}${r.dry ? '（dry，没写任何东西）' : ''}`)
  } else {
    console.error(`失败：${r.reason || '未知原因'}`)
  }
  return r.ok ? 0 : 2
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exit(main())
