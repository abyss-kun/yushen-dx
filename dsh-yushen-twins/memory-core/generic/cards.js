// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜memory-core/generic/cards.js:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
/* 标签
 * id: generic-cards
 * kind: module
 * summary: 通用卡片：经验/知识/错题/任务/人物一句话卡；只追加、可检索；不绑鱼神的角色目录。
 * tags: 卡片, 通用, 独立包, 检索
 * created: 2026-11-24 22:0x
 * author: 大鱼·本班
 * authority: 老板（2026-11-24：独立包也要能提炼/搜卡片）
 * audience: dsh-memory 独立包、别的壳
 * owner: 框架；只追加，不删旧卡
 * usage: addCard({dir,kind,head,detail,tags}) / listCards({dir,kind,limit}) / searchCards(q,{dir,limit})
 * why: 独立包只有事件，没有“提炼过的经验/知识/错题”
 * result: cards.jsonl 一行一张；同 kind+head 去重；检索按词面命中数排序
 * mutable: 可改；宁少不滥
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DIR = (dir) => String(dir || '').trim() || path.join(HOME, 'dayu')
const FILE = (dir) => path.join(DIR(dir), 'cards.jsonl')
export const CARD_KINDS = Object.freeze(['经验', '知识', '错题', '任务', '人物'])

function readAll(dir) {
  try {
    return fs.readFileSync(FILE(dir), 'utf8').split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
  } catch { return [] }
}

export function addCard({ dir = '', kind = '经验', head = '', detail = '', tags = [], at = new Date().toISOString() } = {}) {
  const k = String(kind || '')
  if (!CARD_KINDS.includes(k)) return { ok: false, error: `kind 只能是 ${CARD_KINDS.join(' / ')}` }
  const h = String(head || '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!h) return { ok: false, error: 'head 不能为空' }
  const rows = readAll(dir)
  if (rows.some((r) => String(r.kind) === k && String(r.head) === h && String(r.status || 'active') === 'active')) {
    return { ok: true, deduped: true }
  }
  const row = {
    id: 'c-' + crypto.createHash('sha1').update(`${at}|${k}|${h}`).digest('hex').slice(0, 10),
    kind: k,
    head: h,
    detail: String(detail || h).replace(/\s+/g, ' ').trim().slice(0, 300),
    tags: (Array.isArray(tags) ? tags : []).slice(0, 6).map((x) => String(x).slice(0, 12)),
    at: String(at),
    status: 'active',
  }
  try {
    fs.mkdirSync(DIR(dir), { recursive: true })
    fs.appendFileSync(FILE(dir), JSON.stringify(row) + '\n', 'utf8')
    return { ok: true, row }
  } catch (e) { return { ok: false, error: String(e?.message || e) } }
}

export function listCards({ dir = '', kind = '', limit = 20 } = {}) {
  return readAll(dir)
    .filter((r) => String(r.status || 'active') === 'active')
    .filter((r) => !kind || String(r.kind) === kind)
    .slice(-Math.max(1, Number(limit) || 20))
    .reverse()
}

export function searchCards(q = '', { dir = '', limit = 5 } = {}) {
  const s = String(q || '').trim()
  if (!s) return []
  const grams = new Set()
  const h = s.replace(/[^\u4e00-\u9fffA-Za-z0-9]+/g, '')
  for (let i = 0; i + 2 <= h.length; i += 1) grams.add(h.slice(i, i + 2))
  if (!grams.size) grams.add(s)
  return readAll(dir)
    .filter((r) => String(r.status || 'active') === 'active')
    .map((r) => {
      const text = `${r.head || ''} ${r.detail || ''} ${(r.tags || []).join(' ')}`
      let score = 0
      for (const g of grams) if (text.includes(g)) score += 1
      return { row: r, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || String(b.row.at).localeCompare(String(a.row.at)))
    .slice(0, Math.max(1, Number(limit) || 5))
    .map((x) => x.row)
}
