/* 标签
 * id: memory-core-heartbeat
 * kind: module
 * summary: 心跳的共享内核：按角色追加/读取/汇总心跳行，只存不判；鱼神与 dsh-memory 共用这一份实现。
 * tags: 心跳, 共享内核, 通用设施, 独立插件
 * created: 2026-11-11 01:10:00
 * changed: 2026-11-11 01:05:34
 * author: 大鱼·子代理（闭环 P2）
 * authority: 老板（2026-11-11 01:0x：「心跳接入记忆插件」；「留一手不全塞进去」）
 * why: 心跳原来是鱼神私有的 lib 实现，dsh-memory 装给外面角色时看不到；而心跳和记忆一样是"按角色的事实流"，本来就该在共享内核里
 * result: append(role,row) / read(role,{day,days}) / summary(role,{days})，只依赖 node 内置；行格式与鱼神原实现逐字节一致
 * mutable: 可改（只许加只读能力；**不许在这里判 trigger/whyNot 的语义**——那是角色的判断，留在鱼神）
 * audience: 鱼神（lib/heartbeat-journal.js 转调它）、dsh-memory（独立壳的工具）、未来别的角色插件
 * owner: 框架；改行格式或路径要老板点头（有测试和面板盯着）
 * defaults: 数据落 $DSH_HOME/dayu/heartbeat/<本地日期>.jsonl（一天一个文件）
 * usage: append(role,{trigger:'兜底',did:'…'}) → {ok,file,row}；read(role,{days:2}) → 新→旧；summary(role) → 今天的计数
 * off: 不接写入口就只剩空文件；已写的行不删（只增不改）
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-11 01:1x｜大鱼·子代理（闭环 P2）｜授权：老板（2026-11-11：「心跳接入记忆插件」「留一手不全塞进去」）｜memory-core/heartbeat.mjs:1-…｜新增：心跳的共享内核（append/read/summary）｜为什么：心跳按角色存、和记忆同构，属于通用设施；放在共享内核里，鱼神和 dsh-memory 都调同一份，不用各写一遍（两份就是两套账）｜验证：node --check；scripts/test-heartbeat-core.mjs；鱼神侧 test-heartbeat-journal 仍 12/12；dsh-memory 独立装能读（test-dsh-memory-heartbeat）｜可改：可改（**只存不判**：不认识 trigger 是什么意思、不认识 whyNot 有哪几档——语义留在鱼神）
//
// 三条边界：
//   · **只存不判**：trigger 是什么、whyNot 有哪几档、哪一算"醒"——本模块一概不懂，原样存原样还。
//   · **失败静默**：写不进去返回 {ok:false, reason}，从不抛（心跳写不进去不许把主流程带塌）。
//   · **只依赖 node 内置**：不 import 鱼神任何文件；独立装 dsh-memory 时这一份就能跑。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function home() { return process.env.DSH_HOME || path.join(os.homedir(), '.dsh') }
/** 心跳目录（和记忆同一个 data 根：$DSH_HOME/dayu）。 */
export function dirOf() { return path.join(home(), 'dayu', 'heartbeat') }

function pad(n) { return String(n).padStart(2, '0') }
/** 本地日期（一天一个文件；东亚时区也不会串天）。 */
export function dayOf(now = Date.now()) {
  const d = new Date(now)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function fileOf(day) { return path.join(dirOf(), `${day}.jsonl`) }

function oneLine(s, n = 200) { return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n) }

/**
 * 追加一跳。row 由调用方归一化好（枚举、截断都在上层），这里只保证"一行 JSON"。
 * @returns {{ok:boolean, at?:string, file?:string, row?:object, reason?:string}}
 */
export function append(role, row = {}, { now = Date.now() } = {}) {
  try {
    const id = oneLine(role, 40)
    if (!id) return { ok: false, reason: '没有角色' }
    const line = { ...(row && typeof row === 'object' ? row : {}) }
    line.at = String(line.at || new Date(now).toISOString())
    line.role = String(line.role || id)
    const file = fileOf(dayOf(now))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${JSON.stringify(line)}\n`, 'utf8')
    return { ok: true, at: line.at, file, row: line }
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 160) }
  }
}

function parseLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/)
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
  } catch { return [] }
}

/**
 * 读若干天（新→旧）。role 空就是所有人。
 * 顺序与原实现一致：先今天、再往前，最后整体 reverse。
 */
export function read(role = '', { day = '', days = 1, now = Date.now() } = {}) {
  const id = String(role || '').trim()
  const out = []
  const span = day ? 1 : Math.max(1, Math.min(31, Number(days) || 1))
  for (let i = 0; i < span; i += 1) {
    const d = day || dayOf(now - i * 86400000)
    const got = parseLines(fileOf(d))
    for (const r of got) if (!id || r.role === id) out.push(r)
  }
  return out.reverse()
}

/**
 * 今天跳了几次、按 trigger 原样分组、花了多少——**只报数，不解释**。
 * "哪几种算醒、哪类归哪组"由上层算（鱼神那边是 WAKE_TRIGGERS / wakeClassOf）。
 */
export function summary(role = '', { now = Date.now(), days = 1 } = {}) {
  const id = String(role || '').trim()
  const rows = read(id, { now, days })
  const today = dayOf(now)
  const only = rows.filter((r) => dayOf(Date.parse(r.at || '') || now) === today)
  const byTrigger = {}
  let spent = 0
  let lastAt = ''
  for (const r of only) {
    const trig = String(r.trigger || '未知')
    byTrigger[trig] = (byTrigger[trig] || 0) + 1
    const at = Date.parse(r.at || '') || 0
    if (at && at > (Date.parse(lastAt || '') || 0)) lastAt = r.at
    if (Number.isFinite(Number(r.spent))) spent += Number(r.spent)
  }
  return {
    ok: true,
    day: today,
    total: only.length,
    byTrigger,
    spent: Math.round(spent * 10000) / 10000,
    lastAt,
  }
}
