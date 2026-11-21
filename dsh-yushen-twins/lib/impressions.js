/* 标签
 * id: lib-impressions
 * kind: module
 * summary: 印象：她对某个人的判断，一条一个 trait（说话直接 / 很在意证据 / 爱熬夜）
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；记忆内容归角色本人
 * mutable: 可改
 * usage: impressionFile / allImpressions / addImpression / impressionsOf（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-03 01:53｜大鱼·子会话（工作台；父会话 c82f4345 委派）｜授权：老板（本次任务书：关系库承诺与印象）｜lib/impressions.js:1-225｜新增：印象（谁·什么印象·证据·权重）的追加/去重累加/按人取前 N，落 ~/.dsh/dayu/relations/impressions.jsonl｜为什么：关系库原来只有「好感」一个数，她对人形成的具体判断（说话直接、爱熬夜）无处可存，记一次翻一次、重复记还会堆成山｜验证：& $node scripts/test-relations-extra.mjs 全过（同 who+trait 只累加不堆行/排序取前 N/按人过滤/坏行跳过）；node --check 通过；node 内联 parseTrace 六要素齐｜可改：可改（字段只增不删；动去重口径要同步 scripts/test-relations-extra.mjs）
//
// 印象：她对某个人的判断，一条一个 trait（说话直接 / 很在意证据 / 爱熬夜）。
//
// 和同族的区别（别另起一套）：
//   · lib/people.js    —— 客观事实（处境、答应过什么），按 userId 一人一文件；
//   · lib/relations.js —— 好感分（0-100）与规则加减；
//   · 这里            —— **印象**：who + trait + evidence + weight，同一 who+trait 只留一行。
//
// 规矩：
//   · jsonl 一行一条，和 people.jsonl 同层（~/.dsh/dayu/relations/）；
//   · 同一 who+trait 再记一次：不新加行，把最近那条 count+1、evidence 换成最新的、updatedAt 刷新；
//   · 只增不删：不提供删除接口；新行 O_APPEND，累加走 tmp + fsync + rename 原子替换；
//   · 坏行跳过，一条坏行不能让整本印象读不出来；
//   · 零依赖、不读网络、不调模型。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { dshHome } from './paths.js'
import { localISO } from './clock.js'

/** 文件名（和 people.jsonl 放同一层）。 */
export const IMPRESSION_FILE = 'impressions.jsonl'
/** 没给权重时的默认值（权重只影响排序，不影响存不存）。 */
export const DEFAULT_WEIGHT = 1

/** 去空白、限长：落盘前先收一遍，免得一行里塞进换行把 jsonl 拆坏。 */
const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
/** 调用方可能传 null 或不是对象：收成对象，别让取字段时抛错。 */
const asObj = (v) => (v && typeof v === 'object' ? v : {})

/** 关系库目录：baseDir 注入优先（测试/迁移用），否则 ~/.dsh/dayu/relations。 */
function relationsDir(opts = {}) {
  const given = opts && typeof opts.baseDir === 'string' ? opts.baseDir.trim() : ''
  return path.resolve(given || path.join(dshHome(), 'dayu', 'relations'))
}

/** 印象文件路径（给测试和工具核对用，不写盘）。 */
export function impressionFile(opts = {}) {
  return path.join(relationsDir(opts), IMPRESSION_FILE)
}

/** 时间：Date / 毫秒 / ISO 串都认；认不出返回 NaN（不抛错）。 */
function toMs(value) {
  if (value === undefined || value === null || value === '') return NaN
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  const ms = Date.parse(String(value))
  return Number.isFinite(ms) ? ms : NaN
}

/** 统一收成本地 ISO（带真实时区偏移）；认不出就 ''。 */
function isoOf(value) {
  const ms = toMs(value)
  return Number.isFinite(ms) ? localISO(new Date(ms)) : ''
}

/** 权重：0-100 之间，保留三位小数；给的东西认不出返回 null。 */
function weightOf(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(Math.max(0, Math.min(100, n)) * 1000) / 1000
}

/** 读 jsonl 的原始行；文件还没有就返回空数组。 */
function readLines(file) {
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  return text.replace(/^\uFEFF/, '').split('\n').filter((line) => line.trim())
}

/** 收一条印象的形状；缺 who/trait 的返回 null。 */
function normalize(row) {
  const who = str(row.who, 40)
  const trait = str(row.trait, 60)
  if (!who || !trait) return null
  const at = isoOf(row.at) || isoOf(row.updatedAt) || ''
  const rawCount = Number(row.count)
  const count = Number.isFinite(rawCount) && rawCount >= 1 ? Math.floor(rawCount) : 1
  const weight = weightOf(row.weight)
  return {
    id: str(row.id, 60),
    who,
    trait,
    evidence: str(row.evidence, 300),
    at,
    updatedAt: isoOf(row.updatedAt) || at,
    count,
    weight: weight === null ? DEFAULT_WEIGHT : weight,
  }
}

/** 一次追加：O_APPEND + fsync。不用「读全量再 tmp 重写」，那会丢并发写入。 */
function appendRow(file, row) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const fd = fs.openSync(file, 'a')
  try {
    fs.writeFileSync(fd, `${JSON.stringify(row)}\n`, 'utf8')
    try { fs.fsyncSync(fd) } catch { /* 有的文件系统不认 fsync，忽略 */ }
  } finally {
    try { fs.closeSync(fd) } catch { /* 关不掉也要把错抛出去 */ }
  }
}

/** 整份原子替换：先写同目录 tmp、fsync、再 rename 盖上去；失败清 tmp 并抛。 */
function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`
  let fd = null
  try {
    fd = fs.openSync(tmp, 'w')
    fs.writeFileSync(fd, text, 'utf8')
    try { fs.fsyncSync(fd) } catch { /* 同上 */ }
    fs.closeSync(fd)
    fd = null
    fs.renameSync(tmp, file)
  } catch (err) {
    if (fd !== null) { try { fs.closeSync(fd) } catch { /* 已经出错，别盖掉原错 */ } }
    try { fs.rmSync(tmp, { force: true }) } catch { /* 清不掉也不挡 */ }
    throw err
  }
}

/**
 * 全部印象（同一 who+trait 只留最近更新那条；坏行跳过）。
 * opts: { baseDir? }
 */
export function allImpressions(opts = {}) {
  opts = asObj(opts)
  const byKey = new Map()
  for (const line of readLines(impressionFile(opts))) {
    let row = null
    try { row = JSON.parse(line) } catch { continue } // 坏行跳过
    if (!row || typeof row !== 'object') continue
    const item = normalize(row)
    if (!item) continue
    const key = `${item.who}|${item.trait}`
    const old = byKey.get(key)
    // 并发写撞出的重复行：留更新的一条，不把两份 count 相加（相加会假装记得更牢）
    if (!old || (toMs(item.updatedAt) || 0) >= (toMs(old.updatedAt) || 0)) byKey.set(key, item)
  }
  return [...byKey.values()]
}

/**
 * 追加一条印象；同一 who+trait 已存在时只更新最近那条并 count+1，不重复堆。
 * input: { who, trait, evidence?, at?, weight? }
 * opts:  { baseDir? }
 * 返回：{ ok, created, count, impression, file } / { ok: false, reason }
 */
export function addImpression(input = {}, opts = {}) {
  input = asObj(input)
  opts = asObj(opts)
  const who = str(input.who, 40)
  const trait = str(input.trait, 60)
  if (!who) return { ok: false, reason: 'who 不能为空：这是对谁的印象' }
  if (!trait) return { ok: false, reason: 'trait 不能为空：一句话说是什么印象' }
  const at = isoOf(input.at) || localISO()
  const evidence = str(input.evidence, 300)
  const hasWeight = input.weight !== undefined && input.weight !== null && String(input.weight).trim() !== ''
  const weight = hasWeight ? weightOf(input.weight) : null
  if (hasWeight && weight === null) return { ok: false, reason: `weight 认不出：${String(input.weight)}` }
  const file = impressionFile(opts)
  const lines = readLines(file)
  let row = null
  let index = -1
  for (let i = 0; i < lines.length; i += 1) {
    let parsed = null
    try { parsed = JSON.parse(lines[i]) } catch { continue } // 坏行跳过
    if (!parsed || typeof parsed !== 'object') continue
    if (str(parsed.who, 40) === who && str(parsed.trait, 60) === trait) { row = parsed; index = i }
  }
  if (row) {
    const old = normalize(row)
    if (!old) return { ok: false, reason: `这条印象缺字段，不敢累加：${who}/${trait}` }
    const count = old.count + 1
    const merged = {
      ...row, // 先原样留着：将来加的字段不该被这次累加顺手抹掉
      id: old.id || `im-${crypto.createHash('sha1').update(`${who}|${trait}|${at}`, 'utf8').digest('hex').slice(0, 10)}`,
      who,
      trait,
      evidence: evidence || old.evidence,
      at: old.at || at,
      updatedAt: at,
      count,
      weight: weight === null ? old.weight : weight,
    }
    const written = lines.slice()
    written[index] = JSON.stringify(merged)
    atomicWrite(file, `${written.join('\n')}\n`)
    return { ok: true, created: false, count, impression: merged, file }
  }
  const impression = {
    id: `im-${crypto.createHash('sha1')
      .update(`${who}|${trait}|${at}|${crypto.randomBytes(4).toString('hex')}`, 'utf8')
      .digest('hex').slice(0, 10)}`,
    who,
    trait,
    evidence,
    at,
    updatedAt: at,
    count: 1,
    weight: weight === null ? DEFAULT_WEIGHT : weight,
  }
  appendRow(file, impression)
  return { ok: true, created: true, count: 1, impression, file }
}

/**
 * 读某人的印象，按 weight 降序、count 降序、最后更新倒序，取前 N（默认 10）。
 * who 传空 = 全部人（列表里带 who，调用方自己分）。
 * opts: { baseDir?, limit? }
 */
export function impressionsOf(who = '', opts = {}) {
  opts = asObj(opts)
  const target = str(who, 40)
  const rawLimit = Number(opts.limit)
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 10
  const rows = allImpressions(opts).filter((row) => !target || row.who === target)
  rows.sort((a, b) => (b.weight - a.weight)
    || (b.count - a.count)
    || ((toMs(b.updatedAt) || 0) - (toMs(a.updatedAt) || 0)))
  return rows.slice(0, limit)
}
