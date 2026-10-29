// 遗忘：她自己的清理能力。
//
// 为什么要它：磁盘有限，而备份/记录只会长。设计说明里写着“历史版本不覆盖、默认不清理”，
// 于是三天长出 1.3 GB——其中 89% 是备份库，不是她说过的话。
//
// 边界（写死）：
//   1. 白名单永不删：宪章、角色卡、底线、点化、主人绑定、决策台账、修复档案、最近 7 天账本；
//   2. 删之前先进冷档（压一份放 cold/），能捞回来；
//   3. 每一笔都记账（forget.jsonl），老板随时能查“扔了什么、为什么、什么时候”；
//   4. 删的是“可再生的”：备份快照、没人引用的备份对象、安装包副本；
//   5. dryRun 是默认：不看清单不删。
//
// 数据：~/.dsh/dayu/retention.json（老板可改）、forget.jsonl（账）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'
import { pipeline } from 'node:stream/promises'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const PROT = path.join(DATA, 'protection')
const SNAP_DIR = path.join(PROT, 'store', 'snapshots')
const OBJ_DIR = path.join(PROT, 'store', 'objects')
const ART_MANIFEST = path.join(PROT, 'software-artifacts', 'artifacts')
const ART_OBJECTS = path.join(PROT, 'software-artifacts', 'objects')
const COLD = path.join(PROT, 'cold')
const POLICY_FILE = path.join(DATA, 'retention.json')
const LOG = path.join(DATA, 'forget.jsonl')

/** 默认策略：老板可以在 retention.json 里改，改了立即生效。 */
export const DEFAULT_POLICY = Object.freeze({
  version: 1,
  note: '默认：最近 24 份快照全留，再往前每天留一份，最多 30 天；安装包副本留 7 天。',
  // 自动清理默认**关**：删是不可逆的，第一次必须人看过清单再打开。
  // 2026-10-26 的教训：默认开着，开机 90 秒就自己删了 115 份快照——她要的"先 dry-run 看一眼"被跳过了。
  auto: { enabled: false, minHoursBetweenRuns: 20, firstReviewRequired: true },
  snapshots: { keepRecent: 24, keepDaily: 30 },
  objects: { keepReferenced: true, minAgeHours: 24 }, // 只回收没人引用、且过一天的
  artifacts: { keepDays: 7, keepNewest: 1, keepManifest: true },
  maxBytesPerRun: 3 * 1024 * 1024 * 1024, // 一次最多扔 3 GB，防手滑
  whitelist: [
    'charter.json', 'residence.json', 'soul/', 'baseline/', 'decisions.jsonl',
    'incidents.json', 'incidents-closed/', 'repair/', 'runtime/', 'handoff/',
    'owner.json', 'owner-veto', 'retention.json', 'inbox/.reads.json',
  ],
})

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

/** 策略：文件里有的覆盖默认值（浅合并两层够用）。 */
export function policy() {
  const raw = readJson(POLICY_FILE, null)
  if (!raw) {
    try { writeJsonAtomic(POLICY_FILE, DEFAULT_POLICY) } catch { /* 写不了就用默认 */ }
    return { ...DEFAULT_POLICY, ...{}, source: 'default' }
  }
  return {
    ...DEFAULT_POLICY,
    ...raw,
    auto: { ...DEFAULT_POLICY.auto, ...(raw.auto || {}) },
    snapshots: { ...DEFAULT_POLICY.snapshots, ...(raw.snapshots || {}) },
    objects: { ...DEFAULT_POLICY.objects, ...(raw.objects || {}) },
    artifacts: { ...DEFAULT_POLICY.artifacts, ...(raw.artifacts || {}) },
    source: 'file',
  }
}

function sizeOf(file) { try { return fs.statSync(file).size } catch { return 0 } }
function dirStats(dir) {
  let files = 0; let bytes = 0
  const walk = (d) => {
    let list = []
    try { list = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of list) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else { files += 1; bytes += sizeOf(p) }
    }
  }
  walk(dir)
  return { files, bytes }
}

function listSnapshots() {
  let names = []
  try { names = fs.readdirSync(SNAP_DIR).filter((n) => n.endsWith('.json')) } catch { return [] }
  const out = []
  for (const name of names) {
    const file = path.join(SNAP_DIR, name)
    const mtime = (() => { try { return fs.statSync(file).mtime } catch { return new Date(0) } })()
    out.push({ name, file, mtime, bytes: sizeOf(file) })
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

/** 留哪些快照：最近 N 份 + 每天第一份，最多 D 天。 */
function pickSnapshots(list, cfg) {
  const keep = new Set()
  for (const s of list.slice(0, Math.max(1, Number(cfg.keepRecent) || 24))) keep.add(s.name)
  const seenDay = new Map()
  for (const s of list) {
    const day = s.mtime.toISOString().slice(0, 10)
    if (!seenDay.has(day)) seenDay.set(day, s)
  }
  let n = 0
  for (const [, s] of seenDay) {
    if (n >= Math.max(1, Number(cfg.keepDaily) || 30)) break
    keep.add(s.name)
    n += 1
  }
  return { keep, drop: list.filter((s) => !keep.has(s.name)) }
}

/** 被保留的快照引用了哪些对象（hash 就是文件名）。 */
function referencedHashes(kept) {
  const refs = new Set()
  for (const s of kept) {
    const doc = readJson(s.file, null)
    for (const f of doc?.files || []) if (f?.hash) refs.add(String(f.hash))
  }
  return refs
}

function listObjects(dir) {
  let names = []
  try { names = fs.readdirSync(dir) } catch { return [] }
  return names.map((name) => {
    const file = path.join(dir, name)
    const mtime = (() => { try { return fs.statSync(file).mtime } catch { return new Date(0) } })()
    return { name, file, mtime, bytes: sizeOf(file) }
  })
}

/** 清单：只看不删。 */
export function plan({ now = Date.now() } = {}) {
  const cfg = policy()
  const snaps = listSnapshots()
  const { keep, drop } = pickSnapshots(snaps, cfg.snapshots)
  const keptRows = snaps.filter((s) => keep.has(s.name))

  const refs = referencedHashes(keptRows)
  const minAgeMs = (Number(cfg.objects?.minAgeHours) || 24) * 3600 * 1000
  const objs = listObjects(OBJ_DIR)
  // 兜底：引用集为空说明快照读坏了，宁可不删。
  const safeToGc = refs.size > 0
  const dropObjects = safeToGc
    ? objs.filter((o) => !refs.has(o.name) && now - o.mtime.getTime() > minAgeMs)
    : []

  // 安装包副本：清单留着，大文件到期扔。
  let dropArtifacts = []
  try {
    const manifests = fs.readdirSync(ART_MANIFEST).filter((n) => n.endsWith('.json'))
      .map((name) => {
        const file = path.join(ART_MANIFEST, name)
        const doc = readJson(file, null)
        const at = Date.parse(doc?.createdAt || '') || 0
        return { name, file, hash: String(doc?.hash || ''), size: Number(doc?.size) || 0, at, basename: String(doc?.basename || '') }
      })
      .filter((m) => m.hash)
      .sort((a, b) => b.at - a.at)
    const newest = manifests.slice(0, Math.max(1, Number(cfg.artifacts?.keepNewest) || 1)).map((m) => m.hash)
    const keepDaysMs = (Number(cfg.artifacts?.keepDays) || 7) * 86400 * 1000
    for (const m of manifests) {
      if (newest.includes(m.hash)) continue
      if (now - m.at < keepDaysMs) continue
      const stillReferenced = manifests.slice(0, Math.max(1, Number(cfg.artifacts?.keepNewest) || 1)).some((x) => x.hash === m.hash)
      if (stillReferenced) continue
      dropArtifacts.push(m)
    }
    // 同一个 hash 只删一次
    const seen = new Set()
    dropArtifacts = dropArtifacts.filter((m) => (seen.has(m.hash) ? false : seen.add(m.hash)))
  } catch { dropArtifacts = [] }

  const bytes = drop.reduce((a, s) => a + s.bytes, 0)
    + dropObjects.reduce((a, o) => a + o.bytes, 0)
    + dropArtifacts.reduce((a, m) => a + sizeOf(path.join(ART_OBJECTS, m.hash)), 0)

  return {
    ok: true,
    at: new Date(now).toISOString(),
    policySource: cfg.source,
    snapshots: { total: snaps.length, keep: keptRows.length, drop: drop.map((s) => ({ name: s.name, at: s.mtime.toISOString(), bytes: s.bytes })) },
    objects: { total: objs.length, referenced: refs.size, drop: dropObjects.map((o) => ({ name: o.name, bytes: o.bytes })), safeToGc },
    artifacts: { drop: dropArtifacts.map((m) => ({ name: m.name, basename: m.basename, bytes: sizeOf(path.join(ART_OBJECTS, m.hash)), at: new Date(m.at).toISOString() })) },
    willFreeBytes: bytes,
    willFreeMB: Math.round(bytes / 1048576),
    overCap: bytes > (Number(cfg.maxBytesPerRun) || 0),
  }
}

function coldArchive(rows, dayKey) {
  if (!rows.length) return ''
  const dir = path.join(COLD, dayKey)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `pruned-${Date.now()}.ndjson.gz`)
  const lines = rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
  fs.writeFileSync(file, zlib.gzipSync(Buffer.from(lines, 'utf8'), { level: 9 }))
  return file
}

function appendLog(row) {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true })
    fs.appendFileSync(LOG, `${JSON.stringify(row)}\n`, 'utf8')
  } catch { /* 记不下不挡清理 */ }
}

/**
 * 执行：进冷档 → 删 → 记账。
 * dryRun 默认 true；CLI 要 --yes 才真删。
 */
export async function apply({ dryRun = true, now = Date.now() } = {}) {
  const before = plan({ now })
  if (dryRun) return { ...before, dryRun: true, applied: false }
  const cfg = policy()
  const dayKey = new Date(now).toISOString().slice(0, 10)
  const budget = Number(cfg.maxBytesPerRun) || 0
  let freed = 0
  const done = { snapshots: 0, objects: 0, artifacts: 0, cold: '' }

  // 1) 快照：先把要扔的清单压进冷档，再删。
  const snapRows = before.snapshots.drop
  if (snapRows.length) {
    done.cold = coldArchive(snapRows.map((s) => ({ kind: 'snapshot', ...s })), dayKey)
    for (const s of snapRows) {
      if (budget && freed + s.bytes > budget) break
      try { fs.unlinkSync(path.join(SNAP_DIR, s.name)); freed += s.bytes; done.snapshots += 1 } catch { /* 删不掉就留着 */ }
    }
  }
  // 2) 对象：没人引用、且过了一天。
  for (const o of before.objects.drop) {
    if (budget && freed + o.bytes > budget) break
    try { fs.unlinkSync(path.join(OBJ_DIR, o.name)); freed += o.bytes; done.objects += 1 } catch { /* 同上 */ }
  }
  // 3) 安装包副本：清单留，大文件扔。
  for (const m of before.artifacts.drop) {
    const target = path.join(ART_OBJECTS, m.hash)
    const size = sizeOf(target)
    if (!size) continue
    if (budget && freed + size > budget) break
    try { fs.unlinkSync(target); freed += size; done.artifacts += 1 } catch { /* 同上 */ }
  }

  const row = {
    at: new Date(now).toISOString(),
    action: 'forget/apply',
    freedBytes: freed,
    freedMB: Math.round(freed / 1048576),
    ...done,
    cold: done.cold,
  }
  appendLog(row)
  return { ...before, dryRun: false, applied: true, freed, freedMB: row.freedMB, done }
}

/** 磁盘什么样、下次什么时候清。 */
export function status({ now = Date.now() } = {}) {
  const cfg = policy()
  const snaps = dirStats(SNAP_DIR)
  const objs = dirStats(OBJ_DIR)
  const arts = dirStats(ART_OBJECTS)
  const last = (() => {
    try {
      const rows = fs.readFileSync(LOG, 'utf8').trim().split(/\r?\n/).slice(-5)
      return rows.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean).pop() || null
    } catch { return null }
  })()
  const hours = Number(cfg.auto?.minHoursBetweenRuns) || 20
  const lastAt = Date.parse(last?.at || '') || 0
  return {
    ok: true,
    dir: DATA,
    totalMB: Math.round(dirStats(DATA).bytes / 1048576),
    snapshots: { files: snaps.files, MB: Math.round(snaps.bytes / 1048576) },
    objects: { files: objs.files, MB: Math.round(objs.bytes / 1048576) },
    artifacts: { files: arts.files, MB: Math.round(arts.bytes / 1048576) },
    policy: { auto: cfg.auto, snapshots: cfg.snapshots, objects: cfg.objects, artifacts: cfg.artifacts },
    lastRun: last,
    dueInHours: lastAt ? Math.max(0, Math.round((lastAt + hours * 3600 * 1000 - now) / 3600 / 1000)) : 0,
  }
}

/** 她自己那一趟：到点才跑，只清策略允许的。 */
export async function autoOnce({ now = Date.now(), dryRun = false } = {}) {
  const cfg = policy()
  if (cfg.auto?.enabled === false) return { ok: true, skipped: 'auto-off' }
  const hours = Number(cfg.auto?.minHoursBetweenRuns) || 20
  const last = status({ now }).lastRun
  const lastAt = Date.parse(last?.at || '') || 0
  if (lastAt && now - lastAt < hours * 3600 * 1000) return { ok: true, skipped: 'not-due' }
  const p = plan({ now })
  if (!p.snapshots.drop.length && !p.objects.drop.length && !p.artifacts.drop.length) {
    return { ok: true, skipped: 'nothing-to-forget' }
  }
  return apply({ dryRun, now })
}
