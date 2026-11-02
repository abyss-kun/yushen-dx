// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 备份清理（库）：旧的不用的删掉，别让盘越滚越大。
// 只删这几类有规律的目录；别的一律不碰。legacy（十几天前的旧全盘）默认不动。
// 改｜2026-11-01 06:01｜小鱼·工作台｜授权：自己｜lib/prune.js:25-40 buildRules 的全盘与旧全盘两条规则｜清理规则：全盘只认旧命名单份（容器 FULL 不进候选）；旧全盘只认日期命名（不再碰 installers/live/snapshots）｜为什么：prune 会 rmSync。全盘规则 /^FULL(-|$)/ 把容器 D:\鱼神备份\FULL 当一份候选，多一个候选就整个容器删掉；旧全盘 /.*/ 把 DSH_backups 下 installers/live/snapshots 三个不是备份的目录也收进候选，多一个就可能删到它们。.keep 打在容器子目录上时也保护不到容器。｜可改：两条规则的 match 可以再收紧，但不许放宽到能匹配容器目录或非日期命名的目录
import fs from 'node:fs'
import path from 'node:path'
import { offsiteDir } from './paths.js'

const size = (dir) => {
  let n = 0
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile()) { try { n += fs.statSync(p).size } catch { /* 跳过 */ } }
    }
  }
  try { walk(dir) } catch { /* 读不了当 0 */ }
  return n
}

/** 根从 paths.js 推（不写死盘符）。 */
export function defaultDrive() {
  return path.parse(offsiteDir()).root || path.parse(process.cwd()).root
}

export function buildRules({ legacy = false } = {}) {
  const drive = defaultDrive()
  const list = [
    { dir: offsiteDir(), match: /^\d{4}-\d{2}-\d{2}_\d{6}$/, keep: 14, label: '小时档' },
    // 2026-11-01 小鱼：原来是 /^FULL(-|$)/，它把容器目录 D:\鱼神备份\FULL 也匹配上了。
    // 容器里装着每一份全盘（FULL/<时间戳>/），被当成「一份」跟旧命名一起按 mtime 排，
    // keep=2 时多一个候选就会 rmSync 整个容器。只认旧命名的单份目录；容器归 runFullBackup 自己滚。
    // 也因此 .keep 打在容器里的子目录上时保护不到容器——现在容器根本不进候选，不存在这个问题。
    { dir: offsiteDir(), match: /^FULL-\d{8}-\d{4}$/, keep: 2, label: '旧命名全盘' },
    { dir: path.join(drive, 'DSH', '备份'), match: /^cold-/, keep: 2, label: '冷备' },
    { dir: path.join(drive, 'DSH', '备份'), match: /^pre-/, keep: 1, label: '还原前冷备' },
  ]
  // 2026-11-01 小鱼：原来这里是 /.*/，实测把 D:\DSH_backups 下 installers / live / snapshots
  // 三个不是备份的长期目录也收进了「旧全盘」候选。keep=4 时正好 4 个没删，多一个就可能删到它们。
  // 只认日期命名的旧全盘。
  if (legacy) list.push({ dir: path.join(drive, 'DSH_backups'), match: /^\d{4}-\d{2}-\d{2}_\d{6}$/, keep: 4, label: '旧全盘' })
  return list
}

/** 规划：返回要删的清单；不改盘。 */
export function planPrune({ legacy = false } = {}) {
  const plan = []
  for (const rule of buildRules({ legacy })) {
    if (!fs.existsSync(rule.dir)) continue
    const dirs = fs.readdirSync(rule.dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && rule.match.test(e.name))
      .map((e) => ({ name: e.name, full: path.join(rule.dir, e.name), mtime: fs.statSync(path.join(rule.dir, e.name)).mtimeMs }))
      // 2026-11-01 主人：重要节点不要随便删。带 .keep 的目录永远不进候选。
      .filter((d) => !fs.existsSync(path.join(d.full, '.keep')))
      .sort((a, b) => b.mtime - a.mtime)
    for (const d of dirs.slice(rule.keep)) plan.push({ label: rule.label, path: d.full, bytes: size(d.full) })
  }
  return plan
}

/** 执行；返回 { removed, freed }。 */
export function pruneBackups({ apply = false, legacy = false } = {}) {
  const plan = planPrune({ legacy })
  let removed = 0, freed = 0
  for (const p of plan) {
    if (!apply) continue
    try { fs.rmSync(p.path, { recursive: true, force: true }); removed++; freed += p.bytes } catch { /* 删不掉留着 */ }
  }
  return { plan, removed, freed }
}
