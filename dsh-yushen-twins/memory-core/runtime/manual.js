/* 标签
 * id: memory-core-manual
 * kind: module
 * summary: 手动写一张纸 / 手动钉顶游；不经过模型，但必须带类型和出处。
 * tags: 手动写卡, 顶游, 钉住, 浅层, 单一实现
 * created: 2026-11-13 18:25:00
 * changed: 2026-11-13 18:25:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：现在就想记一张；顶游要能手动钉）
 * audience: yushen_memo / yushen_pin、未来页面
 * owner: 框架；只追加/改标记，不删旧卡
 * mutable: 可改；手动卡必须带 type + 出处
 * usage: writeManualCard({...}) / pinCard({turnId,ref,pin})
 * why: 之前只能写进对话等提炼，顶游只有规则没有入口
 * result: 手动卡直接进浅层；钉/摘顶游只改标记，不复制
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { dataRoot } from './root.js'
import { appendInUse } from './shallow.js'
import { addLinks } from './links.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10)

export const CARD_TYPES = Object.freeze({
  event: '记忆', memory: '记忆', 事件: '记忆', 记忆: '记忆',
  method: '经验', 办法: '经验', 经验: '经验', 攻略: '经验',
  knowledge: '知识', 知识: '知识',
  task: '任务', 待办: '任务', 承诺: '任务',
  incident: '错题', 错题: '错题', 事故: '错题',
  view: '看法', 看法: '看法', 判断: '看法',
  person: '人物', 人物: '人物',
})

export function normalizeCardType(t) {
  const k = String(t || '').trim()
  return CARD_TYPES[k] || '记忆'
}

export function writeManualCard({
  type = 'event', head = '', detail = '', turnId = '', ref = '',
  role = '', topic = '', tags = [], pin = false, at = new Date().toISOString(),
  links = [], eventKey = '', topicKey = '', threadId = '',
} = {}) {
  const title = String(head || '').trim()
  if (!title) return { ok: false, error: 'head 不能为空' }
  if (!turnId && !ref) return { ok: false, error: 'turnId 和 ref 至少给一个' }
  const kind = normalizeCardType(type)
  const day = String(at).slice(0, 10)
  const row = {
    id: `m-${sha(`${kind}|${title}|${turnId}|${ref}`)}`,
    kind,
    head: title,
    detail: String(detail || title).slice(0, 500),
    text: title,
    keywords: (tags || []).slice(0, 6),
    tags: (tags || []).slice(0, 6),
    at,
    day,
    channel: '手动',
    role: String(role || 'unbound'),
    topic: String(topic || ''),
    source: '手动',
    turnId: String(turnId || ''),
    ref: String(ref || ''),
    fromRef: String(ref || turnId || ''),
    threadId: String(threadId || (String(turnId || '').includes('#') ? String(turnId).split('#')[0] : '')),
    eventKey: String(eventKey || turnId || ref || ''),
    topicKey: String(topicKey || topic || (Array.isArray(tags) ? tags[0] : '') || ''),
    status: 'active',
    tier: pin ? '顶游' : '中游',
    ...(pin ? { pin: true } : {}),
    useCount: 0,
    lastUsed: at,
    createdAt: at,
    links: [],
  }
  return appendInUse(kind, day, addLinks(row, links))
}

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

/** 手动钉/摘顶游：只改这一行，原子写回。 */
export function pinCard({ turnId = '', ref = '', pin = true } = {}) {
  const id = String(turnId || '').trim()
  const r = String(ref || '').trim()
  if (!id && !r) return { ok: false, error: 'turnId 和 ref 至少给一个' }
  const files = walk(path.join(dataRoot(HOME), 'library', '在用'))
  let changed = 0
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean)
    let dirty = false
    const out = lines.map((line) => {
      let row = null
      try { row = JSON.parse(line) } catch { return line }
      const match = (id && String(row.turnId || '') === id) || (r && (String(row.ref || '') === r || String(row.fromRef || '') === r))
      if (!match) return line
      if (pin) { row.pin = true; row.tier = '顶游' } else { delete row.pin; row.tier = '中游' }
      changed += 1
      dirty = true
      return JSON.stringify(row)
    })
    if (dirty) {
      const tmp = `${f}.${process.pid}.tmp`
      fs.writeFileSync(tmp, out.join('\n') + '\n', 'utf8')
      fs.renameSync(tmp, f)
    }
  }
  return { ok: true, changed, pin: Boolean(pin) }
}
