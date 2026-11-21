/* 标签
 * id: memory-core-relink
 * kind: module
 * summary: 把同一会话相邻轮的纸自动连上“上一轮/下一轮”；只改线，不动正文。
 * tags: 承上启下, 上一轮, 下一轮, 自动填线, 单一实现
 * created: 2026-11-13 18:45:00
 * changed: 2026-11-15 01:07:30
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：承上启下要自动留线）
 * audience: refine、维护、以后 dsh-memory
 * owner: 框架；只连同一会话，不跨会话硬连
 * mutable: 可改；不要覆盖已有 links
 * usage: relinkTurns({dry}) → {changed,files}
 * why: 新卡只有 turnId，上一轮/下一轮还要人工补
 * result: 同一会话相邻轮自动有硬线，查询可按圈拉
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'
import { addLinks, linksOf } from './links.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

const walk = (dir, out = []) => {
  let es = []
  try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of es) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (p.endsWith('.jsonl')) out.push(p)
  }
  return out
}

const turnOf = (row) => {
  const m = /^(.+)#(\d+)$/.exec(String(row?.turnId || ''))
  return m ? { sid: m[1], n: Number(m[2]) } : null
}

export function relinkTurns({ dry = false } = {}) {
  const files = walk(path.join(dataRoot(HOME), 'library', '在用'))
  const byFile = new Map()
  const groups = new Map()
  for (const f of files) {
    const rows = []
    let lineNo = 0
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      let row = null
      try { row = JSON.parse(line) } catch { continue }
      rows.push(row)
      lineNo += 1
      const t = turnOf(row)
      if (t) {
        const key = t.sid
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push({ row, n: t.n, file: f, index: rows.length - 1 })
      }
    }
    byFile.set(f, rows)
  }

  let changed = 0
  const touched = new Set()
  for (const list of groups.values()) {
    list.sort((a, b) => a.n - b.n)
    for (let i = 0; i < list.length; i += 1) {
      const cur = list[i]
      const prev = list[i - 1]
      const next = list[i + 1]
      const extra = []
      if (prev) extra.push({ type: 'prev', to: String(prev.row.turnId), strength: 'hard', why: '同一会话相邻轮' })
      if (next) extra.push({ type: 'next', to: String(next.row.turnId), strength: 'hard', why: '同一会话相邻轮' })
      if (!extra.length) continue
      const old = linksOf(cur.row)
      const before = JSON.stringify(old)
      const keep = old.filter((l) => l.type !== 'prev' && l.type !== 'next')
      const withLinks = addLinks({ ...cur.row, links: keep }, extra)
      if (JSON.stringify(linksOf(withLinks)) === before) continue
      cur.row.links = withLinks.links
      if (!cur.row.threadId) cur.row.threadId = String(turnOf(cur.row)?.sid || '')
      changed += 1
      touched.add(cur.file)
    }
  }

  if (!dry) {
    for (const f of touched) {
      const rows = byFile.get(f)
      const tmp = `${f}.${process.pid}.tmp`
      fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
      fs.renameSync(tmp, f)
    }
  }
  return { ok: true, changed, files: touched.size, dry }
}

/**
 * 给新卡补“同一话题”的线：同一个 topicKey 的卡互相连着，最多连最近 2 张。
 * 只连有 turnId 的新卡；旧卡没有身份证，不猜。
 */
export function relinkTopics({ dry = false, max = 2 } = {}) {
  const files = walk(path.join(dataRoot(HOME), 'library', '在用'))
  const byFile = new Map()
  const groups = new Map()
  for (const f of files) {
    const rows = []
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      let row = null
      try { row = JSON.parse(line) } catch { continue }
      rows.push(row)
      if (!row.turnId) continue
      const topic = String(row.topicKey || row.topic || '').trim()
      if (!topic) continue
      const key = `${String(row.role || '')}|${topic}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push({ row, file: f })
    }
    byFile.set(f, rows)
  }

  let changed = 0
  const touched = new Set()
  for (const list of groups.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => String(a.row.at || '').localeCompare(String(b.row.at || '')))
    for (let i = 0; i < list.length; i += 1) {
      const cur = list[i]
      const near = []
      for (let j = i - 1; j >= 0 && near.length < max; j -= 1) near.push(list[j])
      for (let j = i + 1; j < list.length && near.length < max; j += 1) near.push(list[j])
      const old = linksOf(cur.row)
      const before = JSON.stringify(old)
      // 每次重建 same_topic：已有 prev/next 的目标不再重复连；旧 same_topic 先摘掉。
      const base = old.filter((l) => l.type !== 'same_topic')
      const linkedTos = new Set(base.map((l) => String(l.to)))
      const extra = near
        .filter((x) => x.row !== cur.row && x.row.turnId && !linkedTos.has(String(x.row.turnId)))
        .map((x) => ({ type: 'same_topic', to: String(x.row.turnId), strength: 'medium', why: '同一话题' }))
      const withLinks = addLinks({ ...cur.row, links: base }, extra)
      if (JSON.stringify(linksOf(withLinks)) === before) continue
      cur.row.links = withLinks.links
      changed += 1
      touched.add(cur.file)
    }
  }

  if (!dry) {
    for (const f of touched) {
      const rows = byFile.get(f)
      const tmp = `${f}.${process.pid}.tmp`
      fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
      fs.renameSync(tmp, f)
    }
  }
  return { ok: true, changed, files: touched.size, dry }
}

/**
 * same_event 只认显式 sameEventKey（task/agenda id 或显式事件 id），
 * 绝不按标题相似度自动合并（2026-11-15 决定）。
 */
export function relinkSameEvent({ dry = false, max = 6 } = {}) {
  const files = walk(path.join(dataRoot(HOME), 'library', '在用'))
  const byFile = new Map()
  const groups = new Map()
  for (const f of files) {
    const rows = []
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      let row = null
      try { row = JSON.parse(line) } catch { continue }
      rows.push(row)
      if (!row.turnId) continue
      const key = String(row.sameEventKey || '').trim()
      if (!key) continue
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push({ row, file: f })
    }
    byFile.set(f, rows)
  }
  let changed = 0
  const touched = new Set()
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const part = list.slice(0, max)
    for (const cur of part) {
      const extra = part
        .filter((x) => x.row !== cur.row && x.row.turnId)
        .map((x) => ({ type: 'same_event', to: String(x.row.turnId), strength: 'hard', why: '显式同一件事' }))
      const old = linksOf(cur.row)
      const base = old.filter((l) => l.type !== 'same_event')
      const withLinks = addLinks({ ...cur.row, links: base }, extra)
      if (JSON.stringify(linksOf(withLinks)) === JSON.stringify(old)) continue
      cur.row.links = withLinks.links
      changed += 1
      touched.add(cur.file)
    }
  }
  if (!dry) {
    for (const f of touched) {
      const rows = byFile.get(f)
      const tmp = `${f}.${process.pid}.tmp`
      fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
      fs.renameSync(tmp, f)
    }
  }
  return { ok: true, changed, files: touched.size, dry }
}
