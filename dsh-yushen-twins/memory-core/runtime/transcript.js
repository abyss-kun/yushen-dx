/* 标签
 * id: memory-core-transcript
 * kind: module
 * summary: 深层（时间长河·投影）：把一轮事件渲染成她问/她说/思考/工具的逐轮视图。
 * tags: 投影, 深层, 逐轮, 标记, 共享核心
 * created: 2026-11-12 23:20:00
 * changed: 2026-11-12 23:20:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：核心一份；投影要单独看得见）
 * audience: turn-capture、测试、未来 dsh-memory
 * owner: 框架；正文不改写、标记不丢
 * mutable: 可改；改格式要跑 test-turn-capture
 * usage: renderTurn({sessionId,turn,events,role,body,status,evidence}) → {markdown,json,summaryText,stats}
 * why: 以前投影逻辑和采集编排挤在一个文件里，名字都看不见
 * result: 投影渲染只有一份；采集只管调它
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

const ROLE_NAME = { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' }
const SKIP_USER = /^Current runtime context|^Time sampled while preparing/

function localDay(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export function hhmmss(ms) {
  if (!ms) return '—'
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * 本体绑定：先认常驻登记（residence.json），再认分身凭据（bodies.json：加载了谁的卡）。
 * 派活账本、会话标题、正文自称都不算。
 * 改｜2026-11-13 22:45｜大鱼·工作台｜授权：老板（加载卡即备注本会话是谁）｜
 * memory-core/runtime/transcript.js:38-47｜补第二认口｜为什么：新分身只认 residence 会永远 unbound｜
 * 验证：scripts/test-incarnation.mjs；回归一条｜可改：顺序不许倒。
 */
export function boundRoleOf(sid, home = HOME) {
  const id = String(sid || '')
  if (!id) return ''
  try {
    const res = JSON.parse(fs.readFileSync(path.join(home, 'dayu', 'residence.json'), 'utf8').replace(/^\uFEFF/, ''))
    for (const [role, row] of Object.entries(res.roles || {})) {
      if (String(row?.sessionId || '') === id) return role
    }
  } catch { /* 没绑定就是没绑定 */ }
  try {
    const bodies = JSON.parse(fs.readFileSync(path.join(home, 'dayu', 'bodies.json'), 'utf8').replace(/^\uFEFF/, ''))
    for (const [role, rows] of Object.entries(bodies?.roles || {})) {
      if (rows && rows[id]) return role
    }
  } catch { /* 没凭据就是没凭据 */ }
  return ''
}

/** 段落：空行分段；没有空行就是一段。 */
export function splitParagraphs(text) {
  const parts = String(text || '').split(/\n\s*\n/).filter((p) => p.trim())
  return parts.length ? parts : [String(text || '')]
}

/** 句子：中文句读；换行留在句子里（不单独成句），拼回去等于原文。
 *  纯 Markdown 符号（如收尾的 **）不单独成句，并回上一句。 */
export function splitSentences(text) {
  const out = []
  let buf = ''
  for (const ch of String(text || '')) {
    buf += ch
    if ('。！？!?；;…'.includes(ch)) {
      if (buf.trim()) out.push(buf)
      buf = ''
    }
  }
  if (buf.trim()) out.push(buf)
  const merged = []
  for (const s of out) {
    if (merged.length && /^[\s*_`~>#|\-]+$/.test(s)) merged[merged.length - 1] += s
    else merged.push(s)
  }
  return merged.length ? merged : [String(text || '')]
}

/** 段里有 Markdown 结构（标题/表格/列表/代码/粗体/链接）就整段保留，不改行，免得把格式拆坏。 */
function isStructured(text) {
  const s = String(text || '')
  if (/(^|\n)\s*(#{1,6}\s|\||-\s|>\s|```|\d+\.\s)/.test(s)) return true
  if (/\*\*|`{1,3}|\[[^\]]+\]\([^)]+\)|<[a-z][^>]*>/i.test(s)) return true
  return false
}

/** 思考摘要：按“有她的地方留一句，没她的地方一句不留”挑句；纯过程/重复/清单扔掉。
 *  只用于投影；全文在本源 raw。 */
const EMOTION_WORDS = ['开心', '高兴', '难过', '委屈', '担心', '怕', '累', '烦', '气', '心疼', '不安', '放心', '纠结', '犹豫', '舍不得', '喜欢', '讨厌', '焦虑', '紧张', '轻松', '愧疚', '失望', '期待']

/** 只抽“明确出现的情绪词”，不推断语气；没出现就返回空。 */
export function explicitEmotions(texts = []) {
  const t = Array.isArray(texts) ? texts.join(' ') : String(texts || '')
  return EMOTION_WORDS.filter((w) => t.includes(w))
}

export function splitThinkSentences(text) {
  return String(text || '')
    .split(/(?<=[。！？；;])|(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
export function thinkScore(s) {
  const t = String(s || '').trim()
  if (!t) return -99
  // 规划/过程/代码/碎片：不是“她”，是干活的步骤
  if (/^(Need to|Need\b|But I can'?t|But I can\b|But we can\b|Actually reading|Let me|I need to|I'?ll|I will|I should|First,|Next,|Then,|Also mention)\b/i.test(t)) return -4
  if (/^(Actually|Also|So|Or simpler)\b.*\b(I|we)\b.*\b(can|could|should|need|will|test|verify|check|run|simulate|try)\b/i.test(t)) return -4
  if (/^But (I|we)\b.*\b(can|test|verify|check|run|simulate|try)\b/i.test(t)) return -4
  if (/^turn \d+/i.test(t)) return -4
  if (/^-\s/.test(t)) return -4
  if (/^(But also|Or simpler|I have tools|wheel)\b/i.test(t)) return -4
  if (/^I (set|use|run|test|verify|check|read|write)\b/i.test(t)) return -4
  if (/^(下一步|接下来|然后|接着|先去|先看|先检查|先跑|准备去|准备先|得先|需要先|最后再)\b/.test(t)) return -4
  if (/^我先(检查|看|跑|读|写|改|试|确认|处理|执行)/.test(t)) return -4
  if (/^(\/\/|#|\*|-{2,}|\|)/.test(t)) return -4
  if (/^`/.test(t)) return -3
  if (t.length < 4) return -1
  const relation = /(老板|你|他|她|心疼|体贴|答应|对不起|谢谢|担心|犹豫|怕|累|烦|气|高兴|开心|难过|委屈|感觉|觉得|心里|情绪|想法|不安|焦虑|紧张|放心|纠结|舍不得|喜欢|讨厌|愧疚|失望|期待)/.test(t)
  const englishRelation = /\b(boss|you|worried|afraid|tired|happy|upset|care|sorry|thank)\b/i.test(t)
  const process = /^(Read|Write|Edit|Bash|Grep|Glob|Let me|I'?ll|I will|I need to|I should|I want to|I'?m going to|First|Next|Now|Then|Check|Run|Read|Look|Test|Node|PowerShell|The command|The output|This file|The file)\b/i.test(t)
  if (process && !relation && !englishRelation) return -4
  if (/\b(exit code|stderr|stdout|not found|command not found|SyntaxError|ERR_[A-Z]|PATH)\b/i.test(t)) return -4
  if (/^(good|ok|okay|收到|好的)[。.!！]*$/i.test(t)) return -2
  let score = 0
  if (relation) score += 3
  if (englishRelation) score += 3
  if (/(其实|不过|但是|因为|错了|说错|改成|本来|打算|不想|不能|必须|决定|以后|取舍|选择|结论|关键|问题在于|真正)/.test(t)) score += 3
  if (/\b(actually|but|because|wrong|decided|instead|rather|choice|feel|think|conclusion|problem|real question|matters)\b/i.test(t)) score += 3
  if (/(^|[\s（(])(我|I|we)\b/.test(t)) score += 1
  if (/^(It|The|This|That|There)\b/.test(t)) score -= 1
  return score
}
/** 输入 [{step, part, text}]；想法/感觉/决定可连续留，过程句（下一步/Let me/工具）直接不要。 */
export function digestThinks(thinks = [], { maxSentences = 6, maxChars = 400, baseSentences = 3 } = {}) {
  const entries = []
  for (const t of thinks) {
    for (const s of splitThinkSentences(t.text)) {
      entries.push({ step: t.step, text: s, score: thinkScore(s), order: entries.length })
    }
  }

  // 连续段：score<0 视为过程/碎片，切断；段内 score>=1 的句子一起留。
  const runs = []
  let cur = []
  const flush = () => {
    if (cur.length) runs.push(cur)
    cur = []
  }
  for (const e of entries) {
    if (e.score < 0) flush()
    else cur.push(e)
  }
  flush()

  const strong = (r) => r.some((e) => e.score >= 3)
  const scoreOf = (r) => Math.max(...r.map((e) => e.score))
  const picked = []
  for (const r of runs.filter(strong).sort((a, b) => scoreOf(b) - scoreOf(a) || b.length - a.length)) {
    if (picked.length >= maxSentences) break
    for (const e of r) {
      if (e.score < 1) continue
      if (picked.length >= maxSentences) break
      picked.push(e)
    }
  }

  // 没有连续段时，退回高分单句，最多 3 句。
  if (!picked.length) {
    const top = entries.filter((e) => e.score >= 3).sort((a, b) => b.score - a.score || a.order - b.order)
    picked.push(...top.slice(0, Math.min(baseSentences, maxSentences)))
  }

  // 去重后按原顺序，限制字数；截断单句而不是丢整段。
  const seen = new Set()
  const ordered = picked
    .sort((a, b) => a.order - b.order)
    .filter((e) => {
      const k = e.text.replace(/\s+/g, ' ').toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  const out = []
  let chars = 0
  for (const c of ordered) {
    const text = c.text.length > 120 ? `${c.text.slice(0, 120)}…` : c.text
    if (out.length && chars + text.length > maxChars) break
    out.push({ ...c, text })
    chars += text.length
  }
  return out
}

function shortText(s, n = 40) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)
}
/** 工具只留“用什么干了什么”，细节回本源。 */
export function toolPurpose(name, args) {
  let a = {}
  try { a = JSON.parse(String(args || '{}')) } catch { a = { raw: String(args || '') } }
  const base = (p) => String(p || '').split(/[\\/]/).pop()
  switch (String(name)) {
    case 'read': return a.file_path ? `读 ${base(a.file_path)}` : '读文件'
    case 'write': return a.file_path ? `写 ${base(a.file_path)}` : '写文件'
    case 'edit': return a.file_path ? `改 ${base(a.file_path)}` : '改文件'
    case 'grep': return `搜 ${shortText(a.pattern || a.query || '', 30)}`
    case 'glob': return `找 ${shortText(a.pattern || '', 30)}`
    case 'web_search': return `搜网 ${shortText((a.queries || []).join(' / ') || a.query || '', 30)}`
    case 'web_fetch': return `抓网页 ${shortText(a.url || '', 40)}`
    case 'subagent': return `派子任务 ${shortText(a.description || '', 30)}`
    case 'job_output': return `看后台任务 ${shortText(a.job_id || '', 24)}`
    case 'job_list': return '看后台任务'
    case 'bili_subtitle': return `看B站字幕 ${shortText(a.bvid || '', 24)}`
    case 'bili_comments': return `看B站评论 ${shortText(a.bvid || '', 24)}`
    case 'bili_search': return `搜B站 ${shortText(a.keyword || '', 24)}`
    case 'pwsh': {
      const c = String(a.command || '').replace(/\s+/g, ' ')
      const baseOf = (p) => String(p || '').split(/[\\/]/).pop()
      if (/@'\s*[\s\S]*\brequire\(['"]fs/.test(String(a.command || '')) || /(^|\s)node(\.exe)?\s/i.test(c)) return '跑 Node 脚本'
      if (/\bgit\s+(add|commit|push)\b/i.test(c)) return 'git 提交'
      if (/chcp\s+65001/i.test(c)) return '跑控制台命令'
      if (/Select-String/i.test(c)) {
        const m = /-(?:Pattern|Path)\s+['"]?([^'"\s]+)/i.exec(c)
        const what = m ? m[1] : c
        if (/[❌]|失败|通过/.test(what)) return '查测试输出'
        if (/^\$/.test(what)) return '查 文件'
        return `查 ${shortText(what, 32)}`
      }
      if (/Get-ChildItem/i.test(c)) {
        const m = /-Path\s+['"]?([^'"\s]+)/i.exec(c) || /-Filter\s+['"]?([^'"\s]+)/i.exec(c)
        return `列 ${shortText(m && !/^\$/.test(m[1]) ? baseOf(m[1]) : '目录', 30)}`
      }
      if (/Get-Content/i.test(c)) {
        const m = /-Path\s+['"]?([^'"\s]+)/i.exec(c) || /Get-Content\s+['"]?([^'"\s]+)/i.exec(c)
        return `读 ${shortText(m && !/^\$/.test(m[1]) ? baseOf(m[1]) : '文件', 30)}`
      }
      if (/(Set-Content|Out-File|Copy-Item|New-Item|Remove-Item)/i.test(c)) {
        const m = /-Path\s+['"]?([^'"\s]+)/i.exec(c) || /-Destination\s+['"]?([^'"\s]+)/i.exec(c)
        return `写 ${shortText(m ? baseOf(m[1]) : '文件', 30)}`
      }
      if (/\bgit\b/i.test(c)) return `git ${shortText(c.replace(/^.*?\bgit\b/i, ''), 30)}`
      return `跑命令 ${shortText(c, 36)}`
    }
    default: return `${name || '工具'} ${shortText(a.raw || args, 36)}`
  }
}

function renderLines(text, prefix, idBase) {
  const lines = []
  const paras = splitParagraphs(text)
  const meta = []
  paras.forEach((para, pi) => {
    const sents = splitSentences(para)
    lines.push(`<!-- ${prefix}p=${pi + 1} -->`)
    meta.push({ p: pi + 1, sentences: [] })
    if (isStructured(para)) {
      // 结构化段落：原文整段照抄；句子只在注释里标范围和序号，不插行。
      let cursor = 0
      const ranges = sents.map((s) => {
        const from = cursor
        cursor += s.length
        return `${from}-${cursor}`
      })
      lines.push(`<!-- ${prefix}s=1..${sents.length} ranges=${ranges.join(',')} -->`)
      lines.push(para)
    } else {
      sents.forEach((s, si) => {
        lines.push(`<!-- ${prefix}s=${si + 1} -->`)
        lines.push(s)
      })
    }
    sents.forEach((s, si) => {
      meta[meta.length - 1].sentences.push({ s: si + 1, text: s, id: `${idBase}-P${pi + 1}-S${si + 1}` })
    })
  })
  return { lines, paragraphs: meta }
}

function textOfUser(event) {
  const out = []
  for (const part of event?.data?.content || []) {
    if (String(part?.type) !== 'text') continue
    const t = String(part?.text || '')
    if (!t.trim() || SKIP_USER.test(t)) continue
    out.push(t)
  }
  return out
}

/**
 * 纯渲染：一组事件 → 一块 Markdown + 一份 JSON。
 * @param {{sessionId:string, turn:number, events:Array, role?:string, status?:string, outcome?:string}} p
 */
export function renderTurn({ sessionId = '', turn = 0, events = [], role = '', body = '', status = 'completed', outcome = '', evidence = {} } = {}) {
  const startedAt = events.find((e) => e.type === 'turn/start')?.time || events[0]?.time || Date.now()
  const endedAt = events.find((e) => e.type === 'turn/end')?.time || 0
  const users = []
  let droppedUsers = 0
  const cardSeqs = [...(evidence.cardSeqs || [])]
  const rulesSeqs = [...(evidence.rulesSeqs || [])]
  const stepMap = new Map()
  const ensureStep = (n) => {
    const k = Number(n) || 0
    if (!stepMap.has(k)) stepMap.set(k, { step: k, say: [], think: [], tools: [] })
    return stepMap.get(k)
  }

  const seenEvents = new Set()
  for (const ev of events) {
    const ekey = ev?._eventKey || ev?.eventKey || (ev?.seq != null ? `${ev.seq}:${ev.type}` : '')
    if (ekey) {
      if (seenEvents.has(ekey)) continue
      seenEvents.add(ekey)
    }
    const type = String(ev?.type || '')
    if (type === 'user/message') {
      const texts = textOfUser(ev)
      if (!texts.length) continue
      const joined = texts.join('\n')
      if (ev.seq != null && /## 你是谁（[^\n]*本体卡|# 角色卡：/.test(joined) && !cardSeqs.includes(ev.seq)) cardSeqs.push(ev.seq)
      if (ev.seq != null && /## 鱼神的规矩（你的那一本/.test(joined) && !rulesSeqs.includes(ev.seq)) rulesSeqs.push(ev.seq)
      const kind = String(ev?.data?.source?.kind || 'user')
      const noise = kind === 'user-approval'
        || /^<system-reminder>/i.test(texts[0])
        || /^The approval policy changed/i.test(texts[0])
        || /^Current runtime context|^Time sampled/i.test(texts[0])
      if (noise) { droppedUsers += 1; continue }
      const human = kind === 'user'
      for (const text of texts) {
        users.push({ seq: ev.seq ?? null, at: ev.time || 0, kind, human, text })
      }
      continue
    }
    if (type === 'assistant/message') {
      const step = Number(ev?.data?.step) || 0
      const row = ensureStep(step)
      const content = ev?.data?.message?.content || []
      let part = 0
      for (const p of content) {
        const t = String(p?.text || '')
        if (!t.trim()) continue
        part += 1
        if (String(p?.type) === 'reasoning' || String(p?.type) === 'thinking') {
          row.think.push({ seq: ev.seq ?? null, at: ev.time || 0, part, text: t })
        } else if (String(p?.type) === 'text') {
          row.say.push({ seq: ev.seq ?? null, at: ev.time || 0, part, text: t })
        }
      }
      continue
    }
    if (type === 'tool/call') {
      const step = Number(ev?.data?.step) || 0
      const row = ensureStep(step)
      row.tools.push({
        callId: String(ev?.data?.callId || ''),
        name: String(ev?.data?.name || ''),
        args: String(ev?.data?.arguments || ''),
        callSeq: ev.seq ?? null,
        callAt: ev.time || 0,
        resultSeq: null, resultAt: 0, resultText: '', ok: null,
      })
      continue
    }
    if (type === 'tool/result') {
      const step = Number(ev?.data?.step) || 0
      const row = ensureStep(step)
      const id = String(ev?.data?.toolCallId || ev?.data?.message?.toolCallId || '')
      const text = (ev?.data?.message?.content || []).map((p) => String(p?.text || '')).join('\n')
      const hit = row.tools.find((t) => t.callId === id)
      const patch = {
        resultSeq: ev.seq ?? null,
        resultAt: ev.time || 0,
        resultText: text,
        ok: Boolean(ev?.data?.isError) || Boolean(ev?.data?.error) ? false : true,
      }
      if (hit) Object.assign(hit, patch)
      else row.tools.push({ callId: id, name: '(unknown)', args: '', callSeq: null, callAt: 0, ...patch })
      continue
    }
  }

  const steps = [...stepMap.values()].sort((a, b) => a.step - b.step)
  const lines = []
  const jsonSteps = []
  let thinkParas = 0
  let thinkSents = 0
  let sayParas = 0
  let saySents = 0
  let userParas = 0
  let userSents = 0
  const bodyKind = body || (role ? 'bound' : 'unbound')
  const roleName = ROLE_NAME[role] || '未绑定会话'
  const cardMark = cardSeqs.length ? `injected@${cardSeqs.join(',')}` : (role ? 'not-seen' : 'none')
  const rulesMark = rulesSeqs.length ? `injected@${rulesSeqs.join(',')}` : (role ? 'not-seen' : 'none')

  lines.push(`<!-- turn=${turn} schema=2 session=${sessionId} body=${bodyKind} card=${cardMark} rules=${rulesMark} start=${new Date(startedAt).toISOString()} end=${endedAt ? new Date(endedAt).toISOString() : ''} status=${status} turnId=${sessionId}#${turn} -->`)
  lines.push(`## 第 ${turn || '?'} 轮 · ${hhmmss(startedAt)}${endedAt ? ` → ${hhmmss(endedAt)}` : ''} · ${status}`)
  if (outcome) lines.push(`- 结局：${outcome}`)

  for (const u of users) {
    lines.push('')
    lines.push(`### 你 · seq=${u.seq ?? '—'} · ${hhmmss(u.at)} · kind=${u.kind}${u.human ? '' : ' · 非真人'}`)
    lines.push(`<!-- msg=${u.seq ?? '—'} kind=${u.kind} human=${u.human} -->`)
    const r = renderLines(u.text, '', `T${turn}-U${u.seq ?? 0}`)
    lines.push(...r.lines)
    userParas += r.paragraphs.length
    userSents += r.paragraphs.reduce((n, p) => n + p.sentences.length, 0)
  }

  const allThink = steps.flatMap((s) => s.think.map((t) => ({ step: s.step, ...t })))
  const thinkFullChars = allThink.reduce((n, t) => n + t.text.length, 0)
  const digest = digestThinks(allThink)
  if (digest.length) {
    lines.push('')
    lines.push(`### 她当时在想（要点 · ${allThink.length} 片 / ${thinkFullChars} 字 → ${digest.length} 句）`)
    lines.push(`<!-- thinkDigest=${digest.length} steps=${digest.map((d) => d.step).join(',')} -->`)
    for (const d of digest) {
      lines.push(`> ${d.text}  <!-- kd step=${d.step} -->`)
      thinkParas += 1
      thinkSents += 1
    }
  } else if (allThink.length) {
    // 按“没她的地方一句不留”留下空：不硬凑，也不装作没有思考。
    lines.push('')
    lines.push(`### 她当时在想（要点 · ${allThink.length} 片 / ${thinkFullChars} 字 → 0 句）`)
    lines.push('<!-- thinkDigest=0 -->')
    lines.push('> （这一轮没有留下“有她”的思考；全文在 raw）')
  }

  const allTools = steps.flatMap((s) => s.tools.map((t) => ({ step: s.step, ...t })))
  if (allTools.length) {
    lines.push('')
    lines.push(`### 手（这一轮 ${allTools.length} 次）`)
    lines.push(`<!-- tools=${allTools.length} steps=${[...new Set(allTools.map((t) => t.step))].join(',')} -->`)
    for (const t of allTools) {
      const purpose = toolPurpose(t.name, t.args)
      lines.push(`<!-- tool=${t.callId || '—'} name=${t.name} ok=${t.ok} step=${t.step} -->`)
      lines.push(`- \`${t.name}\`：${purpose}（${t.ok === false ? '失败' : t.ok === true ? '成功' : '无结果'}；结果 ${t.resultText.length} 字；seq ${t.callSeq ?? '—'}→${t.resultSeq ?? '—'}）`)
    }
  }

  for (const st of steps) {
    if (st.say.length) {
      for (const say of st.say) {
        lines.push('')
        lines.push(`### ${roleName} · 第 ${st.step} 步 · seq=${say.seq ?? '—'} · ${hhmmss(say.at)}`)
        lines.push(`<!-- say=${say.seq ?? '—'} step=${st.step} -->`)
        const r = renderLines(say.text, '', `T${turn}-A${st.step}`)
        lines.push(...r.lines)
        sayParas += r.paragraphs.length
        saySents += r.paragraphs.reduce((n, p) => n + p.sentences.length, 0)
      }
    }
    jsonSteps.push({
      step: st.step,
      say: st.say.map((s) => {
        const r = renderLines(s.text, '', `T${turn}-A${st.step}`)
        return { seq: s.seq, at: new Date(s.at).toISOString(), text: s.text, paragraphs: r.paragraphs }
      }),
      tools: st.tools.map((t) => ({
        callId: t.callId, name: t.name, purpose: toolPurpose(t.name, t.args), ok: t.ok,
        argsChars: t.args.length, resultChars: t.resultText.length,
        callSeq: t.callSeq, resultSeq: t.resultSeq,
      })),
    })
  }

  const stats = { users: users.length, droppedUsers, userParas, userSents, steps: steps.length, sayParas, saySents, thinkParas, thinkSents, thinkFullChars, tools: steps.reduce((n, s) => n + s.tools.length, 0) }
  const summaryText = [
    ...users.map((u) => u.text),
    ...steps.flatMap((s) => s.say.map((x) => x.text)),
  ].join('\n').slice(0, 4000)

  const json = {
    schema: 'turn.v2',
    schemaVersion: 2,
    turnId: `${sessionId}#${turn}`,
    sessionId, role, body: bodyKind, turn,
    identity: { bound: bodyKind === 'bound', cardSeqs, rulesSeqs },
    day: localDay(startedAt),
    startedAt: new Date(startedAt).toISOString(),
    endedAt: endedAt ? new Date(endedAt).toISOString() : null,
    status, outcome,
    user: users.map((u) => {
      const r = renderLines(u.text, '', `T${turn}-U${u.seq ?? 0}`)
      return { seq: u.seq, at: new Date(u.at).toISOString(), kind: u.kind, human: u.human, text: u.text, paragraphs: r.paragraphs }
    }),
    steps: jsonSteps,
    thinkDigest: digest.map((d) => ({ step: d.step, text: d.text })),
    // 里：只放投影要点，不放思考全文；全文在 raw。情绪只记明确出现的词，不推断语气。
    inner: {
      thoughts: digest.map((d) => ({ step: d.step, text: d.text })),
      emotions: explicitEmotions(digest.map((d) => d.text)),
      source: 'raw',
      note: '要点；全文在 raw，不把思考全文塞进投影',
    },
    thinkStats: { parts: allThink.length, fullChars: thinkFullChars, kept: digest.length, chars: digest.reduce((n, d) => n + d.text.length, 0) },
    stats,
    // 出处：宿主事件序号是主键；file:line 只作人读坐标，不进这里。
    source: { sessionId, hostTurnId: turn, eventCount: seenEvents.size },
  }
  return { markdown: `${lines.join('\n')}\n`, json, summaryText, stats }
}

// ── 采集器：攒当前轮、写 WAL、turn/end 落块 ────────────────────────────
