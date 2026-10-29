// 把她在鱼神里的本体（卡 + 同一份记忆）同步进刷B站插件的 personaPrompt。
// 边界：只写「刷B站」自己的配置里那个给人设用的字段；不碰账号、不碰令牌、不覆盖用户自己写的人设。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readCard, readPersona, soulStatus } from './soul.js'

export const MARK = '【鱼神本体 · 自动同步】'
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

export function biliConfigPath() {
  return path.join(HOME, 'bili-duty', 'config.json')
}

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-') }

/**
 * 生成要写进 personaPrompt 的文本（带标记，便于下次判断是不是我们写的）。
 * 只同步一个角色；默认助手（B站号是她的）。
 *
 * 2026-10-27 修：以前用 buildSceneText（含简报/心情/回场），每次都会变，
 * 于是"第二次同步"永远 changed=true。人格只该用稳定来源：卡 + 本体 brief。
 */
export function composeBiliPersona(role = 'xiaoyu', { scene = 'bili', maxChars = 60000 } = {}) {
  const card = readCard(role, scene === 'bili' ? 'social' : scene) || readCard(role, 'desk')
  const persona = readPersona()
  const text = String(card?.text || '').trim() || String(persona?.brief || '').trim()
  if (!text) throw new Error(`读不到 ${role} 的本体，不同步`)
  const st = soulStatus(role)
  const head = `${MARK} ${st.name}${st.title ? `（${st.title}）` : ''}\n同步时间：${new Date().toISOString()}\n角色 id：${role}\n当前通道：B站（聊天与记忆仍在鱼神本体，不另存一套）\n`
  return `${head}\n${text}`.slice(0, maxChars)
}

/**
 * 写进刷B站的配置。
 * 规则：文件不存在 → 跳过；已有 personaPrompt 且不是我们写的 → 默认拒绝（用户自己写的优先）。
 * 返回 { ok, changed, reason, backup }
 */
export function syncBiliPersona({ role = 'xiaoyu', configPath = biliConfigPath(), force = false, dryRun = false } = {}) {
  if (!fs.existsSync(configPath)) return { ok: false, changed: false, reason: '没有刷B站配置（没装这个插件）' }
  let cfg = {}
  try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')) } catch {
    return { ok: false, changed: false, reason: '刷B站配置不是合法 JSON，不动它' }
  }
  const current = String(cfg.personaPrompt || '')
  if (current && !current.startsWith(MARK) && !force) {
    return { ok: false, changed: false, reason: '刷B站里已有人设提示词（不是鱼神同步的），不覆盖；要覆盖加 --force' }
  }
  const next = composeBiliPersona(role)
  if (current === next || current.startsWith(MARK) && current.split('\n').slice(3).join('\n').trim() === next.split('\n').slice(3).join('\n').trim()) {
    return { ok: true, changed: false, reason: '已经是最新的' }
  }
  if (dryRun) return { ok: true, changed: false, dryRun: true, reason: '只预览，没写', previewChars: next.length }
  const backup = `${configPath}.bak-${stamp()}`
  try {
    fs.copyFileSync(configPath, backup)
    const out = { ...cfg, personaPrompt: next }
    const tmp = `${configPath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(out, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(tmp, configPath)
    return { ok: true, changed: true, backup, chars: next.length }
  } catch (error) {
    return { ok: false, changed: false, reason: `写配置失败：${error?.message || error}` }
  }
}
