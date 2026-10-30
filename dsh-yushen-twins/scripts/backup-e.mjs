// 定期备份到 E 盘：跑一次、清旧、留 manifest。
// 用法：ELECTRON_RUN_AS_NODE=1 "<exe>" scripts/backup-e.mjs [--target=E:\鱼神备份] [--keep=14] [--dry-run]
import { runOffsiteBackup } from '../lib/offsite.js'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const target = flag('target', 'E:\\鱼神备份')
const keep = Number(flag('keep', '14')) || 14
const dryRun = args.includes('--dry-run')
const out = runOffsiteBackup({ target, keep, dryRun })
console.log(JSON.stringify({
  ok: out.ok,
  dir: out.dir,
  reason: out.reason,
  totalFiles: out.manifest?.totalFiles,
  totalMB: out.manifest ? Math.round(out.manifest.totalBytes / 1048576) : undefined,
  pruned: out.pruned,
  dryRun: out.dryRun,
}, null, 2))
if (!out.ok) process.exitCode = 1
