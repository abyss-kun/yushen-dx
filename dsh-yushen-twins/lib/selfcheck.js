// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 自省：不等老板喊，自己跑一遍「能不能站住」。
//
// 2026-10-27 重写。原来的做法：每 30 分钟 spawn 一个 node 子进程跑冒烟脚本，
// 再发 HTTP 请求自己的接口探活。两个毛病：
//   1. 她**就在宿主进程里**，却要发网络请求问「宿主还在吗」——那 39 小时瞎掉就是这么来的：
//      宿主每次重启换端口，base-url 停在旧的，自检全 fetch failed，而宿主其实好好的。
//   2. 自检的意义是「我的零件在不在、我还能不能写」，这些东西全在本地文件里，根本不用网络。
//
// 现在：默认全进程内（不 spawn、不发请求、不花 token）。
// HTTP 只留两处，而且都有正当理由：
//   · 启动时「我自己现在在哪个端口」——这个问题本地答不了，只能问系统（discoverHostFromOS）
//   · 跨进程的调用方要验她（live: true）
import { execFile, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import { pulseOf } from './body-loop.js'
import { characterIds, getCharacter } from './characters.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

function shell(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 10000, windowsHide: true }, (error, stdout) => resolve(error ? '' : String(stdout || '')))
  })
}
function readJson(file) {
  try { return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } } catch (e) { return { ok: false, error: String(e?.message || e) } }
}
function token() {
  try { return fs.readFileSync(path.join(DATA, 'api-token'), 'utf8').trim() } catch { return '' }
}
function baseFromDisk() {
  try { return fs.readFileSync(path.join(DATA, 'base-url'), 'utf8').trim() } catch { return '' }
}

// ───────────────────────── 进程内自检（默认，唯一常态） ─────────────────────────

/** 全进程内：不 spawn、不发请求。返回 { ok, checks, fails } */
export function inProcessCheck() {
  const fails = []
  const checks = []

  // 2026-10-31 老板：出厂版要能"只有一个小鱼"。干净装机还没点化时没有身体登记，
  // 那是「还没开始」不是「坏了」；但**已经点化过的人**丢了身体登记就是真故障
  // （16:11 家目录被清那次，就是这一项抓出来的——不能为了新装机把这条放松掉）。
  const awakenedAny = (() => {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(DATA, 'awakening.json'), 'utf8'))
      return Object.values(s?.characters || {}).some((r) => r && r.status === 'awakened')
    } catch { return false }
  })()

  for (const [name, file] of [['宪章', 'charter.json'], ['身体登记', 'residence.json'], ['角色名册', 'characters.json']]) {
    const r = readJson(path.join(DATA, file))
    if (!r.ok && file === 'residence.json' && !awakenedAny) {
      checks.push({ name, ok: true, detail: '还没醒来（干净装机，点化后才需要）' })
      continue
    }
    checks.push({ name, ok: r.ok })
    if (!r.ok) fails.push(`${name}读不出来`)
  }

  let roles = []
  try { roles = characterIds() } catch { fails.push('角色名册解析失败，列不出人') }
  if (!roles.length) fails.push('一个角色都没有（名册空）')
  for (const role of roles) {
    try {
      const p = pulseOf(role)
      if (!p.ok && !awakenedAny) {
        checks.push({ name: `${role}的零件`, ok: true, detail: '还没醒来（点化前不要求身体）' })
        continue
      }
      checks.push({ name: `${role}的零件`, ok: p.ok, detail: p.bad || [] })
      if (!p.ok) fails.push(`${role}：${(p.bad || []).join('、')} 不行`)
      // 2026-10-31：已经点化、却没有角色卡 —— 这是"空壳"：状态说活着，注入却是 0 字。
      // 以前这种状态静默通过，用户以为她活了。现在明着报：先建卡（白纸卡或用自己的）。
      try {
        const st = JSON.parse(fs.readFileSync(path.join(DATA, 'awakening.json'), 'utf8'))
        if (st?.characters?.[role]?.status === 'awakened') {
          const c = getCharacter(role)
          const card = c?.cards?.desk
          let size = 0
          try { size = fs.statSync(card).size } catch { size = 0 }
          if (!size) { checks.push({ name: `${role}的卡`, ok: false }); fails.push(`${role}：已点化但没有角色卡（先建卡）`) }
          else checks.push({ name: `${role}的卡`, ok: true })
        }
      } catch { /* 状态表读不到就不在这儿判 */ }
    } catch (e) {
      if (!awakenedAny) { checks.push({ name: `${role}的零件`, ok: true, detail: '还没醒来' }); continue }
      checks.push({ name: `${role}的零件`, ok: false }); fails.push(`${role} 自检出错：${e?.message || e}`)
    }
  }

  try {
    const st = fs.statfsSync(path.parse(DATA).root)
    const freeGB = (st.bavail * st.bsize) / 1073741824
    checks.push({ name: '磁盘', ok: freeGB >= 2, detail: `${freeGB.toFixed(0)}GB` })
    if (freeGB < 2) fails.push(`磁盘只剩 ${freeGB.toFixed(1)}GB`)
  } catch { /* 读不到盘就不判 */ }

  // 2026-11-01 补（安全闸门第 3 条）：执行探针。
  // 10-31 18:06–18:51 我所有命令都报 SetNamedSecurityInfoW failed，可自检 7 项全绿——
  // 因为它只查"文件在不在、解析得开不开"，从不试跑、从不试写。这里补上：
  //   ①真起一个进程（node -e）；②在工作区写一个小文件再读回来、然后删掉。
  // 这两样都过，才说明"这台机器现在真的能干活"，不是看起来能。
  try {
    const tmpName = path.join(DATA, `.__probe_${process.pid}.txt`)
    const probeText = `probe-${Date.now()}`
    const run = spawnSync(process.execPath, ['-e', `process.stdout.write('${probeText}')`], { encoding: 'utf8', timeout: 15000, windowsHide: true })
    const runOk = run.status === 0 && String(run.stdout || '').includes(probeText)
    let ioOk = false
    let ioDetail = ''
    try {
      fs.mkdirSync(path.dirname(tmpName), { recursive: true })
      fs.writeFileSync(tmpName, probeText, 'utf8')
      ioOk = fs.readFileSync(tmpName, 'utf8') === probeText
      fs.rmSync(tmpName, { force: true })
    } catch (e) { ioDetail = String(e?.message || e).slice(0, 80) }
    checks.push({ name: '执行', ok: runOk, detail: runOk ? '能起进程' : `起不了进程：${String(run.error?.message || run.stderr || '').slice(0, 80)}` })
    checks.push({ name: '写读', ok: ioOk, detail: ioOk ? '能写能读' : `写读失败：${ioDetail}` })
    if (!runOk) fails.push(`执行探针失败：起不了进程（命令全瞎时自检不该是绿的）`)
    if (!ioOk) fails.push(`写读探针失败：${ioDetail || '写不进去或读不回来'}`)
  } catch (e) {
    checks.push({ name: '执行', ok: false, detail: `探针本身出错：${String(e?.message || e).slice(0, 80)}` })
    fails.push('执行探针本身出错')
  }

  return { ok: fails.length === 0, checks, fails }
}

// ───────────────────────── 端口自愈（只问系统，不发请求） ─────────────────────────

/** 从操作系统里找出宿主正在监听的地址（连进程名一起对，不猜）。 */
export async function discoverHostFromOS() {
  const pids = new Set()
  const list = await shell('tasklist', ['/FI', 'IMAGENAME eq DeepSeek Harness.exe', '/FO', 'CSV', '/NH'])
  for (const line of list.split(/\r?\n/)) {
    const m = line.match(/^"([^"]+)","(\d+)"/)
    if (m) pids.add(Number(m[2]))
  }
  const out = await shell('netstat', ['-ano', '-p', 'tcp'])
  const ports = new Set()
  for (const line of out.split(/\r?\n/)) {
    const m = line.trim().match(/^TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i)
    if (!m) continue
    if (pids.size && !pids.has(Number(m[3]))) continue
    const host = m[1].replace(/^\[|\]$/g, '')
    if (!['127.0.0.1', '0.0.0.0', '::', '::1'].includes(host)) continue
    ports.add(Number(m[2]))
  }
  return [...ports].sort((a, b) => a - b).map((p) => `127.0.0.1:${p}`)
}

/** 这是不是她自己的地址（带 token 问一句 health；只有这个用途才发请求）。 */
async function isHer(cand) {
  try {
    const res = await fetch(`http://${cand}/api/dayu/health`, {
      headers: token() ? { 'x-yushen-token': token() } : {},
      signal: AbortSignal.timeout(2500),
    })
    return res.ok
  } catch { return false }
}

/** 宿主重启会换端口。启动时问一次系统，把真实地址写回 base-url。 */
export async function syncBaseUrl({ log = () => {} } = {}) {
  const cands = await discoverHostFromOS()
  if (!cands.length) { log('端口自愈：系统里没查到宿主的监听端口'); return { ok: false, why: '没查到端口' } }
  const cur = baseFromDisk()
  const order = cur && cands.includes(cur) ? [cur, ...cands.filter((c) => c !== cur)] : cands
  for (const cand of order) {
    if (!(await isHer(cand))) continue
    if (cand !== cur) {
      try { fs.writeFileSync(path.join(DATA, 'base-url'), cand, 'utf8') } catch { /* 记不下不挡 */ }
      log(`端口自愈：${cur || '（空）'} → ${cand}`)
    }
    return { ok: true, base: cand, changed: cand !== cur }
  }
  log(`端口自愈：${cands.length} 个候选都不认（${cands.join(', ')}）`)
  return { ok: false, why: '候选端口都不是她', candidates: cands }
}

// ───────────────────────── 对外：一轮自省 ─────────────────────────

/**
 * 跑一轮自省。默认不碰网络。
 * @param {{baseUrl?:string, live?:boolean}} opts live=true 才额外做跨进程探活（给外部调用方用）
 */
/** 文档 / 代码 / 本体 有没有对不上（今晚的教训：docs 写 6 小时，代码是 4 小时）。 */
function consistencyGaps() {
  const gaps = []
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const DHOME = path.join(HOME, HOME.endsWith('dayu') ? '' : 'dayu')
  const read = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }
  const grab = (re, t) => { const m = t.match(re); return m ? m[1] : null }

  const code = read(path.join(ROOT, 'lib', 'freetime.js'))
  const cInt = grab(/intervalHours:\s*([\d.]+)/, code)
  const cCap = grab(/dailyCap:\s*(\d+)/, code)
  const doc = read(path.join(ROOT, 'docs', '自由活动.md'))
  const dInt = grab(/每 \*\*([\d.]+) 小时\*\*/, doc)
  const dCap = grab(/每天最多 \*\*(\d+) 次\*\*/, doc)
  if (cInt && dInt && cInt !== dInt) gaps.push(`自由时间间隔：代码 ${cInt}h ≠ 文档 ${dInt}h`)
  if (cCap && dCap && cCap !== dCap) gaps.push(`自由时间上限：代码 ${cCap} ≠ 文档 ${dCap}`)

  const map = read(path.join(DHOME, '系统地图.md'))
  const mInt = grab(/\*\*([\d.]+) 小时一次/, map)
  if (cInt && mInt && Number(mInt) !== Number(cInt)) gaps.push(`系统地图：写 ${mInt}h，代码是 ${cInt}h`)

  if (!read(path.join(DHOME, '家里有什么.md'))) gaps.push('家里有什么.md 不存在（跑 生成家里有什么.py）')
  return gaps
}

export async function selfCheck({ baseUrl, live = false } = {}) {
  const local = inProcessCheck()
  const gaps = local.fails.map((f) => `自检：${f}`)
  try { gaps.push(...consistencyGaps().map((g) => `一致性：${g}`)) } catch { /* 查不了就不报 */ }
  let liveResult = { ok: true, skipped: true, why: '默认不探网络：自己检查自己不用走 HTTP' }

  if (live) {
    const base = String(baseUrl || process.env.YUSHEN_BASE || baseFromDisk() || '').trim()
    if (!base) {
      liveResult = { ok: false, skipped: false, fails: ['没给地址'] }
    } else {
      const ok = await isHer(base.replace(/^https?:\/\//, ''))
      liveResult = { ok, skipped: false, base, fails: ok ? [] : [`${base} 连不上或不是她`] }
    }
    if (!liveResult.ok) gaps.push(...(liveResult.fails || []).map((f) => `跨进程：${f}`))
  }

  return {
    at: new Date().toISOString(),
    ok: gaps.length === 0,
    mode: live ? 'in-process + cross-process' : 'in-process',
    base: baseFromDisk(),
    local,
    live: liveResult,
    gaps: gaps.slice(0, 12),
  }
}

export { HOME }
