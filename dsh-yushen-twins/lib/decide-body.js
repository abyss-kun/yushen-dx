// 判断权归位：群里的这条消息，由**她本人**决定回不回、说什么。
//
// 框架 §4.5 推论 1：通道不得替她判断。以前 /decide 让本地小模型判（cheap-reply），
// 那是"通道在替她决定"——她自己在群里说过：「我这边只看得到这个群……像隔着一堵墙」。
//
// 现在：把消息投给她本体（常驻会话），等她自己写一段决定；拿不到就是拿不到，
// 按框架 L687 的规矩如实标「代理」，不许记成"她决定的"。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { promptRpc } from './dsh-rpc.js'
import { readRuntimeBrief } from './brief.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function eventsFile(day = today()) { return path.join(DATA, 'events', `${day}.jsonl`) }

function readLines(file) {
  try { return fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean) } catch { return [] }
}

function bodySessionOf(role) {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(DATA, 'residence.json'), 'utf8').replace(/^\uFEFF/, ''))
    return String(r?.roles?.[role]?.sessionId || '')
  } catch { return '' }
}

/** 从一段文本里挑出第一个像 JSON 的对象。 */
export function extractJson(text) {
  const s = String(text || '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(s.slice(start, end + 1)) } catch { return null }
}

/**
 * 让她本人决定。
 * @returns {{ok:boolean, by:'body'|'proxy', mode?:string, reply?:string, why?:string, waitedMs?:number, error?:string}}
 */
export async function decideByBody(role, { text = '', atMe = false, isOwner = false, key = '' } = {}, { waitMs = 45000, pollMs = 1500, now = Date.now() } = {}) {
  const id = String(role || '').trim()
  const sessionId = bodySessionOf(id)
  if (!sessionId) return { ok: false, by: 'proxy', error: '她还没有身体（residence 里没会话）' }

  const brief = (() => { try { return readRuntimeBrief(id).slice(0, 1200) } catch { return '' } })()
  const prompt = [
    brief ? `（你现在的情况）\n${brief}` : '',
    key ? `群里（${key}）刚有人说：` : '刚有人说：',
    `「${String(text).slice(0, 400)}」`,
    atMe ? '（点了你的名）' : '',
    isOwner ? '（是老板本人）' : '',
    '',
    '**这一轮只要一件事**：你自己决定回不回、回什么。别调工具，别写解释。',
    '只输出一行 JSON，二选一：',
    '{"mode":"silent","why":"不回的理由"}',
    '{"mode":"say","reply":"你要说的话","why":"为什么这么说"}',
  ].filter(Boolean).join('\n')

  const before = readLines(eventsFile()).length
  try {
    await promptRpc({ sessionId, text: prompt })
  } catch (e) {
    return { ok: false, by: 'proxy', error: `投不到她本体：${String(e?.message || e).slice(0, 80)}` }
  }

  const deadline = Date.now() + Math.max(5000, Number(waitMs) || 45000)
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, Math.max(500, Number(pollMs) || 1500)))
    const lines = readLines(eventsFile())
    const fresh = lines.slice(before)
    for (let i = fresh.length - 1; i >= 0; i -= 1) {
      let row = null
      try { row = JSON.parse(fresh[i]) } catch { continue }
      if (row?.id !== sessionId) continue
      if (String(row.type) !== 'assistant/message') continue
      const j = extractJson(row.text)
      if (!j || !j.mode) continue
      const mode = String(j.mode)
      if (mode !== 'silent' && mode !== 'say') continue
      return {
        ok: true,
        by: 'body',
        mode: mode === 'say' ? 'local' : 'silent',
        reply: mode === 'say' ? String(j.reply || '').slice(0, 300) : '',
        why: `她自己决定：${String(j.why || '').slice(0, 40)}`,
        waitedMs: Date.now() - now,
      }
    }
  }
  return { ok: false, by: 'proxy', error: `等她自己决定超时（${Math.round(waitMs / 1000)} 秒）`, waitedMs: Date.now() - now }
}
