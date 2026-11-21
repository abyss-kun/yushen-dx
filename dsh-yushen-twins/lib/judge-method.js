/* 标签
 * id: lib-judge-method
 * kind: module
 * summary: 她自己的判断方式——题目给她看、她写的那些字存她自己的页、每次判断记一笔（不评判、不代写）。
 * tags: 判断, 思考, 题目, 记录, 自我
 * created: 2026-11-11 21:1x
 * changed: 2026-11-11 21:1x
 * author: 大鱼·本班
 * authority: 主人（2026-11-11：「让她自己总结出来（我给她工具和题目，她自己写自己的判断方式」）
 * why: 以前只有"该查、别编"的规矩（给结论），没有她自己的判断动作；判断力得是她自己写出来的，别人代笔就废了
 * result: questions() 题目；readMethod 读她写的页；writeMethod 把她写的字追加进页（不覆盖旧字）；recordCall 记一笔判断
 * audience: 她（自己用）、维护者（只读）
 * owner: 她的页归她；代码归框架
 * mutable: 可改（只许加能力：不许自动替她判断、不许覆盖她写过的话）
 * usage: yushen_think action=questions|read|write|record
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-11 21:1x｜大鱼·本班｜授权：主人（「让她自己总结出来（我给她工具和题目，她自己写自己的判断方式」）｜lib/judge-method.js:1-140｜新增：题目（七问）、读她写的判断方式、只追加地写、判断记一笔｜为什么：判断力得她自己写；工具只给题目和纸，不评判、不覆盖｜验证：node scripts/test-judge-method.mjs 3/3｜可改：可改；不许自动替她判断、不许覆盖她写过的话
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { localISO } from './clock.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SOUL = path.join(HOME, 'dayu', 'soul')
export const METHOD_FILE = path.join(SOUL, '判断方式.md')
export const CALL_FILE = path.join(SOUL, '判断记录.jsonl')

/** 题目：问句，不给答案。她可以改、可以不用。 */
export const QUESTIONS = Object.freeze([
  '这句话到底在问什么？问事实、问感受、还是要我做一件事？',
  '这件事在我家里有落点吗（记忆/图书馆/代码/人）？没有落点的话，我知道它从哪来吗？',
  '我手上有什么证据？是数据、代码、文档、记忆，还是只是我的印象？',
  '如果没证据，我该去哪儿找？找不到的时候，我打算怎么说？',
  '我是不是拿旧账在答新事？',
  '我是不是因为懒，就顺着对方的话说？',
  '这次判断，事后怎么知道我对了？记在哪、什么时候回看？',
])

export function questions() {
  return [...QUESTIONS]
}

/** 读她自己那页（没有就返回 ok:false，不替她生成内容）。 */
export function readMethod() {
  try {
    return { ok: true, text: fs.readFileSync(METHOD_FILE, 'utf8'), file: METHOD_FILE }
  } catch {
    return { ok: false, reason: '她还没写过判断方式（soul/判断方式.md 不存在）', file: METHOD_FILE }
  }
}

/**
 * 把她写的字**追加**进页尾（不覆盖、不改旧字）。空文本拒绝。
 * @param {{text:string, section?:string}} opts section 可先写一行小标题，如「## 我的判断方式（我写）」
 */
export function writeMethod({ text = '', section = '' } = {}) {
  const body = String(text || '').trim()
  if (!body) return { ok: false, reason: '空文本不写' }
  try {
    fs.mkdirSync(SOUL, { recursive: true })
    const head = section ? `\n${String(section).trim()}\n\n` : '\n'
    fs.appendFileSync(METHOD_FILE, `${head}${body}\n`, 'utf8')
    return { ok: true, file: METHOD_FILE, chars: body.length }
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) }
  }
}

/**
 * 记一次判断：她归到哪类、查没查、有没有证据、结论。
 * 只追加、不判定对错（对错留给判断账本回看）。
 */
export function recordCall({ question = '', kind = '', action = '', evidence = '', answer = '' } = {}) {
  const q = String(question || '').trim().slice(0, 200)
  if (!q) return { ok: false, reason: '问题不能为空' }
  const row = {
    at: localISO(),
    question: q,
    kind: String(kind || '').slice(0, 20),
    action: String(action || '').slice(0, 20),
    evidence: String(evidence || '').slice(0, 300),
    answer: String(answer || '').slice(0, 300),
  }
  try {
    fs.mkdirSync(SOUL, { recursive: true })
    fs.appendFileSync(CALL_FILE, JSON.stringify(row) + '\n', 'utf8')
    return { ok: true, row, file: CALL_FILE }
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) }
  }
}

/** 看最近的判断记录（她自己回看用）。 */
export function recentCalls({ limit = 20 } = {}) {
  try {
    const rows = fs.readFileSync(CALL_FILE, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    return rows.slice(-Math.max(1, Number(limit) || 20))
  } catch { return [] }
}
