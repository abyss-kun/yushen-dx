// 偏好：她喜欢什么、受不了什么。她自己写，插件只存和带。
import fs from 'node:fs'
import path from 'node:path'
import { runtimeDir } from './runtime.js'

export const KINDS = Object.freeze(['likes', 'dislikes', 'nope'])

function file(role) { return path.join(runtimeDir(role), 'tastes.json') }
function read(role) {
  try {
    const doc = JSON.parse(fs.readFileSync(file(role), 'utf8'))
    return { likes: doc.likes || [], dislikes: doc.dislikes || [], nope: doc.nope || [] }
  } catch { return { likes: [], dislikes: [], nope: [] } }
}
function write(role, doc) {
  fs.mkdirSync(path.dirname(file(role)), { recursive: true })
  fs.writeFileSync(file(role), `${JSON.stringify(doc, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return doc
}

export function listTastes(role) { return read(role) }

export function addTaste(role, { kind = 'likes', text = '' } = {}) {
  if (!KINDS.includes(kind)) throw new Error(`不认识的类别：${kind}（可用：${KINDS.join(' / ')}）`)
  const t = String(text || '').trim()
  if (!t) throw new Error('喜欢/讨厌什么？写一句')
  const doc = read(role)
  if (!doc[kind].includes(t)) doc[kind] = [...doc[kind], t.slice(0, 80)].slice(-50)
  return write(role, doc)
}

export function removeTaste(role, { kind = 'likes', text = '' } = {}) {
  if (!KINDS.includes(kind)) throw new Error(`不认识的类别：${kind}`)
  const doc = read(role)
  doc[kind] = doc[kind].filter((x) => x !== String(text || '').trim())
  return write(role, doc)
}

/** 注入用：只有她写过才带。 */
export function tasteLine(role) {
  const t = read(role)
  const bits = []
  if (t.likes.length) bits.push(`喜欢：${t.likes.slice(-6).join('、')}`)
  if (t.dislikes.length) bits.push(`不喜欢：${t.dislikes.slice(-6).join('、')}`)
  if (t.nope.length) bits.push(`别这么叫：${t.nope.slice(-6).join('、')}`)
  return bits.length ? `## 你的口味\n${bits.join('；')}。` : ''
}
