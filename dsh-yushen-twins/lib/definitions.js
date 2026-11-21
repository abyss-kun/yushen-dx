/* 标签
 * id: lib-definitions
 * kind: module
 * summary: 长期决定（定义类）：老板说过的、反复强调过的口径，钉在注入里，不靠检索想起来。
 * tags: 定义, 长期决定, 注入, 记忆
 * created: 2026-11-21 00:1x
 * author: 大鱼·本班
 * authority: 老板（2026-11-21：说过不止一次的图书馆定义，又忘了——定义要摆到眼前）
 * audience: 注入、记忆、维护
 * owner: 框架；只追加，不删；删要留墓碑
 * usage: addDefinition({text,source,quote}) / readDefinitions({limit}) / buildDefinitionsBlock(task)
 * why: 事件型记忆靠检索；定义型决定必须常驻，否则每次都要重新吵一遍
 * result: definitions.jsonl 只追加；注入里按话题给 1–5 条，每条带日期
 * mutable: 可改；只追加，不删；删要留墓碑
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const FILE = () => path.join(HOME, 'dayu', 'definitions.jsonl')

/** 读长期决定（最新在后）。默认只给还在生效的；带 includeSuperseded 才看被覆盖的。 */
export function readDefinitions({ limit = 20, includeSuperseded = false } = {}) {
  try {
    const all = fs.readFileSync(FILE(), 'utf8').split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
    const patch = new Map()
    for (const r of all) {
      if (String(r?.type || '') === 'update' && r.id) {
        patch.set(String(r.id), { status: r.status || 'superseded', supersededBy: r.supersededBy || '', at: r.at || '' })
      }
    }
    return all
      .filter((r) => String(r?.type || '') !== 'update')
      .map((r) => ({ ...r, ...(patch.get(String(r.id || '')) || {}) }))
      .filter((r) => includeSuperseded || String(r.status || '') !== 'superseded')
      .slice(-Math.max(1, Number(limit) || 20))
  } catch { return [] }
}

const TOPIC = ['图书馆', '记忆', '插件', '软件', '项目', '进度', '情绪', '关系', '决定', '边界', '注入', '检索', '档案', '角色', '身份', '备份', '出厂', '发布', '评测', '提醒']
const CHANGE = /(更正|不是|应该是|改成|改为|以后都|以后别|不再|不用|取消|覆盖|更新为|错了)/

/** 新决定和旧决定是不是同一话题、且带了“改口”的话。 */
export function definitionConflict(newText, oldText) {
  const a = String(newText || '')
  const b = String(oldText || '')
  if (!a || !b) return false
  if (!CHANGE.test(a)) return false
  return TOPIC.some((k) => a.includes(k) && b.includes(k))
}

/** 记一条长期决定；同文去重；带“改口”且同话题时，把旧的那条标成已覆盖。 */
export function addDefinition({ text = '', source = '', quote = '', now = Date.now(), replaces = '' } = {}) {
  const t = String(text || '').trim()
  if (!t) return { ok: false, error: '空定义不记' }
  const rows = readDefinitions({ limit: 100000 })
  const dup = rows.find((r) => String(r.text || '').trim() === t)
  if (dup) return { ok: true, deduped: true, row: dup }
  const id = 'd-' + crypto.createHash('sha1').update(`${now}|${t}`).digest('hex').slice(0, 10)
  const row = {
    type: 'definition',
    id,
    at: new Date(now).toISOString(),
    text: t.slice(0, 300),
    source: String(source || '').slice(0, 120),
    quote: String(quote || '').slice(0, 200),
    status: 'active',
  }
  const hit = rows.filter((r) => String(r.id || '') === String(replaces || '') || (!replaces && definitionConflict(t, r.text)))
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true })
    fs.appendFileSync(FILE(), JSON.stringify(row) + '\n', 'utf8')
    for (const old of hit) {
      if (!old.id) continue
      fs.appendFileSync(FILE(), JSON.stringify({ type: 'update', id: old.id, status: 'superseded', supersededBy: id, at: new Date(now).toISOString() }) + '\n', 'utf8')
    }
    return { ok: true, row, superseded: hit.map((r) => ({ id: r.id || '', text: String(r.text || '').slice(0, 60) })) }
  } catch (e) { return { ok: false, error: String(e?.message || e) } }
}

/** 注入块：只在聊到相关话题时出现，最多 5 条、每条一行。 */
export function buildDefinitionsBlock(task = '', { limit = 5 } = {}) {
  const t = String(task || '')
  if (!/图书馆|记忆|插件|软件|档案|项目|定义|重复造轮子/.test(t)) return ''
  const rows = readDefinitions({ limit })
  if (!rows.length) return ''
  const lines = rows.map((r) => `- ${String(r.text).replace(/\s+/g, ' ').slice(0, 80)}（${String(r.at || '').slice(0, 10)}）`)
  return ['## 长期决定（老板定过、反复说过的，别忘）', ...lines, '出处：~/.dsh/dayu/definitions.jsonl（要细看自己翻）'].join('\n')
}
