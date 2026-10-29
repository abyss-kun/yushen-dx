// 身份：助手只有一个。
//
// 2026-10-27 纠错：上一版把"鱼神里的助手"和"QQ 上显示助手那个号"当成两个人——
// 错了。她是一个本体（助手），工作台、QQ、B站只是她坐的地方；
// 桥上的"角色/角色"是她在那个通道的称呼/卡，不是另一个人。
//
// 所以这里不再分"两个系统的人"，只分"一个本体的不同通道"。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const FILE = path.join(HOME, 'dayu', 'identity.json')

const ROLES = Object.freeze({ dayu: '管家（管家）', xiaoyu: '助手（助手）', dragon: '顾问' })
const CHANNEL_LABEL = Object.freeze({ workbench: '工作台', qq: 'QQ', bili: 'B站', hub: '中枢' })

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return { channelNames: {} } }
}
function write(doc) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, `${JSON.stringify(doc, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return doc
}

/** 记下她在某个通道的显示名（比如 QQ 上叫"助手"或"角色"）——称呼，不是身份。 */
export function setChannelName(channel, displayName) {
  const doc = read()
  doc.channelNames = doc.channelNames || {}
  doc.channelNames[String(channel || 'qq')] = String(displayName || '').slice(0, 40)
  doc.at = new Date().toISOString()
  return write(doc)
}

/**
 * 她是谁：本体 + 现在坐在哪。
 * @param {{role?:string, channel?:string}} who
 */
export function resolveIdentity({ role = 'dayu', channel = 'workbench' } = {}) {
  const doc = read()
  const ch = String(channel || 'workbench')
  const name = ROLES[role] || role
  const display = doc.channelNames?.[ch] || ''
  return {
    role,
    name,
    one: true,
    channel: ch,
    channelLabel: CHANNEL_LABEL[ch] || ch,
    displayNameThere: display,
    note: '一个本体；这里只是她在那个通道的称呼',
  }
}

/** 日志/回复用的一行：先本体，再说在哪。 */
export function identityLine({ role = 'dayu', channel = 'workbench' } = {}) {
  const i = resolveIdentity({ role, channel })
  const there = i.displayNameThere && i.displayNameThere !== i.name ? `（那边显示：${i.displayNameThere}）` : ''
  return `${i.name} @${i.channelLabel}${there}`
}
