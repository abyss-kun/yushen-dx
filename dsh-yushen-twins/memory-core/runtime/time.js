/* 标签
 * id: lib-clock
 * kind: module
 * summary: 时间的单一真源：现在几点一律问系统，本地时间一律从这里取。
 * audience: 框架（所有要写时间的地方）
 * owner: 框架；不许在别处自己加减时区
 * mutable: 可改（时区只从这里来）
 * usage: now()/nowMs() 当前时间；localISO()/today()/fmt() 本地格式化；zone() 看时区
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 16:06｜大鱼·子会话（工作台）｜授权：主人（本次任务书：统一时间观念，用系统时间）｜lib/clock.js:1-160｜新增：时间的单一真源 now/nowMs/localISO/today/dayKey/fmt/fmtFull/zone/todayIn｜为什么：全仓 41 处手写时区偏移假装本地时间，换机器或换时区就全错，各处口径还不一致｜验证：node --check lib/clock.js；node scripts/regression.mjs 全绿，且回归断言全仓无手写偏移、本文件导出齐、时区跟随系统｜可改：可改（时区口径只许在这里改，别处不再自己拼偏移）
//
// 时间的单一真源（2026-11-02 老板立：统一时间观念，用系统时间）。
//
// 两条规矩：
//   ① 「现在几点」一律问系统（new Date()），不许自己加减时区去"假装本地时间"——
//      那不是本地时间，那是把某个时区写死在代码里；
//   ② 要给人看、要给文件名、要落进 jsonl 的本地时间，一律从这里取。
//
// 时区从哪来：
//   · 默认跟随系统（Intl.DateTimeFormat().resolvedOptions().timeZone）；
//   · 环境变量 YUSHEN_TZ 可覆盖（服务器设成 UTC、或要复现别的时区时用）；
//   · 这里不默认写死任何一个时区名：写死就等于把「我这台机器」当成「时间」。
//     系统时区不是东八区、又想要北京时间的话，自己设 YUSHEN_TZ，见 docs/时间.md。
//
// 这里不做什么：逻辑时钟（seq / 版本水位）在 sync/ 里，跟墙上时间无关。
// 跨设备合并「谁先谁后」看 seq；时间只用来展示和排序参考，别拿它当事实源。

const pad = (n, w = 2) => String(n).padStart(w, '0')

/** 格式化器按区名缓存：Intl 构造成本不低，而时区在一个进程里基本不变。 */
const TZ_CACHE = new Map()
let zoneCache = { env: null, tz: '' }

function validZone(tz) {
  if (!tz) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

/**
 * 现在用的时区名：YUSHEN_TZ（合法时）优先，否则系统时区。
 * 每次调用都看一遍 env：测试里临时改环境变量也能立刻生效，不用重开进程。
 */
export function zone() {
  const env = String(process.env.YUSHEN_TZ || '').trim()
  if (zoneCache.env === env && zoneCache.tz) return zoneCache.tz
  const tz = env && validZone(env) ? env : (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  zoneCache = { env, tz }
  return tz
}

function formatter(tz) {
  let f = TZ_CACHE.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    })
    TZ_CACHE.set(tz, f)
  }
  return f
}

/** 某一时刻在某个时区里的年月日时分秒（不是 UTC，也不是本机 Date 字段）。 */
function partsIn(date, tz) {
  const out = {}
  for (const p of formatter(tz).formatToParts(date)) if (p.type !== 'literal') out[p.type] = p.value
  return {
    y: Number(out.year),
    mo: Number(out.month),
    d: Number(out.day),
    h: Number(out.hour) % 24, // 有的实现对午夜给 24，折回 0
    mi: Number(out.minute),
    s: Number(out.second),
  }
}

/** 该时刻在该时区的偏移（分钟，东为正）。用它算 +08:00 这种尾巴，不去猜。 */
function offsetMinutes(date, tz) {
  const p = partsIn(date, tz)
  const asUTC = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s)
  return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

function toDate(value) {
  if (value === undefined || value === null) return new Date()
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) throw new TypeError(`clock: 认不出的时间：${JSON.stringify(value)}`)
  return d
}

/** 现在的 Date（系统时间，不加减）。 */
export function now() { return new Date() }

/** 现在（毫秒）。原来写 Date.now() 的地方直接用它，意思一样。 */
export function nowMs() { return Date.now() }

/**
 * 本地时区的 ISO 字符串：`YYYY-MM-DDTHH:mm:ss+08:00`。
 * 偏移按那一刻的真实时区算（夏令时/半时区都对），不是字符串拼出来的。
 * 原来写 `toISOString().replace('Z', '+08:00')` 的地方，全部换成它。
 */
export function localISO(d = now()) {
  const date = toDate(d)
  const tz = zone()
  const p = partsIn(date, tz)
  const off = offsetMinutes(date, tz)
  const sign = off < 0 ? '-' : '+'
  const abs = Math.abs(off)
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** 本地日期 `YYYY-MM-DD`。 */
export function today(d = now()) {
  const p = partsIn(toDate(d), zone())
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`
}

/** 兼容老调用：dayKey(毫秒) 就是那一天的本地日期。 */
export function dayKey(ms) { return today(ms === undefined ? now() : ms) }

/** 指定时区的日期（只给「对端口径」用，比如 B站 那边按 +8 命名文件）。 */
export function todayIn(tz, d = now()) {
  const use = validZone(tz) ? tz : zone()
  const p = partsIn(toDate(d), use)
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`
}

/**
 * 按模板出本地时间：`YYYY` 年 · `MM` 月 · `DD` 日 · `HH` 时 · `mm` 分 · `ss` 秒。
 * 原来一堆 `toISOString().slice(0,19).replace('T',' ')` 的地方换成 fmt(d, 'YYYY-MM-DD HH:mm:ss')。
 */
export function fmt(d = now(), pattern = 'YYYY-MM-DD HH:mm:ss') {
  const p = partsIn(toDate(d), zone())
  const map = { YYYY: String(p.y), MM: pad(p.mo), DD: pad(p.d), HH: pad(p.h), mm: pad(p.mi), ss: pad(p.s) }
  return String(pattern).replace(/YYYY|MM|DD|HH|mm|ss/g, (t) => map[t])
}

/** `YYYY-MM-DD HH:mm:ss`（账本、日志最常用的那一行）。 */
export function fmtFull(d = now()) { return fmt(d, 'YYYY-MM-DD HH:mm:ss') }
