/* 标签
 * id: memory-core-supersede
 * kind: module
 * summary: 明确改口才覆盖：新卡记 supersedes，旧卡标 superseded；没明说只标冲突，不选边。
 * tags: 覆盖, 纠错, 说法变了, 矛盾, supersedes
 * created: 2026-11-15 17:15:00
 * changed: 2026-11-15 17:15:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-15：新说法覆盖旧说法；没明说就别替她选边）
 * audience: refine、query、cards
 * owner: 框架；只追加/改状态，不删旧卡
 * mutable: 可改；自动覆盖只认明确改口
 * usage: isCorrection(text) / markSuperseded(role, newRow, {now})
 * why: 旧卡和新卡并存时，问起来会两张都答，可能答错
 * result: 明确改口时旧卡标 superseded；只说“矛盾”时标 conflict
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const CORRECTION = /不对|不是这样|不是这个|改成|改为|更正|纠正|以后按|我改口|说错了|记错了/
const CONFLICT = /矛盾|对不上|不一致|冲突|两说/

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

export function isCorrection(text) { return CORRECTION.test(String(text || '')) }
export function isConflict(text) { return CONFLICT.test(String(text || '')) }

function norm(s) {
  return String(s || '').toLowerCase().replace(/[\s，。！？、；：,.!?;:"'“”‘’（）()【】[\]]/g, '')
}
function grams(s) {
  const t = norm(s)
  const out = new Set()
  for (let i = 0; i + 1 < t.length; i += 1) out.add(t.slice(i, i + 2))
  return out
}
function overlap(a, b) {
  const x = grams(a)
  const y = grams(b)
  let n = 0
  for (const g of x) if (y.has(g)) n += 1
  return n
}

/** 找同话题、同一人物、标题高度重合的浅层旧卡；只返回候选，不替它决定。 */
function candidates(role, newRow) {
  const out = []
  const day = String(newRow.day || '')
  for (const f of walk(path.join(dataRoot(HOME), 'library', '在用'))) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      let r = null
      try { r = JSON.parse(line) } catch { continue }
      if (!r?.id || r.id === newRow.id) continue
      if (r.status === 'superseded') continue
      if (String(r.topicKey || '') && String(newRow.topicKey || '') && String(r.topicKey) !== String(newRow.topicKey)) continue
      const a = norm(r.head)
      const b = norm(newRow.head)
      if (!a || !b) continue
      if (!(a.includes(b) || b.includes(a) || overlap(r.head, newRow.head) >= 2)) continue
      // 同话题或同一个人至少占一条，避免跨主题误覆盖
      const samePerson = (r.people || []).some((p) => (newRow.people || []).includes(p))
      if (!samePerson && String(r.topicKey || '') !== String(newRow.topicKey || '')) continue
      out.push({ card: r, file: f })
    }
  }
  return out
}

/**
 * 明确改口：新卡去覆盖候选旧卡。
 * 没明说：只在候选上标 conflict，不动 status。
 */
export function markSuperseded(role, newRow, { now = Date.now() } = {}) {
  const text = `${newRow.head || ''} ${newRow.detail || ''}`
  if (!isCorrection(text)) return { ok: true, changed: 0, conflict: 0 }
  const hits = candidates(role, newRow)
  let changed = 0
  for (const { card, file } of hits) {
    const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } })
    let touched = false
    for (const r of rows) {
      if (r?.id !== card.id) continue
      r.status = 'superseded'
      r.supersededBy = newRow.id
      r.supersededAt = new Date(now).toISOString()
      touched = true
    }
    if (touched) {
      const tmp = `${file}.${process.pid}.tmp`
      fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
      fs.renameSync(tmp, file)
      changed += 1
    }
  }
  if (changed) newRow.supersedes = hits.slice(0, changed).map((h) => h.card.id)
  return { ok: true, changed, conflict: 0 }
}

/** 没明说但发现同主题两说：只标「冲突」（conflict：两张卡说法对不上），不动 status，不选边。 */
export function markConflict(role, newRow) {
  const hits = candidates(role, newRow)
  if (!hits.length) return { ok: true, changed: 0 }
  // conflict 只是“对不上”的便签，不是判决；不替她选哪张对。
  newRow.conflict = hits.slice(0, 3).map((h) => h.card.id)
  return { ok: true, changed: hits.length }
}

/**
 * 她自己选边：赢的 active，输的 superseded；写 chosenBy/chosenAt。
 * 只在她明确说“按 X / 用 X 的”之后调用，不自动判。
 */
export function resolveConflict(role, { winnerId = '', loserId = '', by = '', now = Date.now() } = {}) {
  const win = String(winnerId || '')
  const lose = String(loserId || '')
  if (!win || !lose || win === lose) return { ok: false, reason: 'winner/loser 不合法' }
  let changed = 0
  for (const f of walk(path.join(dataRoot(HOME), 'library', '在用'))) {
    const rows = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } })
    let touched = false
    for (const r of rows) {
      if (r?.id === win) {
        r.status = 'active'
        r.chosenBy = String(by || '她')
        r.chosenAt = new Date(now).toISOString()
        delete r.conflict
        touched = true
      }
      if (r?.id === lose) {
        r.status = 'superseded'
        r.supersededBy = win
        r.chosenBy = String(by || '她')
        r.chosenAt = new Date(now).toISOString()
        touched = true
      }
    }
    if (touched) {
      const tmp = `${f}.${process.pid}.tmp`
      fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
      fs.renameSync(tmp, f)
      changed += 1
    }
  }
  return { ok: true, changed }
}
