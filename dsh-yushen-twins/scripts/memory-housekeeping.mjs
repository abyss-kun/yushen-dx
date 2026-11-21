/* 标签
 * id: memory-housekeeping
 * kind: module
 * tags: 记忆维护, 遗忘, 合并, 离线, 不占宿主
 * created: 2026-11-04 14:05:00
 * changed: 2026-11-04 17:28:35
 * author: 照微·工作台
 * authority: 老板（2026-11-04：能放到电脑里正常工作的就别放宿主里，卡卡的容易把宿主搞崩）
 * why: 「遗忘」和「记忆合并」都是纯本地文件活，原来跑在宿主进程里（每 6 小时 / 每小时），会卡界面
 * result: 搬成离线脚本，由 maintenance 调；宿主里只剩"派发"，不干重活
 * mutable: 可改
 */
// 用法：
//   node scripts/memory-housekeeping.mjs            # 真跑（各自带日期护栏）
//   node scripts/memory-housekeeping.mjs --dry      # 只看计划，不动文件
//   node scripts/memory-housekeeping.mjs --force    # 无视护栏，立刻跑一次
//
// 两件事：
//   ① 遗忘（lib/forget.js）：策略在 retention.json，白名单不碰，删前进冷档；**先备份，备份没成就不清**
//   ② 合并（lib/consolidate.js）：同一件事说过好几遍的合一条（旧的标被替换，不删）
// 护栏：遗忘 6 小时一次、合并 20 小时一次；护栏记在文件里，重启也不会重复跑。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 2026-11-04 老板：本地进程不能占着不放（宿主崩了也得能修）。硬超时自己退。
import { hardTimeout } from '../lib/offline-guard.js'
hardTimeout(10, 'memory-housekeeping.mjs')
import { logDisposal } from '../lib/disposal-log.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const D = path.join(HOME, 'dayu')
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const force = args.includes('--force')

const { residentRoleIds } = await import(pathToFileURL(path.join(ROOT, 'lib', 'roles.js')).href)
const { plan: forgetPlan, autoOnce: forgetAuto } = await import(pathToFileURL(path.join(ROOT, 'lib', 'forget.js')).href)
const { consolidate: consolidateRole } = await import(pathToFileURL(path.join(ROOT, 'lib', 'consolidate.js')).href)

const st = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return {} } }
const save = (file, obj) => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8') } catch { /* 记不上不影响 */ } }
const now = Date.now()
const out = { consolidate: [], forget: '', skipped: [] }

// ① 合并（20 小时护栏）
try {
  const stateFile = path.join(D, 'state', 'consolidate.json')
  const s = st(stateFile)
  const last = Date.parse(String(s.lastRunAt || '')) || 0
  if (!force && last && now - last < 20 * 3600 * 1000) out.skipped.push('合并：还没到 20 小时')
  else {
    for (const role of residentRoleIds()) {
      try {
        if (dry) { out.consolidate.push(`${role}：dry（不合并）`); continue }
        const r = consolidateRole(role)
        if (r.groups > 0) out.consolidate.push(`${role}：合并 ${r.groups} 组，标记 ${r.superseded.length} 条`)
      } catch (e) { out.consolidate.push(`${role}：失败 ${String(e?.message || e).slice(0, 60)}`) }
    }
    if (!dry) save(stateFile, { lastRunAt: new Date(now).toISOString() })
  }
} catch { out.skipped.push('合并：没跑成') }

// ② 遗忘（6 小时护栏；先备份再清）
try {
  const stateFile = path.join(D, 'state', 'forget.json')
  const s = st(stateFile)
  const last = Date.parse(String(s.lastRunAt || '')) || 0
  if (!force && last && now - last < 6 * 3600 * 1000) out.skipped.push('遗忘：还没到 6 小时')
  else {
    const p = forgetPlan()
    const total = p.snapshots.drop.length + p.objects.drop.length + p.artifacts.drop.length
    if (!total) out.forget = '没有该清的'
    else if (dry) out.forget = `dry：会清 ${total} 项（快照 ${p.snapshots.drop.length} / 对象 ${p.objects.drop.length} / 产物 ${p.artifacts.drop.length}）`
    else {
      // 先备份：备份没成功就不清（这条顺序不许改）
      let guardOk = false
      try {
        const { createBackup } = await import(pathToFileURL(path.join(ROOT, 'lib', 'versioned-backup.js')).href)
        const r = await createBackup({ roots: [D], note: '遗忘前备份' })
        guardOk = Boolean(r && (r.ok !== false))
      } catch { guardOk = false }
      if (!guardOk) out.forget = '备份没成，今天不清（顺序：先备份再清）'
      else {
        const r = await forgetAuto({ now, dryRun: false })
        out.forget = `清了 ${total} 项`
        save(stateFile, { lastRunAt: new Date(now).toISOString(), cleared: total, result: r })
        // 2026-11-04 老板：动了东西要留记录——自动清理也得在公告栏里说一声，
        // 不然别的角色醒来看到备份少了，会当成丢了。
        try {
          const { recordChange } = await import(pathToFileURL(path.join(ROOT, 'lib', 'changes-log.js')).href)
          recordChange({ who: '自动维护（照微）', action: 'delete', what: `遗忘清掉 ${total} 项（快照 ${p.snapshots.drop.length} / 对象 ${p.objects.drop.length} / 产物 ${p.artifacts.drop.length}）`, why: '策略保留期到了（retention.json）', authority: '主人（自动维护）' })
        } catch { /* 记不上不影响清理 */ }
        // 2026-11-04 老板：图书馆要"剔旧留痕"——删掉的东西也得留名，否则盘点时分不清是丢了还是剔了。
        try {
          const { logDisposal } = await import(pathToFileURL(path.join(ROOT, 'lib', 'disposal-log.js')).href)
          logDisposal({
            what: `遗忘清理：快照 ${p.snapshots.drop.length} / 对象 ${p.objects.drop.length} / 产物 ${p.artifacts.drop.length}`,
            count: total,
            why: '保留期到了（retention.json）',
            detail: [...p.snapshots.drop.slice(0, 8).map((x) => `快照 ${x.name}`), ...p.objects.drop.slice(0, 8).map((x) => `对象 ${x.name.slice(0, 12)}…`)],
          })
        } catch { /* 记不上不影响清理 */ }
      }
    }
  }
} catch { out.skipped.push('遗忘：没跑成') }

// 只输出一份 JSON（调用方要能直接 JSON.parse；人看也够）。跳过原因已经在 skipped 里。
console.log(JSON.stringify({ at: new Date(now).toISOString(), dry, ...out }, null, 2))
