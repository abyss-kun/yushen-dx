// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 内容谱系：关键文件（角色卡 / 宪章 / 记忆 / 契约 / 认主）每轮留一枚内容指纹，
// **内容倒退就报警**，别默默盖。
//
// 改｜2026-11-01 09:05｜照微·工作台｜授权：主人（安全与权限归我，2026-10-31 分配）｜
// 新增本文件；scripts/check-lineage.mjs（命令行）、scripts/test-content-lineage.mjs（自测）、
// dayu/index.js 每日 tick 接一行｜
// 为什么：缺口5——备份只按时间挑、fingerprint 只数文件数+字节+mtime，全仓没有一处比内容；
// 17:00 那份备份里装的是 10-24 的旧卡｜
// 可改：判据（"以前来过=倒退"）不要放宽，只许更严
//
// 为什么要有它（2026-10-31 真事）：同一张卡，17:00 那份备份里是 10-24 的旧版（18867B），
// 12:27 那份备份里才是 10-30 的新版（19266B）。备份只按目录/文件时间挑新的；
// lib/fingerprint.js 的变更指纹也只数「文件数 + 总字节 + mtime」——**全仓没有一处比内容**。
// 于是「备份很新、内容很旧」能一路静默，直到真有人拿它去还原的那天。
//
// 判据（明说，能验）：现网这一版的 hash 如果**在历史里出现过**，就是倒退——
// 不是"看起来旧"，是这串字节以前就来过。第一次见到的内容只记基线、不报。
//
// 两个入口：
//   observe() 记账 + 报倒退（写入台账；备份成功后调它）
//   check()   只读比对、不写盘（给 verifyBackup / 体检用，体检必须只读）
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { dayuHome } from './paths.js'

const VERSION = 1
// 每个文件留最近 12 版。留多了没用：要判的是"倒退到哪一版"，不是"存了多少历史"。
const KEEP = 12

/** 哪类文件算"倒退就出事"——身份、规矩、记忆、契约、认主。 */
export function criticalFiles(dir = dayuHome()) {
  const out = []
  const add = (rel) => {
    const abs = path.join(dir, rel)
    if (fs.existsSync(abs)) out.push({ rel: rel.replace(/\\/g, '/'), abs })
  }
  add('charter.json')
  add('owner.json')
  add('contract/契约.json')
  for (const sub of ['soul/cards', 'soul/memory']) {
    const d = path.join(dir, sub)
    if (!fs.existsSync(d)) continue
    for (const n of fs.readdirSync(d)) {
      if (/\.(md|json)$/i.test(n)) add(path.join(sub, n).replace(/\\/g, '/'))
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel))
}

function sha(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16)
}

export function ledgerPath(dir = dayuHome()) {
  return path.join(dir, 'state', 'content-lineage.json')
}

/**
 * 报警要留档，不能只在发现的那一分钟喊一声。
 * 台账会把"倒退回来的那一版"收作最新版（不然每天都会报同一件事），
 * 所以倒退本身必须另存一条——事后有人问"上周是不是被换回去过"，能查得到。
 */
export function alertsPath(dir = dayuHome()) {
  return path.join(dir, 'state', 'content-lineage-alerts.jsonl')
}

export function readAlerts(dir = dayuHome()) {
  try {
    return fs.readFileSync(alertsPath(dir), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

export function readLedger(dir = dayuHome()) {
  try {
    const j = JSON.parse(fs.readFileSync(ledgerPath(dir), 'utf8').replace(/^\uFEFF/, ''))
    if (!j || typeof j.files !== 'object') return { version: VERSION, files: {} }
    return { version: VERSION, files: j.files }
  } catch {
    return { version: VERSION, files: {} }
  }
}

function writeLedger(ledger, dir = dayuHome()) {
  const p = ledgerPath(dir)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = `${p}.tmp-${process.pid}`
  fs.writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, p)
}

/**
 * 只比对、不写盘。返回 { checked, regressions }。
 * regression = { file, backTo, previousAt, size }：
 *   现网这一版以前来过（backTo 是第一次见到它的时间），而上一版是 previousAt。
 */
export function check({ dir = dayuHome() } = {}) {
  const ledger = readLedger(dir)
  const regressions = []
  const files = criticalFiles(dir)
  for (const f of files) {
    let buf
    try { buf = fs.readFileSync(f.abs) } catch { continue }
    const h = sha(buf)
    const history = ledger.files[f.rel] || []
    const last = history[history.length - 1]
    if (!last || last.h === h) continue
    const seen = history.find((e) => e.h === h)
    if (seen) regressions.push({ file: f.rel, backTo: seen.at, previousAt: last.at, size: buf.length })
  }
  return { checked: files.length, regressions }
}

/** 记一笔指纹，同时把倒退报出来。备份成功后调它（可以写盘）。 */
export function observe({ dir = dayuHome(), now = Date.now() } = {}) {
  const ledger = readLedger(dir)
  const at = new Date(now).toISOString()
  const scanned = criticalFiles(dir)
  const regressions = []
  const changed = []
  for (const f of scanned) {
    let buf
    try { buf = fs.readFileSync(f.abs) } catch { continue }
    const h = sha(buf)
    const history = Array.isArray(ledger.files[f.rel]) ? ledger.files[f.rel] : []
    const last = history[history.length - 1]
    if (last && last.h === h) continue
    if (last) {
      const seen = history.find((e) => e.h === h)
      if (seen) regressions.push({ file: f.rel, backTo: seen.at, previousAt: last.at, size: buf.length })
    }
    history.push({ h, at, size: buf.length })
    ledger.files[f.rel] = history.slice(-KEEP)
    changed.push(f.rel)
  }
  if (changed.length) writeLedger(ledger, dir)
  // 倒退另存一条：台账会把退回来的那版收作最新（不然天天报同一件事），
  // 只留在内存里等于没报——发现的人那分钟没看，就永远看不见了。
  if (regressions.length) {
    try {
      const p = alertsPath(dir)
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.appendFileSync(p, regressions.map((g) => JSON.stringify({ at, ...g }) + '\n').join(''), 'utf8')
    } catch { /* 报警留档失败不许影响主流程，但也不能假装存上了——返回值里还有 regressions */ }
  }
  return { checked: scanned.length, changed, regressions }
}
