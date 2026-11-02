// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 账号余额（2026-10-31 老板选「从账号接口取余额」；22:5x 对照小鲸鱼插件后改成宿主服务优先）
//
// 结论先写在这：**不需要问老板要 key**。DSH 自己有两个服务：
//   · `ctx.credentials.resolve('DEEPSEEK_API_KEY')` —— 宿主凭据里配了 key 就用它（官方 /user/balance）
//   · `ctx.get('deepseekAccount')` —— 只登录了 DeepSeek 账号、没配 key 时，用这个服务取余额
//     （充值钱包 + 赠金钱包相加；token、请求头、401 清理都由宿主负责，插件不接触账号令牌）
// 两个都是**可选服务**：老宿主没有，必须 `ctx.get()` 读、**绝不能写进 inject**（否则整个插件永远不 apply）。
// 参考实现：MeteorNOX/DeepSeek-Balance-Whale-Widget 的 lib/index.js:1177-1259（外部资料，只借接口形状）。
//
// 规矩（写死在这里，别在别处放宽）：
//   1. 只读：不写任何账号数据；key/token 只在进程内用。
//   2. key/token 绝不写日志、绝不进错误信息、绝不随响应返回。
//   3. 失败就失败：返回 ok:false + 一句原因（两条路的原因都带上），不编数、不拿旧数冒充新数。
//   4. 5 分钟缓存：桌宠点一下不该每次都打一次网络/宿主服务。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const KEY_FILE = path.join(HOME, 'dayu', 'account.json')
const TTL_MS = 5 * 60 * 1000
const URL_BALANCE = 'https://api.deepseek.com/user/balance'

let bound = null
let cache = { at: 0, balance: null, currency: '', source: '', why: '还没查过' }
let inflight = null

/** 把宿主 ctx 记下来（可选服务都在它身上）。apply 时调一次。 */
export function bindContext(ctx) { bound = ctx || null }

/** key 从哪来：宿主凭据服务优先，其次环境变量，最后本地 account.json。 */
export async function resolveKey({ env = process.env, keyFile = KEY_FILE } = {}) {
  try {
    const k = await bound?.credentials?.resolve?.('DEEPSEEK_API_KEY')
    if (k && String(k).trim()) return String(k).trim()
  } catch { /* 凭据服务没配/没就绪，继续往下 */ }
  const fromEnv = String(env.DEEPSEEK_API_KEY || '').trim()
  if (fromEnv) return fromEnv
  try {
    const j = JSON.parse(fs.readFileSync(keyFile, 'utf8'))
    return String(j?.apiKey || '').trim()
  } catch { return '' }
}

/** 把任何可能带 key 的文本抹掉——错误信息只能说明"失败"，不能把凭据带出去。 */
export function redact(text, key = '') {
  let s = String(text || '')
  if (key) s = s.split(key).join('****')
  return s.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-****').replace(/Bearer\s+\S+/gi, 'Bearer ****')
}

/** 官方 /user/balance 的响应：优先 CNY，其次第一条。取不到就是 null，不猜。 */
export function parseBalance(json) {
  const infos = Array.isArray(json?.balance_infos) ? json.balance_infos : []
  if (!infos.length) return null
  const pick = infos.find((x) => String(x?.currency || '').toUpperCase() === 'CNY') || infos[0]
  const n = Number(pick?.total_balance)
  if (!Number.isFinite(n)) return null
  return { balance: n, currency: String(pick.currency || '') }
}

/**
 * 账号登录态的钱包：`getBalance()` 返回 {status:'ready', value:[充值钱包], bonusWallets:[赠金钱包]}。
 * 两个钱包相加才是总余额（与 API key 路的 total_balance 同口径）；只只只有赠金也算成功。
 * 返回 null 表示"这个账号没有可用钱包"——不是余额 0。
 */
export function sumWallets(result) {
  if (!result || String(result.status || '') !== 'ready') return null
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
  const norm = Array.isArray(result.value) ? result.value.filter((w) => w && num(w.balance) !== null) : []
  const bonus = Array.isArray(result.bonusWallets) ? result.bonusWallets.filter((w) => w && num(w.balance) !== null) : []
  const all = norm.concat(bonus)
  if (!all.length) return null
  const curOf = (w) => String((w && w.currency) || 'CNY').toUpperCase()
  const nonzero = all.filter((w) => Number(w.balance) > 0)
  const pick = nonzero.find((w) => curOf(w) === 'CNY') || nonzero[0] || all.find((w) => curOf(w) === 'CNY') || all[0]
  const currency = curOf(pick)
  const sum = (list) => list.filter((w) => curOf(w) === currency).reduce((s, w) => s + Number(w.balance), 0)
  return { balance: Number((sum(norm) + sum(bonus)).toFixed(6)), currency }
}

/** 走宿主账号服务（只登录、没配 key 的那条路）。拿不到返 {ok:false, why}。 */
export async function fetchFromHostAccount({ now = Date.now(), timeoutMs = 8000 } = {}) {
  let acc = null
  try { acc = typeof bound?.get === 'function' ? bound.get('deepseekAccount') : null } catch { acc = null }
  if (!acc || typeof acc.getBalance !== 'function') return { ok: false, why: '当前 DSH 没有账号服务' }
  let result
  try {
    result = await Promise.race([
      acc.getBalance({
        version: String(process.env.DSH_CLIENT_VERSION || process.env.DSH_VERSION || '') || 'unknown',
        locale: String(process.env.DSH_LOCALE || '') || 'zh_CN',
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      }),
      new Promise((r) => setTimeout(() => r(null), timeoutMs)),
    ])
  } catch (e) {
    return { ok: false, why: redact(`账号余额接口调用失败：${String(e?.message || e).slice(0, 80)}`) }
  }
  if (!result) return { ok: false, why: '账号余额请求超时' }
  if (String(result.status || '') !== 'ready') return { ok: false, why: `账号余额接口未就绪（${String(result.status || 'unknown')}）` }
  const got = sumWallets(result)
  if (!got) return { ok: false, why: '账号没有余额钱包' }
  return { ok: true, balance: got.balance, currency: got.currency, at: now, source: 'account' }
}

/** 走 API key + 官方接口。 */
export async function fetchWithKey({ key = '', fetchImpl = fetch, timeoutMs = 6000, now = Date.now() } = {}) {
  const k = String(key || '').trim()
  if (!k) return { ok: false, why: '没有 key' }
  try {
    const res = await fetchImpl(URL_BALANCE, {
      method: 'GET',
      headers: { Authorization: `Bearer ${k}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await res.text()
    if (!res.ok) return { ok: false, why: redact(`接口回了 ${res.status}`, k) }
    let json = null
    try { json = JSON.parse(text) } catch { return { ok: false, why: '接口回的不是 JSON' } }
    const got = parseBalance(json)
    if (!got) return { ok: false, why: '响应里没有余额字段' }
    return { ok: true, balance: got.balance, currency: got.currency, at: now, source: 'key' }
  } catch (e) {
    return { ok: false, why: redact(`请求失败：${e?.name || 'Error'}`, k) }
  }
}

/**
 * 两条路都试：有 key 先走 key，没有（或失败）走账号服务。
 * 两个都失败就把两条原因一起说出来——分不清"没登录"和"接口坏了"是最气人的。
 */
export async function fetchBalance({ key, fetchImpl = fetch, timeoutMs = 6000, now = Date.now() } = {}) {
  const k = key === undefined ? await resolveKey() : String(key || '').trim()
  const remember = (r) => {
    if (r?.ok) {
      cache = { at: r.at || now, balance: r.balance, currency: r.currency || '', source: r.source || '', why: '' }
      // 顺手落一份只含数字的快照：Python 那边的账本（管账.py）读不到宿主账本时靠它取余额。
      // 只写余额/币种/来源/时间——key、token 一个字都不进来。
      try {
        const dir = path.join(HOME, 'dayu', 'state')
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'account-balance.json'), JSON.stringify({
          at: new Date(r.at || now).toISOString(),
          balance: r.balance,
          currency: r.currency || '',
          source: r.source || '',
        }) + '\n', 'utf8')
      } catch { /* 落不下不挡读余额 */ }
    }
    return r
  }
  let keyWhy = ''
  if (k) {
    const r = await fetchWithKey({ key: k, fetchImpl, timeoutMs, now })
    if (r.ok) return remember(r)
    keyWhy = r.why
  }
  const acc = await fetchFromHostAccount({ now })
  if (acc.ok) return remember(acc)
  const parts = []
  parts.push(k ? `API key 路：${keyWhy}` : '没有 API key')
  parts.push(`账号登录路：${acc.why}`)
  return { ok: false, why: parts.join('；') }
}

/**
 * 给同步调用方用：立刻返回上一次结果，过期就在后台补一次（不阻塞请求）。
 * 返回 {balance, at, ageMs, fresh, source, why}——balance 为 null 表示没有可用数字。
 */
export function peekBalance({ key, ttlMs = TTL_MS, now = Date.now() } = {}) {
  const age = cache.at ? now - cache.at : Infinity
  if (age > ttlMs && !inflight) {
    inflight = fetchBalance({ key, now })
      .then((r) => {
        cache = r.ok
          ? { at: r.at, balance: r.balance, currency: r.currency, source: r.source || '', why: '' }
          : { at: now, balance: null, currency: '', source: '', why: r.why }
        return r
      })
      .catch(() => ({}))
      .finally(() => { inflight = null })
  }
  return {
    balance: cache.balance,
    at: cache.at || null,
    ageMs: cache.at ? age : null,
    fresh: Boolean(cache.at && age <= ttlMs),
    source: cache.source,
    why: cache.why,
  }
}

/** 只给测试用：清缓存、解绑。 */
export function _reset() {
  bound = null
  cache = { at: 0, balance: null, currency: '', source: '', why: '还没查过' }
  inflight = null
}
