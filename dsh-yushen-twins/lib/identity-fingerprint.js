// 身份指纹：身份文本只由「规则块 + 本体卡」决定，文件没变就不重算。
//
// 为什么要有它：
//   以前每次 ensureRole 都会重新拼一遍身份文本、算一次哈希，再跟账本里的
//   全局 personaHash 比。任何一个身体写回失败，所有身体都会被判「设定变了」，
//   于是每说一句话就重注入一次设定——她只能回「嗯。」。
//
// 现在的规则：
//   · 指纹只由文件内容决定；用 (mtime,size) 做缓存键，文件没动直接给上次结果；
//   · 指纹按角色算，不再跨角色、跨身体共用；
//   · 调用方拿这个指纹去和自己「这个会话见过的指纹」比，而不是和别人比。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { buildIdentityText } from './soul.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SOUL = path.join(HOME, 'dayu', 'soul')

const cache = new Map() // role -> { key, text, hash, files }

function statKey(files) {
  const parts = []
  for (const f of files) {
    try {
      const s = fs.statSync(f)
      parts.push(`${f}:${s.mtimeMs}:${s.size}`)
    } catch {
      parts.push(`${f}:missing`)
    }
  }
  return parts.join('|')
}

function identityFiles(role) {
  // 卡片按角色分文件；规则块读宪章 + 手册策略常量（策略在代码里，改动会重启，不用算）。
  const candidates = [
    path.join(SOUL, 'cards', `${role}.desk.md`),
    path.join(SOUL, 'persona.json'),
    path.join(HOME, 'dayu', 'charter.json'),
  ]
  return candidates
}

export function identityFingerprint(role = 'dayu') {
  const files = identityFiles(role)
  const key = statKey(files)
  const hit = cache.get(role)
  if (hit && hit.key === key) return hit
  let text = ''
  try { text = buildIdentityText(role, 'desk') || '' } catch { text = '' }
  const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
  const row = { key, text, hash, files, chars: text.length }
  cache.set(role, row)
  return row
}

/** 只读：给诊断/日志用，不产生副作用。 */
export function identityFingerprintInfo(role = 'dayu') {
  const fp = identityFingerprint(role)
  return { role, hash: fp.hash, chars: fp.chars, files: fp.files.map((f) => path.basename(f)) }
}
