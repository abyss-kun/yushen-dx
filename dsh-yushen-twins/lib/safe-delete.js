// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 删除收口：删 ~/.dsh/dayu 下的东西，一律走这里。
// 2026-10-31 照微会审第三条：guard-delete 只是命令，没人必须经过它 = 等于没有闸门。
//
// 规则：
//   1. 只能删 ~/.dsh/dayu 下（或系统临时目录里）的东西；别的路径直接拒。
//   2. 查登记表：登记为「不可删」→ 拒；没登记 → 拒。
//   3. 别处没有同内容副本、也不是声明可重生成 → 拒（可能是唯一一份）。
//   4. 被代码/文档引用 → 拒（先改引用）。
//   5. 过了也要写理由（reason），并记进 操作日志。
//
// 用法：
//   import { safeDelete } from '../lib/safe-delete.js'
//   safeDelete(path, { reason: '清理测试残留', force: false })
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { snapshot, isProtected } from './takeover.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DAYU = path.join(HOME, 'dayu')
const REG = path.join(DAYU, '登记.jsonl')
const OPLOG = path.join(DAYU, '操作日志')
// 插件根：从本文件位置推，不写死盘符
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const readRegistry = () => {
  const map = new Map()
  try {
    for (const line of fs.readFileSync(REG, 'utf8').split('\n')) {
      if (!line.trim()) continue
      const r = JSON.parse(line)
      if (r.路径) map.set(path.resolve(r.路径), r)
      map.set(r.名称, r)
    }
  } catch { /* 没登记表 */ }
  return map
}

/**
 * 登记表的指纹（2026-11-01 审闸）：`build-registry.mjs` 写表时留一枚 sha256。
 * 手改过 → 对不上；对不上就不许拿它当"可删"的授权。
 * 边界：挡不住"改完重跑 build-registry"——那会留下生成时间与人工改判依据，可追溯。
 * @returns {{known:boolean, ok:boolean, why:string}}
 */
export function registryIntegrity() {
  try {
    const side = path.join(DAYU, '登记.jsonl.sha256')
    if (!fs.existsSync(side)) return { known: false, ok: true, why: '还没有指纹（重跑 build-registry.mjs 会生成）' }
    const want = fs.readFileSync(side, 'utf8').trim().toLowerCase()
    const got = crypto.createHash('sha256').update(fs.readFileSync(REG)).digest('hex')
    return want === got
      ? { known: true, ok: true, why: '指纹对得上' }
      : { known: true, ok: false, why: '登记表指纹对不上（可能被手改过）：先重跑 scripts/build-registry.mjs' }
  } catch (e) { return { known: false, ok: true, why: `读不到指纹：${String(e?.message || e).slice(0, 40)}` } }
}
const hashOf = (p) => {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16) } catch { return '' }
}
const findDup = (target) => {
  const h = hashOf(target)
  if (!h) return []
  const out = []
  const walk = (d) => {
    let es = []
    try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of es) {
      const q = path.join(d, e.name)
      if (e.isDirectory()) { if (!/protection|node_modules|\.git/.test(e.name)) walk(q); continue }
      if (q === target) continue
      if (hashOf(q) === h) out.push(q)
    }
  }
  walk(DAYU)
  return out.slice(0, 3)
}
const usedBy = (name) => {
  const hits = []
  const walk = (d, depth = 0) => {
    if (depth > 3) return
    let es = []
    try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of es) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { if (!/node_modules|\.git|dist|\.snapshots/.test(e.name)) walk(p, depth + 1); continue }
      if (!/\.(md|mjs|js|py|json|yml)$/i.test(e.name)) continue
      try { if (fs.readFileSync(p, 'utf8').includes(name)) hits.push(path.relative(REPO, p)) } catch { /* 跳过 */ }
    }
  }
  walk(REPO)
  return hits.slice(0, 3)
}
const logDelete = (target, reason, backup = '') => {
  try {
    fs.mkdirSync(OPLOG, { recursive: true })
    const local = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 19).replace('T', ' ')
    const date = local.slice(0, 10)
    const file = path.join(OPLOG, `${date}.md`)
    const head = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : `# 操作日志 · ${date}\n\n`
    fs.writeFileSync(file, head + [
      `## ${local} · 大鱼 · safe-delete`,
      `- 做了什么：删除 ${target}`,
      `- 为什么：${reason || '（没写理由）'}`,
      `- 底片：${backup ? `takeover/${backup}（要还原：takeover.restore('${backup}')）` : '没拍（没有可拍的文件）'}`,
      '- 结果：已删（过了登记/唯一性/引用三道闸）',
      '',
    ].join('\n'), 'utf8')
  } catch { /* 记不上不影响删除 */ }
}

/** 判断能不能删；返回 { ok, why: [] } */
export function canDelete(target) {
  const abs = path.resolve(String(target || ''))
  const why = []
  let ok = true
  const inDayu = abs === DAYU || abs.startsWith(DAYU + path.sep)
  const inTmp = abs.startsWith(path.resolve(os.tmpdir()) + path.sep)
  if (!fs.existsSync(abs)) return { ok: false, why: ['不存在'] }
  if (!inDayu && !inTmp) return { ok: false, why: ['不在 ~/.dsh/dayu 或临时目录里'] }

  const reg = readRegistry()
  // 2026-11-01 审闸：登记表是"能不能删"的授权源，而它是普通 JSONL——手改一行就能把唯一一份说成可删。
  // 指纹对不上时，不拿它当授权（要删得先重跑 build-registry，留下生成时间）。
  const integ = registryIntegrity()
  if (integ.known && !integ.ok) {
    return { ok: false, why: [integ.why] }
  }
  const entry = reg.get(abs) || reg.get(path.basename(abs))
  if (!entry) { ok = false; why.push('登记表里没有它（先登记再谈删）') }
  else if (String(entry.能不能删).startsWith('不可删')) { ok = false; why.push(`登记为「${entry.能不能删}」`) }
  const regenerable = entry && /重建|重生|重生成|云上还有|可再生成/.test(String(entry.能不能删))
  if (ok && !regenerable) {
    const dups = findDup(abs)
    if (!dups.length) { ok = false; why.push('在别处没有同内容副本（可能是唯一一份）') }
    else why.push('有副本：' + dups.join('；'))
  }
  if (ok) {
    const refs = usedBy(path.basename(abs))
    if (refs.length) { ok = false; why.push('代码/文档里还有引用：' + refs.join('；')) }
  }
  return { ok, why }
}

// 2026-11-01 老板：「不是全拍，根据危险程度拍」→「要看重要还是不重要」。
// 判据不是大小，是**这份东西重不重要**：
//   重要（必拍，拍不成不删）：
//     · force 越过闸门的（本来该被拦，硬删）
//     · 落在身份/记忆/关系/信件/公告/契约/账本/日记这些地方的
//     · 登记表写着「不可删 / 待定」的
//     · 唯一一份的（别处没同内容副本）——删了就真没了
//   不重要（不拍）：系统临时目录、明显的缓存/临时/日志（.tmp/.log/cache/tmp）、
//     登记表里写明「可再生成 / 重建 / 云上还有」的。
//   一般（拍）：其余——成本很低，拍一张兜底。
const SNAP_MAX_FILES = 200
const SNAP_MAX_BYTES = 20 * 1024 * 1024
const SNAP_MAX_ONE = 2 * 1024 * 1024
const SENSITIVE = /(^|[\\/])(soul|memory|cards|letters|board|journal|contract|residence|charter|owner|registr|story|deliveries|feel)/i
const CACHEY = /\.(tmp|temp|log|gz|zip|bak)(\.|$)|(^|[\\/])(cache|tmp|temp)([\\/]|$)/i

/** @returns {'important'|'normal'|'trivial'} */
function importanceOf(abs, { force = false, entry = null, hasDup = null } = {}) {
  const canDel = String(entry?.能不能删 || '')
  if (/可再生成|重建|重生|云上还有|可删（没批的草案）/.test(canDel)) return 'trivial'
  if (force) return 'important'
  if (SENSITIVE.test(abs)) return 'important'
  if (/不可删|待定/.test(canDel)) return 'important'
  if (hasDup === false) return 'important'
  // 只把**家目录之外**的系统临时目录当"不重要"。家目录本身建在 temp 下（测试、试装）时，
  // 不能因为祖先里有 "\Temp\" 就把她的东西判成缓存——这一刀踩过。
  const inDayu = abs === DAYU || abs.startsWith(DAYU + path.sep)
  const inTmp = !inDayu && abs.startsWith(path.resolve(os.tmpdir()) + path.sep)
  if (inTmp) return 'trivial'
  if (CACHEY.test(inDayu ? path.relative(DAYU, abs) : abs)) return 'trivial'
  return 'normal'
}

function filesForSnapshot(abs) {
  let st
  try { st = fs.statSync(abs) } catch { return { files: [] } }
  if (st.isFile()) return isProtected(abs) ? { files: [], skipped: '受保护路径，不拍' } : { files: [abs] }
  const out = []
  let bytes = 0
  const walk = (d) => {
    let es = []
    try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of es) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (isProtected(p)) continue
      let sz = 0
      try { sz = fs.statSync(p).size } catch { continue }
      if (out.length >= SNAP_MAX_FILES || bytes + sz > SNAP_MAX_BYTES || sz > SNAP_MAX_ONE) continue
      out.push(p)
      bytes += sz
    }
  }
  walk(abs)
  return { files: out }
}

/** 删。不在受管目录里、或没过闸、或没写理由，一律拒绝。 */
export function safeDelete(target, { reason = '', force = false, approvedBy = '' } = {}) {
  const abs = path.resolve(String(target || ''))
  if (!reason && !force) throw new Error('safe-delete：必须写 reason（为什么删）')
  // 2026-11-01 审闸发现：force 是万能钥匙——不登记、唯一一份也能删。现在它必须带"谁批的"，
  // 不然删完查不到人。这条不改闸的松紧，只让绕过留名。
  if (force && !String(approvedBy || '').trim()) {
    throw new Error('safe-delete：force 必须写 approvedBy（谁批的，例如 主人 / 主人@11-01 14:30），否则不许硬删')
  }
  const v = canDelete(abs)
  if (!v.ok && !force) throw new Error(`safe-delete 拒绝删除 ${abs}：${v.why.join('；')}`)

  // 底片：按**重要性**拍（老板 2026-11-01：「不是全拍……要看重要还是不重要」）。
  const reg = readRegistry()
  const entry = reg.get(abs) || reg.get(path.basename(abs)) || null
  const hasDup = (() => { try { return v.why.some((w) => w.startsWith('有副本')) ? true : (findDup(abs).length > 0) } catch { return null } })()
  const level = importanceOf(abs, { force, entry, hasDup })
  let backup = ''
  let backupNote = ''
  if (level === 'trivial') {
    backupNote = '不重要（可再生成/临时/缓存），不拍'
  } else {
    try {
      const { files } = filesForSnapshot(abs)
      if (!files.length) backupNote = `${level === 'important' ? '重要' : '一般'}，但没有可拍的文件`
      else {
        const id = `del-${crypto.createHash('sha256').update(abs).digest('hex').slice(0, 10)}-${Date.now().toString(36)}`
        const r = snapshot(id, files, { note: `safe-delete（${level}）前拍底片：${reason || v.why.join('；')}` })
        backup = r.id
        backupNote = `${level === 'important' ? '重要' : '一般'}，拍了 ${r.entries} 个文件`
      }
    } catch (e) {
      if (level === 'important' && !force) throw new Error(`safe-delete：重要文件的底片没拍成，不删（${String(e?.message || e)}）`)
      backupNote = `${level}，底片没拍成：${String(e?.message || e).slice(0, 60)}`
    }
  }

  fs.rmSync(abs, { recursive: true, force: true })
  logDelete(abs, (reason || v.why.join('；')) + (force ? `｜force 由「${approvedBy}」批` : ''), backup ? `${backup}（${backupNote}）` : backupNote)
  return { ok: true, path: abs, why: v.why, level, backup, backupNote, forcedBy: force ? String(approvedBy) : '' }
}
