// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 全量导出 / 全量重建（2026-11-02，方案 v1 §6）——**兜底比增量更重要**。
//
// 为什么存在：增量合并再小心，也可能出现「这台机器上东西没了」；这时候必须有一个
// 「把她的记忆整份搬回来」的东西，而且搬完条数要能对上。方案 v1 §6 把这条排在 P1 前面。
//
// 规矩（一条都不许破）：
//   · 只读导出：导出过程不改任何记忆文件；
//   · 导入是整份替换（--replace）：替换前先把旧文件另存一份 .bak-replace-<时间>，不删；
//   · 冷档必须一起走（coldIncluded）——「只增不删」的承诺在搬家这一步最容易破；
//   · 零网络、零 LLM 调用；单机默认不加载（index.js / dayu/index.js 都不 import 这个文件）。
//
// 用法：
//   node sync/full.mjs export --all --out 备份-2026-11-02.jsonl [--role dayu] [--days 7]
//   node sync/full.mjs import --replace --file 备份-2026-11-02.jsonl [--dry] [--force]
//   node sync/full.mjs status
//
// 产物：<out> 是 jsonl（每行 {role, ...事件}，冷档那条带 cold:true）；
//       <out>.manifest.json 是清单（设备、条数、sha256、每个角色的 summary/habits/dynamics/impressions）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { device } from '../lib/platform.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const MEM = path.join(DATA, 'soul', 'memory')
const ROLES = ['dayu', 'xiaoyu', 'dragon']
const DEFAULT_MAX = 200 // 和 lib/memory.js 的热档上限一致；重建时超出的进冷档，不丢

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')) } catch { return fb } }
const memFile = (role) => path.join(MEM, `${role}.json`)

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`
  fs.writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

/** 冷档目录：热档挤出来的旧事在这里（两处都读，写只写 role 那处，和 memory.js 一致）。 */
const coldDirs = (role) => [
  path.join(DATA, 'runtime', role, '记忆冷档'),
  path.join(DATA, 'runtime', '记忆冷档'),
]
const coldWriteDir = (role) => coldDirs(role)[0]

function readCold(role) {
  const rows = []
  for (const dir of coldDirs(role)) {
    let files = []
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')) } catch { continue }
    for (const f of files) {
      try {
        for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
          if (!line.trim()) continue
          try {
            const ev = JSON.parse(line)
            if (ev && typeof ev.text === 'string') rows.push({ ...ev, cold: true, coldFile: f })
          } catch { /* 坏行跳过，不整份失败 */ }
        }
      } catch { /* 读不了就跳过 */ }
    }
  }
  return rows
}

/** 内容键：id 缺失时靠它认「同一条」，重建后重复导入不会堆副本。 */
const contentKey = (r) => 'c:' + sha256(Buffer.from(`${r.device || ''}|${r.at || ''}|${r.channel || ''}|${r.kind || ''}|${String(r.text || '').replace(/\s+/g, '')}`)).slice(0, 16)
const keysOf = (r) => [r.id ? `id:${r.id}` : '', contentKey(r)].filter(Boolean)

const atMs = (r) => { const t = Date.parse(String(r.at || '')); return Number.isFinite(t) ? t : 0 }

/**
 * 全量导出（只读）。每条事件带 role；冷档那条带 cold:true。
 * @returns {{ok:boolean, file:string, manifest:string, total:number, coldIncluded:boolean, counts:object}}
 */
export function exportAll({ roles = ROLES, out = '', days = 0, now = '' } = {}) {
  const at = String(now || new Date().toISOString())
  const file = out || `备份-${at.slice(0, 10)}.jsonl`
  const since = days ? Date.now() - days * 86400e3 : 0
  const rows = []
  const counts = {}
  const meta = {}
  for (const role of roles) {
    const doc = readJson(memFile(role), null) || {}
    const hot = Array.isArray(doc.events) ? doc.events : []
    const cold = readCold(role)
    const take = (ev) => (since && atMs(ev) < since ? null : ev)
    let nHot = 0
    let nCold = 0
    const seen = new Set()
    for (const ev of hot) {
      const keep = take(ev)
      if (!keep) continue
      if (keysOf(keep).some((k) => seen.has(k))) continue // 同一条在两处都有：只导一次
      for (const k of keysOf(keep)) seen.add(k)
      rows.push({ role, ...keep, cold: false })
      nHot += 1
    }
    for (const ev of cold) {
      const keep = take(ev)
      if (!keep) continue
      if (keysOf(keep).some((k) => seen.has(k))) continue
      for (const k of keysOf(keep)) seen.add(k)
      rows.push({ role, ...keep, cold: true })
      nCold += 1
    }
    if (nHot || nCold) {
      counts[role] = { events: nHot, cold: nCold, total: nHot + nCold }
      // 重建要的不只是流水：摘要/习惯/关系/印象也要能搬回去，否则「有 200 条流水、没人设」。
      meta[role] = {
        version: doc.version ?? 1,
        updatedAt: String(doc.updatedAt || ''),
        summary: String(doc.summary || ''),
        habits: Array.isArray(doc.habits) ? doc.habits : [],
        dynamics: Array.isArray(doc.dynamics) ? doc.dynamics : [],
        impressions: doc.impressions && typeof doc.impressions === 'object' ? doc.impressions : {},
      }
    }
  }
  const body = rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
  writeAtomic(file, body)
  const total = rows.length
  const coldIncluded = rows.some((r) => r.cold)
  const manifestFile = file.replace(/\.jsonl$/i, '') + '.manifest.json'
  const manifest = {
    format: 1,
    at,
    device: device(),
    coldIncluded,
    total,
    counts,
    sha256: sha256(Buffer.from(body, 'utf8')),
    roles: meta,
  }
  writeAtomic(manifestFile, JSON.stringify(manifest, null, 1) + '\n')
  return { ok: true, file, manifest: manifestFile, total, coldIncluded, counts, device: manifest.device }
}

/**
 * 全量重建（--replace）：用一份全量导出把本机记忆整份换回来。
 * 为什么存在：丢了要能重建，而且重建后条数能和清单对上——否则备份只是一堆好看的文件。
 * 安全：替换前旧文件另存 .bak-replace-<时间>；不属于本次导入的字段原样留着。
 * 热档只留最后 DEFAULT_MAX 条，超出的写进冷档（只增不删），不会静默消失。
 */
export function importReplace({ file = '', roles = [], dry = false, force = false, now = '' } = {}) {
  if (!file || !fs.existsSync(file)) return { ok: false, reason: '要一份全量导出文件（--file）' }
  const at = String(now || new Date().toISOString())
  const body = fs.readFileSync(file, 'utf8')
  const manifestFile = file.replace(/\.jsonl$/i, '') + '.manifest.json'
  const manifest = readJson(manifestFile, null)
  if (manifest && manifest.sha256 && manifest.sha256 !== sha256(Buffer.from(body, 'utf8')) && !force) {
    return { ok: false, reason: '和清单里的 sha256 对不上（文件被改过？确认要导就加 --force）', expect: manifest.sha256 }
  }
  const rows = []
  let badLines = 0
  for (const line of body.split('\n')) {
    if (!line.trim()) continue
    try {
      const r = JSON.parse(line)
      if (r && typeof r.text === 'string' && r.role) rows.push(r)
      else badLines += 1
    } catch { badLines += 1 }
  }
  const want = roles.length ? roles : [...new Set(rows.map((r) => r.role))]
  const report = { ok: true, dry: Boolean(dry), file, manifest: manifest ? manifestFile : '', badLines, roles: {}, total: rows.length, coldIncluded: Boolean(manifest?.coldIncluded) }
  for (const role of want) {
    if (!ROLES.includes(role)) { report.roles[role] = { skipped: '不认识的角色' }; continue }
    const mine = rows.filter((r) => r.role === role)
    if (!mine.length) { report.roles[role] = { skipped: '这份里没有它的条目' }; continue }
    // 去重：先按 id、再按内容键；同一件事只留一条（重复导入不会越导越多）
    const seen = new Set()
    const uniq = []
    for (const r of mine) {
      const ks = keysOf(r)
      if (ks.some((k) => seen.has(k))) continue
      for (const k of ks) seen.add(k)
      const { role: _r, coldFile: _f, ...ev } = r
      uniq.push({ ...ev, cold: Boolean(ev.cold) })
    }
    // 顺序：at 优先，同秒按 seq（逻辑时钟），再按 id 定死，保证同一份输入导出同样的结果。
    uniq.sort((a, b) => (atMs(a) - atMs(b)) || ((Number(a.seq) || 0) - (Number(b.seq) || 0)) || String(a.id || '').localeCompare(String(b.id || '')))
    const hot = uniq.slice(-DEFAULT_MAX).map(({ cold: _c, ...rest }) => rest)
    const rest = uniq.slice(0, Math.max(0, uniq.length - DEFAULT_MAX))
    const meta = manifest?.roles?.[role] || {}
    const oldDoc = readJson(memFile(role), null)
    // 冷档：只补本机还没有的那些（按 id / 内容键认），重跑不堆副本。
    let coldWrote = 0
    if (!dry) {
      const have = new Set(readCold(role).flatMap(keysOf))
      const byDay = new Map()
      for (const r of rest) {
        if (keysOf(r).some((k) => have.has(k))) continue
        const day = String(r.at || at).slice(0, 10)
        if (!byDay.has(day)) byDay.set(day, [])
        byDay.get(day).push(r)
      }
      const dir = coldWriteDir(role)
      for (const [day, list] of byDay) {
        fs.mkdirSync(dir, { recursive: true })
        const f = path.join(dir, `${day}.jsonl`)
        // cold:true 是导出文件里的运输标记，不写进冷档本身（冷档里就是事件，和 archiveDropped 一致）。
        const body = list.map(({ cold: _c, ...ev }) => JSON.stringify(ev)).join('\n') + '\n'
        fs.appendFileSync(f, body, 'utf8')
        coldWrote += list.length
      }
    }
    const doc = {
      ...(oldDoc || {}),
      version: meta.version ?? oldDoc?.version ?? 1,
      updatedAt: at,
      events: hot,
      ...(meta.summary !== undefined ? { summary: meta.summary } : {}),
      ...(meta.habits ? { habits: meta.habits } : {}),
      ...(meta.dynamics ? { dynamics: meta.dynamics } : {}),
      ...(meta.impressions ? { impressions: meta.impressions } : {}),
    }
    let backup = ''
    if (!dry) {
      const target = memFile(role)
      if (fs.existsSync(target)) {
        backup = `${target}.bak-replace-${Date.now()}`
        try { fs.copyFileSync(target, backup) } catch { backup = '' }
      }
      writeAtomic(target, JSON.stringify(doc, null, 2) + '\n')
    }
    report.roles[role] = { hot: hot.length, coldRestored: dry ? rest.length : coldWrote, coldInExport: rest.length, backup }
  }
  return report
}

/** 现在本机有多少：热档条数 + 冷档条数（只读，不上锁、不改任何东西）。 */
export function fullStatus({ roles = ROLES } = {}) {
  const out = {}
  for (const role of roles) {
    const doc = readJson(memFile(role), null)
    out[role] = { hot: Array.isArray(doc?.events) ? doc.events.length : 0, cold: readCold(role).length, file: memFile(role) }
  }
  return { ok: true, home: HOME, roles: out, seqFile: path.join(DATA, 'sync', 'seq.json') }
}

// ── CLI ────────────────────────────────────────────────────────────
export function main(argv = process.argv.slice(2)) {
  const cmd = argv[0] || ''
  const val = (n, d = '') => { const i = argv.indexOf('--' + n); return i >= 0 ? String(argv[i + 1] || '') : d }
  const has = (n) => argv.includes('--' + n)
  const roleArg = val('role', '')
  const roles = roleArg ? [roleArg] : ROLES
  if (cmd === 'export') {
    // --all 是方案里的显式写法；不带它也是同样的口径（兜底导出必须含冷档），这里只为兼容写法。
    const r = exportAll({ roles, out: val('out', ''), days: Number(val('days', '0')) || 0 })
    console.log(JSON.stringify(r, null, 1))
    if (r.ok) console.log(`导出全量：${r.total} 条（冷档 ${Object.values(r.counts).reduce((n, c) => n + c.cold, 0)} 条，coldIncluded=${r.coldIncluded}）→ ${r.file}`)
    return r.ok ? 0 : 2
  }
  if (cmd === 'import') {
    const r = importReplace({ file: val('file', ''), roles, dry: has('dry'), force: has('force') })
    console.log(JSON.stringify(r, null, 1))
    if (r.ok) {
      const parts = Object.entries(r.roles).map(([role, c]) => c.skipped ? `${role}:跳过(${c.skipped})` : `${role}:热档 ${c.hot} 条${c.coldRestored ? `，冷档补回 ${c.coldRestored} 条` : ''}`)
      console.log(`导入${r.dry ? '（dry，没写）' : '（已替换）'}：${parts.join('｜')}`)
    } else {
      console.error(`失败：${r.reason || '未知原因'}`)
    }
    return r.ok ? 0 : 2
  }
  if (cmd === 'status' || !cmd) {
    console.log(JSON.stringify(fullStatus({ roles }), null, 1))
    return 0
  }
  console.error('用法：node sync/full.mjs export --all --out <file> | import --replace --file <file> [--dry] | status')
  return 2
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exit(main())
