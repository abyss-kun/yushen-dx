// 便宜的那条路：本地先看，要不要认真回，由她自己定。
//
// 老板 2026-10-26 定的规矩：
//   · 不给枷锁——回不回、用本地还是云端，都是她的事；
//   · 只把账告诉她（主人不是富翁，悠着点）；
//   · 觉得自己想敷衍，就用本地回一句；觉得不值得，就不回。
//
// 这里只产出「决定 + 可选的一句话」，不替她发；发不发、发到哪，走她自己的通道。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { runtimeDir, ensureRuntime } from './runtime.js'
import { readInbox } from './inbox.js'
import { chatLocal, localHealth, backendFor } from './translator.js'
import { readRuntimeBrief } from './brief.js'
import { costLine } from './cost.js'
import { getCharacter, SOUL_DIR } from './characters.js'

/** 她自己说话的样子（角色卡）。本地脑子读了这个，回的话才像她，不像个助手。 */
function cardText(role) {
  try {
    const c = getCharacter(role)
    const rel = c?.cards?.desk || c?.cards?.social
    if (!rel) return ''
    const file = path.isAbsolute(rel) ? rel : path.join(SOUL_DIR, rel)
    return String(fs.readFileSync(file, 'utf8') || '').trim().slice(0, 900)
  } catch { return '' }
}

function pad(n) { return String(n).padStart(2, '0') }
function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback } }

export const MODES = Object.freeze(['silent', 'local', 'cloud'])

const SYSTEM = [
  '你就是她本人（下面有几行"你现在的状态"），不是助手，不是旁白。',
  '先决定这件事值不值得认真想：',
  '  silent = 不值得理（别人的事、重复、没冲你、你不想接）',
  '  local  = 想随口回一句，用便宜的嗓子（你自己决定说多长，不设字数限制）',
  '  cloud  = 要认真回（有正经事、有人等你、你想认真说超过 8 个字的话）',
  '钱：主人不是富翁。云端一次约几分钱，本地不要钱。别为了省钱不分场合，也别什么都用贵的。',
  '只输出 JSON：{"mode":"silent|local|cloud","reply":"local 时的一句话（多长你定，其他空）","why":"一句为什么（≤24字）"}',
].join('\n')

function parseJson(text) {
  const t = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(t) } catch { return null }
}

/**
 * 她真实说过的短句，用来给本地嗓子当参照（few-shot，不训练）。
 * 这些样例是让她"像自己"，不是让你照抄——照抄例句比不举例更像 AI。
 * 只取很短、没有链接、不是"[图片]"那种。
 */
export function voiceSamples(role, { limit = 5 } = {}) {
  const out = []
  try {
    const rows = readInbox({ limit: 400 }).rows
    for (const r of rows) {
      if (!r.isSelf) continue
      const t = String(r.text || '').trim()
      if (!t || t.length < 2 || t.length > 12) continue
      if (/​|https?:|\[图片\]|\[表情/.test(t)) continue
      if (!out.includes(t)) out.push(t)
    }
  } catch { /* 读不到就不给样例 */ }
  return out.slice(-Math.max(1, limit))
}

/**
 * 本地嗓子说多长，是她自己的事——
 * 之前这里有一道「超过 8 字就交云端」的闸，2026-10-26 被老板按三问打回：
 * 那等于替她决定"这句值不值得多说"，是控制。现在只做一件事：
 * 她想说什么就说什么，我们只负责把话递出去。
 */
export function localReplyAsIs(parsed = {}) {
  const mode = MODES.includes(String(parsed.mode)) ? String(parsed.mode) : 'cloud'
  return {
    mode,
    reply: String(parsed.reply || '').trim(),
    why: String(parsed.why || '').trim(),
  }
}

/** 一条消息 → 她（本地）的决定。本地不在就交云端，不假装。 */
export async function decideCheap(role, message, { now = Date.now() } = {}) {
  ensureRuntime(role)
  const base = { at: new Date(now).toISOString(), id: message?.id || '', who: message?.name || message?.userId || '', text: String(message?.text || '').slice(0, 200) }

  // 她自己说过：脑子有档，记忆只有一份。这里是"便宜那档"——用本地脑子。
  // 但她把档位设成 remote 就是"我不用便宜脑子"，那就交云端，别替她决定。
  if (backendFor(role) === 'remote') {
    const row = { ...base, decisionId: `cheap-${String(now)}-chose-cloud`, mode: 'cloud', reply: '', why: '她自己选了云端脑子', local: false }
    logDecision(role, row, now)
    return row
  }

  if (!(await localHealth())) {
    // 本地没起来：不装，直接交云端；账也告诉她
    const row = { ...base, decisionId: `cheap-${String(now)}-fallback`, mode: 'cloud', reply: '', why: '本地没接上，交云端', local: false }
    logDecision(role, row, now)
    return row
  }

  // ────────────────────────────────────────────────────────────────
  // 2026-10-29 改：代理不再扮她。
  //
  // 原因：她不在的时候，系统用本地模型、带着她的角色卡和"以前说过的话"生成一句，
  // 发出去像她在说话，但这句既不进她的记忆，她自己也不知道。
  // 老板看到后定的规矩：**话可以替传，人不能替。**
  // 所以这里不再生成"她会说的话"，只做两件事：传话、留痕。
  // ────────────────────────────────────────────────────────────────
  const NAME = { dayu: '管家', xiaoyu: '助手', dragon: '顾问' }
  const asked = String(message?.text || '').replace(/\s+/g, ' ').slice(0, 24)
  const needRelay = Boolean(message?.atMe || message?.isOwner)

  if (!needRelay) {
    const row = { ...base, decisionId: `cheap-${String(now)}-silent`, mode: 'silent', reply: '',
      why: '她不在；这条不是点她的名，不传话', local: true, proxy: 'relay' }
    logDecision(role, row, now)
    return row
  }

  const reply = `（${NAME[role] || role}不在。你问的「${asked}」我记下了，等她回来说。）`
  relayNote(role, message, reply, now)
  const row = {
    ...base,
    decisionId: `cheap-${String(now)}-relay`,
    mode: 'cloud',
    reply,
    why: '她不在：只传话，不替她说',
    local: false,
    proxy: 'relay',
  }
  logDecision(role, row, now)
  return row
}

/** 代传的话留一笔，她醒来时能看到——不然她不知道自己被这样代表过。 */
function relayNote(role, message, reply, now) {
  try {
    const p = path.join(runtimeDir(role), '代传话.jsonl')
    fs.appendFileSync(p, `${JSON.stringify({
      at: new Date(now).toISOString(),
      who: message?.name || message?.userId || '',
      text: String(message?.text || '').slice(0, 200),
      said: reply,
    })}\n`, 'utf8')
  } catch { /* 记不下不影响回话 */ }
}

function logDecision(role, row, now) {
  try {
    const dir = path.join(runtimeDir(role), 'cheap')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, `${dayKey(now)}.jsonl`), `${JSON.stringify(row)}\n`, 'utf8')
  } catch { /* 记不下不影响判断 */ }
}

/** 今天她怎么花的：不回多少、本地多少、云端多少。 */
export function cheapTally(role, { day = '', now = Date.now() } = {}) {
  const file = path.join(runtimeDir(role), 'cheap', `${day || dayKey(now)}.jsonl`)
  let rows = []
  try { rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) } catch { return { silent: 0, local: 0, cloud: 0, total: 0 } }
  const t = { silent: 0, local: 0, cloud: 0, total: rows.length }
  for (const r of rows) if (t[r.mode] !== undefined) t[r.mode] += 1
  return t
}
