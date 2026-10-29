// 鱼神 · 模型偏好（本机、按角色）
// 干什么：记住“这条鱼用哪个模型”，总台/身体建会话和换模型都读同一份，不在代码里各写死一个。
// 不干什么：不改 DSH 配置、不碰别人的会话、不联网校验；选不了就如实报错。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const FILE = path.join(HOME, 'dayu', 'model.json')
export const DEFAULT_MODEL = { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' }

function clean(value, max = 80) {
  return String(value ?? '').trim().slice(0, max)
}

function readAll() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8').replace(/^\uFEFF/, ''))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

/** 某条鱼现在用的模型；没设过就用默认。 */
export function readModelPref(role = 'dayu') {
  const row = readAll().roles?.[role] || {}
  return {
    provider: clean(row.provider) || DEFAULT_MODEL.provider,
    model: clean(row.model) || DEFAULT_MODEL.model,
    reasoningEffort: clean(row.reasoningEffort) || DEFAULT_MODEL.reasoningEffort,
  }
}

/** 只写这一条鱼的模型；别的角色一个字节都不动。 */
export function writeModelPref(role = 'dayu', patch = {}) {
  const all = readAll()
  const roles = all.roles && typeof all.roles === 'object' ? all.roles : {}
  const prev = roles[role] || {}
  roles[role] = {
    ...prev,
    ...(patch.provider ? { provider: clean(patch.provider) } : {}),
    ...(patch.model ? { model: clean(patch.model) } : {}),
    ...(patch.reasoningEffort ? { reasoningEffort: clean(patch.reasoningEffort) } : {}),
    updatedAt: new Date().toISOString(),
  }
  const next = { version: 1, roles, updatedAt: new Date().toISOString() }
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const tmp = `${FILE}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, FILE)
  return readModelPref(role)
}
