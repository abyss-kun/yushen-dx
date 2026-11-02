// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 创建角色（向导后端，2026-10-31 老板定）：
//   选来源（三选一白纸卡 / 用他自己的卡）→ 取名 → 契约 → 创建即生效。
// 这里只做前三步里"建卡 + 进名册"这一段；生效在 lib/awakening.js:finishCreation（卡+契约齐）。
//
// 规矩：
//   · 只用现成能力：建卡走 characters.addCharacter（自带空白卡模板、绝不覆盖、失败回滚）；
//     形象走 nest.adoptFile/resolveAvatar；候选图走 intake.characterCandidates。
//   · 不凭空造卡：source=builtin 才用空白模板；source=card 必须给正文。
import fs from 'node:fs'
import path from 'node:path'
import { characterIds, rosterIds, listCharacters, getCharacter, addCharacter, BUILTIN_ROLES } from './characters.js'
import { characterCandidates } from './intake.js'
import { adoptFile } from './nest.js'

/** 建角色前能给他看什么。只读。 */
export function createOptions({ home = '' } = {}) {
  // 用 rosterIds()：干净装没有名册就是空的，不能因为 SEED 兜底就把"大鱼"显示成已占用。
  const roster = (() => { try { return rosterIds() } catch { return [] } })()
  const builtins = BUILTIN_ROLES.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    alias: c.alias || '',
    taken: roster.includes(c.id),      // 已经在册的，不能再建（不覆盖）
  }))
  let candidates = []
  try {
    candidates = characterCandidates().map((a) => ({ plugin: a.plugin, kind: a.kind, rel: a.rel || '', path: a.path, license: a.license || '' })).slice(0, 80)
  } catch { candidates = [] }
  return {
    ok: true,
    roster,
    builtins,
    candidates,   // 能当形象用的图/模型候选（来自已装插件）
    sources: [
      { id: 'builtin', label: '三选一（给一张白纸卡，她自己长成）' },
      { id: 'card', label: '用我自己的角色卡（.md 正文）' },
    ],
    note: roster.length ? '' : '还没有角色：先选一个，取名，签契约，就生效。',
  }
}

/**
 * 建一个角色并进名册。不点化（点化在 finishCreation 里，卡+契约齐才活）。
 * @param {{source?:'builtin'|'card', id:string, name:string, alias?:string, title?:string,
 *          cardText?:string, avatarFile?:string, cwd?:string}} input
 * @returns {{ok:true, role:string, card:string, avatar?:string}|{ok:false, code:string, error:string}}
 */
export function createCharacter(input = {}) {
  const source = String(input.source || 'builtin')
  const id = String(input.id || '').trim()
  const name = String(input.name || '').trim()
  if (!id) return { ok: false, code: 'NO_ID', error: '缺 id（小写字母开头，2–32 位）' }
  if (!name) return { ok: false, code: 'NO_NAME', error: '缺名字：先取名再建' }
  if (source !== 'builtin' && source !== 'card') return { ok: false, code: 'BAD_SOURCE', error: `source 只能是 builtin / card：${source}` }
  const idCheck = canUseId(id)
  if (!idCheck.ok) return { ok: false, code: idCheck.why === '已经有这个 id 了' ? 'TAKEN' : 'BAD_ID', error: idCheck.why }

  let cardText = ''
  if (source === 'card') {
    cardText = String(input.cardText || '')
    if (!cardText.trim()) return { ok: false, code: 'NO_CARD_TEXT', error: '选了「用我自己的卡」，但卡正文是空的' }
  }
  try {
    addCharacter({ id, name, alias: String(input.alias || ''), title: String(input.title || ''), cwd: String(input.cwd || ''), card: source === 'card' ? cardText : '' })
  } catch (e) {
    const msg = String(e?.message || e)
    const code = /已经有这个角色/.test(msg) ? 'TAKEN' : /卡文件已存在|记忆文件已存在/.test(msg) ? 'EXISTS' : 'ADD_FAILED'
    return { ok: false, code, error: msg }
  }

  // 形象：不给就用包内那张；给了图片就走 nest.adoptFile（鱼窝那条现成的路，不另写一份）
  let avatar = ''
  let warn = ''
  const imgPath = String(input.avatarFile || '').trim()
  if (imgPath) {
    try {
      if (!fs.existsSync(imgPath)) warn = `形象文件找不到：${imgPath}`
      else {
        const r = adoptFile(id, name, imgPath)
        avatar = String(r?.file || r?.path || imgPath)
      }
    } catch (e) {
      // 形象换失败不影响"人建成"——她先有卡，图以后还能换
      warn = `形象没换上：${String(e?.message || e).slice(0, 80)}`
    }
  }
  const c = (() => { try { return getCharacter(id) } catch { return null } })()
  return { ok: true, role: id, name: c?.name || name, card: c?.cards?.desk || '', avatar, ...(warn ? { warn } : {}) }
}

/** 只读：这个 id 成不成（建之前给界面即时提示）。createCharacter 里也再判一次，这里不替代校验。 */
export function canUseId(id) {
  const s = String(id || '').trim()
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(s)) return { ok: false, why: '小写字母开头，2–32 位（a-z 0-9 _ -）' }
  try { if (rosterIds().includes(s)) return { ok: false, why: '已经有这个 id 了' } } catch { /* 名册读不到就按可用 */ }
  return { ok: true }
}
