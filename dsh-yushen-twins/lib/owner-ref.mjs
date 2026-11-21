/* 标签
 * id: lib-owner-ref
 * kind: module
 * tags: 画像参考, 老板, 多端, 只增不改, 建议
 * created: 2026-11-07 22:56:00
 * changed: 2026-11-07 23:03:03
 * author: 照微·子会话（实现代理）
 * authority: 老板（2026-11-07 方案-场景架构对照 §3.1「画像参考：能提议，不能改」，经父会话下发任务书）
 * why: 手机端、小鱼、照微都会看到老板的脾气和偏好，可这些观察现在没有地方放，
 *      只能当场说一句，说过就没了；而 owner.json 的修改权只该在主端手里。
 * result: 新增 soul/owner-ref/<role>.md 作为「只增不改」的参考本：addRef 追加一行（日期 + 来源 + 原话），
 *        listRefs 读出来，mergeRefs 只给建议——dry=false 时写 soul/owner-ref/merge-YYYYMMDD.md，
 *        **绝不直接改 owner.json**（修改权只在主端，本轮不做）。
 * mutable: 可改
 *
 * 边界（写清楚，别让下一个人猜）：
 *   · 参考本只追加：addRef 从不改写已有行，同一条写两次就是两行（谁写的谁负责）；
 *   · merge-YYYYMMDD.md 是**建议清单**，每次生成覆盖当天那份，不下结论、不合并；
 *   · 本模块不读也不写 owner.json——将来要合并，也由主端自己读参考、自己动手。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const home = () => process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const pad = (n) => String(n).padStart(2, '0')

/** 角色名只允许字母数字下划线横线：拼路径前先卡一道。 */
export function safeRole(role) {
  const r = String(role ?? '').trim()
  if (!/^[a-z0-9_-]{1,32}$/i.test(r)) {
    throw new Error(`角色名不合法：${JSON.stringify(role)}（只允许字母数字下划线横线，1~32 位）`)
  }
  return r
}

function toMs(value, fallback = Date.now()) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value === undefined || value === null || value === '') return fallback
  const ms = Date.parse(String(value))
  return Number.isFinite(ms) ? ms : fallback
}

function stamp(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function dayKey(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

/** 参考本：soul/owner-ref/<role>.md。 */
export function refFile(role) {
  return path.join(home(), 'dayu', 'soul', 'owner-ref', `${safeRole(role)}.md`)
}

/** 建议合并清单：soul/owner-ref/merge-YYYYMMDD.md（按天一份，重跑覆盖当天那份）。 */
export function mergeFile(role, now = Date.now()) {
  return path.join(home(), 'dayu', 'soul', 'owner-ref', `merge-${dayKey(toMs(now))}.md`)
}

const HEAD = (role) => [
  `# 画像参考 · ${role}`,
  '',
  '> 只增不改：任何端（手机 / 小鱼 / 照微）对老板的观察都写这里。',
  '> `owner.json` 仍只由主端改；这里只是参考，不是结论。',
  '',
  '',
].join('\n')

/**
 * 加一条参考：只追加，一行一条，带日期与来源。
 * @param {string} role 哪一端/哪个角色看到的（dayu / xiaoyu / dragon）
 * @param {{text:string, source?:string, at?:number|string|Date}} entry
 * @returns {{ok:true, file:string, line:string, count:number}}
 */
export function addRef(role, { text = '', source = '', at = Date.now() } = {}) {
  const who = safeRole(role)
  const body = String(text || '').replace(/\s+/g, ' ').trim()
  if (!body) throw new Error('参考要写一句（text 不能为空）')
  const src = String(source || '').replace(/\s+/g, ' ').trim().slice(0, 60) || '未写来源'
  const when = toMs(at)
  const file = refFile(who)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (!fs.existsSync(file)) fs.writeFileSync(file, HEAD(who), { encoding: 'utf8', mode: 0o600 })
  // 只补一个换行、不碰已有内容：上一个写的人没留行尾（或文件坏了），别让新的一行粘在旧行后面。
  try {
    const old = fs.readFileSync(file, 'utf8')
    if (old && !old.endsWith('\n')) fs.appendFileSync(file, '\n', 'utf8')
  } catch { /* 读不了就直接追加 */ }
  const line = `- ${stamp(when)} · 来源：${src} · ${body.slice(0, 500)}`
  fs.appendFileSync(file, `${line}\n`, 'utf8')
  return { ok: true, file, line, count: listRefs(who).length }
}

const REF_LINE = /^-\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+·\s+来源：(.*?)\s+·\s+(.+)$/

/**
 * 读参考：坏文件/半个文件都不抛，认不出的行跳过。
 * @returns {Array<{at:string, source:string, text:string, line:string}>}
 */
export function listRefs(role) {
  let text = ''
  try { text = fs.readFileSync(refFile(role), 'utf8') } catch { return [] }
  const out = []
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(REF_LINE)
    if (!m) continue
    out.push({ at: m[1], source: m[2].trim() || '未写来源', text: m[3].trim(), line: raw })
  }
  return out
}

/**
 * 把参考整理成一份**建议**清单。
 * dry 默认 true（默认不落盘）；只有 dry:false 才写 merge-YYYYMMDD.md。
 * 无论哪种模式，都不碰 owner.json。
 * @returns {{ok:true, dry:boolean, wrote:boolean, file:string, refs:number, note?:string}}
 */
export function mergeRefs(role, { dry = true, now = Date.now() } = {}) {
  const who = safeRole(role)
  const at = toMs(now)
  const refs = listRefs(who)
  const file = mergeFile(who, at)
  if (dry !== false) {
    return { ok: true, dry: true, wrote: false, file, refs: refs.length, note: 'dry：只读，不落文件（要建议清单传 dry:false）' }
  }
  if (!refs.length) {
    return { ok: true, dry: false, wrote: false, file, refs: 0, note: '还没有参考，不写空文件' }
  }
  const lines = [
    `# 画像参考 · 建议合并清单（${who}）`,
    '',
    `- 生成：${stamp(at)}`,
    `- 参考条数：${refs.length}`,
    `- 来源：soul/owner-ref/${who}.md（只读）`,
    '- 说明：这只是给主端的建议；**owner.json 的修改权只在主端**，本文件不改它。',
    '',
    '## 参考原文（按写入顺序）',
    ...refs.map((r) => `- ${r.at} · 来源：${r.source} · ${r.text}`),
    '',
    '## 待主端判断',
    '- 哪几条和现有画像重复、哪几条是新的、哪几条互相冲突——由主端自己判断，本文件不下结论。',
    '',
  ]
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${crypto.randomBytes(3).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${lines.join('\n')}`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
  return { ok: true, dry: false, wrote: true, file, refs: refs.length }
}
