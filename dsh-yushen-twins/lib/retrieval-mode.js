/* 标签
 * id: lib-retrieval-mode
 * kind: module
 * summary: 检索模式开关：lexical=本地词频（默认，不下载）；embedding=本地小模型（需安装后启用）。
 * tags: 检索, 模式, 词频, 嵌入, 设置
 * created: 2026-11-19 21:00:00
 * changed: 2026-11-19 23:43:33
 * author: 大鱼·本班
 * authority: 老板（2026-11-19：默认词频，小模型用户可选、选了再下载）
 * audience: 查询、后台设置页
 * owner: 框架；只读写 switches.json 的 retrievalMode
 * mutable: 可改；embedding 未安装时必须回落 lexical
 * usage: getMode() / setMode('lexical'|'embedding') / describeMode()
 * why: 默认不下载模型；用户明确选择后才装小模型
 * result: 三态描述；embedding 不可用时返回回落信息
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from '../memory-core/runtime/root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const fileOf = () => path.join(dataRoot(HOME), 'switches.json')
export const MODES = Object.freeze(['lexical', 'embedding'])
export const LABEL = Object.freeze({ lexical: '本地词频', embedding: '本地小模型' })
export const MODEL_NAME = 'bge-small-zh-v1.5'
export const MODEL_URL = 'https://huggingface.co/BAAI/bge-small-zh-v1.5'

function read() {
  try {
    const raw = JSON.parse(fs.readFileSync(fileOf(), 'utf8').replace(/^\uFEFF/, ''))
    const m = String(raw?.retrievalMode || 'lexical').toLowerCase()
    return { data: raw && typeof raw === 'object' ? raw : {}, mode: MODES.includes(m) ? m : 'lexical' }
  } catch { return { data: {}, mode: 'lexical' } }
}

export function getMode() { return read().mode }

export function describeMode() {
  const mode = getMode()
  return {
    mode,
    label: LABEL[mode],
    modes: MODES.map((m) => ({ mode: m, label: LABEL[m], available: m === 'lexical' })),
    embeddingInstalled: false,
    embeddingImplemented: false,
    modelName: MODEL_NAME,
    modelUrl: MODEL_URL,
    note: '本地词频（默认，不下载模型、不联网）。本地小模型还没接：2026-11-19 老板说等以后看情况，先不提供切换。',
  }
}

export function setMode(mode) {
  const m = String(mode || '').toLowerCase()
  if (!MODES.includes(m)) return { ok: false, why: `只能是 ${MODES.join(' / ')}` }
  // 2026-11-19 老板：本地小模型先不接，等以后看情况。没接之前不许假装能切。
  if (m === 'embedding') return { ok: false, why: '本地小模型还没接（老板 2026-11-19：等以后看情况）；现在只有本地词频。' }
  const { data } = read()
  data.retrievalMode = 'lexical'
  const file = fileOf()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1) + '\n', 'utf8')
  fs.renameSync(tmp, file)
  return { ok: true, ...describeMode() }
}
