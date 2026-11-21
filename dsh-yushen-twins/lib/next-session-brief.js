/* 标签
 * id: lib-next-session-brief
 * kind: module
 * summary: 心跳提前准备“上次走后”小包；下次工作台启动注入一次，不建信箱、不维护未读。
 * tags: 心跳, 下次启动, 注入, 按需, 不建信箱
 * created: 2026-11-16 23:40:00
 * changed: 2026-11-17 00:54:19
 * author: 大鱼·本班
 * authority: 老板（2026-11-16：不要信箱，心跳提前准备，下次启动注入）
 * audience: 心跳 freeTimeOnce、注入 soul.js
 * owner: 框架；只写 runtime/<role>/next-session-brief.json
 * mutable: 可改；“注入一次”“没有就空”“不存未读”不许改
 * usage: prepare(role,{episodes,reports,signals,system}) / consume(role) / peek(role)
 * why: 角色不会主动翻信箱；下次启动时把上次走后的事直接放眼前
 * result: 一份短包；consume 一次后清空 injectedAt，不重复
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from '../memory-core/runtime/root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const fileOf = (role) => path.join(dataRoot(HOME), 'runtime', String(role || 'dayu'), 'next-session-brief.json')
const str = (v, n = 160) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n)

function read(role) {
  try {
    const data = JSON.parse(fs.readFileSync(fileOf(role), 'utf8'))
    return data && typeof data === 'object' ? data : null
  } catch { return null }
}

export function prepare(role, { episodes = [], reports = [], signals = [], system = '', now = Date.now() } = {}) {
  const eps = (Array.isArray(episodes) ? episodes : []).slice(0, 2).map((e) => ({
    id: str(e.id, 60), label: str(e.label), at: str(e.startAt || e.at), kind: str(e.domainKind || 'unknown', 20),
  })).filter((e) => e.label)
  const reps = (Array.isArray(reports) ? reports : []).slice(0, 2).map((r) => ({
    id: str(r.eventId || r.childSessionId, 60), text: str(r.text), at: str(r.at),
  })).filter((r) => r.text)
  const sig = (Array.isArray(signals) ? signals : []).filter((s) => Number(s?.level) >= 1).slice(0, 4).map((s) => ({
    kind: str(s.kind, 40), level: Number(s.level) || 1, what: str(s.what),
  }))
  const packet = { version: 1, role: String(role || 'dayu'), preparedAt: new Date(now).toISOString(), episodes: eps, reports: reps, signals: sig, system: str(system, 200), injectedAt: '' }
  if (!eps.length && !reps.length && !sig.length && !packet.system) return { ok: true, prepared: false, why: '没东西可放' }
  const file = fileOf(role)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(packet) + '\n', 'utf8')
  fs.renameSync(tmp, file)
  return { ok: true, prepared: true, packet }
}

export function peek(role) {
  const p = read(role)
  return p && !p.injectedAt ? p : null
}

export function consume(role) {
  const p = read(role)
  if (!p || p.injectedAt) return { ok: true, text: '', packet: null }
  const lines = []
  if (p.system) lines.push(`- 软件：${p.system}`)
  for (const e of p.episodes || []) {
    const prefix = e.kind === 'work' ? '工作' : e.kind === 'life' ? '生活' : e.kind === 'mixed' ? '工作/生活' : '最近'
    lines.push(`- ${prefix}：${e.label}`)
  }
  for (const r of p.reports || []) lines.push(`- 分身：${r.text}`)
  for (const s of p.signals || []) lines.push(`- 待办：${s.what}`)
  if (!lines.length) return { ok: true, text: '', packet: p }
  p.injectedAt = new Date().toISOString()
  try {
    const file = fileOf(role)
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(p) + '\n', 'utf8')
    fs.renameSync(tmp, file)
  } catch { /* 记不上最多下次再注入一次 */ }
  return { ok: true, text: `## 上次走后\n${lines.slice(0, 6).join('\n')}`, packet: p }
}
