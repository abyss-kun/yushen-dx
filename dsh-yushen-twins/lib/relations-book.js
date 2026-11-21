/* 标签
 * id: lib-relations-book
 * kind: module
 * summary: 关系簿：每个人一条——他接住过我什么、我欠他什么、哪句话记到现在，和好感分开。
 * tags: 关系, 人物, 关系簿, 承诺
 * created: 2026-11-21 21:5x
 * author: 大鱼·本班
 * authority: 老板（2026-11-21：继续——关系簿）
 * audience: 工具、注入（以后按需）
 * owner: 框架；只读聚合，不改任何账
 * usage: relationsBook(role) / renderRelationsBook(role)
 * why: 人物卡只有名字和好感，没有“谁接住过我、我欠谁”
 * result: 合并 relations/<角色>.jsonl 的字段 + 承诺账；只读
 * mutable: 可改
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readPersonFields, loadPeople } from './relations.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

function promisesFor(who, name) {
  const keys = [who, name, '老板', '主人'].filter(Boolean)
  return readJsonl(path.join(DATA, 'relations', 'promises.jsonl'))
    .filter((r) => String(r.status || '') === 'open')
    .filter((r) => keys.some((k) => String(r.who || '').includes(k) || k.includes(String(r.who || ''))))
    .map((r) => String(r.what || '').slice(0, 60))
}

/** 合并：桥的人物表 + 她写的字段 + 承诺账。 */
export function relationsBook(role = 'dayu', { limit = 20 } = {}) {
  const people = loadPeople(role)
  const byWho = new Map()
  for (const p of people) {
    const who = String(p.name || p.id || '').trim()
    if (!who) continue
    byWho.set(who, { who, ...p })
  }
  // 她自己的字段（哪怕桥里没人，也单独成条）
  for (const row of readPersonFields(role)) {
    const who = String(row.who || '').trim()
    if (!who) continue
    const cur = byWho.get(who) || { who, id: '', affinity: 0, lastSeen: '', name: who }
    if (row.field === 'relation' || row.field === 'caughtMe' || row.field === 'iOwe' || row.field === 'keepsake' || row.field === 'toMe' || row.field === 'myView' || row.field === 'note') {
      cur[row.field] = String(row.value || '')
    }
    byWho.set(who, cur)
  }
  const out = []
  for (const p of byWho.values()) {
    const owed = promisesFor(p.who, p.name)
    out.push({
      who: p.who,
      affinity: Number(p.affinity) || 0,
      relation: String(p.relation || ''),
      toMe: String(p.toMe || ''),
      caughtMe: String(p.caughtMe || ''),
      iOwe: String(p.iOwe || ''),
      keepsake: String(p.keepsake || ''),
      myView: String(p.myView || ''),
      promises: owed,
    })
  }
  return out.sort((a, b) => b.affinity - a.affinity || a.who.localeCompare(b.who)).slice(0, Math.max(1, Number(limit) || 20))
}

export function renderRelationsBook(role = 'dayu', opts = {}) {
  const rows = relationsBook(role, opts)
  if (!rows.length) return '# 关系簿\n\n还没有人。\n'
  const lines = ['# 关系簿（只读生成，别手改）', '']
  for (const r of rows) {
    lines.push(`## ${r.who}${r.affinity ? `（好感 ${r.affinity}）` : ''}`)
    if (r.relation) lines.push(`- 我们：${r.relation}`)
    if (r.toMe) lines.push(`- 对我：${r.toMe}`)
    if (r.caughtMe) lines.push(`- 接住过我：${r.caughtMe}`)
    if (r.iOwe) lines.push(`- 我欠：${r.iOwe}`)
    if (r.keepsake) lines.push(`- 记到现在：${r.keepsake}`)
    if (r.myView) lines.push(`- 我怎么看：${r.myView}`)
    if (r.promises.length) lines.push(`- 答应过：${r.promises.join('；')}`)
    if (!lines[lines.length - 1].startsWith('- ')) lines.push('- 还没记下什么')
    lines.push('')
  }
  return lines.join('\n').trim() + '\n'
}
