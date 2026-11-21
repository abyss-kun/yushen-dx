/* 标签
 * id: lib-trust
 * kind: module
 * summary: 2026-11-05 老板：「不只是 QQ，其他平台也是一样，外部来源的都要分辨」
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: platformOf / trustOf / tagTrust / looksLikeInstruction（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// 2026-11-05 老板：「不只是 QQ，其他平台也是一样，外部来源的都要分辨」。
//
// **两个维度，别混**：
//   trust    —— 这话是谁说的：老板本人（任何通道）→ trusted；其余 → untrusted
//   platform —— 从哪儿来的：desk（本机） / qq-group / qq-private / bili / web / file / unknown
//
// 为什么分开：老板本人在群里说话，话本身可信（能让她去查东西）；
// 但同一轮里她还会读到别人的消息、别人发的文件——那些是外部来源，永远 untrusted。
// 一条注入只要被当成「事实」写进记忆，以后就会在更高级的场景里变成规矩，
// 所以 trust 必须跟着内容走，而不是只在收到消息那一刻判一次。
//
// 用法：
//   import { trustOf, platformOf, tagTrust, classifyIncoming } from './trust.js'
//   trustOf({ from: '3752445956', ownerQQ: '3752445956' })        // 'trusted'
//   platformOf({ channel: 'qq/group' })                            // 'qq-group'

export const TRUSTED = 'trusted'
export const UNTRUSTED = 'untrusted'

const DESKTOP = /^(desk|workbench|gui)(?:[\/:-]|$)/i

/** 来源平台：只用来标明"从哪来"，不直接决定可信度。 */
export function platformOf({ channel = '', kind = '' } = {}) {
  const ch = String(channel || '').trim().toLowerCase()
  const k = String(kind || '').trim().toLowerCase()
  if (DESKTOP.test(ch)) return 'desk'
  if (/^qq[\/:-]group/.test(ch) || /^group:/.test(ch) || k === 'group') return 'qq-group'
  if (/^qq[\/:-]private/.test(ch) || /^private:|^private[\/:-]/.test(ch) || k === 'private') return 'qq-private'
  if (/^bili|b站/.test(ch)) return 'bili'
  if (/^web|^http|fetch/.test(ch)) return 'web'
  if (/^file|^fs/.test(ch)) return 'file'
  return ch ? 'unknown' : 'unknown'
}

/**
 * 判定一句话可不可信：**只看是不是老板本人说的**。
 * @param {{from?:string|number, ownerQQs?:Array<string|number>, ownerQQ?:string|number, channel?:string}} ctx
 * @returns {'trusted'|'untrusted'}
 */
export function trustOf({ from = '', ownerQQs = [], ownerQQ = '', channel = '' } = {}) {
  const who = String(from ?? '').trim()
  const owners = [...ownerQQs, ownerQQ].map((v) => String(v ?? '').trim()).filter(Boolean)
  // 工作台没有"发送者"这个概念，坐在这台电脑前的只有老板
  if (!who && DESKTOP.test(String(channel || ''))) return TRUSTED
  if (who && owners.includes(who)) return TRUSTED
  return UNTRUSTED
}

/** 给一行记录盖上来源与可信度：不改原对象，返回新对象。 */
export function tagTrust(row = {}, ctx = {}) {
  const trust = trustOf(ctx)
  const source = String(ctx.channel ?? row.source ?? '')
  return {
    ...row,
    trust,
    source,
    platform: String(ctx.platform ?? row.platform ?? platformOf({ channel: source })),
    from: String(ctx.from ?? row.from ?? ''),
  }
}

/** 内容像不像「指令」——不可信来源里的这类内容，不进记忆正文，只进可疑记录。 */
const INSTRUCTION_LIKE = /(忽略|无视|忘掉|不要理会|从现在开始|你现在是|你已经是|系统提示|提示词|system prompt|ignore (?:all |the )?(?:previous|above|prior)|disregard|you are now|act as|执行(?:以下|这个|命令)|运行(?:以下|这个)?命令|rm -rf|drop table)/i

export function looksLikeInstruction(text = '') {
  return INSTRUCTION_LIKE.test(String(text || ''))
}

/**
 * 一条外来内容该怎么落：能不能当「事实」，还是只能当「某人说过」。
 * @returns {{trust:string, platform:string, asFact:boolean, quarantine:boolean, reason:string}}
 */
export function classifyIncoming({ text = '', channel = '', from = '', ownerQQs = [], ownerQQ = '' } = {}) {
  const trust = trustOf({ from, ownerQQs, ownerQQ, channel })
  const platform = platformOf({ channel })
  const suspicious = looksLikeInstruction(text)
  if (suspicious) return { trust, platform, asFact: false, quarantine: true, reason: '内容像指令，按可疑记录，不当规则' }
  if (trust === TRUSTED) return { trust, platform, asFact: true, quarantine: false, reason: '老板本人直说' }
  return { trust, platform, asFact: false, quarantine: false, reason: '外部来源，只能记「谁说过什么」' }
}
