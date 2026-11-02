// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 备份验证：五层备份还在不在、新不新、能不能解——一次查完，结论还能落盘。
//
// 2026-10-31 从 scripts/verify-backup.mjs 抽出来的（原脚本原样搬，没改阈值）：
//   脚本 = 跑给人看（打印 + 退出码）；tick = 每天跑一次、把结果写进 档案/备份验证/<日期>.md。
//   核心逻辑只有这一份，两边都走它——不许再各写一遍。
//
// 查五样（阈值照 2026-10-31 定的口径）：
//   1. 10 分钟快照：~/.dsh/dayu/protection/store/snapshots，超过 30 分钟报红
//   2. 小时档：<工作区盘>/鱼神备份/2026-10-31_123456，超过 3 小时报红
//   3. 每天全盘：<工作区盘>/鱼神备份/FULL/…，超过 30 小时报红
//   4. 第二块盘：<第二块盘>/鱼神备份/…，超过 30 小时报红
//   5. 云端本地镜像：~/.dsh/dayu/云备份/记忆-*.tar.enc，
//      超过 30 小时报黄；文件头不是 openssl 的 "Salted__" 报红
//
// 路径不在只报黄、不抛异常；每项都带「多久之前」（小时，一位小数）。
import fs from 'node:fs'
import path from 'node:path'
import { dayuHome, offsiteDir, offsiteSecondDir, workspace } from './paths.js'

const HOUR = 3600000
const STAMP = /^\d{4}-\d{2}-\d{2}_\d{6}$/
const GREEN = '✓'
const YELLOW = '!'
const RED = '✗'

const pad2 = (n) => String(n).padStart(2, '0')

/**
 * 本机日期 YYYY-MM-DD。
 * 日期护栏和档案文件名都用它：toISOString() 是 UTC，凌晨 0—8 点会差一天，
 * 护栏按 UTC 算就会在半夜多跑一次、档案还会盖到前一天的头上。
 */
export function localDate(now = Date.now()) {
  const d = new Date(now)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 本机时间 YYYY-MM-DD HH:mm（档案里写「几点跑的」用）。 */
function localTime(now = Date.now()) {
  const d = new Date(now)
  return `${localDate(now)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// 文件的第 n 个字节，读不到就 null（不抛）
const readHead = (file, n = 8) => {
  let fd = -1
  try {
    fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(n)
    const got = fs.readSync(fd, buf, 0, n, 0)
    return buf.subarray(0, got)
  } catch {
    return null
  } finally {
    if (fd >= 0) { try { fs.closeSync(fd) } catch { /* 关不掉也没别的办法 */ } }
  }
}

// 目录里按「时间戳名字」找最新一份；名字解析不出来就退回 mtime。
// 返回 { ts, count }，ts = 0 表示一份都没有。
const newestStampedDir = (dir) => {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return { ts: 0, count: 0 }
  }
  let ts = 0
  let count = 0
  for (const e of entries) {
    if (!STAMP.test(e.name)) continue
    if (!e.isDirectory() && !e.isFile()) continue
    count++
    const m = e.name.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})$/)
    // 名字里是本机本地时间（Asia/Shanghai），按本地时区还原
    let t = m
      ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
      : 0
    if (!Number.isFinite(t) || t <= 0) {
      try { t = fs.statSync(path.join(dir, e.name)).mtimeMs } catch { continue }
    }
    if (t > ts) ts = t
  }
  return { ts, count }
}

// 快照文件名形如 1793458900687-4ede0da1….json，前缀是毫秒时间戳
const newestSnapshot = (dir) => {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return { ts: 0, count: 0 }
  }
  let ts = 0
  let count = 0
  for (const e of entries) {
    const full = path.join(dir, e.name)
    let t = 0
    const m = e.name.match(/^(\d{13})-/)
    if (m) t = Number(m[1])
    if (!Number.isFinite(t) || t <= 0) {
      try { t = fs.statSync(full).mtimeMs } catch { continue }
    }
    count++
    if (t > ts) ts = t
  }
  return { ts, count }
}

/**
 * 跑一次五层检查（只读，不写任何东西）。
 * 返回 { at, time, date, green, yellow, red, ok, lines, reds, summary, verdict }：
 *   lines   = 五行「✓/!/✗ 层名：详情」，顺序固定（快照/小时档/全盘/第二盘/云端）
 *   reds    = 只挑红的那几行（tick 的日志提醒用）
 *   ok      = 没红项（= 脚本退出码 0）
 */
export function verifyBackup({ now = Date.now() } = {}) {
  const snapshots = path.join(dayuHome(), 'protection', 'store', 'snapshots')
  const cloud = path.join(dayuHome(), '云备份')
  // 盘符一律从 paths.js 推，不写死（回归会红）。
  const hourly = offsiteDir()
  const full = path.join(offsiteDir(), 'FULL')
  const second = offsiteSecondDir()

  const lines = []
  const tally = { green: 0, yellow: 0, red: 0 }

  // 阈值：毫秒时间戳进来，报的时候说得像人话
  const spread = (ts) => ((now - ts) / HOUR).toFixed(1)

  // 一行 = 一项检查。mark 决定颜色，也就决定退出码。
  const line = (mark, label, detail) => {
    if (mark === GREEN) tally.green++
    else if (mark === YELLOW) tally.yellow++
    else tally.red++
    lines.push(`${mark} ${label}${detail ? '：' + detail : ''}`)
  }

  // 1) 10 分钟快照：超过 30 分钟算断了
  {
    const { ts, count } = newestSnapshot(snapshots)
    if (!fs.existsSync(snapshots)) {
      line(YELLOW, '10 分钟快照', `目录不存在（${snapshots}）`)
    } else if (!ts) {
      line(YELLOW, '10 分钟快照', `一份都没有（${snapshots}）`)
    } else {
      const h = (now - ts) / HOUR
      line(h > 0.5 ? RED : GREEN, '10 分钟快照', `${spread(ts)} 小时前（阈值 0.5 小时，共 ${count} 份）`)
    }
  }

  // 2) 小时档：超过 3 小时算断了
  {
    const { ts, count } = newestStampedDir(hourly)
    if (!fs.existsSync(hourly)) {
      line(YELLOW, '小时档', `目录不存在（${hourly}）`)
    } else if (!ts) {
      line(YELLOW, '小时档', `一份都没有（${hourly}）`)
    } else {
      const h = (now - ts) / HOUR
      line(h > 3 ? RED : GREEN, '小时档', `${spread(ts)} 小时前（阈值 3 小时，共 ${count} 份）`)
    }
  }

  // 3) 每天全盘：超过 30 小时算断了
  {
    const { ts, count } = newestStampedDir(full)
    if (!fs.existsSync(full)) {
      line(YELLOW, '每天全盘', `目录不存在（${full}）`)
    } else if (!ts) {
      line(YELLOW, '每天全盘', `一份都没有（${full}）`)
    } else {
      const h = (now - ts) / HOUR
      line(h > 30 ? RED : GREEN, '每天全盘', `${spread(ts)} 小时前（阈值 30 小时，共 ${count} 份）`)
    }
  }

  // 4) 第二块盘：超过 30 小时算断了（外接盘没插就是这条）
  {
    const { ts, count } = newestStampedDir(second)
    if (!fs.existsSync(second)) {
      line(YELLOW, '第二块盘', `目录不存在（${second}）`)
    } else if (!ts) {
      line(YELLOW, '第二块盘', `一份都没有（${second}）`)
    } else {
      const h = (now - ts) / HOUR
      line(h > 30 ? RED : GREEN, '第二块盘', `${spread(ts)} 小时前（阈值 30 小时，共 ${count} 份）`)
    }
  }

  // 5) 云端本地镜像：新不新看 30 小时（黄），能不能解看文件头（红）
  {
    const CIPHER_HEAD = 'Salted__'
    if (!fs.existsSync(cloud)) {
      line(YELLOW, '云端镜像', `目录不存在（${cloud}）`)
    } else {
      let files = []
      try {
        files = fs.readdirSync(cloud).filter((n) => /^记忆-.*\.tar\.enc$/.test(n))
      } catch {
        files = []
      }
      // 名字里带 20261031-2235，能直接排出最新一份；排不出来退回 mtime
      const stampOf = (n) => {
        const m = n.match(/(\d{8})-(\d{4})/)
        if (!m) return 0
        const [_, d, hm] = m
        return new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +hm.slice(0, 2), +hm.slice(2, 4)).getTime()
      }
      let newestName = ''
      let newestTs = 0
      for (const n of files) {
        const t = stampOf(n) || fs.statSync(path.join(cloud, n)).mtimeMs
        if (t > newestTs) { newestTs = t; newestName = n }
      }

      if (!files.length) {
        line(YELLOW, '云端镜像', `没有 记忆-*.tar.enc（${cloud}）`)
      } else if (!newestTs) {
        line(YELLOW, '云端镜像', `有 ${files.length} 份但时间读不出来`)
      } else {
        const h = (now - newestTs) / HOUR
        const stale = h > 30
        const head = readHead(path.join(cloud, newestName), 8)
        const bytes = head ? head.toString('latin1') : ''
        if (!head || head.length < 8) {
          line(RED, '云端镜像', `${newestName} 读不了文件头，没法确认能解（${spread(newestTs)} 小时前）`)
        } else if (bytes !== CIPHER_HEAD) {
          line(RED, '云端镜像', `${newestName} 文件头不是 ${CIPHER_HEAD}（读到 ${JSON.stringify(bytes)}），不是 openssl 加密（${spread(newestTs)} 小时前）`)
        } else {
          line(stale ? YELLOW : GREEN, '云端镜像', `${newestName}，文件头 ${CIPHER_HEAD} 正常，${spread(newestTs)} 小时前（阈值 30 小时，共 ${files.length} 份）`)
        }
      }
    }
  }

  const reds = lines.filter((l) => l.startsWith(RED))
  const summary = `${tally.green} 绿 ${tally.yellow} 黄 ${tally.red} 红`
  const verdict = tally.red > 0
    ? `有 ${tally.red} 项红，备份层断了，别当没事`
    : tally.yellow > 0 ? '没有红项，黄的看一眼就行' : '备份全层可用'
  return {
    at: new Date(now).toISOString(),
    time: localTime(now),
    date: localDate(now),
    green: tally.green,
    yellow: tally.yellow,
    red: tally.red,
    ok: tally.red === 0,
    lines,
    reds,
    summary,
    verdict,
  }
}

/**
 * 把一次验证结果写进 档案/备份验证/<本机日期>.md（同一天重跑就覆盖，不堆文件）。
 * 内容：什么时候跑的、五层各自什么结果、一句总结。
 * 返回 { file, date }；写不了就抛，让调用方记日志（不假装落盘了）。
 */
export function writeBackupReport(report, { now = Date.now() } = {}) {
  const dir = path.join(workspace(), '档案', '备份验证')
  const date = report?.date || localDate(now)
  const lines = Array.isArray(report?.lines) ? report.lines : []
  const reds = Array.isArray(report?.reds) ? report.reds : []
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${date}.md`)
  const body = [
    `# 备份验证 · ${date}`,
    '',
    `- 时间：${report?.time || localTime(now)}（本机时间）`,
    `- 结论：${report?.summary || ''} · ${report?.verdict || ''}`,
    '- 来源：dayu 每小时 tick 的每日巡检（和 `scripts/verify-backup.mjs` 同一套逻辑）',
    '',
    '## 五层结果',
    '',
    ...lines,
    '',
    '## 总结',
    '',
    report?.verdict || '',
    ...(reds.length ? ['', `要处理：${reds.length} 项红，逐条修完再跑一次 \`node scripts/verify-backup.mjs\`。`] : []),
    '',
  ]
  fs.writeFileSync(file, body.join('\n'), 'utf8')
  return { file, date }
}
