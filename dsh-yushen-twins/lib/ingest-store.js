/* 标签
 * id: lib-ingest-store
 * kind: module
 * summary: 手抄本最底层：只负责把一行 JSON 写进去（去重、按天分文件），不判断值不值得记。
 * audience: 框架（事件/经历/知识三层的写入口）
 * owner: 框架；布局与 id 口径别动
 * mutable: 可改（只加不收；要加层先想"不新建存储"）
 * defaults: 层次：经历 / 事件 / 知识
 * usage: appendRow 写一行；layerFileOf/pendingFileOf 定位文件；summarize 做浅层短串
 * off: 不能单独关（上游不调就不写）
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 22:35｜大鱼·子会话（工作台）｜授权：主人（本次任务书：三条来源都要进手抄本）｜lib/ingest-store.js:1-160｜新增：手抄本的第三套写入口（经历/事件/知识三层共用一套追加、去重、待提炼指针、按天聚合覆盖）｜为什么：原来的手抄本只有「对话」一条写入口（library-chain）；三条新来源各抄一份 jsonl 写入，迟早出现三种 id 口径、三种指针格式，重复入库又没人看得见｜验证：node --check lib/ingest-store.js；node scripts/test-ingest-actions.mjs / test-ingest-events.mjs / test-ingest-culture.mjs 全过｜可改：可改（id 算法与文件布局别动；要加层先想清楚「不新建存储」那条）
//
// 手抄本的最底一层：只负责「一行 JSON 写进去」，不判断内容值不值得记。
//
// 布局（和 library.mjs 的 手抄本/<类别>/<日>.jsonl 一致；和 library-chain 的
// 手抄本/<通道>/<日>.jsonl 并存——通道是「在哪说的」，类别是「是什么」）：
//   手抄本/经历/<日>.jsonl   她干过的活（工具调用）
//   手抄本/事件/<日>.jsonl   心跳 / 体检 / 群消息（按天聚合成一行）
//   手抄本/知识/<日>.jsonl   书上来的（culture 单向同步）
//   待提炼/<同名>/<日>.jsonl  指针（只放 id/kind/at/ref/state，等精提炼）
//
// 三条不变量：
//   ① 写不进去不抛错——返回 {ok:false, err}，调用方自己决定要不要 log；
//   ② 同一 id 同一天只写一次（进程内缓存，和 library-chain 一个口径）；
//   ③ 聚合类（事件）用 upsertRow：同 id 覆盖成「最新一条 + count」。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { localISO, today } from './clock.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
export const LIB = path.join(HOME, 'dayu', 'library')
export const LAYERS = Object.freeze(['经历', '事件', '知识'])

export const sha = (s, n = 10) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, n)
export const clip = (s, n = 120) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

export const layerFileOf = (layer, day) => path.join(LIB, '中层', String(layer), `${day}.jsonl`)
export const pendingFileOf = (layer, day) => path.join(LIB, '待提炼', String(layer), `${day}.jsonl`)

/** 一个时刻 → { at, day }；at 认 Date / ISO / 缺省（现在）。认不出就退回现在，不抛。 */
export function stamp(at) {
  let d
  if (at instanceof Date) d = at
  else if (typeof at === 'number' && Number.isFinite(at)) d = new Date(at)
  else if (typeof at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(at.trim())) {
    // 只有日期（culture 的 at 就是这样）：按本地零点算，别让 new Date('2026-11-02') 解释成 UTC
    // ——那会变成北京时间 08:00，账本上多出一段谁都没干过的上午。
    const [y, m, dd] = at.trim().split('-').map(Number)
    d = new Date(y, m - 1, dd, 0, 0, 0)
  } else if (at) d = new Date(String(at))
  if (!d || Number.isNaN(d.getTime())) d = new Date()
  const iso = localISO(d)
  return { at: iso, day: today(d) }
}

/**
 * 给去重 key 用的「摘要」：浅层、短、稳定。
 * 不做深拷贝 stringify——工具结果可能有几十万字，每调一次工具就全序列化一遍太亏。
 */
export function summarize(value, max = 120) {
  const one = (v) => {
    if (v === null || v === undefined) return ''
    if (typeof v === 'string') return v
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    if (v instanceof Error) return `${v.name}: ${v.message}`
    if (Array.isArray(v)) return `[${v.length}项]`
    if (typeof v === 'object') {
      const keys = Object.keys(v)
      const head = keys.slice(0, 5).map((k) => {
        const x = v[k]
        if (x === null || x === undefined) return k
        if (typeof x === 'object') return Array.isArray(x) ? `${k}[${x.length}]` : `${k}{}`
        return `${k}=${clip(x, 20)}`
      }).join(',')
      return `{${head}${keys.length > 5 ? ',…' : ''}}`
    }
    return String(v)
  }
  const text = clip(one(value), max)
  // 空串也要能当 key 的一段：用固定占位，免得三种来源的空值撞成同一个 id。
  return text || '-'
}

export function readRows(file) {
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  const out = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch { /* 坏行跳过，不吵 */ }
  }
  return out
}

// 文件 → 已写过的 id；一个进程只读一次（和 library-chain 的 seenCache 一个口径）。
const seenCache = new Map()
function seenIds(file) {
  let s = seenCache.get(file)
  if (s) return s
  s = new Set()
  for (const row of readRows(file)) if (row?.id) s.add(String(row.id))
  seenCache.set(file, s)
  return s
}

function appendLines(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
}

/** 追加若干行：同 id 已写过就跳过；返回真写进去的条数。 */
export function writeRows({ layer, day, rows = [], pending = false, archive = true } = {}) {
  // 2026-11-15：旧 ingest 不再默认写「待提炼」；新数据统一进中层（手抄本 state=queued）。
  // pending=true 只留给旧数据迁移/显式兼容，不再默认开。
  try {
    const list = rows.filter(Boolean)
    if (!list.length) return { ok: true, added: 0, file: layerFileOf(layer, day) }
    const file = layerFileOf(layer, day)
    const seen = seenIds(file)
    const fresh = list.filter((r) => r?.id && !seen.has(String(r.id)))
      .map((r) => ({ ...r, state: r.state || 'queued' }))
    if (fresh.length && archive) {
      appendLines(file, fresh)
      for (const r of fresh) seen.add(String(r.id))
    }
    let ptrs = 0
    if (pending && fresh.length) {
      const pf = pendingFileOf(layer, day)
      const pseen = seenIds(pf)
      const list2 = fresh
        .filter((r) => !pseen.has(String(r.id)))
        .map((r) => ({ id: r.id, kind: r.kind, layer, at: r.at, ref: r.ref || '', state: 'pending' }))
      if (list2.length) {
        appendLines(pf, list2)
        for (const p of list2) pseen.add(String(p.id))
        ptrs = list2.length
      }
    }
    return { ok: true, added: fresh.length, pending: ptrs, file }
  } catch (e) {
    return { ok: false, added: 0, err: clip(e?.message || e, 120) }
  }
}

/**
 * 聚合类写入：同一个 id 只留最新一条，count 累加。
 * 心跳一天几十次，如果每次追加一行，手抄本当天就被灌满——这条就是为它写的。
 * 返回合并后的整行（含 count / firstAt），写失败返回 null。
 */
export function upsertRow(file, row, increment = 1) {
  try {
    if (!row?.id) return null
    const step = Math.max(1, Math.round(Number(increment) || 1))
    const lines = []
    let prev = null
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { /* 第一天还没有文件 */ }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let parsed = null
      try { parsed = JSON.parse(line) } catch { lines.push(line); continue }
      if (String(parsed?.id) === String(row.id)) { prev = parsed; continue }
      lines.push(line)
    }
    const merged = {
      ...row,
      count: (Number(prev?.count) || 0) + step,
      firstAt: prev?.firstAt || row.firstAt || row.at,
      updatedAt: row.at,
    }
    lines.push(JSON.stringify(merged))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // 覆盖写走临时文件再 rename：写到一半断电也不会把当天几十行对话/经历一起弄坏。
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, lines.join('\n') + '\n', 'utf8')
    fs.renameSync(tmp, file)
    // 覆盖过就作废缓存，免得后面的 writeRows 以为「已写过」。
    seenCache.delete(file)
    return merged
  } catch {
    return null
  }
}

/** 旧「待提炼」指针：2026-11-15 起新数据已直接进中层 state=queued，不再写旧队列。 */
export function ensurePointer() {
  return false
}
