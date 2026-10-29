// 鱼神跨窗口当前目标：只保存主人最近明确交代的目标摘要，不保存完整私密对话。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'current-goal.json')
const MAX = 1000

function clean(v, max = MAX) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}
export function readConversationGoal() {
  try {
    const v = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    if (!v || typeof v !== 'object' || !v.text) return null
    return { goalId: clean(v.goalId, 80), text: clean(v.text), status: clean(v.status, 30) || 'active', nextStep: clean(v.nextStep, 500), sourceSessionId: clean(v.sourceSessionId, 160), updatedAt: clean(v.updatedAt, 40) }
  } catch { return null }
}
export function writeConversationGoal({ text, status = 'active', nextStep = '', sourceSessionId = '', goalId = '' } = {}) {
  const body = {
    goalId: clean(goalId) || `goal-${Date.now().toString(36)}`,
    text: clean(text), status: clean(status, 30) || 'active', nextStep: clean(nextStep, 500), sourceSessionId: clean(sourceSessionId, 160), updatedAt: new Date().toISOString(),
  }
  if (!body.text) return readConversationGoal()
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = `${FILE}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2), 'utf8')
  fs.renameSync(tmp, FILE)
  return body
}
export function goalFile() { return FILE }
