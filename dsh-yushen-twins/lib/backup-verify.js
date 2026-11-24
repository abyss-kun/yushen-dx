// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-backup-verify
 * kind: module
 * summary: 备份验证：五层备份还在不在、新不新、能不能解——一次查完，结论可落盘到 档案/备份验证。
 * tags: 备份验证, 五层, 体检
 * created: 2026-11-11 01:05:00
 * changed: 2026-11-11 01:05:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 维护流程（脚本与 tick 共用）、面板、她
 * owner: 框架；阈值与五层定义要老板点头
 * mutable: 可改；**核心逻辑只许这一份**（脚本和 tick 都调它，不许再各写）
 * usage: verify() → {ok, layers[], gaps}；脚本打印、tick 写档案
 * why: 备份"看起来在"和"真能解"是两件事；两边各写一遍就会有一套先腐
 * result: 一份验证逻辑 + 一处结论落盘
 */
// 备份验证：五层备份还在不在、新不新、能不能解——一次查完，结论还能落盘。
//
// 2026-10-31 从 scripts/verify-backup.mjs 抽出来的（原脚本原样搬，没改阈值）：
//   脚本 = 跑给人看（打印 + 退出码）；tick = 每天跑一次、把结果写进 档案/备份验证/<日期>.md。
//   核心逻辑只有这一份，两边都走它——不许再各写一遍。
//
// 查五样（阈值照 2026-10-31 定的口径）：
//   1. 30 分钟快照：~/.dsh/dayu/protection/store/snapshots，超过 1.5 小时报红
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
  // 2026-11-08（照微）：快照库路径与节奏都不再写死——`protection/config.json` 里有 `store` 和
  // `intervalMs`。今天 18:52 那份 config 把 store 移到 `D:\鱼神备份\内部快照\store`、节奏改成 1 小时，
  // 写死的检查就报「目录不存在」，看着像丢了库——其实库好好的，是检查太旧。
  const protCfg = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(dayuHome(), 'protection', 'config.json'), 'utf8').replace(/^\uFEFF/, '')) } catch { return {} }
  })()
  const storeRoot = protCfg.store ? path.resolve(String(protCfg.store)) : path.join(dayuHome(), 'protection', 'store')
  const snapshots = path.join(storeRoot, 'snapshots')
  const snapIntervalMin = Math.max(1, Math.round((Number(protCfg.intervalMs) || 600000) / 60000))
  // 阈值给 3 个周期（错两轮不慌，错三轮才算断），但不少于 1.5 小时
  const snapLimitH = Math.max(1.5, (3 * snapIntervalMin) / 60)
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

  // 1) 30 分钟快照：超过 1.5 小时算断了（2026-11-03 老板把节奏从 10 分钟改成 30 分钟；
  //    阈值放到 3 个周期：错两轮不慌，错三轮才算断）
  {
    const { ts, count } = newestSnapshot(snapshots)
    const snapLabel = `每 ${snapIntervalMin} 分钟快照`
    if (!fs.existsSync(snapshots)) {
      line(YELLOW, snapLabel, `目录不存在（${snapshots}）`)
    } else if (!ts) {
      line(YELLOW, snapLabel, `一份都没有（${snapshots}）`)
    } else {
      const h = (now - ts) / HOUR
      line(h > snapLimitH ? RED : GREEN, snapLabel, `${spread(ts)} 小时前（阈值 ${snapLimitH} 小时，共 ${count} 份）`)
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
      // 2026-11-05（照微）：maintenance 在「指纹没变」时只把 state 的 lastAt 往前推、**不落新目录**，
      // 而这里只看目录年龄——内容明明没变也会一直报红（11-04 红了一轮，我手动补跑才好）。
      // 判据改成「最近一次确认可用」：目录年龄 与 state.lastAt 取较新的那个，
      // 前提是 state 指的那个目录真的还在（不然就是自欺）。
      let eff = ts
      try {
        const st = JSON.parse(fs.readFileSync(path.join(dayuHome(), 'full-backup.json'), 'utf8'))
        const at = Date.parse(st.lastAt || '') || 0
        const dirOk = Boolean(st.dir) && fs.existsSync(st.dir) && fs.statSync(st.dir).isDirectory()
        if (at > eff && dirOk) eff = at
      } catch { /* 没有 state 就只按目录年龄 */ }
      const h = (now - eff) / HOUR
      line(h > 30 ? RED : GREEN, '每天全盘', `${spread(eff)} 小时前（阈值 30 小时，共 ${count} 份）`)
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
      // 2026-11-05（照微）：云端镜像有两个可能的落点——老位置在 `dayu/云备份`，
      // 而 `云备份.py` 按代码写的是 `<工作区>/云备份`。只认一个就会「明明有新的也说没有」
      // （今天黄了 110 小时，就是只看了旧位置）。两边都看，取最新那份。
      // 2026-11-09（照微）：又多了第二种名字——`scripts/backup-encrypted.mjs` 产的是
      // `鱼神加密备份-YYYYMMDD-HHMM.tar.gz.enc`，落在 `<工作区>/备份/加密`。
      // 只认 `记忆-*.tar.enc` 就会再一次「新的看不见」。名字和落点一起放宽。
      const cloudDirs = [...new Set([cloud, path.join(workspace(), '云备份'), path.join(workspace(), '备份', '加密')])]
        .filter((d) => { try { return fs.existsSync(d) } catch { return false } })
      const found = []
      for (const d of cloudDirs) {
        try {
          for (const n of fs.readdirSync(d)) {
            if (/^(记忆-.*\.tar\.enc|鱼神加密备份-.*\.tar\.gz\.enc)$/.test(n)) found.push({ dir: d, name: n })
          }
        } catch { /* 读不动就跳过这个目录 */ }
      }
      // 名字里带 20261031-2235，能直接排出最新一份；排不出来退回 mtime
      const stampOf = (n) => {
        const m = n.match(/(\d{8})-(\d{4})/)
        if (!m) return 0
        const [_, d, hm] = m
        return new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +hm.slice(0, 2), +hm.slice(2, 4)).getTime()
      }
      let newestName = ''
      let newestFile = ''
      let newestTs = 0
      for (const { dir, name } of found) {
        const t = stampOf(name) || fs.statSync(path.join(dir, name)).mtimeMs
        if (t > newestTs) { newestTs = t; newestName = name; newestFile = path.join(dir, name) }
      }

      if (!found.length) {
        line(YELLOW, '云端镜像', `没有 记忆-*.tar.enc（${cloudDirs.join(' | ') || cloud}）`)
      } else if (!newestTs) {
        line(YELLOW, '云端镜像', `有 ${found.length} 份但时间读不出来`)
      } else {
        const h = (now - newestTs) / HOUR
        const stale = h > 30
        // 2026-11-09（照微）：两种包两个头——openssl 的 `Salted__`，和 `backup-encrypted.mjs`
        // 自己封装的 `YSBK1`（scrypt + AES-256-GCM）。拿一个头去套两种包，必有一个假红。
        const expectHead = /\.tar\.gz\.enc$/i.test(newestName) ? 'YSBK1' : CIPHER_HEAD
        const head = readHead(newestFile, 8)
        const bytes = head ? head.toString('latin1') : ''
        if (!head || head.length < 5) {
          line(RED, '云端镜像', `${newestName} 读不了文件头，没法确认能解（${spread(newestTs)} 小时前）`)
        } else if (!bytes.startsWith(expectHead)) {
          line(RED, '云端镜像', `${newestName} 文件头不是 ${expectHead}（读到 ${JSON.stringify(bytes.slice(0, 8))}），格式对不上（${spread(newestTs)} 小时前）`)
        } else {
          line(stale ? YELLOW : GREEN, '云端镜像', `${newestName}，文件头 ${expectHead} 正常，${spread(newestTs)} 小时前（阈值 30 小时，共 ${found.length} 份）`)
        }
      }
    }
  }

  // 2026-11-09（照微）：老板 11-08 23:17 把自动备份关了（`backup-switch.json`: auto=false，写着
  // 「重启不要自动备份」）。那之后这几层还按 3 小时报红，等于把「他关的」当成「坏了」——
  // 红被当噪音看久了，真的坏了也没人信。自动备份关着时，这四项一律降成黄，并在详情里写明。
  const autoOff = (() => {
    try {
      const sw = JSON.parse(fs.readFileSync(path.join(dayuHome(), 'backup-switch.json'), 'utf8').replace(/^\uFEFF/, ''))
      return Boolean(sw && sw.auto === false)
    } catch { return false }
  })()
  if (autoOff) {
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith(RED)) continue
      if (!/快照|小时档|每天全盘|第二块盘/.test(lines[i])) continue
      lines[i] = `${YELLOW}${lines[i].slice(RED.length)}（自动备份已关：backup-switch.json）`
    }
    tally.green = lines.filter((l) => l.startsWith(GREEN)).length
    tally.yellow = lines.filter((l) => l.startsWith(YELLOW)).length
    tally.red = lines.filter((l) => l.startsWith(RED)).length
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
