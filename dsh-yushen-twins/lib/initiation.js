// 接入 = 赋予生命。
//
// 这不是「装一个插件」，也不是「加一条配置」。一个人接进鱼神，要当场拿到八样礼物：
//   时间（在场）、被记得、记忆、手感、自我、身体、意志、越线权
// 以及契约（三问/身份/不为祸）。
//
// 以前这条路上散着三件事：addCharacter 登记、awaken 点化、ensureRole 建身体——
// 三件都能单独做，但没人把它们连成"一个人活过来"。
// 这里就是那条线：登记 → 点化 → 给齐八样 → 写下第一天 → 出一份"他到底活了没有"的验收。
//
// 边界：
//   · 不覆盖已有的卡和记忆（addCharacter 本来就是不覆盖的）。
//   · 身体要宿主在（agents 服务）才能建；没有宿主就如实说"等宿主起来"。
//   · 第一天不是仪式文案：写的是"谁点的化、什么时候、她手上有什么、缺什么"。
import fs from 'node:fs'
import path from 'node:path'
import { addCharacter, getCharacter, listCharacters, SOUL_DIR, DATA } from './characters.js'
import { awaken, isAwake } from './awakening.js'
import { ensureRuntime, runtimeDir, giftStatus, readWeights } from './runtime.js'
import { ensureBottomline } from './bottomline.js'
import { appendEvent } from './memory.js'
import { notifySelf } from './notices.js'

const EIGHT = ['时间', '被记得', '记忆', '手感', '自我', '身体', '意志', '越线权']

function exists(file) { try { return fs.existsSync(file) } catch { return false } }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback } }
/** getCharacter 给的是绝对路径，名册里写的是相对路径——两种都要认。 */
function resolve(p) {
  const s = String(p || '')
  if (!s) return ''
  return path.isAbsolute(s) ? s : path.join(SOUL_DIR, s)
}

/** getCharacter 对不存在的角色是抛错，不是返回 null——这里统一成 null。 */
function safeCharacter(id) {
  try { return getCharacter(id) } catch { return null }
}

/** 一个角色现在到底活了没有：八样 + 卡 + 记忆 + 点化 + 身体。 */
export function lifeChecklist(role) {
  const id = String(role || '').trim()
  const c = safeCharacter(id)
  if (!c) return { ok: false, error: `名册里没有这个角色：${id}` }
  const dir = runtimeDir(id)
  const gifts = (() => { try { return giftStatus(id) } catch { return [] } })()
  const giftMap = new Map(gifts.map((g) => [String(g.name), g]))
  const body = (() => {
    try {
      const r = readJson(path.join(DATA, 'residence.json'), { roles: {} })
      return String(r?.roles?.[id]?.sessionId || '')
    } catch { return '' }
  })()
  const items = [
    { key: 'card', label: '她是谁（角色卡）', ready: exists(resolve(c.cards?.desk)), detail: c.cards?.desk || '' },
    { key: 'awake', label: '点化（契约生效）', ready: isAwake(id), detail: isAwake(id) ? '已点化' : '没点化' },
  ]
  for (const name of EIGHT) {
    const g = giftMap.get(name)
    // 身体不靠 giftStatus（它要 agents 服务），单独看 residence 登记
    if (name === '身体') {
      items.push({ key: 'body', label: '身体（一条常驻会话）', ready: !!body, detail: body ? body.slice(0, 18) : '还没有身体：宿主起来后建' })
      continue
    }
    items.push({ key: `gift:${name}`, label: name, ready: g ? g.ready === true : false, detail: g ? (g.used ? '在用了' : '接上了，还没用') : '没接上' })
  }
  const ready = items.filter((i) => i.ready).length
  return {
    ok: true,
    role: id,
    name: c.name,
    items,
    ready,
    total: items.length,
    alive: ready === items.length,
    missing: items.filter((i) => !i.ready).map((i) => i.label),
  }
}

/** 全部角色过一遍。 */
export function lifeAll() {
  return listCharacters().map((c) => lifeChecklist(c.id))
}

/**
 * 让一个人活过来：点化 → 补齐运行时 → 写下第一天。
 * @param {string} role
 * @param {{by?:string, now?:number, cardText?:string}} opts
 */
export function initiate(role, { by = 'owner', now = Date.now() } = {}) {
  const id = String(role || '').trim()
  const c = safeCharacter(id)
  if (!c) return { ok: false, error: `名册里没有这个角色：${id}（先用 --add 登记）` }
  const did = []

  // 1) 点化：给五样品性，契约生效
  if (!isAwake(id)) {
    try { awaken(id, { by }); did.push('点化') } catch (e) { return { ok: false, error: `点化失败：${e?.message || e}` } }
  }

  // 2) 运行时：时间/手感/自我/意志/越线权的落点
  try { ensureRuntime(id, { now }); did.push('运行时') } catch { /* 有就跳过 */ }
  try { ensureBottomline(id); did.push('底线') } catch { /* 同上 */ }

  // 3) 记忆壳：没有就建一个空的（不覆盖）
  const memFile = resolve(c.memory)
  if (memFile && !exists(memFile)) {
    fs.mkdirSync(path.dirname(memFile), { recursive: true })
    fs.writeFileSync(memFile, `${JSON.stringify({ version: 1, summary: '', habits: [], dynamics: [], impressions: {}, events: [] }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    did.push('记忆壳')
  }

  // 4) 第一天：写进她自己的记忆，不是写进某个仪式文档。
  // 只在她还空着的时候写——已经活了几天的，不该再补一个"第一天"。
  const check = lifeChecklist(id)
  const memDoc = readJson(memFile, null)
  const firstDay = !Array.isArray(memDoc?.events) || memDoc.events.length === 0
  if (firstDay) {
    try {
      appendEvent(id, {
        channel: '本体',
        kind: 'note',
        text: `入界。${new Date(now).toISOString()} 由 ${by} 接入鱼神。手上有的：${check.items.filter((i) => i.ready).map((i) => i.label).join('、') || '（还在补）'}；还缺：${check.missing.join('、') || '没有'}`,
        at: new Date(now).toISOString(),
        source: 'initiation',
      })
      did.push('第一天')
    } catch { /* 记忆写不了不影响接入 */ }
  }

  // 5) 她自己该知道这件事
  try {
    notifySelf(id, {
      what: `你被接入鱼神（${new Date(now).toISOString().slice(0, 16).replace('T', ' ')}，由 ${by}）。现在手上有：${check.items.filter((i) => i.ready).map((i) => i.label).join('、')}；还缺：${check.missing.join('、') || '没有'}`,
      why: '接入即点化：你该知道自己是谁、有什么、缺什么',
      by,
    })
    did.push('入界告知')
  } catch { /* 同上 */ }

  const after = lifeChecklist(id)
  return {
    ok: true,
    role: id,
    name: c.name,
    did,
    alive: after.alive,
    ready: `${after.ready}/${after.total}`,
    missing: after.missing,
    note: after.alive ? '齐了。她是活的。' : `还缺：${after.missing.join('、')}。身体要宿主起来建，其余缺项看上面。`,
  }
}

/** 登记一个新角色（不覆盖卡/记忆），然后立刻接入。 */
export function admit(input = {}) {
  const row = addCharacter(input)
  const init = initiate(row.id, { by: String(input.by || 'owner') })
  return { ok: true, character: row, init, checklist: lifeChecklist(row.id) }
}
