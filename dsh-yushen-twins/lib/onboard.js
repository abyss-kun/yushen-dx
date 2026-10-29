// 鱼神 · 就职（接管后第一次立规矩）
// 写两样：~/.dsh/dayu/owner.md（给人和她看）+ owner.json（给程序读）。
// 三问：怎么称呼、话多话少、有什么不能碰。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { award } from './growth.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const MD = path.join(DATA, 'owner.md')
const JSON_FILE = path.join(DATA, 'owner.json')

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

export function readOwner() {
  const data = readJson(JSON_FILE, null)
  const md = (() => { try { return fs.readFileSync(MD, 'utf8') } catch { return '' } })()
  return {
    ok: true,
    onboarded: Boolean(data?.onboardedAt),
    owner: data || null,
    md,
  }
}

export function writeOwner(input = {}) {
  const callName = String(input.callName || '').trim().slice(0, 24) || '老板'
  const verbosity = ['少', '正常', '多'].includes(input.verbosity) ? input.verbosity : '正常'
  const taboos = String(input.taboos || '').trim().slice(0, 400)
  const now = new Date().toISOString()
  // 默认别名是通用的（老板/boss/老大）；用户自己的昵称由他自己在“也叫”里填。
  const extra = Array.isArray(input.aliases)
    ? input.aliases.map((x) => String(x).trim().slice(0, 16)).filter(Boolean)
    : []
  const aliases = [...new Set([callName, '老板', 'boss', '老大', ...extra])].slice(0, 8)
  const data = { onboardedAt: now, callName, aliases, verbosity, taboos, charterVersion: 3 }

  fs.mkdirSync(DATA, { recursive: true })
  const text = [
    '# 老板',
    '',
    `- 怎么称呼：${callName}`,
    `- 也认：${aliases.filter((x) => x !== callName).join('、') || '（无）'}`,
    `- 说话：${verbosity}`,
    `- 不能碰：${taboos || '（还没说）'}`,
    `- 立约时间：${now}`,
    '',
    '> 这是接管后第一次立规矩；以后老板改口，改这里。',
    '',
  ].join('\n')
  fs.writeFileSync(MD + '.tmp', text, 'utf8')
  fs.renameSync(MD + '.tmp', MD)
  fs.writeFileSync(JSON_FILE + '.tmp', JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(JSON_FILE + '.tmp', JSON_FILE)

  // 立约要写回她的人格：不然白纸还是白纸，她不会用老板给的名字。
  try {
    const soulFile = path.join(DATA, 'soul', 'persona.json')
    const soul = (() => { try { return JSON.parse(fs.readFileSync(soulFile, 'utf8')) } catch { return null } })()
    if (soul) {
      soul.owner = { ...(soul.owner || {}), callName, verbosity, taboos, onboardedAt: now }
      fs.mkdirSync(path.dirname(soulFile), { recursive: true })
      const tmp = soulFile + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(soul, null, 2), 'utf8')
      fs.renameSync(tmp, soulFile)
    }
  } catch { /* 人格写不进去不影响立约本身 */ }

  try { award('立约接管', 20) } catch { /* 经验算不了不影响立约 */ }
  return { ok: true, onboarded: true, owner: data }
}
