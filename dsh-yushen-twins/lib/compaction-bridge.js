// 改｜2026-11-24 23:55｜大鱼·工作台｜授权：主人（2026-11-24：还有什么没做的一起）｜lib/compaction-bridge.js:1｜本轮整理提交：该文件此前已有改动，补留痕｜为什么：改动要能查到谁/何时/怎么验｜验证：回归 325/0（整体）｜可改：可改
/* 标签
 * id: lib-compaction-bridge
 * kind: module
 * summary: 把官方 compaction 的 summarize() 包一层：memory 模式用我们的工作/生活摘要，default 走官方，压缩后做覆盖核对。
 * tags: 压缩, 摘要, provider, 工作生活, 核对
 * created: 2026-11-17 01:20:00
 * changed: 2026-11-18 00:48:27
 * author: 大鱼·本班
 * authority: 老板（2026-11-17：压缩要能开关、能还原，摘要按工作/生活分块）
 * audience: 宿主启动、压缩 provider
 * owner: 框架；只包 summarize，不改官方锁/替换/原文保留
 * mutable: 可改；default 必须原样回落，memory 失败也必须回落
 * usage: installCompactionBridge({ctx, engine, getMode, onCheck}) → 是否装上
 * why: 官方 compaction 的默认摘要不是记忆结构，但直接重写替换协议太危险
 * result: memory 模式走自定义摘要；default 原样；每次摘要后跑工作/生活/共同核对
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from '../memory-core/runtime/root.js'
import { buildMemorySummaryInstruction, checkMemorySummary } from './compaction-summary.js'
import { getMode } from './compaction-mode.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const logFile = () => path.join(dataRoot(HOME), 'runtime', 'compaction-memory.jsonl')

function routeOf(agent) {
  try {
    const h = agent?.session?.requestHeader?.() || {}
    const provider = String(h.provider || agent?.options?.provider || '')
    const model = String(h.model || agent?.options?.model || '')
    return { provider, model }
  } catch { return { provider: '', model: '' } }
}

function textOfSummary(result) {
  return (Array.isArray(result?.summary) ? result.summary : [])
    .filter((b) => b && b.type === 'text' && b.text)
    .map((b) => String(b.text))
    .join('\n')
}

function recordCheck(entry) {
  try {
    const file = logFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8')
  } catch { /* 记不上不影响压缩 */ }
}

async function customSummary(ctx, input, agent, signal) {
  let llm = null
  try { llm = ctx?.get?.('llm') || ctx?.llm || null } catch { llm = null }
  if (!llm || typeof llm.stream !== 'function') return null
  const route = routeOf(agent)
  if (!route.provider || !route.model) return null
  const messages = [
    ...(Array.isArray(input?.messages) ? input.messages : []),
    { role: 'user', content: [{ type: 'text', text: buildMemorySummaryInstruction() }] },
  ]
  let text = ''
  let usage = undefined
  try {
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      messages,
      maxTokens: 4096,
      purpose: 'compaction',
      ...(signal ? { signal } : {}),
    })) {
      if (chunk?.type === 'text-delta' && chunk.text) text += String(chunk.text)
      if (chunk?.type === 'usage' && chunk.usage) usage = chunk.usage
    }
  } catch { return null }
  if (!text.trim()) return null
  return {
    summary: [{ type: 'text', text }],
    rawOutput: [{ type: 'text', text }],
    llmStreamCall: true,
    provider: route.provider,
    model: route.model,
    maxTokens: 4096,
    ...(usage ? { usage } : {}),
  }
}

/**
 * 给已有 compaction engine 的 summarize 打一层补丁。
 * default：完全调用原方法；memory：先试我们的摘要，失败回落原方法；off：仍走原方法（自动开关在宿主配置层）。
 */
export function installCompactionBridge({ ctx, engine, getMode: modeOf = getMode, onCheck = null } = {}) {
  const e = engine || ctx?.compaction
  if (!e || typeof e.summarize !== 'function' || e.__yushenCompactionBridge) return { ok: false, why: '没有 compaction.summarize' }
  const orig = e.summarize.bind(e)
  const origCompact = typeof e.compactIfNeeded === 'function' ? e.compactIfNeeded.bind(e) : null
  if (origCompact) {
    e.compactIfNeeded = async function patchedCompactIfNeeded(agent, trigger, signal) {
      // off：自动压缩不跑；手动 compactNow 不受影响，原文/摘要都不动。
      if (String(modeOf() || 'default') === 'off') return null
      return origCompact(agent, trigger, signal)
    }
  }
  e.summarize = async function patchedSummarize(input, agent, signal) {
    const mode = String(modeOf() || 'default')
    let result = null
    if (mode === 'memory') {
      try { result = await customSummary(ctx, input, agent, signal) } catch { result = null }
    }
    if (!result) result = await orig(input, agent, signal)
    try {
      const text = textOfSummary(result)
      const check = checkMemorySummary(text)
      const entry = { at: new Date().toISOString(), mode, ok: check.ok, missing: check.missing, hasRefs: check.hasRefs, chars: text.length }
      recordCheck(entry)
      if (typeof onCheck === 'function') onCheck(entry)
    } catch { /* 核对失败不影响压缩 */ }
    return result
  }
  e.__yushenCompactionBridge = true
  return { ok: true }
}
