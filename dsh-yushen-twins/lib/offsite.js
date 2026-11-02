// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-10-31 10:58｜小鱼·工作台｜授权：自己｜lib/offsite.js:11-60 DEFAULT_ROOTS、:37 fullRoots、:69 空 rel 跳过；同批在 scripts/regression.mjs 末尾新增第 103 条断言（只加，没删改任何已有断言）｜备份清单补上宪章/认老板/常住绑定/契约/账本/信箱/公告栏/会话存档；空 root 不再吞整个家｜为什么：今天 16:11 家被清一次，恢复完发现宪章/认老板/常住绑定/契约/账本/信箱/公告栏/会话存档从来没进过任何备份；另 qqBridgeRoot() 返回空时 path.join(home,'') 会把整个 ~/.dsh 平铺进备份根｜可改：清单可增可删（家里添东西就补一行）；filter(Boolean) 与空 rel 跳过不许删
// 离线快照：把关键数据定期拷到另一块盘（比如 E:），并清掉太老的。
// 只做文件拷贝；不加密、不上传、不调模型。目标盘不在就跳过，不报错。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { packageRoot, offsiteDir, qqBridgeRoot, treasureDir } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

export const DEFAULT_ROOTS = [
  'dayu/soul',
  'dayu/journal',
  'dayu/story',
  'dayu/ideas',
  'dayu/solutions',
  'dayu/character-library',
  'dayu/characters.json',
  'dayu/awakening.json',
  'dayu/ranks.json',
  'dayu/freetime.json',
  // 2026-10-31 补：一次家目录重建把这两样整目录带走，而它们从来没进过任何备份。
  // sessions 是她的对话正文，storages 是工作区账本；少了它们，"人"在，"说过的话"不在。
  'sessions',
  'storages',
  // 2026-10-31 18:5x 补（小鱼）：上面这批漏掉了「这个家是谁的家」——宪章、认老板、常住绑定、
  // 契约、账本、信箱、公告栏、会话存档，一个都不在任何备份里。再被清一次，人还在，却认不出
  // 主人、也没有规矩。逐个点名而不吞整个 dayu：protection/avatars 共 60MB，只进全量层。
  'dayu/charter.json',
  'dayu/owner.json',
  'dayu/residence.json',
  'dayu/bodies.json',
  'dayu/retention.json',
  'dayu/offsite.json',
  'dayu/boot.json',
  'dayu/dispatch.json',
  'dayu/incidents.json',
  'dayu/growth.json',
  'dayu/capmap.json',
  'dayu/worklog.jsonl',
  'dayu/inbox.jsonl',
  'dayu/actions.jsonl',
  'dayu/audit.jsonl',
  'dayu/backup-judgments.jsonl',
  'dayu/memory-audit.jsonl',
  'dayu/contract',
  'dayu/letters',
  'dayu/board',
  'dayu/inbox',
  'dayu/state',
  'dayu/repair',
  'dayu/patches',
  'dayu/facts',
  'dayu/employees',
  'dayu/conversations',
  'dayu/nest',
  'dayu/runtime',
  'dayu/sessions-archive',
  'dayu/records',
  // 2026-11-01：原文/书目/错题/媒体/日记也进备份——她们是"家底"，不是缓存
  'dayu/live',
  'dayu/catalog',
  'dayu/mistakes',
  'dayu/library',
  'dayu/diary',
  'dayu/local',
  'dayu/events',
  packageRoot(),
]

const EXCLUDE = /[\\/](node_modules|\.git|dist|\.cache)[\\/]|\.log$/i

// 全盘备份（一天一次）：她 + 代码 + QQ 桥 + 宝藏。
// 2026-10-31 老板点出：电脑不是服务器，关机也要能补；所以调用方按「超过 24 小时就补一次」来调。
export function fullRoots() {
  // filter(Boolean) 不是洁癖：qqBridgeRoot() 找不到桥时返回 ''，而 path.join(home, '') 就是 home 本身——
  // 那样会把整个 ~/.dsh（连 api-token 一起）平铺进备份根目录，manifest 里还记成 rel:''。
  return [...DEFAULT_ROOTS, 'dayu/protection', 'dayu/avatars', qqBridgeRoot(), treasureDir()].filter(Boolean)
}

export function runFullBackup({ target = path.join(offsiteDir(), 'FULL'), keep = 3, now = new Date(), dryRun = false } = {}) {
  return runOffsiteBackup({ target, keep, roots: fullRoots(), now, dryRun })
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function countFiles(dir) {
  let files = 0, bytes = 0
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { const s = countFiles(full); files += s.files; bytes += s.bytes } else if (e.isFile()) { files += 1; bytes += fs.statSync(full).size }
    }
  } catch { /* 读不了跳过 */ }
  return { files, bytes }
}

/** 跑一次：拷到 target/<时间戳>/，写 manifest，按 keep 清旧。 */
export function runOffsiteBackup({ target = offsiteDir(), keep = 14, roots = DEFAULT_ROOTS, home = HOME, now = new Date(), dryRun = false } = {}) {
  const exists = fs.existsSync(target)
  if (!exists) {
    if (!dryRun) {
      try { fs.mkdirSync(target, { recursive: true }) } catch { return { ok: false, reason: `目标盘不可用：${target}` } }
    } else return { ok: false, reason: `目标盘不可用：${target}` }
  }
  const dir = path.join(target, stamp(now))
  if (!dryRun) fs.mkdirSync(dir, { recursive: true })
  const copied = []
  for (const rel of roots) {
    // 空串不是「根目录」，是没找到：跳过，别让 path.join(home, '') 把整个家备份成一份。
    if (!rel) continue
    const absolute = path.isAbsolute(rel)
    const src = absolute ? rel : path.join(home, rel)
    if (!fs.existsSync(src)) continue
    const dst = path.join(dir, absolute ? path.join('extra', path.basename(rel)) : rel)
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.cpSync(src, dst, { recursive: true, filter: (from) => !EXCLUDE.test(from) })
    }
    const s = countFiles(src)
    copied.push({ rel: absolute ? `extra/${path.basename(rel)}` : rel, files: s.files, bytes: s.bytes })
  }
  const manifest = {
    at: now.toISOString(),
    source: home,
    roots: copied,
    totalFiles: copied.reduce((n, x) => n + x.files, 0),
    totalBytes: copied.reduce((n, x) => n + x.bytes, 0),
  }
  if (!dryRun) fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  // 清理：只留最近 keep 份
  let pruned = []
  if (!dryRun) {
    let dirs = []
    // 2026-11-01 小鱼查出：这里只按份数滚，不看 .keep——「重要节点」那份会被后来三份挤掉。
    // 带 .keep 的目录一律不进候选（也不占 keep 名额）。
    try {
      dirs = fs.readdirSync(target, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(e.name))
        .map((e) => e.name)
        .filter((name) => !fs.existsSync(path.join(target, name, '.keep')))
        .sort()
    } catch { dirs = [] }
    while (dirs.length > Math.max(1, keep)) {
      const old = dirs.shift()
      try { fs.rmSync(path.join(target, old), { recursive: true, force: true }); pruned.push(old) } catch { /* 删不掉就留着 */ }
    }
  }
  const sha = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 16)
  return { ok: true, dir, manifest, sha, pruned, dryRun }
}
