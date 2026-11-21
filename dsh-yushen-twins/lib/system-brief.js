/* 标签
 * id: lib-system-brief
 * kind: module
 * summary: 软件心跳的一小段：只看维护/备份/事件目录有没有明显不对，按需给一句；没毛病就不出现。
 * tags: 软件心跳, 维护, 备份, 按需, 只读
 * created: 2026-11-16 23:10:00
 * changed: 2026-11-17 00:00:44
 * author: 大鱼·本班
 * authority: 老板（2026-11-16：心跳不只角色，整个软件也要有）
 * audience: 注入、面板、以后软件心跳
 * owner: 框架；只读 runtime 状态，不写盘、不调模型
 * mutable: 可改；没毛病返回空，不许每轮刷“正常”
 * usage: buildSystemBrief({home, now}) → {level, text, signals}
 * why: 维护/备份坏了没人说，角色注入却只讲她自己的事
 * result: 有毛病给一句，没毛病空串
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = () => process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}
const ms = (v) => {
  const t = Date.parse(String(v || ''))
  return Number.isFinite(t) ? t : 0
}
const str = (v, n = 120) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n)

export function buildSystemBrief({ home = HOME(), now = Date.now() } = {}) {
  const base = path.join(home, 'dayu')
  const runtime = path.join(base, 'runtime')
  const signals = []

  const last = readJson(path.join(runtime, 'maintenance-last.json'))
  if (last) {
    const age = now - ms(last.at)
    if (last.ok === false) signals.push({ kind: 'maintenance-failed', level: 2, what: '维护上一轮失败' })
    else if (age > 8 * 60 * 60 * 1000) signals.push({ kind: 'maintenance-stale', level: 1, what: `维护已 ${Math.round(age / 3600e3)} 小时没跑` })
    for (const s of Array.isArray(last.steps) ? last.steps : []) {
      if (String(s?.result || '') === 'failed') signals.push({ kind: 'step-failed', level: 2, what: `${s.step || '步骤'} 失败` })
    }
  }

  const backup = readJson(path.join(base, 'full-backup.json'))
  if (backup) {
    const age = now - ms(backup.lastAt)
    if (age > 30 * 3600e3) signals.push({ kind: 'backup-stale', level: 1, what: `全盘备份已 ${Math.round(age / 3600e3)} 小时没更新` })
  }

  const ep = readJson(path.join(runtime, 'episodes-auto-state.json'))
  if (ep) {
    const age = now - ms(ep.lastAt)
    if (age > 3 * 3600e3) signals.push({ kind: 'episodes-stale', level: 1, what: `事件目录已 ${Math.round(age / 3600e3)} 小时没补` })
  }

  const ctx = readJson(path.join(runtime, 'context-notice.json'))
  if (ctx && Number(ctx.level) >= 2 && now - ms(ctx.at) < 6 * 3600e3) {
    signals.push({ kind: 'context-tight', level: 1, what: `上下文到 ${Math.round(Number(ctx.pct) || 0)}%，建议换会话` })
  }

  if (!signals.length) return { level: 0, text: '', signals: [] }
  const level = Math.max(...signals.map((s) => s.level))
  const text = `软件状态 ${level}：${signals.slice(0, 3).map((s) => s.what).join('；')}`
  return { level, text, signals }
}
