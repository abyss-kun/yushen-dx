/* 标签
 * id: offline-ticks
 * kind: module
 * tags: 离线, 账本结算, 阶位, 通道记忆, 不占宿主
 * created: 2026-11-04 14:55:00
 * changed: 2026-11-04 16:22:28
 * author: 照微·工作台
 * authority: 老板（2026-11-04：能放电脑里的别放宿主，卡卡的容易把宿主搞崩）
 * why: 这三件（账本结算 5 分钟一次、阶位每小时重算、通道记忆回写）都是纯本地文件活，原来都在宿主定时器里
 * result: 搬成离线脚本，由 maintenance 每小时调；每个自带护栏，重启也不会重复干
 * mutable: 可改
 */
// 用法：node scripts/offline-ticks.mjs [--dry] [--only settle|rank|channel]
// 输出一份 JSON（调用方直接 parse）。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 2026-11-04 老板：本地进程不能占着不放（宿主崩了也得能修）。硬超时自己退。
import { hardTimeout } from '../lib/offline-guard.js'
hardTimeout(10, 'offline-ticks.mjs')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const D = path.join(HOME, 'dayu')
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const onlyIdx = args.indexOf('--only')
const only = onlyIdx >= 0 ? String(args[onlyIdx + 1] || '') : ''

const out = { settle: '', rank: [], channel: '', skipped: [] }
const readState = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return {} } }
const writeState = (f, o) => { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n', 'utf8') } catch { /* 记不上不影响 */ } }
const now = Date.now()

// ① 账本结算（宿主原来 5 分钟一次；这里 5 分钟护栏，维护每小时跑一次也够）
if (!only || only === 'settle') {
  try {
    const { settleSpend } = await import(pathToFileURL(path.join(ROOT, 'lib', 'cost.js')).href)
    const stateFile = path.join(D, 'state', 'settle.json')
    if (!dry && now - (Number(readState(stateFile).at) || 0) > 5 * 60 * 1000) {
      const r = settleSpend()
      out.settle = r && r.ok === false ? `结算失败：${r.reason || ''}` : '结算完成'
      writeState(stateFile, { at: now })
    } else if (dry) out.settle = 'dry：会结算一次'
    else out.skipped.push('结算：5 分钟内刚跑过')
  } catch (e) { out.settle = `结算没跑成：${String(e?.message || e).slice(0, 60)}` }
}

// ② 阶位重算（宿主原来每小时；这里每小时护栏）
if (!only || only === 'rank') {
  try {
    const { status: rankStatus, recompute: rankRecompute, RANK_ROLES, RANK_LABEL } = await import(pathToFileURL(path.join(ROOT, 'lib', 'rank.js')).href)
    const { listJobs } = await import(pathToFileURL(path.join(ROOT, 'lib', 'jobs-book.js')).href).catch(() => ({ listJobs: null }))
    const jobsMod = listJobs ? null : await import(pathToFileURL(path.join(ROOT, 'core', 'jobs.js')).href)
    const jobs = (listJobs || jobsMod?.readAll || (() => []))()
    const verifiedJobs = jobs.filter((j) => ['done', 'verified', 'passed'].includes(String(j.status))).length
    let openIncidents = 0
    try {
      const inc = JSON.parse(fs.readFileSync(path.join(D, 'incidents.json'), 'utf8'))
      openIncidents = (Array.isArray(inc) ? inc : []).filter((i) => ['open', 'fixing'].includes(String(i.status))).length
    } catch { /* 没事故单就是 0 */ }
    let daysActive = 0
    try {
      const t = Number(JSON.parse(fs.readFileSync(path.join(D, 'growth.json'), 'utf8')).installedAt)
      if (Number.isFinite(t)) daysActive = Math.floor((now - t) / 86400000)
    } catch { /* 没有就从 0 天算 */ }
    const stateFile = path.join(D, 'state', 'rank.json')
    if (!dry && now - (Number(readState(stateFile).at) || 0) > 60 * 60 * 1000) {
      const ev = { verifiedJobs, openIncidents, daysActive }
      for (const role of RANK_ROLES) {
        const before = rankStatus(role)
        try {
          const r = rankRecompute(role, ev)
          if (r.advanced) {
            out.rank.push(`${role}：${before.rank} → ${r.rank}（${RANK_LABEL[r.rank]}）`)
            try {
              const { recordChange } = await import(pathToFileURL(path.join(ROOT, 'lib', 'changes-log.js')).href)
              recordChange({ who: '自动维护（照微）', action: 'edit', what: `阶位升级：${role} ${before.rank} → ${r.rank}`, why: '证据够了（派活/事故/天数）', authority: '主人（自动维护）' })
            } catch { /* 记不上不影响 */ }
          }
        } catch { /* 单个角色失败不影响别的 */ }
      }
      writeState(stateFile, { at: now, ev })
    } else if (dry) out.rank.push(`dry：证据 成单 ${verifiedJobs} / 开单 ${openIncidents} / ${daysActive} 天`)
    else out.skipped.push('阶位：1 小时内刚算过')
  } catch (e) { out.rank.push(`阶位没跑成：${String(e?.message || e).slice(0, 60)}`) }
}

// ③ 通道记忆回写（宿主原来 5 分钟；这里 5 分钟护栏）
if (!only || only === 'channel') {
  try {
    const { syncChannelMemory } = await import(pathToFileURL(path.join(ROOT, 'lib', 'channel-memory.js')).href)
    const stateFile = path.join(D, 'state', 'channel-sync.json')
    if (!dry && now - (Number(readState(stateFile).at) || 0) > 5 * 60 * 1000) {
      const r = syncChannelMemory({ limit: 200 })
      out.channel = r && r.ok === false ? `回写失败：${r.reason || ''}` : `回写完成${r && r.added != null ? `（${r.added} 条）` : ''}`
      writeState(stateFile, { at: now })
    } else if (dry) out.channel = 'dry：会回写一次'
    else out.skipped.push('通道记忆：5 分钟内刚跑过')
  } catch (e) { out.channel = `回写没跑成：${String(e?.message || e).slice(0, 60)}` }
}

console.log(JSON.stringify({ at: new Date(now).toISOString(), dry, ...out }, null, 2))
