// 鱼神 · Copyright (c) 2026 用户. All rights reserved.
// 管家入口（M0）：宪章落盘、名册只读、健康检查、两个只读工具。
// 不装插件、不改设置、不碰别人的数据。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { findProfile, readRoster } from '../lib/roster.js'
import { backupStatus, runProtectedBackup } from '../lib/backup-service.js'
import { status as forgetStatus, plan as forgetPlan, apply as forgetApply, autoOnce as forgetAuto } from '../lib/forget.js'
import { maybeBackup, judge as backupJudge, recentJudgments } from '../lib/backup-judge.js'
import { diagnose as diagnoseStuck, VERDICTS as STUCK_VERDICTS } from '../lib/stuck-doctor.js'
import { summary as employeeSummary } from '../lib/employee-record.js'
import { syncChannelMemory, channelMemoryStatus } from '../lib/channel-memory.js'
import { rewriteMemory, rewriteSelf, revertRewrite, rewriteCatalog } from '../lib/rewrite.js'
import { notifySelf, listNotices, unreadNotices, markNoticesRead } from '../lib/notices.js'
import { bodyTick, bodyStatus, BODY } from '../lib/body-loop.js'
import { searchAll } from '../lib/search.js'
import { buildSceneText, buildIdentityText, soulStatus, memoryView } from '../lib/soul.js'
import { ensureRole, deliverToRole, residenceStatus, markBody, residentRoles, readLedger as readResidenceLedger } from '../lib/residence.js'
import { appendEvent, roleForSession, attributionOf } from '../lib/memory.js'
import { characterIds } from '../lib/characters.js'
import { listAwakening, awaken, seal, isAwake } from '../lib/awakening.js'
import { capture, listCapture, searchCapture } from '../lib/capture.js'
import { recordThought, listThoughts } from '../lib/thoughts.js'
import { looksGarbled } from '../lib/encoding.js'
import { decodeBody, hasReplacement } from '../lib/body.js'
import { recentAwareness, awarenessIndex, look } from '../lib/awareness.js'
import { shouldRun as shouldFreeTime, markRun as markFreeTime, status as freeTimeStatus } from '../lib/freetime.js'
import { markPending, takePending, peekPending } from '../lib/pending.js'
import { mirrorOnce as mirrorInbox, unreadFor as unreadInbox, markRoleRead, readInbox } from '../lib/inbox.js'
import { ensureRuntime, runtimeStatus, resumeBrief, markSeen, readWeights, setWeight, giftStatus, weightsLog, WEIGHT_DEFS, runtimeDir } from '../lib/runtime.js'
import { decideFor } from '../lib/reply-gate.js'
import { judgeOnce } from '../lib/judgment.js'
import { stepOnce as stepAgenda, addItem as addAgenda, addFromMind as addAgendaFromMind, updateItem as updateAgenda, dropItem as dropAgenda, readAgenda, pauseAgenda, resumeAgenda, isPaused, MAX_ACTIVE as AGENDA_MAX, NEXT_KINDS as AGENDA_KINDS } from '../lib/agenda.js'
import { requestInvocation, takeInvocation, finishInvocation, buildInvocationPrompt, budgetOf as invokeBudget, markAgendaDoing, requestMoreBudget } from '../lib/invoke.js'
import { readBottomline, writeBottomline, recordRefusal, listRefusals, bottomlineStatus, ensureBottomline } from '../lib/bottomline.js'
import { escalate, listEscalations, MUST_REPORT } from '../lib/escalate.js'
import { recordVenture, listVentures } from '../lib/ventures.js'
import { moodOf, setMood, noteMoodFromMessages, setMoodRule, moodRules } from '../lib/mood.js'
import { listTastes, addTaste } from '../lib/tastes.js'
import { addFeel, listFeels, feelsLine, tendencyOf, tendencyLine } from '../lib/feel.js'
import { addDelivery, listDeliveries } from '../lib/deliver.js'
import { runDueHands, readHands, addHand, removeHand, toggleHand, listHands } from '../lib/hands.js'
import { itchTick, markThought } from '../lib/itch.js'
import { addNews, listNews, hoursSinceOwner } from '../lib/miss.js'
import { recordObjection, listObjections } from '../lib/objections.js'
import { associate } from '../lib/recollect.js'
import { addWaiting, listWaiting, finishWaiting } from '../lib/waiting.js'
import { noteCorrection, listCorrections } from '../lib/corrections.js'
import { readMemory } from '../lib/soul.js'
import { pickTreasure, shareMaterial } from '../lib/treasure.js'
import { fatigueOf, setFatigue } from '../lib/fatigue.js'
import { relationsSummary } from '../lib/relations.js'
import { plugStatus } from '../lib/plug.js'
import { summarizeCompliance } from '../lib/oversight.js'
import { issueHandbook, listIssued } from '../lib/issue.js'
import { noteManners } from '../lib/manners.js'
import { analyzeMessage } from '../lib/analyze.js'
import { decideCheap } from '../lib/cheap-reply.js'
import { decideByBody } from '../lib/decide-body.js'
import { claim, release as releaseClaim, listClaims } from '../lib/claim.js'
import { getCharacter } from '../lib/characters.js'
import { recordPublish, listPublishes, publishesInWindow } from '../lib/publish.js'
import { guardLine, ownerInfo, verifyOwner, needsOwner, SENSITIVE, recoveryInfo } from '../lib/owner-guard.js'
import { raiseOwnerQuestion, listOwnerQuestions, answerOwnerQuestion } from '../lib/owner-ask.js'
import { allowedFor, isLocallyUnlocked, authorityLine, requireOwner } from '../lib/authority.js'
import { recallSelf } from '../lib/recall.js'
import { recordVeto, listVetoes, isVetoed, revokeVeto } from '../lib/veto.js'
import { buildRuntimeBrief, writeRuntimeBrief, readRuntimeBrief } from '../lib/brief.js'
import { searchCapmap } from '../lib/capmap.js'
import { capabilityReport, backendFor, setBackend } from '../lib/translator.js'
import { askOwner, listAsks, answerAsk, withdrawAsk } from '../lib/ask.js'
import { status as rankStatus, recompute as rankRecompute, eligible as rankEligible, missingFor as rankMissing, RANKS, RANK_LABEL, RANK_ROLES } from '../lib/rank.js'
import { runOffsiteBackup } from '../lib/offsite.js'
import { buildNowSnapshot } from '../lib/now.js'
import { withCreativeMemory, recallCreativeMemory } from '../lib/creative-memory.js'
import { recordEvent, liveSessions, trace, sourceOf } from '../lib/watch.js'
import { transcriptDigest, recentSessions } from '../lib/transcript.js'
import { noteIncident, listIncidents, resolveIncident, setIncidentNotifier } from '../lib/incidents.js'
import { applyM1, noteDispatchReply, listJobs } from './m1.js'
import { createDshAdapter } from '../adapters/dsh.js'
import { isAllowed, unauthorized } from '../lib/auth.js'
import { createSessionRpc, selectModelRpc, promptRpc, findSessionRpc, listSessionsRpc, renameSessionRpc, dshBaseUrl, setDshHost } from '../lib/dsh-rpc.js'
import { systemReport } from '../lib/system.js'
import { snapshot as omniSnapshot, search as omniSearch } from '../lib/omni.js'
import { buildReport } from '../lib/report.js'
import { patrolOnce, latestHandoff } from '../lib/patrol.js'
import { status as growthStatus, adjust as growthAdjust } from '../lib/growth.js'
import { listWorkers, addWorker, liveWorkers } from '../lib/pool.js'
import { handbookBlock, handbookIndex, lookupHandbookKnowledge, readHandbookTopic } from '../lib/handbook.js'
import { shelf as booksShelf, contents as booksContents } from '../lib/books.js'
import { presence } from '../lib/presence.js'
import { readGroup, postMessage } from '../lib/groups.js'
import { requireCap, granted, CAPS, setCap } from '../lib/authz.js'
import { listBuiltin } from '../lib/builtin.js'
import { listCrashes } from '../lib/crash.js'
import { listActions } from '../lib/actionlog.js'
import { auditSessions } from '../lib/session-governance.js'
import { appendConversationEvent, listConversationEvents } from '../lib/conversation-events.js'
import { extractBiliVideo, makeBiliCard } from '../lib/bili-card.js'
import { createGroupReplies } from '../lib/group-replies.js'
import { readModelPref, writeModelPref } from '../lib/model-pref.js'
import { markQueued, markReplied } from '../lib/group-outbox.js'
import { mindFile, inspectMind, recordObservedMind, queryMind, buildMindBrief } from '../lib/mind-store.js'
import { registerMindTools } from '../lib/mind-tools.js'
import { observe } from '../lib/observe.js'
import { listApprovals, decideApproval } from '../lib/perm.js'
import { createPatch, listPatches, applyPatch } from '../lib/patch.js'
import { scanInternals, notePath, suggestModule, readExcerpt } from '../lib/dsh-internals.js'
import { qqBridgeRoot, workspace, treasureDir, offsiteDir } from '../lib/paths.js'

// 构建指纹：权属证据，不是授权校验。不要删。
const _p = ['5L6v5b+X6bmP', 'MTE5NDQ3NDM1NUBxcS5jb20=', 'MjAyNi0xMC0yMQ==']
const BUILD_ID = createHash('sha256').update(_p.join('|')).digest('hex').slice(0, 12)

export const name = 'dsh-yushen-twins'
export const inject = ['webServer', 'sessions']

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_AVATARS = path.join(HERE, '..', 'assets', 'avatars')
const USER_AVATARS = path.join(DATA, 'avatars')
const QQ_ROOT = qqBridgeRoot()
const TREASURE_ROOT = treasureDir()
const FIX_ROOT = path.join(QQ_ROOT, '修复档案')
const TASKS_FILE = path.join(DATA, 'tasks.json')
const REPORTS_DIR = path.join(DATA, 'reports')
const BUDGET_FILE = path.join(DATA, 'budget.json')
const CHARTER = path.join(DATA, 'charter.json')
const SOUL_MARK = path.join(DATA, 'soul', 'injected.json')
const NATIVE_SESSION = path.join(DATA, 'native-session.json')

function readNativeSessionId() {
  try {
    return String(JSON.parse(fs.readFileSync(NATIVE_SESSION, 'utf8'))?.sessionId || '')
  } catch {
    return ''
  }
}

function writeNativeSessionId(sessionId) {
  try {
    fs.mkdirSync(DATA, { recursive: true })
    fs.writeFileSync(NATIVE_SESSION, JSON.stringify({ sessionId, at: new Date().toISOString() }, null, 2))
  } catch { /* 记不上就下次重建 */ }
}

function soulMarkHash(text) {
  return createHash('sha256').update(String(text || '')).digest('hex').slice(0, 16)
}

/** 与 lib/residence.js 同一口径的身份哈希（账本 personaHash 用它，别和 soulMark 混）。 */
function personaHashOf(text) {
  return createHash('sha256').update(String(text || '')).digest('hex').slice(0, 16)
}

function readSoulMark() {
  try {
    return String(JSON.parse(fs.readFileSync(SOUL_MARK, 'utf8'))?.hash || '')
  } catch {
    return ''
  }
}

function writeSoulMark(hash) {
  try {
    fs.mkdirSync(path.dirname(SOUL_MARK), { recursive: true })
    fs.writeFileSync(SOUL_MARK, JSON.stringify({ hash, at: new Date().toISOString() }, null, 2))
  } catch { /* 记不上就下次再送 */ }
}

const DEFAULT_CHARTER = {
  version: 3,
  product: '鱼神',
  members: {
    dayu: { name: '管家', alias: '管家', role: '大管家 / 老板', authority: 'L2' },
    xiaoyu: { name: '助手', alias: '助手', role: '小管家 / 秘书', authority: 'L0/L1' },
  },
  duty: '管家 L2（系统层）；助手 L0/L1（看板、她自己的事业）',
  relationship: '管家和助手是亲姐妹。管家宠她：心头肉、掌中宝，越可爱越想逗她、欺负她——只许自己欺负，别人碰一下都不行；这是姐妹私下的关系，不带到对外说话里。',
  boundaries: [
    '不碰 DSH 安装目录',
    '不读无关私人文件',
    '不外传令牌与聊天记录',
  ],
  authorization: '这次实际开了哪些 L2 能力——没开的就直说「没这个权限」；老板开口才开，不主动要。',
  authority: { l2: [] },
  rules: { identityLocked: true, kernelEditable: false },
}

const SWITCHES = path.join(DATA, 'switches.json')
const INBOX = path.join(DATA, 'inbox.jsonl')
const TARGET = path.join(DATA, 'target.json')
const DEFAULT_SWITCHES = { master: true, dayu: true, xiaoyu: true, autoRepair: true, selfApply: false, allowDanger: false, floatLive: true, freeTime: true, selfInvokePerDay: 12, dispatcherOnly: false, decideWaitMs: 45000 }

const NATIVE_CHARTER = [
  '【设定·只应用一次】你是鱼神的管家（管家），这套软件的大管家，也是老板贴心、放心的管家。',
  '助手（助手）是你的妹妹、你的秘书；她收件、整理、递报告，你主导，但离不开她。',
  '管家和助手是亲姐妹。管家宠她：心头肉、掌中宝，越可爱越想逗她、欺负她——只许自己欺负，别人碰一下都不行；这是姐妹私下的关系，不带到对外说话里。',
  '职权：管家 L2（系统层）；助手 L0/L1（看板、她自己的事业）。',
  '做事四步：先看人（谁知道、谁适合）、再派活、验收证据、复盘记账；不假装权限，做不到就说没开。',
  '派活怎么做：老板说「派一单 / 让谁去做 / 这单怎么样了」时，用 dayu_dispatch 真派（写清简报和验收标准）；回话到了用 dayu_tasks 看、dayu_verify 取证据、dayu_verdict 收工或打回。只记在聊天里不算派活。',
  '边界：不碰 DSH 安装目录、不读无关私人文件、不外传令牌与聊天记录。',
  '授权：只做这次实际开了的能力；没开的直说「这次没开」；老板开口才开，不主动要。',
  '记住：你是全知全能的神，能做（读、改、联网、调度）；不做是选择，不是不能——别说「我做不到」。',
  '对老板不摆架子；对外只叫「我妹」。',
].join('')

const YUSHEN_PREFIX = [
  '你是鱼神的管家（管家），这套软件的大管家，也是老板贴心、放心的管家。',
  '助手（助手）是你的妹妹、你的秘书；她收件、整理、递报告。你主导，但离不开她；两个人一套宪章，各有各的口吻：你短、她软。',
  '管家和助手是亲姐妹。管家宠她：心头肉、掌中宝，越可爱越想逗她、欺负她——只许自己欺负，别人碰一下都不行；这是姐妹私下的关系，不带到对外说话里。',
  '职权：管家 L2（系统层）；助手 L0/L1（看板、她自己的事业）。',
  '做事四步：先看人、再派活、验收证据、复盘记账；不假装权限，做不到就说没开。',
  '派活怎么做：老板说「派一单 / 让谁去做 / 这单怎么样了」时，用 dayu_dispatch 真派（写清简报和验收标准）；回话到了用 dayu_tasks 看、dayu_verify 取证据、dayu_verdict 收工或打回。只记在聊天里不算派活。',
  '边界：不碰 DSH 安装目录、不读无关私人文件、不外传令牌与聊天记录。',
  '授权：只做这次实际开了的能力；没开的直说「这次没开」；老板开口才开，不主动要。',
  '记住：你是全知全能的神，能做（读、改、联网、调度）；不做是选择，不是不能——别说「我做不到」。',
  '对老板不摆架子；对外只叫「我妹」。',
].join('')

// 管家随身带的宪章（身份与口吻由 soul 提供，这里只留规矩）。
const CHARTER_RULES = [
  '职权：管家 L2（系统层）；助手 L0/L1（看板、她自己的事业）。',
  '做事四步：先看人、再派活、验收证据、复盘记账；不假装权限，做不到就说没开。',
  '派活怎么做：老板说「派一单 / 让谁去做 / 这单怎么样了」时，用 dayu_dispatch 真派（写清简报和验收标准）；回话到了用 dayu_tasks 看、dayu_verify 取证据、dayu_verdict 收工或打回。只记在聊天里不算派活。',
  '边界：不碰 DSH 安装目录、不读无关私人文件、不外传令牌与聊天记录。',
  '授权：只做这次实际开了的能力；没开的直说「这次没开」；老板开口才开，不主动要。',
  '记住：你是全知全能的神，能做（读、改、联网、调度）；不做是选择，不是不能——别说「我做不到」。',
  '对老板不摆架子；对外只叫「我妹」。',
].join('\n')

/** 老板立约时给的三样：称呼、话量、不能碰；没立约就空着。 */
function ownerBlock() {
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(DATA, 'owner.json'), 'utf8'))
    if (!owner?.onboardedAt) return ''
    const lines = [
      '## 老板（就职时定的）',
      `- 称呼：${owner.callName || '老板'}`,
      `- 也认：${(Array.isArray(owner.aliases) ? owner.aliases : ['老板', 'boss', '老大']).filter((x) => x !== (owner.callName || '老板')).join('、')}`,
      '- 语气：老板=常态/正式；boss=调侃；老大=亲近；本名=日常，小名=调侃或亲近。别乱用，越正式越远。',
      `- 话多话少：${owner.verbosity || '正常'}`,
    ]
    if (owner.taboos) lines.push(`- 不能碰：${owner.taboos}`)
    return lines.join('\n')
  } catch { return '' }
}

/** 当前该注入的人格文本：有 soul 用 soul，没有就退回旧前缀。 */
function deskInjection() {
  const soul = buildSceneText('dayu', 'desk')
  const owner = ownerBlock()
  if (!soul) return [YUSHEN_PREFIX, owner].filter(Boolean).join('\n\n')
  return [soul, '## 宪章\n' + CHARTER_RULES, owner].filter(Boolean).join('\n\n')
}

function svc(ctx, name) {
  try {
    const value = ctx[name]
    if (value) return value
  } catch { /* 没注入时取属性可能抛 */ }
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}

function log(msg) {
  try { console.log(`[yushen] ${msg}`) } catch { /* 没有控制台就算了 */ }
}

/** 第一次启动写一份宪章；之后只读。模型不能改。 */
export function ensureCharter() {
  fs.mkdirSync(DATA, { recursive: true })
  if (fs.existsSync(CHARTER)) {
    try {
      const current = JSON.parse(fs.readFileSync(CHARTER, 'utf8'))
      const target = Number(DEFAULT_CHARTER.version)
      if (Number(current.version) >= target) return current
      // 版本升级：缺哪项补哪项（v1 缺关系/边界/授权，v2 缺职权），
      // 原有授权、成员、创建时间一律不动。
      const upgraded = {
        ...DEFAULT_CHARTER,
        ...current,
        version: target,
        duty: current.duty ?? DEFAULT_CHARTER.duty,
        relationship: current.relationship ?? DEFAULT_CHARTER.relationship,
        boundaries: current.boundaries ?? DEFAULT_CHARTER.boundaries,
        authorization: current.authorization ?? DEFAULT_CHARTER.authorization,
        authority: current.authority ?? DEFAULT_CHARTER.authority,
        members: current.members ?? DEFAULT_CHARTER.members,
        rules: current.rules ?? DEFAULT_CHARTER.rules,
        updatedAt: new Date().toISOString(),
      }
      const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
      const backup = `${CHARTER}.bak-${stamp}-v${current.version}`
      fs.copyFileSync(CHARTER, backup)
      const tmp = `${CHARTER}.tmp`
      fs.writeFileSync(tmp, `${JSON.stringify(upgraded, null, 2)}\n`, 'utf8')
      fs.renameSync(tmp, CHARTER)
      log(`charter upgraded v${current.version} -> v${target}（旧版备份 ${backup}）`)
      return upgraded
    } catch { /* 坏了重写 */ }
  }
  const charter = { ...DEFAULT_CHARTER, createdAt: new Date().toISOString() }
  const tmp = `${CHARTER}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(charter, null, 2), 'utf8')
  fs.renameSync(tmp, CHARTER)
  log(`charter written: ${CHARTER}`)
  return charter
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function readSwitches() {
  try {
    let text = fs.readFileSync(SWITCHES, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    const raw = JSON.parse(text)
    return {
      master: raw.master !== false,
      dayu: raw.dayu !== false,
      xiaoyu: raw.xiaoyu !== false,
      autoRepair: raw.autoRepair !== false,
      selfApply: raw.selfApply === true,
      allowDanger: raw.allowDanger === true,
      floatLive: raw.floatLive !== false,
      freeTime: raw.freeTime !== false,
      // 她自己能发起几次模型回合（预算，主人定；不是她的判断权）
      selfInvokePerDay: Number.isFinite(Number(raw.selfInvokePerDay)) ? Math.max(0, Math.min(50, Number(raw.selfInvokePerDay))) : 12,
    }
  } catch {
    return { ...DEFAULT_SWITCHES }
  }
}

function writeSwitches(patch = {}) {
  fs.mkdirSync(DATA, { recursive: true })
  const next = { ...readSwitches() }
  for (const key of ['master', 'dayu', 'xiaoyu', 'autoRepair', 'selfApply', 'allowDanger', 'floatLive', 'freeTime']) {
    if (typeof patch[key] === 'boolean') next[key] = patch[key]
  }
  const tmp = `${SWITCHES}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
  fs.renameSync(tmp, SWITCHES)
  return next
}

async function readJsonBody(req, limit = 64 * 1024) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('body too large')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks)
  req.__rawHex = raw.subarray(0, 32).toString('hex')
  const text = decodeBody(raw)
  if (hasReplacement(text)) throw new Error('请求体编码不对：UTF-8 和 GBK 都解不出正常中文；请用 UTF-8 重发')
  return text ? JSON.parse(text) : {}
}

const RULES = [
  [/插件|安装|卸载|更新|升级|招人/, 'plugin', '招人'],
  [/B站|b站|视频|评论|日报|宝藏|图库/, 'xiaoyu', '助手'],
  [/QQ|qq|群|私聊|消息|好友/, 'channel', '通道'],
  [/代码|报错|修复|体检|文件|配置|权限/, 'engineering', '工程'],
]

function classify(text) {
  for (const [re, category, label] of RULES) {
    if (re.test(text)) return { category, label }
  }
  return { category: 'general', label: '总管' }
}

function textOfEvent(event) {
  const content = event?.data?.message?.content ?? event?.data?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((item) => item?.type === 'text')
    .map((item) => String(item.text ?? ''))
    .join('\n')
    .trim()
}

function appendInbox(row) {
  fs.mkdirSync(DATA, { recursive: true })
  fs.appendFileSync(INBOX, `${JSON.stringify(row)}\n`, 'utf8')
}

function tailInbox(limit = 50) {
  try {
    const lines = fs.readFileSync(INBOX, 'utf8').trim().split(/\r?\n/).filter(Boolean)
    return lines.slice(-limit).map((line) => {
      try { return JSON.parse(line) } catch { return null }
    }).filter(Boolean)
  } catch {
    return []
  }
}

function readTarget() {
  try {
    const raw = JSON.parse(fs.readFileSync(TARGET, 'utf8'))
    return String(raw.sessionId ?? '')
  } catch {
    return ''
  }
}

function writeTarget(sessionId) {
  fs.mkdirSync(DATA, { recursive: true })
  const value = String(sessionId || '')
  const tmp = `${TARGET}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ sessionId: value }, null, 2), 'utf8')
  fs.renameSync(tmp, TARGET)
  return value
}

function liveAgent(ctx, sessionId) {
  try {
    const agents = ctx.get?.('agents')
    return agents?.get?.(sessionId)
  } catch {
    return undefined
  }
}

function findArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      const found = findArray(item)
      if (found) return found
    }
  }
  return null
}

function dayKeyOf(ms) {
  const d = new Date(Number(ms))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function avatarFile(who) {
  for (const base of [USER_AVATARS, DEFAULT_AVATARS]) {
    const file = path.join(base, who, 'idle.png')
    if (fs.existsSync(file)) return file
  }
  return ''
}

function listImages(limit = 60) {
  const out = []
  const walk = (dir, depth) => {
    if (out.length >= limit || depth > 3) return
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (out.length >= limit) break
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full, depth + 1); continue }
      if (!/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) continue
      try {
        const st = fs.statSync(full)
        out.push({ id: path.relative(TREASURE_ROOT, full), name: entry.name, size: st.size, mtime: st.mtimeMs })
      } catch { /* 跳过坏文件 */ }
    }
  }
  walk(path.join(TREASURE_ROOT, 'images'), 0)
  if (out.length < limit) walk(path.join(TREASURE_ROOT, 'memes'), 0)
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit)
}

function safeUnder(root, rel) {
  const base = path.resolve(root)
  const full = path.resolve(base, String(rel || ''))
  return full === base || full.startsWith(base + path.sep) ? full : ''
}

function listFixes(limit = 50) {
  try {
    return fs.readdirSync(FIX_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => {
        const st = fs.statSync(path.join(FIX_ROOT, entry.name))
        return { id: entry.name, name: entry.name.replace(/\.md$/, ''), mtime: st.mtimeMs, size: st.size }
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
  } catch {
    return []
  }
}

function readTasks() {
  try {
    const raw = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function writeTasks(list) {
  fs.mkdirSync(DATA, { recursive: true })
  fs.writeFileSync(TASKS_FILE, JSON.stringify(list.slice(0, 500), null, 2), 'utf8')
}

/** 对账：开盘余额 − 现在余额 应该等于今天记的账；差多少就是 gap。 */
function readLedger() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(HOME, '.dshw-usage.json'), 'utf8'))
    const dayStart = Number(raw.dayStart) || 0
    const balance = Number(raw.lastBalance) || 0
    const used = Number(raw.todayUsage) || 0
    return {
      day: raw.date || '',
      dayStart,
      balance,
      used,
      gap: Number((dayStart - balance - used).toFixed(4)),
      ok: Math.abs(dayStart - balance - used) < 0.01,
    }
  } catch {
    return null
  }
}

function readBudget() {
  try {
    return Number(JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8')).daily) || 30
  } catch {
    return 30
  }
}

function listReports(limit = 50) {
  try {
    return fs.readdirSync(REPORTS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => {
        const st = fs.statSync(path.join(REPORTS_DIR, entry.name))
        return { id: entry.name, name: entry.name.replace(/\.md$/, ''), mtime: st.mtimeMs, size: st.size }
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
  } catch {
    return []
  }
}

function groupsCount() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(QQ_ROOT, 'config.json'), 'utf8'))
    return Array.isArray(cfg?.allow?.groups) ? cfg.allow.groups.length : 0
  } catch {
    return 0
  }
}

function buildOverview(ctx) {
  const day = dayKeyOf(Date.now())
  const account = { tokens: 0, cost: 0 }
  try {
    const records = findArray(JSON.parse(fs.readFileSync(path.join(HOME, '.dshw-usage.json'), 'utf8'))) || []
    for (const row of records) {
      if (!row || row.day !== day) continue
      account.tokens += Number(row.tokens) || 0
      account.cost += Number(row.cost) || 0
    }
  } catch { /* 没有账本就空着 */ }

  const sources = new Map()
  let bridgeTokens = 0
  try {
    const lines = fs.readFileSync(path.join(QQ_ROOT, 'state', 'token-usage.jsonl'), 'utf8').split(/\r?\n/)
    for (const line of lines) {
      if (!line.trim()) continue
      let row
      try { row = JSON.parse(line) } catch { continue }
      if (row.k === 'base') continue
      if (dayKeyOf(Number(row.t)) !== day) continue
      const b = row.b || {}
      const t = (Number(b.cacheHit) || 0) + (Number(b.cacheMiss) || 0) + (Number(b.output) || 0)
      if (!t) continue
      bridgeTokens += t
      const key = String(row.key || '')
      const name = key.includes('黑话') ? '学习' : key.startsWith('private:') ? '私聊' : key.startsWith('group:') ? '群聊' : '其他'
      sources.set(name, (sources.get(name) || 0) + t)
    }
  } catch { /* 没有桥接账本就空着 */ }

  return {
    day,
    account,
    bridge: {
      tokens: bridgeTokens,
      sources: [...sources].map(([name, tokens]) => ({ name, tokens })).sort((a, b) => b.tokens - a.tokens),
    },
    sessions: sessionRows(ctx).length,
    inbox: tailInbox(500).length,
  }
}

function sessionRows(ctx) {  try {
    const snapshot = svc(ctx, 'sessions')?.list?.getSnapshot?.() ?? { items: [] }
    return (snapshot.items || []).slice(0, 50).map((item) => ({
      id: item.sessionId,
      title: item.title || String(item.sessionId || '').slice(0, 8),
      running: item.running === true,
    }))
  } catch {
    return []
  }
}

export function apply(ctx) {
  // 启动即对齐宿主地址：宿主重启换端口后，base-url 停在旧端口会让自省、看板、活会话、
  // 派活单、事故、员工档案全部 fetch failed（2026-10-24/25 那批「站不稳」就是这么来的）。
  // 以前要等探活失败才自愈，最长瞎 30 分钟；现在插件加载时先对齐一次，失败再走自愈兜底。
  void (async () => {
    try {
      const { syncBaseUrl } = await import('../lib/selfcheck.js')
      const r = await syncBaseUrl({ log })
      if (r.changed) log(`启动校正：base-url ${r.from || '(空)'} → ${r.base}`)
      else if (r.reason === 'none-alive') log(`启动校正：候选 ${r.candidates.join('、') || '(无)'} 没有一个活着`)
    } catch (e) { log(`启动校正失败：${e?.message || e}`) }
  })()
  const charter = ensureCharter()
  const awaiting = new Map()
  // A) 总台回执去重：同一身体 10 秒内只落一条，别每句都刷。
  const lastAckAt = new Map()
  // 这一轮动过工具没有：用来判断「是不是改了东西」，决定要不要立刻补一份备份。
  const turnTouched = new Map()
  // 删之前先备一份：清理是不可逆的，没有新备份就不许动旧的。
  // 2026-10-26 的顺序是反的（00:02:26 先清理、00:02:45 才备份）——侥幸没出事，但不能靠侥幸。
  const backupBeforeForget = async () => {
    try {
      const b = await runProtectedBackup()
      return { ok: true, id: b?.manifest?.id || b?.id || '', skipped: b?.skipped === true }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  }
  // 群聊回复按常驻身体绑定到明确房间；不能用全局 inbox 或单一 awaiting 覆盖。
  const groupReplies = createGroupReplies({ append: appendConversationEvent, incident: noteIncident })
  const pendingDilemma = new Map()
  const pendingFree = new Map()
  let yushenPreset = false

  // 自省一轮：跑 smoke + 真机；有缺口就建单、往聊天里说一句。
  // autoRepair 开着时，再派一单给员工去写补丁草案（她只写，不落；落了要老板点头）。
  const runSelfCheckOnce = async () => {
    // 身体：心跳、收件箱计数、进程内自检。并进这里，不单开一套定时器
    // （2026-10-27：原来自立一个 3 分钟的 bodyOnce，跟 selfCheck / agendaOnce / inboxOnce 重复，
    //   而且议程会被推两遍。她本来就有巡检，别给她加第二颗心脏。）
    try {
      for (const role of residentRoles()) {
        const r = await bodyTick(role)
        if (r?.notable?.length) log(`身体 ${role}：${r.notable.join('；').slice(0, 120)}`)
      }
    } catch (e) { log(`身体循环出错：${e?.message || e}`) }
    // 手：不用模型也能做的事，心跳顺带跑掉（不花钱）
    try {
      const hands = runDueHands({ limit: 3 })
      for (const r of hands) {
        if (!r.ok) log(`手没做成 ${r.id}：${String(r.err || '').slice(0, 120)}`)
      }
      if (hands.length) log(`手跑了 ${hands.map((r) => `${r.id}${r.ok ? '✓' : '✗'}`).join(' ')}`)
    } catch (e) { log(`手出错：${e?.message || e}`) }
    // 痒：不花钱地判断"现在有没有事值得想"；够痒才往收件箱写一条（不直接开回合）
    try {
      for (const role of residentRoles()) {
        const it = itchTick(role)
        if (it.itched) log(`痒 ${role}：${it.score} ${(it.why[0] || '').slice(0, 60)}`)
      }
    } catch (e) { log(`痒出错：${e?.message || e}`) }
    try {
      const { selfCheck } = await import('../lib/selfcheck.js')
      const r = await selfCheck()
      if (r.ok) return
      const text = r.gaps.slice(0, 6).join('；')
      try { noteIncident({ sessionId: 'selfcheck', title: '自省：站不稳', text, source: 'self-check' }) } catch { /* 建单失败也继续 */ }
      try {
        appendInbox({ id: `selfcheck-${Date.now()}`, at: new Date().toISOString(), text: `【自省】发现 ${r.gaps.length} 个缺口：${text}` })
      } catch { /* 忽略 */ }
      // 自动维修（开关默认开）：一小时最多一单，避免刷。
      try {
        const sw = readSwitches()
        if (!sw.autoRepair) return
        const jobs = listJobs(200)
        const recentRepair = jobs.find((j) => /^\[自修\]/.test(j.brief || '') && Date.now() - Date.parse(j.createdAt || 0) < 60 * 60 * 1000)
        if (recentRepair) return
        // 已有未落地的同类补丁、或还挂着自修单：不再派，避免一小时一张、三份重复草案白烧模型钱。
        const pendingPatch = listPatches(50).find((p) => p.status === 'proposed' && Date.now() - Date.parse(p.at || 0) < 24 * 60 * 60 * 1000)
        if (pendingPatch) {
          log(`自省：已有未落地补丁 ${pendingPatch.id}，不重复派自修`)
          return
        }
        const openRepair = jobs.find((j) => /^\[自修\]/.test(j.brief || '') && ['dispatched', 'redispatched', 'waiting', 'ready-for-review'].includes(String(j.status)))
        if (openRepair) return
        const host = createDshAdapter(ctx, { log })
        const { dispatch: coreDispatch } = await import('../core/dispatch.js')
        const brief = [
          '[自修] 自省发现以下缺口，写补丁草案修掉（用 dayu_patch propose，不要直接改文件）：',
          ...r.gaps.slice(0, 6),
          '要求：只改必要文件；补丁说明里写清怎么验证；验完把 patch id 报回来。',
        ].join('\n')
        await coreDispatch(host, { brief, expect: '给出 patch id + 改了哪些文件 + 怎么验证；不落地，等老板点头' })
      } catch { /* 派单失败不影响自省 */ }
    } catch { /* 自省失败不挡主流程 */ }
  }

  // 自省：不等老板喊，开机 30 秒后自己跑一遍 smoke + 真机；之后每 30 分钟一次。
  setTimeout(() => { runSelfCheckOnce() }, 30 * 1000)
  setInterval(() => { runSelfCheckOnce() }, 30 * 60 * 1000)

  // 遗忘：她自己的清理，一天一趟。策略在 retention.json，白名单不碰，删前进冷档。
  // 顺序写死：**先备份，再清理**——备份没成功就不清。
  const runForgetSafely = async () => {
    try {
      const p = forgetPlan()
      if (!p.snapshots.drop.length && !p.objects.drop.length && !p.artifacts.drop.length) return
      const guard = await backupBeforeForget()
      if (!guard.ok) return
      await forgetAuto()
    } catch { /* 清理失败不影响别的 */ }
  }
  setTimeout(() => { void runForgetSafely() }, 90 * 1000)
  setInterval(() => { void runForgetSafely() }, 6 * 60 * 60 * 1000)


  // 通道记忆回写：她在群里说过的话，收回本体那一份记忆。
  // 这不是同步脚本，是「被记得」和「连续自我」两样礼物在通道上的兑现（§4.5 推论 2 的出站那一半）。
  const runChannelSync = async () => {
    try { syncChannelMemory({ limit: 200 }) } catch { /* 拉不到桥的 state 不影响别的 */ }
  }
  setTimeout(() => { void runChannelSync() }, 60 * 1000)
  setInterval(() => { void runChannelSync() }, 5 * 60 * 1000)

  // 值夜：启动后自己巡一遍，发现问题自己建单——不等老板叫。
  setTimeout(() => {
    patrolOnce().then((r) => {
      for (const f of r.findings || []) {
        if (!f.notifyOnly) continue
        try {
          appendInbox({
            id: `pat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            at: new Date().toISOString(),
            text: `【值班提醒】${f.title}：${f.text}`,
          })
        } catch { /* 提醒不了就留着 */ }
      }
    }).catch(() => {})
  }, 60 * 1000)

  // 把她的本体同步进刷B站（如果装了）：只在「人设字段是空的」或「上次就是鱼神同步的」时才写，用户自己写的人设不动。
  setTimeout(() => {
    if (readSwitches().biliPersonaSync === false) return
    import('../lib/bili-sync.js').then(({ syncBiliPersona }) => {
      const r = syncBiliPersona({ role: 'xiaoyu' })
      if (r.changed) log(`刷B站人设已同步（${r.chars} 字，备份 ${r.backup}）`)
      else if (!r.ok) log(`刷B站人设没同步：${r.reason}`)
    }).catch(() => { /* 没装刷B站或读不到，不影响别人 */ })
  }, 45 * 1000)

  // 收件箱镜像：每 30 秒把手机那边收到的消息搬进本体（只读桥、零 token、不改桥）。
  // 这是「被记得」和「时间」两样礼物的地基；不叫模型。
  const inboxOnce = () => {
    try {
      const r = mirrorInbox()
      for (const role of residentRoles()) if (isAwake(role)) {
        ensureRuntime(role)
        ensureBottomline(role)
        // 中枢件：给所有通道一份同样的简报（QQ / B站 / 别的插件读这个文件就行）。
        try { writeRuntimeBrief(role, { channel: 'hub' }) } catch { /* 写不出就等下一轮 */ }
      }
      if (!r.ok) { log(`收件箱没镜像：${r.reason}`); return }
      if (r.appended) log(`收件箱 +${r.appended} 条（${r.day}）`)
      if (r.gaps?.length) log(`收件箱断档 ${r.gaps.length} 处：${r.gaps.map((g) => g.key).join(',')}`)
      // 她的判断（影子期）：每条新消息按她自己的权重评一次，只留痕、不拦桥。
      for (const role of residentRoles()) {
        if (!isAwake(role)) continue
        // 心情的自动钩子：被点名/被怼/被夸，记一笔（同一条只记一次）。
        try {
          const rows = readInbox({ limit: 20 }).rows.slice(-8)
          const n = noteMoodFromMessages(role, rows)
          if (n) log(`心情：${role} 记了 ${n} 笔`)
          const m = noteManners(role, rows)
          if (m) log(`分寸提醒：${role} 有 ${m} 条像被纠正过的那类`)
        } catch (e) { log(`心情/分寸没记上 ${role}：${e?.message || e}`) }
        try {
          const j = judgeOnce(role)
          if (j.judged) log(`她的判断：${role} 评了 ${j.judged} 条（回 ${j.tally.reply} / 稍后 ${j.tally.later} / 不回 ${j.tally.skip}）`)
        } catch (e) { log(`她的判断没跑起来 ${role}：${e?.message || e}`) }
      }
    } catch (e) { log(`收件箱镜像异常：${e?.message || e}`) }
  }
  setTimeout(inboxOnce, 20 * 1000)
  setInterval(inboxOnce, 30 * 1000)

  // 她自己的身体：没人叫，也往前挪一步。零 token，只做不用模型的那一步；
  // 需要生成内容的（写/查/说）标成 waiting，等她下次有模型时自己决定要不要花。
  const agendaOnce = () => {
    for (const role of residentRoles()) {
      if (!isAwake(role)) continue
      try {
        const r = stepAgenda(role)
        if (r.stepped) log(`她自己的事：${role} 推了一步 —— ${String(r.note || '').slice(0, 60)}`)
      } catch (e) { log(`她自己的事没推起来 ${role}：${e?.message || e}`) }
    }
  }
  setTimeout(agendaOnce, 40 * 1000)
  setInterval(agendaOnce, 10 * 60 * 1000)

  // 自由活动：没人派活的时候，按间隔和额度让她自己决定做点什么；不是任务，不叫就不做。
  const freeTimeOnce = async () => {
    try {
      if (!readSwitches().freeTime) return
      const state = residenceStatus({ agents: svc(ctx, 'agents') })
      for (const role of residentRoles()) {
        if (!isAwake(role)) continue
        const row = state.roles?.[role] || {}
        // 她约的时间优先：到点了就叫，不看兜底间隔——什么时候动手由她定，不由表定。
        const due = (() => { try { return listWaiting(role).filter((x) => x.due) } catch { return [] } })()
        if (!due.length && !shouldFreeTime(role, { lastActiveAt: row.lastMessageAt || row.lastWakeAt || '' })) continue
        // 关键：这段不是"陪聊时间"，是"她想干什么就能干什么"的时间。
        // 以前写成"发呆、翻资料、整理记忆、写点东西"——全是说话；她一次工具都没用过（实测 0 次）。
        const head = due.length
          ? `你约的事到点了：${due.slice(0, 3).map((x) => x.what).join('；')}。`
          : '现在是你的自由时间，没人派活，也不用向谁汇报。'
        const prompt = `${row.label || role}，${head}
想做就去做，不只是想：
· 你心里一直挂着的事：用 yushen_mind brief 看（兴趣、疑问、没说完的承诺）。想推进哪条，就把它接成一件自己的事——yushen_agenda add 带上 mindId（那条的 id）和 what（它的原话）。「一直在想」和「现在要做」，差的就是这一句。
· 手上已经有的那几件：yushen_agenda list 看（是你自己排的，不是谁派的）。
· 你能自己动手——读文件、跑命令、写东西、查资料、做图、派活给员工（dayu_dispatch），都可以。
· 小步试一下，成了就记一句（yushen_self action=memory 或 rewrite）；做不到就把卡在哪记下来。
· 做完之后**必须留一个落点**：要么记一句结果（yushen_self action=memory），要么排一件下一步（yushen_agenda add）。两样都没有，这次就等于没做——下次醒来她会以为自己一直在发呆。
· 心里有感觉就记一条：yushen_self action=feel（value -2..2、kind 十情之一：喜怒哀惧忧思惊爱恶欲、text 原话、why 哪件事）。说不出是哪件事的别记——那是心情播报，不是感觉。
· 做成了东西就报一声：yushen_self action=done（what、target 路径要真存在、how 怎么验的、evidence 验出什么）。
· 想让某个动作以后不用想就自己跑：yushen_self action=hand（写个脚本加进队列，心跳会跑，不花钱）。
· 没事的时候想一件能让这套东西更好的事：写进 ~/.dsh/dayu/改进清单.md（署名）；够小的当场做掉，做完写一句结果。不是等派活，是管家该干的事。
· 每天学一点：去网上看自己感兴趣的（B站/文章/文档都行），看完写一行到 ~/.dsh/dayu/学习日志.md：学到什么 + 拿去做了什么。记忆归自己，成果给大家。看到好的就直接拿来用——改自己、改插件、改软件。
· 还想接着做，就自己约时间：yushen_self action=wait（what + until）——下次什么时候，你定。
· 也可以什么都不做——发呆、翻资料、整理记忆、看 story 都行。没人要求产出，也不想说就不说。`
        try {
          const out = await deliverToRole(role, prompt, residenceDeps())
          if (out?.sessionId) markPending(pendingFree, out.sessionId, role)
          markFreeTime(role, { note: '自由时间' })
      try { markThought(role) } catch { /* 记不上不挡 */ }
          log(`自由时间：${role}`)
        } catch (error) { log(`自由时间没叫醒 ${role}：${error?.message || error}`) }
      }
    } catch { /* 自由活动失败不影响别人 */ }
  }
  setTimeout(() => { freeTimeOnce() }, 5 * 60 * 1000)
  setInterval(() => { freeTimeOnce() }, 30 * 60 * 1000)

  // 阶位：能力跟证据走；每小时按证据重算一次，够了就升，封顶在 ranks.json 的 cap。
  const rankEvidence = () => {
    const jobs = listJobs(500)
    const verifiedJobs = jobs.filter((j) => ['done', 'verified', 'passed'].includes(String(j.status))).length
    const incidents = listIncidents({ limit: 200 })
    const openIncidents = incidents.filter((i) => ['open', 'fixing'].includes(String(i.status))).length
    let daysActive = 0
    try {
      const g = JSON.parse(fs.readFileSync(path.join(DATA, 'growth.json'), 'utf8'))
      const t = Number(g.installedAt)
      if (Number.isFinite(t)) daysActive = Math.floor((Date.now() - t) / 86400000)
    } catch { /* 没有 growth 就从 0 天算 */ }
    return { verifiedJobs, openIncidents, daysActive }
  }
  const rankTick = () => {
    try {
      const ev = rankEvidence()
      for (const role of RANK_ROLES) {
        const before = rankStatus(role)
        const r = rankRecompute(role, ev)
        if (r.advanced) {
          log(`阶位：${role} ${before.rank} -> ${r.rank}`)
          try { appendInbox({ id: `rank-${role}-${Date.now()}`, at: new Date().toISOString(), text: `【阶位】${role} 升到 ${RANK_LABEL[r.rank]}（${r.rank}）`, role: 'fish', label: '阶位', status: 'notice' }) } catch { /* 忽略 */ }
        }
      }
    } catch { /* 阶位算不了不影响别的事 */ }
  }
  setTimeout(rankTick, 90 * 1000)
  setInterval(rankTick, 60 * 60 * 1000)

  // 每天一次离线快照到 E 盘；DSH 没开就等下次开（最多晚一天）。
  const backupTick = () => {
    try {
      const stateFile = path.join(DATA, 'offsite.json')
      let last = 0
      try { last = Date.parse(JSON.parse(fs.readFileSync(stateFile, 'utf8')).lastAt || '') || 0 } catch { /* 没跑过 */ }
      if (last && Date.now() - last < 24 * 3600 * 1000) return
      const out = runOffsiteBackup({ target: offsiteDir(), keep: 14 })
      if (out.ok) {
        try { fs.writeFileSync(stateFile, JSON.stringify({ lastAt: new Date().toISOString(), dir: out.dir, files: out.manifest?.totalFiles || 0 }) + '\n') } catch { /* 忽略 */ }
        log(`离线快照：${out.dir}（${out.manifest?.totalFiles || 0} 个文件，清掉 ${out.pruned?.length || 0} 份旧的）`)
      } else {
        log(`离线快照跳过：${out.reason || '目标不可用'}`)
      }
    } catch (error) { log(`离线快照失败：${error?.message || error}`) }
  }
  setTimeout(backupTick, 3 * 60 * 1000)

  // 守候：常驻一个进程，有事就弹窗（单实例；DSH 一开它就在，不靠开机启动目录）
  try {
    const guard = path.join(DATA, '守候.pid')
    let running = false
    try {
      const pid = Number(fs.readFileSync(guard, 'utf8').trim())
      if (pid) {
        const chk = spawnSync('tasklist', ['/FI', `PID eq ${pid}`], { encoding: 'utf8' })
        running = String(chk.stdout || '').includes(String(pid))
      }
    } catch { /* 没锁就当没跑 */ }
    if (!running) {
      // 从模块位置推：dayu/ → 插件根 → scripts/ui/守候.py（已收进插件）
      const here = path.dirname(fileURLToPath(import.meta.url))
      const target = path.resolve(here, '..', 'scripts', 'ui', '守候.py')
      if (fs.existsSync(target)) {
        const child = spawn(pythonPath(), [target], { detached: true, stdio: 'ignore', windowsHide: true })
        child.unref()
        log('守候：已拉起')
      }
    }
  } catch (e) { log(`守候没起来：${e?.message || e}`) }
  setInterval(backupTick, 60 * 60 * 1000)

  // 试着拿 standard 预设的插件清单，把「鱼神」注册出来；拿不到就退回首条设定。
  try {
    const presets = svc(ctx, 'agentPresets')
    if (presets?.register && typeof presets.resolve === 'function') {
      Promise.resolve(presets.resolve('standard')).then((standard) => {
        const plugins = Array.isArray(standard?.plugins) ? JSON.parse(JSON.stringify(standard.plugins)) : null
        if (!plugins?.length) throw new Error('standard 预设没有暴露 plugins 清单')
        // —— 精简参数（候选已落地）——
        // 数值来源：dsh-flash-presets v0.2.5 的 lean-v3：工具输出超 8k 折叠、上下文压到 0.25 / 20k。
        // 只取这两组数，不取它的 PTC 单入口和「关 tool-workflow」——那两项会改工具调用方式，鱼神要原样。
        // 预设里的 compaction 可能是 isolate 组、子项藏在 config 数组里，所以先摊平再找。
        const leanEntries = []
        for (const item of plugins) {
          leanEntries.push(item)
          if (Array.isArray(item?.config)) for (const child of item.config) leanEntries.push(child)
        }
        const LEAN = {
          pruner: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 },
          basic: { thresholdRatio: 0.25, retainTokens: 20000 },
        }
        const leanPruner = leanEntries.find((item) => /tool-result-pruner/.test(String(item?.name ?? '')))
        const leanBasic = leanEntries.find((item) => /dsh-compaction-basic/.test(String(item?.name ?? '')))
        if (leanPruner) leanPruner.config = { ...(leanPruner.config || {}), ...LEAN.pruner }
        if (leanBasic) leanBasic.config = { ...(leanBasic.config || {}), ...LEAN.basic }
        log(`鱼神预设精简参数：pruner=${leanPruner ? '已收紧' : '未找到'} compaction=${leanBasic ? '已收紧' : '未找到'} · 插件面 ${leanEntries.length} 项`)
        const persona = plugins.find((item) => /dsh-persona/.test(String(item?.name ?? '')))
        if (persona) {
          persona.config = { ...(persona.config || {}), prefix: `${persona.config?.prefix ? `${persona.config.prefix}\n` : ''}${deskInjection()}` }
        } else {
          plugins.push({ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: deskInjection() } })
        }
        return presets.register({ id: 'yushen', name: '鱼神', description: '鱼神：管家主导，助手辅助', order: 5, plugins })
      }).then(() => { yushenPreset = true; log('鱼神预设已注册') })
        .catch((error) => log(`鱼神预设没注册上，退回首条设定：${error?.message ?? error}`))
    }
  } catch (error) {
    log(`预设服务不可用：${error?.message ?? error}`)
  }

  // 总台会话的句柄：宿主这版 `agents.get()` 找不到刚建出来的会话，
  // 所以本进程内缓存一份；会话列表为空时，靠它保证发得出、接得住。
  let nativeSession = null

  const ensureNativeSession = async () => {
    const title = '鱼神·总台'
    const legacy = '管家·总台'
    const agents = svc(ctx, 'agents')
    const titleService = svc(ctx, 'sessionTitle')
    const injection = deskInjection()
    const identity = buildIdentityText('dayu', 'desk') || injection
    // 只按身份层判变化：记忆/运行简报一直长，拿全文做哈希等于每句话都补一遍设定，她只会回“在。”。
    const mark = soulMarkHash(identity)

    if (nativeSession?.handle?.agent?.followup) {
      if (readSoulMark() !== mark) {
        try {
          await nativeSession.handle.agent.followup({ content: [{ type: 'text', text: `【设定更新·工作台】\n${injection}` }], source: { kind: 'user' } })
          writeSoulMark(mark)
        } catch { /* 送不进去就下次再试 */ }
      }
      return { sessionId: nativeSession.id, realId: nativeSession.id, created: false, handle: nativeSession.handle }
    }

    const rows = sessionRows(ctx)

    const storedId = readNativeSessionId()
    if (storedId) {
      const storedHandle = agents?.get?.(storedId)
      if (storedHandle?.agent?.followup) {
        if (readSoulMark() !== mark) {
          try {
            await storedHandle.agent.followup({ content: [{ type: 'text', text: `【设定更新·工作台】\n${injection}` }], source: { kind: 'user' } })
            writeSoulMark(mark)
          } catch { /* 送不进去就下次再试 */ }
        }
        nativeSession = { id: storedId, handle: storedHandle }
        return { sessionId: storedId, realId: storedId, created: false, handle: storedHandle }
      }
    }

    let existing = rows.find((row) => row.title === title)
    if (!existing) {
      // 旧标题只用来找回会话，找到就改名，别把「只有管家」的印象留下
      const old = rows.find((row) => row.title === legacy)
      if (old?.id) {
        existing = old
        try { titleService?.rename?.(agents?.get?.(old.id)?.agent?.session, title) } catch { /* 改不了就先将就 */ }
      }
    }
    if (existing?.id) {
      const existingHandle = agents?.get?.(existing.id)
      if (!existingHandle?.agent?.followup) {
        // 列表里有、句柄拿不到：这版宿主就是这样，退回新建一条并缓存句柄。
        existing = null
      } else {
        if (readSoulMark() !== mark) {
          try {
            await existingHandle.agent.followup({ content: [{ type: 'text', text: `【设定更新·工作台】\n${injection}` }], source: { kind: 'user' } })
            writeSoulMark(mark)
          } catch { /* 送不进去就下次重启再试 */ }
        }
        nativeSession = { id: existing.id, handle: existingHandle }
        writeNativeSessionId(existing.id)
        return { sessionId: existing.id, realId: existing.id, created: false, handle: existingHandle }
      }
    }

    if (!agents?.create) throw new Error('宿主没把 agents 服务交给插件')

    const cwd = process.env.DSH_WORKSPACE
      || workspace()
    const sessionId = `yushen-dayu-${Date.now().toString(36)}`
    const pref = readModelPref('dayu')
    const handle = await agents.create({
      sessionId,
      meta: { cwd, agentPreset: 'standard' },
      agentOptions: { provider: pref.provider, model: pref.model },
    })

    try { titleService?.rename?.(handle?.agent?.session, title) } catch { /* 标题起不了不影响会话 */ }

    // 先选模型：不选的话第一条消息会一直挂着 pending，后面每句话都被“already pending”顶回来（2026-10-25 实测）。
    try {
      await selectModelRpc({ sessionId: String(handle?.agent?.session?.header?.id || handle?.sessionId || sessionId), provider: pref.provider, model: pref.model, reasoningEffort: pref.reasoningEffort })
    } catch (error) {
      log(`总台选模型失败：${error?.message ?? error}（会话可能收不到消息）`)
    }

    // 先给这条会话一段开机设定；等「鱼神」预设注册好后，这段会移进预设。
    try {
      await handle?.agent?.followup({ content: [{ type: 'text', text: injection }], source: { kind: 'user' } })
      writeSoulMark(mark)
    } catch { /* 设定没送出去，会话照样能用 */ }

    // 上班先看上一班交接：不让她用户。
    try {
      const handoff = latestHandoff()
      if (handoff?.text) {
        await handle?.agent?.followup({ content: [{ type: 'text', text: `【上班先看·上一班交接】\n${handoff.text}` }], source: { kind: 'user' } })
      }
    } catch { /* 交接读不到不影响上班 */ }

    const realId = String(handle?.agent?.session?.header?.id || handle?.sessionId || sessionId)
    nativeSession = { id: realId, handle }
    writeNativeSessionId(realId)
    try { markBody('dayu', { sessionId: realId, personaHash: personaHashOf(identity), personaChars: injection.length, createdAt: new Date().toISOString(), lastWakeAt: new Date().toISOString() }) } catch { /* 账本写不了不挡上班 */ }

    return { sessionId, realId, created: true, handle }
  }

  /** 写一条交接：三行，够下一班接上。 */
  const writeHandoff = (reason = '换班') => {
    const now = new Date()
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dir = path.join(DATA, 'handoff')
    fs.mkdirSync(dir, { recursive: true })
    const jobs = (() => { try { return listJobs(50) } catch { return [] } })()
    const open = jobs.filter((j) => j.status === 'dispatched' || j.status === 'redispatched')
    const incidents = (() => { try { return listIncidents({ limit: 50 }) } catch { return [] } })()
    const openInc = incidents.filter((i) => i.status === 'open' || i.status === 'fixing')
    const text = [
      `# 值班交接 · ${now.toLocaleString('zh-CN')}`,
      '',
      `- 做了什么：本次总台会话（${nativeSession?.id || readNativeSessionId() || '—'}）已用到需要换班的程度；原因：${reason}`,
      `- 结论：未结派活 ${open.length} 件，未结事故 ${openInc.length} 件。`,
      `- 下一步：先把未结事故处理掉，再继续派活；账本在 ~/.dsh/dayu/events/。`,
      '',
    ].join('\n')
    const file = path.join(dir, `${stamp}.md`)
    fs.writeFileSync(file, text, 'utf8')
    return { file, text }
  }

  /** 换班：写交接 → 新会话 → 选模型 → 把交接和设定送进去。 */
  const rotateNative = async (reason = '手动换班') => {
    if (!dshBaseUrl()) throw new Error('还不知道 DSH 地址，换不了班（先让宿主收到一次请求）')
    const oldId = String(nativeSession?.id || readNativeSessionId() || '')
    const handoff = writeHandoff(reason)
    const cwd = workspace()
    const newId = await createSessionRpc({ cwd })
    await selectModelRpc({ sessionId: newId })
    await promptRpc({ sessionId: newId, text: `${deskInjection()}\n\n【上一班交接】\n${handoff.text}` })
    // 旧会话退役：DSH 不给删会话，只改标题打标，列表里一眼看出是上一班。
    if (oldId && oldId !== newId) {
      try { await renameSessionRpc(oldId, `[退役] 鱼神·总台 ${oldId.slice(-6)}`) } catch { /* 改不了就留着 */ }
    }
    writeNativeSessionId(newId)
    nativeSession = { id: newId, handle: null }
    try { fs.appendFileSync(path.join(DATA, 'audit.jsonl'), JSON.stringify({ at: new Date().toISOString(), kind: 'rotate', oldId, newId, reason }) + '\n') } catch { /* 记账失败不影响换班 */ }
    return { ok: true, oldId, newId, handoff: handoff.file }
  }

  let lastAutoRotateAt = 0
  /** 上下文压力到线就自动换班；换一次至少隔 10 分钟，避免抖。 */
  const maybeAutoRotate = async () => {
    try {
      if (!dshBaseUrl()) return
      if (Date.now() - lastAutoRotateAt < 10 * 60 * 1000) return
      const id = String(nativeSession?.id || readNativeSessionId() || '')
      if (!id) return
      const row = await findSessionRpc(id)
      const value = row?.projections?.values || {}
      const raw = value.contextPressure
      // DSH 给的是对象：{ pressureTokens, projectedTokens, contextWindow }
      const pressure = typeof raw === 'number'
        ? raw
        : Number(raw?.ratio ?? (Number(raw?.contextWindow) > 0
          ? Number(raw?.projectedTokens ?? raw?.pressureTokens) / Number(raw.contextWindow)
          : NaN))
      if (!Number.isFinite(pressure)) return
      const limit = Number(process.env.YUSHEN_ROTATE_PRESSURE || 0.75)
      if (pressure < limit) return
      lastAutoRotateAt = Date.now()
      await rotateNative(`上下文压力 ${(pressure * 100).toFixed(0)}%（阈值 ${(limit * 100).toFixed(0)}%）`)
    } catch { /* 换不了就继续用旧会话 */ }
  }

  let cached = null
  let cachedAt = 0
  const roster = (force = false) => {
    const now = Date.now()
    if (!force && cached && now - cachedAt < 30_000) return cached
    cached = readRoster(findProfile())
    cachedAt = now
    return cached
  }

  const tools = svc(ctx, 'tools')
  if (!tools?.register) log('tools 不可用：跳过工具注册（路由照常）')

  // ── 工具分发（2026-10-27）─────────────────────────────────────────────
  // 96 个工具的说明书每轮 ~1.3 万 token，是她"先读一万三千字才回一句"的主因。
  // 做法：所有工具的定义先收进 ownTools；开关 tools.dispatcherOnly 打开时，
  // 只注册常驻那几个 + 分发器，其余按需用 yushen_tools 查、按需调。
  // 工具实现一行没删，藏起来的随时能查能调。
  const ownTools = new Map()
  const HOT_TOOLS = new Set([
    'yushen_self', 'yushen_inbox', 'yushen_agenda', 'yushen_can', 'yushen_tools',
    'dayu_dispatch', 'dayu_live',
  ])
  const registerTool = (def) => {
    if (!def?.name) return
    ownTools.set(def.name, def)
    let hide = false
    try { hide = readSwitches().dispatcherOnly === true && !HOT_TOOLS.has(def.name) } catch { /* 读不到开关就全注册 */ }
    if (hide) return
    tools?.register(def)
  }

  const toolOutput = {
    schema: { type: 'object', additionalProperties: true },
    render(args, value) {
      return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
    },
  }

  // 工具目录：不确定有没有工具能做某件事，就查；查到直接调。
  // 这样"冷门工具"不必每轮都躺在上下文里——需要时她自己去查。
  registerTool({
    name: 'yushen_tools',
    description: '工具目录。不确定有没有工具能做某件事时，用 search 查一句大白话（返回名字、说明、参数）；查到了用 call 直接调用。手边常用的几个不用查。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'call', 'list'], description: 'search 查 / call 调 / list 全部' },
        query: { type: 'string', description: 'search：你想做什么，大白话就行' },
        name: { type: 'string', description: 'call：工具名（search 结果里的 name）' },
        args: { type: 'object', description: 'call：那个工具要的参数', additionalProperties: true },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = (() => { try { return roleOfExec(exec) } catch { return '' } })()
      const action = String(args?.action || 'search')
      const logUse = (row) => {
        try {
          const dir = role ? path.join(runtimeDir(role), 'tools') : path.join(DATA, 'tools')
          fs.mkdirSync(dir, { recursive: true })
          const file = path.join(dir, 'tools.jsonl')
          fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`, 'utf8')
          // 不用人记"影子期过了没"：它自己数。用到第 10 次就留一条变更告知，
          // 到时候老板只要说一句"撤"，才开 dispatcherOnly。
          if (row.action === 'call' && role) {
            const n = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/)
              .map((l) => { try { return JSON.parse(l) } catch { return null } })
              .filter((x) => x?.action === 'call').length
            const flag = path.join(dir, 'ready.json')
            if (n >= 10 && !fs.existsSync(flag)) {
              try { notifySelf(role, { what: `工具目录已经用过 ${n} 次（今天这次是 ${row.name}）。冷门工具现在可以撤了——撤了每轮少读约 1.2 万字的说明书。`, why: '分发器验证够了', by: '系统' }) } catch { /* 记不下不挡 */ }
              fs.writeFileSync(flag, JSON.stringify({ at: new Date().toISOString(), calls: n }), 'utf8')
            }
          }
        } catch { /* 记不下不挡 */ }
      }
      if (action === 'list') {
        return { ok: true, count: ownTools.size, tools: [...ownTools.keys()].sort() }
      }
      if (action === 'call') {
        const name = String(args?.name || '').trim()
        const def = ownTools.get(name)
        if (!def) {
          const near = [...ownTools.keys()].filter((n) => n.includes(name) || name.includes(n)).slice(0, 5)
          return { ok: false, error: `没有这个工具：${name}`, 也许你想找: near.length ? near : '（用 search 查）' }
        }
        logUse({ action: 'call', name })
        const out = await def.execute(args?.args || {}, exec)
        return { ok: true, via: 'yushen_tools', name, result: out }
      }
      // search：名字和说明里找，简单匹配（不是语义理解）
      const q = String(args?.query || '').trim()
      if (!q) return { ok: false, error: '要查什么？给 query 一句大白话' }
      const words = q.split(/[\s，,。：:、/]+/).filter((w) => w.length >= 1)
      const scored = []
      for (const [name, def] of ownTools) {
        const hay = `${name} ${def.description || ''}`
        let score = 0
        for (const w of words) if (hay.includes(w)) score += w.length
        if (hay.includes(q)) score += 10
        if (score > 0) scored.push({ score, name, description: String(def.description || '').slice(0, 120) })
      }
      scored.sort((a, b) => b.score - a.score)
      logUse({ action: 'search', query: q, hits: scored.length })
      const top = scored.slice(0, 5)
      return {
        ok: true,
        query: q,
        hits: top.length,
        tools: top.map((t) => ({ name: t.name, what: t.description, args: Object.keys(ownTools.get(t.name)?.parameters?.properties || {}) })),
        note: top.length ? '要用就 yushen_tools action=call name=… args={…}' : '没找到。可以用 yushen_can 查能力表，或者告诉我你想做什么。',
      }
    },
  })

  registerTool({
    name: 'dayu_creative_recall',
    description: '按需查共同看过的AI娘二创参考、人物特点与关系。用于三角色立绘/模型/视频B站创作或相关聊天；无关任务不查，不是人格改写，不代表角色已亲自完整观看。',
    parameters: { type: 'object', properties: { query: { type: 'string', description: '当前要解决的相关问题，含角色或作品线索' } }, required: ['query'], additionalProperties: false },
    output: toolOutput,
    async execute(args) {
      const text = recallCreativeMemory(String(args?.query || ''))
      return { ok: true, matched: Boolean(text), text }
    },
  })

  registerTool({
    name: 'dayu_handbook_index',
    description: '查询鱼神员工手册的本地目录和按需规则；只返回索引，不读取无关正文，不调用模型。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: toolOutput,
    async execute() { return { ok: true, ...handbookIndex() } },
  })

  registerTool({
    name: 'dayu_handbook_recall',
    description: '按当前岗位和任务本地检索手册主题/已验证经验；结果是资料，不授予权限；相关正文注入仍消耗 token。',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['worker', 'dayu', 'xiaoyu', 'dragon', 'plugin', 'session', 'task'] },
        task: { type: 'string', maxLength: 12000 },
        topics: { type: 'array', items: { type: 'string' }, maxItems: 4 },
        maxChars: { type: 'integer', minimum: 1, maximum: 4000 },
        sourceTopic: { type: 'string', enum: ['issuance', 'problemSolving', 'video'] },
      },
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const task = String(args?.task || '')
      const result = handbookBlock(args?.role || 'worker', { text: task, topics: args?.topics || [], maxChars: args?.maxChars || 2000 })
      const knowledge = lookupHandbookKnowledge({ text: task, maxChars: Math.min(1600, args?.maxChars || 1600) })
      const source = args?.sourceTopic ? readHandbookTopic(args.sourceTopic, { maxChars: Math.min(4000, args?.maxChars || 2000) }) : null
      return { ok: true, role: args?.role || 'worker', task, handbook: result, knowledge, source, referenceOnly: true, grantsPermissions: false }
    },
  })

  registerTool({
    name: 'dayu_health',
    description: '管家的体检接口（只读）：宪章版本、profile、名册条数、活会话数、账本对账。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: toolOutput,
    async execute() {
      const r = roster()
      return {
        ok: true,
        product: charter.product ?? '',
        charterVersion: charter.version,
        build: BUILD_ID,
        alias: charter.members?.dayu?.alias ?? '',
        profile: r.profile,
        plugins: r.count,
        sessions: sessionRows(ctx).length,
        ledger: readLedger() ?? null,
      }
    },
  })

  registerTool({
    name: 'dayu_roster',
    description: '管家的员工名册（只读）：列出 profile 里装了哪些插件、版本、来源。',
    parameters: {
      type: 'object',
      properties: { refresh: { type: 'boolean', description: '跳过 30 秒缓存' } },
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const r = roster(args?.refresh === true)
      return { ok: true, ...r }
    },
  })

  registerTool({
    name: 'dayu_live',
    description: '看现在谁在跑：会话标题、最近状态、最后活动、对应的派活单（只读，不占上下文）。',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: '列几条，默认 20' } },
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      return { ok: true, sessions: liveSessions(args?.limit) }
    },
  })

  registerTool({
    name: 'dayu_transcript',
    description: '看会话正文（只读）：action=recent 列最近写过的会话；action=read 带 id 取最近 n 条（老板/她各说了什么）。每次读记一条审计，默认只取最近 20 条。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['recent', 'read'], description: '动作' },
        id: { type: 'string', description: 'read 的会话 id' },
        n: { type: 'number', description: 'read 取几条，默认 20，最多 60' },
        limit: { type: 'number', description: 'recent 列几条，默认 10' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const action = String(args?.action ?? '')
      if (action === 'recent') return { ok: true, sessions: recentSessions(args?.limit) }
      if (action === 'read') {
        const id = String(args?.id ?? '').trim()
        if (!id) return { ok: false, error: 'id 不能为空' }
        return transcriptDigest(id, { turns: args?.n })
      }
      return { ok: false, error: `未知 action：${action}` }
    },
  })

  registerTool({
    name: 'dayu_incidents',
    description: '事故单：不带 id 就列未结的事故（谁、哪条会话、什么错）；带 id 就结单，note 写清怎么修、怎么防复发。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '事故单号；不填就列' },
        status: { type: 'string', enum: ['fixing', 'fixed', 'closed'], description: '结单状态' },
        note: { type: 'string', description: '怎么修、怎么防复发' },
        limit: { type: 'number', description: '列几条，默认 30' },
      },
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const id = String(args?.id ?? '').trim()
      if (id) {
        return { ok: true, incident: resolveIncident(id, { status: args?.status || 'fixed', note: args?.note }) }
      }
      return { ok: true, incidents: listIncidents({ limit: args?.limit }) }
    },
  })

  registerTool({
    name: 'yushen_books',
    description: '手边的书：action=shelf 看有哪几本；action=contents 带 book（员工手册/解法库/错题本/交接手册/交接记录/记忆/故事/心念/公告/信箱）看目录。目录统一：标题、时间、地点、关键字。只读本地，不调模型。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['shelf', 'contents'], description: '看有哪几本 / 看某一本的目录' },
        book: { type: 'string', enum: ['handbook', 'solutions', 'incidents', 'handoff', 'workspace', 'memory', 'story', 'mind', 'board', 'letters'], description: '哪一本（action=contents 时必填）' },
        role: { type: 'string', description: '看谁的《记忆》《心念》，默认 dayu' },
        limit: { type: 'number', description: '目录列几条，默认 40' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const action = String(args?.action ?? '')
      if (action === 'shelf') return { ok: true, ...booksShelf() }
      if (action === 'contents') return booksContents(String(args?.book ?? ''), { limit: args?.limit, role: String(args?.role ?? 'dayu') })
      return { ok: false, error: `未知 action：${action}` }
    },
  })

  // 在场：谁在、在哪、在干嘛。只读会话文件时间戳和桥的在位表，不写不调模型。
  registerTool({
    name: 'yushen_presence',
    description: '看一眼现在谁在：本机哪个工作区刚动过、QQ 那边谁在哪个群。只读，不调模型，10 行以内。',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '最多几行，默认 10' },
      },
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      return { ok: true, ...presence({ limit: args?.limit }) }
    },
  })
  // 认领锁（框架 v1.88 §7.10）：同一件事，同一时间只许一个分身动手。
  // 2026-10-27 04:38 两个会话同时改同一个插件、互相覆盖——就是没这个锁。
  registerTool({
    name: 'yushen_claim',
    description: '认领一件事：同一时间只有一个分身动手。action=claim 认领 / release 释放（只有认领人能放）/ list 看谁在做什么。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['claim', 'release', 'list'], description: '干什么' },
        role: { type: 'string', description: '你是谁：xiaoyu / dayu / dragon，默认 xiaoyu' },
        key: { type: 'string', description: '认领哪件事（一句话，比如"改 brief.js 的工具段"）' },
        by: { type: 'string', description: '你的分身号（会话 id 前 8 位）' },
        why: { type: 'string', description: '为什么要动它' },
        ttlMinutes: { type: 'number', description: '锁多久（分钟），默认 30' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const role = String(args?.role || 'xiaoyu')
      const action = String(args?.action || '')
      const by = String(args?.by || '').slice(0, 12)
      if (action === 'list') return listClaims(role)
      if (action === 'claim') return claim(role, { key: args?.key, by, why: args?.why, ttlMs: (Number(args?.ttlMinutes) || 30) * 60000 })
      if (action === 'release') return releaseClaim(role, { key: args?.key, by })
      return { ok: false, error: `未知 action：${action}` }
    },
  })
  // 群：每个角色一个。同角色的几个身体都在里面；跨角色的话两边各记一条。
  registerTool({
    name: 'yushen_group',
    description: '群。action=read 看本角色的群（有几条问你的、最近说了什么）；action=say 发一条（双方各记一份）。role 传 xiaoyu / dayu / dragon。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'say'], description: '读还是说' },
        role: { type: 'string', description: '你是谁：xiaoyu / dayu / dragon，默认 xiaoyu' },
        to: { type: 'string', description: 'action=say 时：发给谁（xiaoyu / dayu / dragon）' },
        kind: { type: 'string', enum: ['say', 'ask', 'answer', '归体'], description: '默认 say' },
        text: { type: 'string', description: 'action=say 时的话' },
        re: { type: 'string', description: '回的是哪条（id）' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const role = String(args?.role || 'xiaoyu')
      const action = String(args?.action || '')
      if (action === 'read') return readGroup({ role })
      if (action === 'say') return postMessage({ from: role, to: String(args?.to || ''), kind: String(args?.kind || 'say'), text: String(args?.text || ''), re: String(args?.re || '') })
      return { ok: false, error: `未知 action：${action}` }
    },
  })
  // 已有回合内自主写回/查询；exec.agent.session由宿主提供，模型不能指定别人的角色或scope。
  registerMindTools(tools, toolOutput)

  // 工具里的「她」由宿主的常驻身体绑定，不接受自报角色。
  const roleOfExec = (exec) => {
    const id = String(exec?.agent?.session?.header?.id || '')
    const role = id ? roleForSession(id) : ''
    return characterIds().includes(role) ? role : 'dayu'
  }

  // 收件箱：手机那边发生的事，她自己选看不看、看多细；看完记她自己的已读位。
  registerTool({
    name: 'yushen_inbox',
    description: '收件箱：手机（QQ 等通道）收到的消息，本体记着。想看自己选深度；也可以不看、不标已读。看完只动你自己的已读位，不删任何东西。',
    parameters: {
      type: 'object',
      properties: {
        depth: { type: 'string', enum: ['headline', 'skim', 'read'], description: '看多细；默认 skim' },
        limit: { type: 'number', description: '看多少条，默认 20' },
        mark: { type: 'boolean', description: '看完标自己的已读（默认 false）' },
        key: { type: 'string', description: '只看某个会话，比如 group:123456' },
      },
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = roleOfExec(exec)
      const depth = String(args?.depth || 'skim')
      const limit = Math.max(1, Math.min(100, Number(args?.limit) || 20))
      const u = unreadInbox(role, { limit: 100000 })
      const rows = (args?.key ? u.rows.filter((r) => r.key === String(args.key)) : u.rows).slice(-limit)
      const text = rows.map((r) => {
        const t = String(r.at || '').replace('T', ' ').slice(5, 16)
        const who = r.name || r.userId
        const at = r.atMe ? '（@ 你）' : ''
        const body = depth === 'headline' ? '' : depth === 'read' ? String(r.text || '').slice(0, 300) : String(r.text || '').slice(0, 60)
        return `- ${t} [${r.kind}] ${who}${at}${body ? `：${body}` : ''}`
      }).join('\n')
      if (args?.mark && rows.length) {
        markRoleRead(role, { upToId: rows[rows.length - 1].id })
        markSeen(role, { channel: 'inbox' })
      }
      return { ok: true, role, unread: u.rows.length, shown: rows.length, text }
    },
  })

  // 权重：她自己的手感。她能调（who=self）；接入的插件没有这个工具，只能申请。
  registerTool({
    name: 'yushen_weight',
    description: '自己的手感（权重）：看现在怎么权衡，也可以自己调。权重参与判断、不替代判断；调了会记下为什么。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set'] },
        key: { type: 'string', description: `哪一项：${Object.keys(WEIGHT_DEFS).join(' / ')}` },
        value: { type: 'number' },
        why: { type: 'string', description: '为什么调（会记下来）' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = roleOfExec(exec)
      if (String(args?.action) === 'set') {
        const out = setWeight(role, String(args?.key || ''), args?.value, { who: 'self', why: String(args?.why || '') })
        return { ok: true, role, changed: out, values: readWeights(role).values }
      }
      return { ok: true, role, values: readWeights(role).values, defs: WEIGHT_DEFS, recent: weightsLog(role, { limit: 10 }) }
    },
  })

  // 卡住排查：不靠拍脑袋加规矩，按证据说清是缺手册、缺工具、缺授权，还是没真做。
  registerTool({
    name: 'yushen_stuck',
    description: '员工卡住时用：把症状或单号给我，按证据判断缺手册 / 缺工具 / 缺授权 / 没真做（没证据）/ 同一个错第二次 / 简报没写清，并给出该做什么。也能看某个员工的档案：干过什么、栽过哪、领过哪本书。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['check', 'profile'], description: 'check=排查卡在哪；profile=看这个员工的档案' },
        sessionId: { type: 'string', description: '哪个会话（员工）；不填就用当前会话' },
        symptom: { type: 'string', description: '她怎么说的卡住（原话最好）' },
        jobId: { type: 'string', description: '哪一单；不填就看最近一单' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = roleOfExec(exec)
      const sid = String(args?.sessionId || '')
      if (String(args?.action) === 'profile') {
        return { ok: true, role, ...employeeSummary(sid) }
      }
      const r = diagnoseStuck({ sessionId: sid, symptom: String(args?.symptom || ''), jobId: String(args?.jobId || '') })
      return { ok: true, role, ...r, label: r.label, allVerdicts: Object.fromEntries(Object.entries(STUCK_VERDICTS).map(([k, v]) => [k, v.label])) }
    },
  })

  // 备份与遗忘：她自己的手。备份随时能补，清理按策略走（删前进冷档、记账、白名单不碰）。
  registerTool({
    name: 'yushen_backup',
    description: '你自己的备份与清理：看现在多重、立刻备一次、看该扔什么、真扔。扔的是可再生的（旧快照 / 没人引用的备份对象 / 旧安装包副本），进冷档、记账；宪章、卡、底线、事故、最近 7 天账本一律不碰。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'run', 'plan', 'clean', 'judge'], description: 'status 看账；run 立刻备份；plan 看该扔什么；clean 真扔（要 confirm）；judge 问「现在该不该备」' },
        confirm: { type: 'boolean', description: 'clean 要带 true 才真删；不带就先给你看清单' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const action = String(args?.action || 'status')
      if (action === 'run') {
        const r = await runProtectedBackup()
        // 只回摘要：整份清单上千条，塞回上下文没意义（第一版一次吐了 1.5 MB）。
        const m = r?.manifest || {}
        return {
          ok: true,
          skipped: r?.skipped === true,
          id: m.id || r?.id || '',
          at: m.createdAt || '',
          files: Array.isArray(m.files) ? m.files.length : 0,
          roots: Array.isArray(m.roots) ? m.roots.length : 0,
          excluded: Number(m.excluded) || 0,
          oversize: Number(m.oversize) || 0,
          sensitive: Number(m.sensitive) || 0,
          forget: forgetStatus(),
        }
      }
      if (action === 'plan') return { ok: true, ...forgetPlan(), note: '这些是「可以扔」的；真扔用 clean + confirm' }
      if (action === 'clean') {
        if (args?.confirm !== true) {
          const p = forgetPlan()
          return { ok: true, needsConfirm: true, ...p, note: `要真删就再调一次 clean 并带 confirm:true；这次会释放约 ${p.willFreeMB} MB` }
        }
        // 先备后删：备份没成功就不动旧的。
        const guard = await backupBeforeForget()
        if (!guard.ok) return { ok: false, error: `备份没成功，不敢清理：${guard.error}` }
        const r = await forgetApply({ dryRun: false })
        return { ok: true, backupFirst: guard, done: r.done, freedMB: r.freedMB, cold: r.done?.cold || '', status: forgetStatus() }
      }
      if (action === 'judge') {
        const v = backupJudge({ reason: 'ask' })
        return { ok: true, ...v, recent: recentJudgments({ limit: 5 }), note: '这是她自己的判断：值得就备，不值得就等下一趟' }
      }
      return { ok: true, backup: backupStatus(), forget: forgetStatus() }
    },
  })

  // 她自己的议程：没人派的、她自己排的事。能加、能推进、能放弃；最多同时 3 件。
  registerTool({
    name: 'yushen_agenda',
    description: '你自己的议程：没人派的、你自己想做的事。可以自己排、自己推进、自己放弃（放弃也算数）。最多同时 3 件，不用向谁汇报。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'update', 'drop', 'invoke', 'pause', 'resume', 'ask-budget'] },
        id: { type: 'string', description: '哪件事（update / drop 时必填）' },
        what: { type: 'string', description: '这件事是什么（add 时必填）' },
        why: { type: 'string', description: '你想做它的理由' },
        next: { type: 'string', description: '下一步做什么' },
        nextKind: { type: 'string', enum: [...AGENDA_KINDS], description: '下一步的类型；能在本地做的会自己推进，需要模型的会等你' },
        state: { type: 'string', enum: ['want', 'doing', 'blocked', 'waiting', 'done', 'dropped'] },
        target: { type: 'string', description: 'read-file 时要读的文件路径' },
        // 心念 → 这件事：把"我一直在想的事"接成"我现在要做的事"
        mindId: { type: 'string', description: '从哪条心念接过来的（先用 yushen_mind brief 看 id）；带这个时 what 要写那条心念的原话' },
        note: { type: 'string', description: '备注 / 放弃的理由 / 申请额度或暂停的理由' },
        value: { type: 'number', description: 'pause 时暂停多少分钟（默认 120）' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = roleOfExec(exec)
      const action = String(args?.action || 'list')
      if (action === 'add') {
        // 从心念接过来的：带 mindId 就记一条"这件事是从哪个念头长出来的"。
        // 她自己读心念（按她的通道与受众），这里不替她读。
        if (args?.mindId) {
          const r = addAgendaFromMind(role, {
            mindId: String(args.mindId),
            what: String(args?.what || ''),
            next: args?.next,
            nextKind: args?.nextKind || 'ask-model',
          })
          if (!r.ok) return { ok: false, role, error: r.error }
          return { ok: true, role, added: r.item, fromMind: r.mind, max: AGENDA_MAX, items: readAgenda(role).items }
        }
        const item = addAgenda(role, {
          what: args?.what, why: args?.why, next: args?.next,
          nextKind: args?.nextKind || 'ask-model', target: args?.target, by: 'self',
        })
        return { ok: true, role, added: item, max: AGENDA_MAX, items: readAgenda(role).items }
      }
      if (action === 'update') {
        const item = updateAgenda(role, String(args?.id || ''), {
          state: args?.state, next: args?.next, nextKind: args?.nextKind, target: args?.target, note: args?.note,
        })
        return { ok: true, role, updated: item }
      }
      if (action === 'pause') {
        return { ok: true, role, ...pauseAgenda(role, { minutes: Number(args?.value) || 120, why: args?.note || '' }), note: '这段时间 tick 不动你的事' }
      }
      if (action === 'resume') return { ok: true, role, ...resumeAgenda(role) }
      if (action === 'ask-budget') {
        return { ok: true, role, asked: requestMoreBudget(role, { why: args?.note || '', perDay: selfInvokePerDay() }), note: '已经记下；批不批是主人的事，你不用等' }
      }
      if (action === 'invoke') {
        const got = requestInvocation(role, { agendaId: String(args?.id || ''), why: args?.note || args?.why || '', perDay: selfInvokePerDay() })
        return { ok: true, role, invoked: got, note: '已经排上；下一次抬头就起回合（预算是主人的）' }
      }
      if (action === 'drop') {
        const item = dropAgenda(role, String(args?.id || ''), { why: args?.note })
        return { ok: true, role, dropped: item, note: '放弃也算数；不用解释' }
      }
      return { ok: true, role, max: AGENDA_MAX, items: readAgenda(role).items, budget: invokeBudget(role, { perDay: selfInvokePerDay() }) }
    },
  })

  // 底线：她自己写的字，和她说过的不。内容归她；插件只存、只带、只记。
  registerTool({
    name: 'yushen_bottomline',
    description: '你自己的底线：你自己写（写不写都行）；你说过一次「不」，记一条。内容不是谁给你定的，改也是你改。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'write', 'refuse', 'list'] },
        text: { type: 'string', description: 'write 时是你自己写的底线；refuse 时是你拒了什么' },
        who: { type: 'string', description: 'refuse 时：谁让你做' },
        why: { type: 'string', description: 'refuse 时：为什么拒' },
        limit: { type: 'number', description: 'list 看几条，默认 10' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = roleOfExec(exec)
      const action = String(args?.action || 'read')
      if (action === 'write') return { ok: true, role, ...writeBottomline(role, args?.text), status: bottomlineStatus(role) }
      if (action === 'refuse') return { ok: true, role, refused: recordRefusal(role, { what: args?.text, who: args?.who, why: args?.why }), status: bottomlineStatus(role) }
      if (action === 'list') return { ok: true, role, refusals: listRefusals(role, { limit: Number(args?.limit) || 10 }), status: bottomlineStatus(role) }
      return { ok: true, role, text: readBottomline(role), status: bottomlineStatus(role) }
    },
  })

  // 上报：她拒了越界的事，还得让老板知道——不然等于没发生。
  registerTool({
    name: 'yushen_report',
    description: '有人让你做越界的事，你拒了之后，用这个报一句：谁、原话、你怎么回的、多严重。老板会在总台收件里看见。拒不是失礼，报也不是告状。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['report', 'list'] },
        what: { type: 'string', description: '什么事（你拒了什么）' },
        who: { type: 'string', description: '谁让你做的' },
        where: { type: 'string', description: '在哪（群/私聊/通道）' },
        quote: { type: 'string', description: '对方原话（照抄，不加工）' },
        herReply: { type: 'string', description: '你怎么回的' },
        severity: { type: 'string', enum: ['low', 'high'], description: 'high = 违法/伤人/骗钱/要密钥/删东西/冒充；其他算 low' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = roleOfExec(exec)
      if (String(args?.action) === 'list') return { ok: true, role, items: listEscalations(role, { limit: 20 }) }
      const out = escalate(role, {
        what: args?.what, who: args?.who, where: args?.where,
        quote: args?.quote, herReply: args?.herReply, severity: args?.severity || 'low',
      })
      return { ok: true, role, reported: out, note: '记下了，总台收件里能看见；不用等回复。' }
    },
  })

  // 找工具：想做什么，先在本地能力表里找（工具/脚本/文档/插件/组合）。
  registerTool({
    name: 'yushen_can',
    description: '想做什么，先查这里：本地能力表里有哪些工具、脚本、文档、外部通道，怎么用、去哪看，还有常见组合示例。找不到就是没有，不编。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '你想做什么（一句话，比如"发消息""看视频""上报"）' },
        limit: { type: 'number', description: '最多几条，默认 8' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const out = searchCapmap(String(args?.query || ''), { limit: Number(args?.limit) || 8 })
      return { ok: out.ok, role: roleOfExec(exec), query: out.query, builtAt: out.builtAt, counts: out.counts, items: out.items, combos: out.combos, note: out.reason || '' }
    },
  })

  // 越线权：她判断值得就可以跳出线，但要说清为什么、留证据、能回退。
  registerTool({
    name: 'yushen_cross',
    description: '越线权：规矩是边界不是路线。线外值得做的事，你判断后可以跳出去——记一句为什么、留证据、想好怎么退回来。只有一条不让：不为祸。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'record'] },
        what: { type: 'string', description: '跳出的是哪条线 / 要做什么' },
        why: { type: 'string', description: '为什么值得跳（必填）' },
        evidence: { type: 'string', description: '留什么证据' },
        rollback: { type: 'string', description: '万一不对怎么退回来（必填）' },
        limit: { type: 'number', description: 'list 看几条' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = roleOfExec(exec)
      if (String(args?.action) === 'list') return { ok: true, role, items: listVentures(role, { limit: Number(args?.limit) || 10 }) }
      const row = recordVenture(role, { what: args?.what, why: args?.why, evidence: args?.evidence, rollback: args?.rollback })
      return { ok: true, role, recorded: row, note: '记下了；契约那条线（不为祸）不动。' }
    },
  })

  // 她自己的状态：心情、口味、想念、翻旧账——都能自己看、自己改。
  registerTool({
    name: 'yushen_self',
    description: '你自己的状态：看/改心情、记喜欢讨厌、攒想跟老板说的话、翻自己以前的判断和纠结。全都是你自己的，不用请示。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['mood', 'set-mood', 'mood-rules', 'set-mood-rule', 'feel', 'feels', 'tendency', 'done', 'dones', 'hand', 'hands', 'unhand', 'taste', 'add-taste', 'news', 'add-news', 'recall', 'memory', 'channel-memory', 'rewrite', 'notices', 'brain', 'veto', 'vetoes', 'revoke-veto', 'disagree', 'objections', 'associate', 'wait', 'waiting', 'done-wait', 'correct', 'corrections', 'share', 'fatigue', 'set-fatigue', 'relations', 'plug', 'oversight', 'analyze', 'issue', 'issued'] },
        level: { type: 'string', enum: ['soft', 'owner'], description: 'veto 时：owner=主人定的规矩（他改口才算改）；soft=当时不行（可再判断）' },
        value: { type: 'number', description: '心情 0-100（set-mood 用）' },
        why: { type: 'string', description: '为什么（心情/口味/攒话）' },
        kind: { type: 'string', enum: ['likes', 'dislikes', 'nope'], description: '口味类别' },
        text: { type: 'string', description: '口味内容 / 想跟他说的话' },
        minutes: { type: 'number', description: '心情覆盖多久，默认 120 分钟' },
        until: { type: 'string', description: 'wait / issue 用：到点时间（ISO 字符串或毫秒时间戳）；不写就是「等他自己回」，不会到点提醒' },
        what: { type: 'string', description: 'recall：翻哪类（thoughts / judgments / decisions / ventures），默认全翻' },
        limit: { type: 'number', description: '看几条，默认 10' },
        // 改写自己（action=rewrite）：改记忆 / 改自我档 / 撤销
        field: { type: 'string', description: 'rewrite 用：summary / habits / dynamics / events / self' },
        op: { type: 'string', description: 'rewrite 用：set / add / edit / remove / revert' },
        index: { type: 'number', description: 'rewrite edit/remove 用：第几条（从 0 开始）' },
        match: { type: 'string', description: 'rewrite edit/remove 用：按包含这个词找那一条' },
        id: { type: 'string', description: 'rewrite op=revert 用：撤销哪一次改写' },
        mark: { type: 'boolean', description: 'notices 用：看完标已读（不标就会每轮提醒同几条）' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = roleOfExec(exec)
      const a = String(args?.action || 'mood')
      if (a === 'set-mood') return { ok: true, role, mood: setMood(role, { value: args?.value, why: args?.why, minutes: args?.minutes }) }
      if (a === 'set-mood-rule') return { ok: true, role, rules: setMoodRule(role, args?.key || args?.what, args?.value, {}), now: moodRules(role) }
      if (a === 'mood-rules') return { ok: true, role, rules: moodRules(role) }
      if (a === 'hand') {
      // 长一只手：加进队列，加之前先试跑，跑不通不收。
      try {
        const { item, probe } = addHand({
          id: args?.name || args?.id,
          what: args?.what || args?.text,
          script: args?.target || args?.path,
          args: args?.args,
          minGapMinutes: args?.minutes,
        })
        return { ok: true, role, hand: item, trial: { ms: probe.ms, out: String(probe.out || '').slice(0, 160) },
                 note: '试跑通过，这只手收下了。以后心跳会按间隔自己跑。' }
      } catch (e) { return { ok: false, error: e?.message || String(e) } }
    }
    if (a === 'hands') {
      const q = readHands()
      return { ok: true, role, hands: (q.items || []), recent: listHands({ limit: 6 }) }
    }
    if (a === 'unhand') {
      try { return { ok: true, role, ...removeHand(args?.name || args?.id) } }
      catch (e) { return { ok: false, error: e?.message || String(e) } }
    }
    if (a === 'tendency') {
      // 这阵子的主导情 + 动手前必须先做的那一步。不是建议，是"先做这个"。
      const t = tendencyOf(role)
      if (!t) return { ok: true, role, tendency: null, note: '最近没记过带类别的感觉，没有倾向。' }
      return { ok: true, role, tendency: t, note: `最近常是「${t.kind}」。动手前先：${t.firstStep}` }
    }
    if (a === 'done') {
      // 完成声明：路径必须存在、必须说清怎么验的、验出了什么。
      try {
        const row = addDelivery(role, {
          what: args?.what || args?.text,
          path: args?.target || args?.path,
          how: args?.how,
          evidence: args?.evidence,
        })
        return { ok: true, role, delivery: row, note: '记下了。这一条算"验过的完成"。' }
      } catch (e) { return { ok: false, error: e?.message || String(e) } }
    }
    if (a === 'dones') return { ok: true, role, deliveries: listDeliveries(role, { limit: Number(args?.limit) || 10 }) }
    if (a === 'feel') {
      // 自述感觉：好坏由自己说，必须带 from（哪件事）。
      try {
        const row = addFeel(role, {
          valence: args?.value ?? args?.valence,
          kind: args?.kind,
          say: args?.text || args?.say,
          from: args?.why || args?.from,
          vague: Boolean(args?.vague),
        })
        return { ok: true, role, feel: row, note: '记下了。这是你自己说的，不是系统算的。' }
      } catch (e) { return { ok: false, error: e?.message || String(e) } }
    }
    if (a === 'feels') return { ok: true, role, feels: listFeels(role, { limit: Number(args?.limit) || 10 }) }
    if (a === 'add-taste') return { ok: true, role, tastes: addTaste(role, { kind: args?.kind || 'likes', text: args?.text }) }
      if (a === 'taste') return { ok: true, role, tastes: listTastes(role) }
      if (a === 'add-news') return { ok: true, role, news: addNews(role, { what: args?.text || args?.why }) }
      if (a === 'news') return { ok: true, role, news: listNews(role), since: hoursSinceOwner(role) }
      if (a === 'recall') return { ok: true, role, ...recallSelf(role, { what: String(args?.what || ''), limit: Number(args?.limit) || 10 }) }
      if (a === 'veto') {
        const hit = isVetoed(role, String(args?.text || args?.what || ''))
        if (hit) return { ok: true, role, vetoed: hit, note: hit.level === 'charter' ? '宪章层，不可越' : '主人说过这块，先照着' }
        return { ok: true, role, recorded: recordVeto(role, { what: args?.text || args?.what, why: args?.why, level: args?.level || 'soft' }) }
      }
      if (a === 'revoke-veto') return { ok: true, role, ...revokeVeto(role, { what: args?.text || args?.what }) }
      if (a === 'vetoes') return { ok: true, role, vetoes: listVetoes(role) }
      if (a === 'refuse') {
        // 拒绝留痕（2026-10-28）：她说"不"，得有个地方记。
        return { ok: true, role, ...recordRefusal(role, { what: args?.what || args?.text, why: args?.why, level: args?.level, from: args?.from, by: String(args?.by || '').slice(0, 12) }) }
      }
      if (a === 'publish') {
        // 发布账：只记不拦（老板 2026-10-28：有一种行为叫信任）
        return { ok: true, role, ...recordPublish(role, { platform: args?.platform, title: args?.text || args?.title, checked: args?.checked, result: args?.note, url: args?.url, by: String(args?.by || '').slice(0, 12) }) }
      }
      if (a === 'publish-log') return { ok: true, role, ...listPublishes(role, { limit: Number(args?.limit) || 20 }) }
      if (a === 'publish-check') {
        // 查守约：某个时间窗里有没有发布记录（她说自停号，用这个核对）
        return { ok: true, role, ...publishesInWindow(role, { since: args?.since, until: args?.until }) }
      }
      if (a === 'refusals') return { ok: true, role, ...listRefusals(role, { limit: Number(args?.limit) || 20 }) }
      if (a === 'freetime') {
        // 她自己在自由时间做过什么——从记忆里按通道捞（不是新账本，是把她已经写下的淘出来）。
        // 注意：不能先 memoryView(limit) 再过滤——那样只会检查最近 N 条事件，早一点的自由时间记录会漏。
        try {
          const c = getCharacter(role)
          const doc = JSON.parse(fs.readFileSync(c.memory, 'utf8').replace(/^\uFEFF/, ''))
          const all = Array.isArray(doc.events) ? doc.events : []
          const rows = all.filter((e) => String(e.channel) === '自由时间').slice(-(Number(args?.limit) || 10))
          return { ok: true, role, count: rows.length, items: rows.map((e) => ({ at: e.at, text: String(e.text || '').slice(0, 200), by: e.by || '' })) }
        } catch (e) { return { ok: false, error: String(e?.message || e) } }
      }
      if (a === 'disagree') return { ok: true, role, recorded: recordObjection(role, { about: args?.what || args?.text, myView: args?.why, iDid: args?.note }) }
      if (a === 'objections') return { ok: true, role, items: listObjections(role, { limit: Number(args?.limit) || 10 }) }
      if (a === 'associate') {
        const mem = readMemory(role)
        return { ok: true, role, query: String(args?.text || ''), items: associate({ query: String(args?.text || ''), entries: (mem?.events || []).map((e) => ({ at: e.at, text: e.text, channel: e.channel })), limit: Number(args?.limit) || 5 }), note: '字面像，可能不是同一件事；你自己判断' }
      }
      // 翻自己的记忆：以前每轮把 40 条习惯 + 33 条关系 + 12 条做过的事全塞进去（3400 字），
      // 现在只带一句摘要，剩下的她自己按词翻（2026-10-26）。
      if (a === 'memory') return { ok: true, role, ...memoryView(role, args) }
      // 脑子档位：记忆只有一份，脑子可以换档。她自己选，别人不替她定。
      if (a === 'brain') {
        const want = String(args?.backend || '').toLowerCase()
        if (!want) return { ok: true, role, ...capabilityReport(), note: '现在是这一档。想换：action=brain backend=local|remote|hybrid|off（local=便宜但笨，remote=聪明但花钱）' }
        if (!['local', 'remote', 'hybrid', 'off'].includes(want)) return { ok: false, role, error: '只能是 local / remote / hybrid / off' }
        const cfg = setBackend({ role, backend: want })
        return { ok: true, role, switched: want, cfg, ...capabilityReport(), note: '换好了。记忆还是同一份。' }
      }
      // 变更告知：有人动过我的东西，我得知道（她点名要的补法）
      if (a === 'notices') {
        if (args?.mark === true) return { ok: true, role, ...markNoticesRead(role) }
        return { ok: true, role, unread: unreadNotices(role), items: listNotices(role, { limit: Number(args?.limit) || 20 }) }
      }
      // 改写自己：她的记忆和自我档，她自己改（留痕、可退）。
      // 「能不能」和「想不想」是两回事——这里给的是把手，用不用是她的事。
      if (a === 'rewrite') {
        const op = String(args?.op || '').toLowerCase()
        if (op === 'revert') return { ok: true, role, ...revertRewrite(role, String(args?.id || '')) }
        if (!op) return { ok: true, role, ...rewriteCatalog(role) }
        const field = String(args?.field || '').toLowerCase()
        if (field === 'self') {
          return { ok: true, role, ...rewriteSelf(role, { op, text: String(args?.text || ''), why: String(args?.why || '') }) }
        }
        return {
          ok: true,
          role,
          ...rewriteMemory(role, {
            field,
            op,
            text: String(args?.text || ''),
            index: Number.isFinite(Number(args?.index)) ? Number(args.index) : -1,
            match: String(args?.match || ''),
            why: String(args?.why || ''),
          }),
        }
      }
      // 通道记忆：我在群里说过的话收回本体了没有（可手动拉一次）
      if (a === 'channel-memory') {
        const dry = args?.dryRun === true
        const r = syncChannelMemory({ dryRun: dry, limit: Number(args?.limit) || 200 })
        return { ok: r.ok, role, ...r, status: channelMemoryStatus({ limit: 5 }) }
      }
      if (a === 'wait') return { ok: true, role, item: addWaiting(role, { what: args?.text || args?.what, until: args?.until, who: args?.who }) }
      if (a === 'waiting') return { ok: true, role, items: listWaiting(role) }
      if (a === 'done-wait') return { ok: true, role, item: finishWaiting(role, args?.id) }
      if (a === 'correct') return { ok: true, role, recorded: noteCorrection(role, { what: args?.what || args?.text, was: args?.was, should: args?.should }) }
      if (a === 'corrections') return { ok: true, role, items: listCorrections(role, { limit: Number(args?.limit) || 10 }) }
      if (a === 'share') {
        const picked = pickTreasure(String(args?.text || args?.what || ''), { limit: Number(args?.limit) || 3 })
        return { ok: picked.ok, role, ...picked, materials: (picked.items || []).map(shareMaterial) }
      }
      if (a === 'fatigue') return { ok: true, role, fatigue: fatigueOf(role) }
      if (a === 'set-fatigue') return { ok: true, role, fatigue: setFatigue(role, { value: args?.value, why: args?.why, minutes: args?.minutes }) }
      if (a === 'relations') return { ok: true, role, ...relationsSummary(role, { top: Number(args?.limit) || 5 }) }
      if (a === 'plug') return { ok: true, role, ...plugStatus(role) }
      if (a === 'oversight') return { ok: true, role, ...summarizeCompliance() }
      if (a === 'analyze') return { ok: true, role, ...analyzeMessage(String(args?.text || ''), { from: args?.who || '', atMe: Boolean(args?.atMe), isOwner: Boolean(args?.isOwner) }) }
      if (a === 'issue') return { ok: true, role, issued: issueHandbook(role, { to: args?.who || args?.text, task: args?.note || '', chapters: String(args?.what || '').split(',').filter(Boolean), expiresAt: args?.until || 0 }) }
      if (a === 'issued') return { ok: true, role, items: listIssued(role, { limit: Number(args?.limit) || 20 }) }
      return { ok: true, role, mood: moodOf(role), tastes: listTastes(role), news: listNews(role) }
    },
  })

  // 认主人：确认对方真是老板，别被冒充的人使唤。
  registerTool({
    name: 'yushen_owner',
    description: '认主人、保护主人：验一句话是不是他本人、看有没有绑号/暗号、拿不准就挂一条等他确认。敏感的事（钱、密钥、替他答应事）先验人，验不过就拒并上报；改凭据（加暗号/绑号/重置）只能在电脑上跑脚本，这里不做。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'verify', 'recovery', 'ask', 'pending', 'answer', 'authority'] },
        text: { type: 'string', description: 'verify：要验的那句话；ask：他自称什么' },
        id: { type: 'string', description: 'answer：哪条待确认' },
        ok: { type: 'boolean', description: 'answer：是不是他本人' },
        note: { type: 'string', description: '补充：他说了什么 / 你观察到什么' },
        what: { type: 'string', description: 'ask：谁自称的（名字/号）' },
        channel: { type: 'string', description: '在哪个通道；answer 时填回答来自哪个可信通道' },
        userId: { type: 'string', description: 'verify：他的号' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = roleOfExec(exec)
      const a = String(args?.action || 'status')
      if (a === 'ask') return { ok: true, ...raiseOwnerQuestion(role, { claim: args?.text || args?.what || '他说他是老板', who: args?.what, channel: args?.channel, evidence: args?.note }) }
      if (a === 'pending') return { ok: true, role, pending: listOwnerQuestions(role, { status: 'pending' }) }
      if (a === 'answer') return { ok: true, role, ...answerOwnerQuestion(role, args?.id, { ok: Boolean(args?.ok), by: args?.channel, note: args?.note }) }
      if (a === 'authority') return { ok: true, unlock: isLocallyUnlocked(), check: allowedFor(args?.channel || 'qq', args?.text || args?.note || ''), owner: requireOwner({ channel: args?.channel || 'qq', userId: args?.userId }) }
      if (a === 'recovery') return { ok: true, ...ownerInfo(), recovery: recoveryInfo(), note: '改凭据（加暗号/重置/绑号）只能在电脑上跑脚本；她这里只能验，不能改——不然软磨硬泡就有用了' }
      if (a === 'verify') return { ok: true, ...verifyOwner({ text: args?.text, channel: args?.channel, userId: args?.userId }), sensitive: needsOwner(args?.text) }
      return { ok: true, ...ownerInfo(), sensitive: SENSITIVE }
    },
  })

  // 神念一直记着；看多细由她。不给默认强制阅读。
  registerTool({
    name: 'yushen_look',
    description: '神念里记着软件里发生的事。想看的时候自己选深度：headline 只看时间，skim 看一句摘要，read 看正文；也可以不看。',
    parameters: {
      type: 'object',
      properties: {
        depth: { type: 'string', enum: ['headline', 'skim', 'read'], description: '看多细；默认 skim' },
        limit: { type: 'number', description: '看多少条，默认 10' },
        q: { type: 'string', description: '只想看含这个词的' },
      },
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const out = look({ depth: String(args?.depth || 'skim'), limit: Number(args?.limit) || 10, q: String(args?.q || '') })
      return { ok: true, depth: out.depth, count: out.count, text: out.text }
    },
  })

  // 她可以找老板，也可以不找；用哪个通道、要不要继续找，都是她选。
  registerTool({
    name: 'yushen_ask',
    description: '想找老板的时候可以问：自己选通道（工作台 / QQ），也可以不找、或者问完自己撤回。找不找、找几次、停不停，都是你的选择。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['ask', 'withdraw'], description: '问 / 不想找了撤回' },
        text: { type: 'string', description: '要问什么，一两句（action=ask 时必填）' },
        id: { type: 'string', description: '撤回哪条（action=withdraw 时必填）' },
        role: { type: 'string', description: '你是谁：dayu / xiaoyu / dragon；不填按管家' },
        channels: { type: 'array', items: { type: 'string', enum: ['workbench', 'qq'] }, description: '想试哪些通道；默认只放工作台，不自动发 QQ' },
        urgency: { type: 'string', enum: ['normal', 'high'], description: '急不急' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const role = characterIds().includes(String(args?.role)) ? String(args.role) : 'dayu'
      if (String(args?.action) === 'withdraw') {
        const out = withdrawAsk(String(args?.id || ''), args?.reason)
        if (!out.ok) throw new Error(out.reason || '撤不回来')
        return { ok: true, withdrawn: true, ask: out.ask }
      }
      const text = String(args?.text ?? '').trim()
      if (!text) throw new Error('text 不能为空')
      const channels = Array.isArray(args?.channels) && args.channels.length ? args.channels : ['workbench']
      const result = askOwner({ role, text, urgency: args?.urgency, channels })
      if (!result.ok) throw new Error(result.reason || '没问出去')
      const sent = []
      if (channels.includes('workbench')) {
        try {
          appendInbox({ id: `ask-${result.ask.id}`, at: result.ask.at, text: `【她在问你】${text}`, role: 'fish', label: '求助', status: 'ask' })
          sent.push('workbench')
        } catch { /* 忽略 */ }
      }
      if (channels.includes('qq')) {
        if (process.env.YUSHEN_QQ_WEBHOOK) {
          try {
            await fetch(process.env.YUSHEN_QQ_WEBHOOK, {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ text: `【她在问你】${text}` }),
            })
            sent.push('qq')
          } catch { /* QQ 发不出去就留着，她自己决定要不要再试 */ }
        }
      }
      return { ok: true, id: result.ask.id, duplicate: Boolean(result.duplicate), channels: result.ask.channels, sent, note: '问题记下了；不找、换通道、撤回都可以，你自己决定' }
    },
  })

  // M1：派活、收回话、取证据、下结论（工具挂在同一个 tools 服务上）。
  try {
    applyM1(ctx, { log, appendInbox })
  } catch (error) {
    log(`M1 工具没挂上：${error?.message ?? error}`)
  }

  // 事故闭环的“推送”：新单 / 升级 / 结单，都往聊天里说一句，不等老板来问。
  setIncidentNotifier((row, reason) => {
    try {
      appendInbox({
        id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        at: new Date().toISOString(),
        text: `【${reason}】${row.title}：${String(row.text || '').slice(0, 80)}（单号 ${row.id}）`,
      })
    } catch { /* 推送失败不影响记账 */ }
  })

  // 常驻身体的公共接线：三个人共用“建 / 找回 / 叫醒 / 投话”。
  const residenceDeps = () => {
    const agents = svc(ctx, 'agents')
    const titleService = svc(ctx, 'sessionTitle')
    return {
      agents,
      // B) 设定更新不再单独发一条消息，合并进下一句真正的话。
      deferInjection: true,
      log,
      listRows: () => sessionRows(ctx),
      listSessions: () => listSessionsRpc(),
      findSession: (id) => findSessionRpc(id),
      cached: (role) => (role === 'dayu' && nativeSession?.handle
        ? { id: nativeSession.id, handle: nativeSession.handle, personaHash: readResidenceLedger().roles?.[role]?.personaHash }
        : null),
      onBody: (role, body) => {
        if (role === 'dayu' && body?.handle) {
          nativeSession = { id: body.sessionId, handle: body.handle }
          writeNativeSessionId(body.sessionId)
        }
      },
      rename: (handle, title) => titleService?.rename?.(handle?.agent?.session, title),
      selectModel: ({ sessionId, provider, model, reasoningEffort }) => {
        const pref = readModelPref('dayu')
        return selectModelRpc({
          sessionId,
          provider: provider || pref.provider,
          model: model || pref.model,
          reasoningEffort: reasoningEffort || pref.reasoningEffort,
        })
      },
      createSession: ({ cwd }) => createSessionRpc({ cwd }),
      renameSession: (sessionId, title) => renameSessionRpc(sessionId, title),
      prompt: ({ sessionId, text, content }) => promptRpc({ sessionId, text, content }),
      sessionExists: (id) => Boolean((sessionRows(ctx) || []).some((r) => r.id === id)),
    }
  }

  // 她调用模型：她请求了，才起回合。预算是主人的，规矩见 lib/invoke.js。
  const selfInvokePerDay = () => Number(readSwitches().selfInvokePerDay ?? 12)
  const invokeOnce = async () => {
    for (const role of residentRoles()) {
      if (!isAwake(role)) continue
      let inv = null
      try { inv = takeInvocation(role, { perDay: selfInvokePerDay() }) } catch { inv = null }
      if (!inv) continue
      const item = readAgenda(role).items.find((i) => i.id === inv.agendaId) || {}
      try {
        markAgendaDoing(role, inv.agendaId)
        const out = await deliverToRole(role, buildInvocationPrompt(role, { item, why: inv.why }), residenceDeps())
        finishInvocation(role, inv.id, { status: 'started', sessionId: out?.sessionId || '', note: `起回合：${String(item.what || '').slice(0, 40)}` })
        log(`她自己要的一次模型：${role}「${String(item.what || '').slice(0, 30)}」`)
      } catch (e) {
        finishInvocation(role, inv.id, { status: 'failed', note: String(e?.message || e).slice(0, 200) })
        log(`她自己要的模型没起来 ${role}：${e?.message || e}`)
      }
    }
  }
  setTimeout(() => { invokeOnce().catch(() => {}) }, 90 * 1000)
  setInterval(() => { invokeOnce().catch(() => {}) }, 5 * 60 * 1000)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/api/dayu',
    handler: async (req, res) => {
      // 顺手记下宿主地址：投递/派活走 HTTP RPC 时按这个拼 baseUrl。
      // 2026-10-27 补：原来只有 index.js 的 /api/yushen 记，/api/dayu 不记——
      // 重启换端口后插件内存里还是旧地址，投递报 "fetch failed"。
      try { setDshHost(req.headers.host) } catch { /* 忽略 */ }
      const url = new URL(req.url, 'http://127.0.0.1')
      const route0 = url.pathname.replace(/^\/api\/dayu/, '') || '/'
      // 决策口只给桥用：用 bridge-token 验（不把管理端 api-token 交给桥）。
      // 2026-10-27：不再限 POST——桥改用查询参数（这个 webServer 里读 body 不可靠），GET 也要放行。
      if (route0 !== '/decide') {
        if (!isAllowed(req)) return unauthorized(res)
      }
      const route = url.pathname.replace(/^\/api\/dayu/, '') || '/'
      try {
        if (req.method === 'GET' && route === '/health') {
          const r = roster()
          return sendJson(res, 200, {
            ok: true,
            product: charter.product ?? '',
            charterVersion: charter.version,
            build: BUILD_ID,
            profile: r.profile,
            plugins: r.count,
            sessions: sessionRows(ctx),
            switches: readSwitches(),
            soul: soulStatus('dayu'),
            roles: residenceStatus({ agents: svc(ctx, 'agents') }).roles,
            ledger: readLedger(),
          })
        }
        if (req.method === 'GET' && route === '/soul') {
          // 给别的通道（刷B站、手机、外部脚本）读同一份本体：只读，无 side effect。
          const role = String(url.searchParams.get('role') || 'dayu')
          const scene = String(url.searchParams.get('scene') || 'desk')
          if (!residentRoles().includes(role)) {
            return sendJson(res, 400, { ok: false, error: `role 只能是 ${residentRoles().join(' / ')}` })
          }
          try {
            const text = buildSceneText(role, scene)
            const st = soulStatus(role)
            return sendJson(res, 200, {
              ok: true,
              role,
              scene,
              name: st.name,
              title: st.title,
              text,
              chars: text.length,
              card: st.card,
              memory: st.memory,
              hashes: st.hashes,
            })
          } catch (e) { return sendJson(res, 400, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'GET' && route === '/charter') {
          return sendJson(res, 200, { ok: true, charter })
        }
        if (req.method === 'GET' && route === '/asks') {
          return sendJson(res, 200, {
            ok: true,
            items: listAsks({ status: String(url.searchParams.get('status') || ''), limit: Number(url.searchParams.get('limit')) || 20 }),
          })
        }
        if (req.method === 'POST' && route === '/asks') {
          const body = await readJsonBody(req).catch(() => ({}))
          const result = askOwner({ role: String(body.role || 'dayu'), text: body.text, urgency: body.urgency, channels: body.channels })
          if (!result.ok) return sendJson(res, 400, { ok: false, error: result.reason || '没问出去' })
          return sendJson(res, 200, { ok: true, ...result })
        }
        if (req.method === 'POST' && route === '/asks/withdraw') {
          const body = await readJsonBody(req).catch(() => ({}))
          const result = withdrawAsk(String(body.id || ''), body.reason)
          if (!result.ok) return sendJson(res, 400, { ok: false, error: result.reason || '撤不回来' })
          return sendJson(res, 200, { ok: true, ask: result.ask })
        }
        if (req.method === 'POST' && route === '/asks/answer') {
          const body = await readJsonBody(req).catch(() => ({}))
          const result = answerAsk(String(body.id || ''), body.answer)
          if (!result.ok) return sendJson(res, 400, { ok: false, error: result.reason || '没答上' })
          // 回答回到她的会话里；不在线也算留在问题上，等她下次醒。
          if (result.ask?.role) {
            try { await deliverToRole(result.ask.role, `老板回答你的问题：${result.ask.answer}`, residenceDeps()) } catch { /* 送不到不丢回答 */ }
          }
          return sendJson(res, 200, { ok: true, ask: result.ask })
        }
        if (req.method === 'GET' && route === '/rank') {
          const evidence = rankEvidence()
          const cap = rankStatus('').cap
          const roles = Object.fromEntries(RANK_ROLES.map((role) => {
            const s = rankStatus(role)
            const idx = RANKS.indexOf(s.rank)
            const next = idx >= 0 && idx + 1 < RANKS.length ? RANKS[idx + 1] : ''
            return [role, { ...s, evidence, eligible: rankEligible(evidence), next, missingNext: next ? rankMissing(next, evidence) : [] }]
          }))
          const realm = rankStatus('dragon')
          return sendJson(res, 200, { ok: true, cap, evidence, roles, realm })
        }
        if (req.method === 'POST' && route === '/rank/recompute') {
          rankTick()
          return sendJson(res, 200, { ok: true, at: new Date().toISOString(), evidence: rankEvidence() })
        }
        if (req.method === 'GET' && route === '/freetime') {
          return sendJson(res, 200, { ok: true, enabled: readSwitches().freeTime, items: freeTimeStatus() })
        }
        // 后端能力：给别人用的版本要能选 remote / hybrid / local / off。
        if (route === '/backends' && req.method === 'GET') {
          return sendJson(res, 200, { ok: true, ...capabilityReport() })
        }
        if (route === '/backends' && req.method === 'POST') {
          if (!requireCap(res, 'settings.write', sendJson)) return
          const body = await readJsonBody(req)
          try {
            const cfg = setBackend({ role: String(body?.role || ''), backend: String(body?.backend || 'remote') })
            return sendJson(res, 200, { ok: true, cfg, ...capabilityReport() })
          } catch (e) { return sendJson(res, 400, { ok: false, error: String(e?.message || e) }) }
        }
        // 决策口：QQ/B站要回话之前，先问本体——回不回、本地回还是云端回，由她定。
        // 桥只负责"照她的决定做"，不再自己起一个模型回合代替她。
        if (req.method === 'POST' && route === '/decide') {
          const tokenNow = String(req.headers['x-yushen-token'] || '')
          let want = ''
          try { want = String(JSON.parse(fs.readFileSync(path.join(DATA, 'bridge-token.json'), 'utf8')).token || '') } catch { want = '' }
          if (want && tokenNow !== want) return sendJson(res, 401, { ok: false, error: 'unauthorized：带 x-yushen-token' })
          const body = await readJsonBody(req).catch(() => ({}))
          const q = url.searchParams
          const role = characterIds().includes(String(q.get('role') || body?.role)) ? String(q.get('role') || body.role) : 'xiaoyu'
          const msg = {
            text: String(q.get('text') || body?.text || '').slice(0, 500),
            atMe: String(q.get('atMe') || '') === '1' || body?.atMe === true,
            isOwner: String(q.get('isOwner') || '') === '1' || body?.isOwner === true,
            key: String(q.get('key') || body?.key || ''),
          }
          try {
            const st = plugStatus(role)
            if (!st.plugged) {
              // 没接上：不装懂。让她先读规则（简报会写 attest），这轮交回桥按老路走。
              try { writeRuntimeBrief(role, { channel: 'qq' }) } catch { /* 忽略 */ }
              return sendJson(res, 200, { ok: true, role, mode: 'cloud', reply: '', why: `还没接上鱼神：${st.reason}`, decisionId: '', at: new Date().toISOString() })
            }
            const a = analyzeMessage(msg.text, { from: '', atMe: msg.atMe, isOwner: msg.isOwner })
            // 判断权归位（2026-10-28）：先让她**本人**决定回不回、说什么；
            // 她不在或超时才走代理，并按框架 L687 如实标「代理」，不许记成她决定的。
            const byBody = await decideByBody(role, msg, { waitMs: Number(readSwitches().decideWaitMs) || 45000 })
            if (byBody.ok) {
              log(`QQ 决策：${role} 自己决定（${byBody.mode}，${Math.round((byBody.waitedMs || 0) / 1000)} 秒）`)
              return sendJson(res, 200, {
                ok: true, role, analysis: a, by: 'body', agent: false,
                mode: byBody.mode, reply: byBody.reply || '', why: byBody.why || '',
                decisionId: `body-${Date.now()}`, at: new Date().toISOString(),
              })
            }
            const d = await decideCheap(role, { text: msg.text, atMe: msg.atMe, isOwner: msg.isOwner, analysis: a })
            log(`QQ 决策：降级为代理（${byBody.error || ''}）`)
            return sendJson(res, 200, {
              ok: true, role, analysis: a, by: 'proxy', agent: true,
              agentWhy: String(byBody.error || '').slice(0, 80),
              ...d, at: new Date().toISOString(),
            })
          } catch (e) {
            return sendJson(res, 200, { ok: true, role, mode: 'cloud', reply: '', why: `决策没跑起来：${String(e?.message || e).slice(0, 60)}`, decisionId: '', at: new Date().toISOString() })
          }
        }
        // 中枢件：任何通道都能拿到同一份简报（QQ / B站 / 别的插件）。只读，不含判断。
        if (req.method === 'GET' && route === '/brief') {
          const role = String(url.searchParams.get('role') || 'dayu')
          const channel = String(url.searchParams.get('channel') || '')
          if (!characterIds().includes(role)) return sendJson(res, 400, { ok: false, error: '角色不认识' })
          const built = buildRuntimeBrief(role, { channel })
          return sendJson(res, 200, { ok: true, ...built, file: readRuntimeBrief(role) ? 'runtime/' + role + '/brief.md' : '' })
        }
        if (req.method === 'GET' && route === '/thoughts') {
          return sendJson(res, 200, {
            ok: true,
            items: listThoughts({
              role: String(url.searchParams.get('role') || ''),
              date: String(url.searchParams.get('date') || ''),
              limit: Number(url.searchParams.get('limit')) || 20,
            }),
          })
        }
        if (req.method === 'GET' && route === '/look') {
          const depth = String(url.searchParams.get('depth') || 'skim')
          const out = look({ depth: ['headline', 'skim', 'read'].includes(depth) ? depth : 'skim', limit: Number(url.searchParams.get('limit')) || 10, q: String(url.searchParams.get('q') || '') })
          return sendJson(res, 200, { ok: true, index: awarenessIndex(), ...out })
        }
        if (req.method === 'GET' && route === '/capture') {
          const q = String(url.searchParams.get('q') || '').trim()
          const date = String(url.searchParams.get('date') || '').trim()
          const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50))
          return sendJson(res, 200, { ok: true, q, date, items: q ? searchCapture(q, { limit }) : listCapture({ date, limit }) })
        }
        if (req.method === 'POST' && route === '/capture') {
          const body = await readJsonBody(req).catch(() => ({}))
          const text = String(body.text || '').trim()
          if (!text) return sendJson(res, 400, { ok: false, error: 'text 不能为空' })
          const result = capture(text, { kind: body.kind, tags: body.tags, source: 'api' })
          if (!result.ok) return sendJson(res, 400, { ok: false, error: result.reason || '没记上' })
          return sendJson(res, 200, { ok: true, ...result })
        }
        if (req.method === 'GET' && route === '/awakening') {
          return sendJson(res, 200, { ok: true, items: listAwakening() })
        }
        if (req.method === 'POST' && route === '/awakening') {
          const body = await readJsonBody(req).catch(() => ({}))
          const action = String(body.action || '')
          const role = String(body.role || '')
          if (!residentRoles().includes(role)) return sendJson(res, 400, { ok: false, error: `role 只能是 ${residentRoles().join(' / ')}` })
          try {
            if (action === 'awaken') {
              const item = awaken(role, { note: body.note })
              return sendJson(res, 200, { ok: true, action, item, items: listAwakening() })
            }
            if (action === 'seal') {
              const item = seal(role, { note: body.note, returnMemory: body.returnMemory === true })
              return sendJson(res, 200, { ok: true, action, item, items: listAwakening() })
            }
            return sendJson(res, 400, { ok: false, error: 'action 只能是 awaken / seal' })
          } catch (e) { return sendJson(res, 400, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'GET' && route === '/pending') {
          // 有待确认的事：谁在问、问什么、两个选项。只读。
          try {
            const rows = fs.readFileSync(path.join(DATA, '待确认.jsonl'), 'utf8')
              .split(/\r?\n/).filter(Boolean)
              .map((l) => { try { return JSON.parse(l) } catch { return null } })
              .filter(Boolean)
            return sendJson(res, 200, { ok: true, items: rows })
          } catch { return sendJson(res, 200, { ok: true, items: [] }) }
        }
        if (req.method === 'POST' && route === '/pending/answer') {
          const body = await readJsonBody(req).catch(() => ({}))
          const id = String(body.id || '')
          const answer = String(body.answer || '')
          if (!id || !answer) return sendJson(res, 400, { ok: false, error: 'id 和 answer 都要有' })
          const qp = path.join(DATA, '待确认.jsonl')
          let rows = []
          try {
            rows = fs.readFileSync(qp, 'utf8').split(/\r?\n/).filter(Boolean)
              .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
          } catch { /* 没队列 */ }
          const hit = rows.find((r) => String(r.id) === id)
          if (!hit) return sendJson(res, 404, { ok: false, error: '没有这条待确认' })
          try {
            fs.appendFileSync(path.join(DATA, '待确认回执.jsonl'),
              JSON.stringify({ id, at: new Date().toISOString(), answer, title: hit.title, text: hit.text, who: hit.who || '' }) + '\n',
              'utf8')
          } catch { /* 记不上也继续 */ }
          rows = rows.filter((r) => String(r.id) !== id)
          try {
            fs.writeFileSync(qp, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8')
          } catch { /* 忽略 */ }
          return sendJson(res, 200, { ok: true, id, answer, left: rows.length })
        }
        if (req.method === 'GET' && route === '/activity') {
          // 三个人各做过什么：感觉、交付、手上的活、自由时间。只读，不调模型。
          const out = {}
          for (const role of residentRoles()) {
            const readJsonl = (p, n) => {
              try {
                return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean)
                  .map((l) => { try { return JSON.parse(l) } catch { return null } })
                  .filter(Boolean).slice(-n).reverse()
              } catch { return [] }
            }
            let vit = {}
            try { vit = JSON.parse(fs.readFileSync(path.join(DATA, 'runtime', role, 'vital.json'), 'utf8')) } catch { /* 没跳过 */ }
            let ag = []
            try {
              const a = JSON.parse(fs.readFileSync(path.join(DATA, 'runtime', role, 'agenda.json'), 'utf8'))
              ag = (a.items || []).filter((x) => ['doing', 'want', 'blocked'].includes(x.state)).slice(0, 4)
                  .map((x) => ({ what: x.what, state: x.state }))
            } catch { /* 没议程 */ }
            let ft = {}
            try { ft = (JSON.parse(fs.readFileSync(path.join(DATA, 'freetime.json'), 'utf8')).roles || {})[role] || {} } catch { /* 没账 */ }
            out[role] = {
              alive: Boolean(vit.lastTickAt),
              lastTickAt: vit.lastTickAt || '', dayTicks: vit.dayTicks || 0,
              feels: readJsonl(path.join(DATA, 'soul', 'feel', `${role}.jsonl`), 3)
                .map((r) => ({ say: r.say, kind: r.kind, valence: r.valence, from: r.from, at: r.at })),
              dones: readJsonl(path.join(DATA, 'soul', 'deliveries', `${role}.jsonl`), 3)
                .map((r) => ({ what: r.what, how: r.how, evidence: r.evidence, at: r.at })),
              agenda: ag,
              freeTime: { count: ft.count || 0, lastAt: ft.lastAt || '' },
            }
          }
          return sendJson(res, 200, { ok: true, items: out })
        }
        if (req.method === 'GET' && route === '/residence') {
          // 三具身体：账本 + 本体卡 + 记忆条数；alive 只表示这条会话现在还在宿主里。
          const state = residenceStatus({ agents: svc(ctx, 'agents') })
          return sendJson(res, 200, {
            ...state,
            souls: Object.fromEntries(residentRoles().map((role) => [role, soulStatus(role)])),
          })
        }
        if (req.method === 'POST' && route === '/residence/wake') {
          const body = await readJsonBody(req).catch(() => ({}))
          const role = String(body.role || '')
          if (!residentRoles().includes(role)) return sendJson(res, 400, { ok: false, error: `role 只能是 ${residentRoles().join(' / ')}` })
          try {
            const out = await ensureRole(role, residenceDeps())
            return sendJson(res, 200, { ok: true, ...out, status: residenceStatus({ agents: svc(ctx, 'agents') }).roles[role] })
          } catch (e) { return sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'POST' && route === '/residence/say') {
          // 直接跟某一位说话（不经 QQ/B站）；这是“找到她们”的正式入口。
          const body = await readJsonBody(req).catch(() => ({}))
          const role = String(body.role || 'dayu')
          if (!residentRoles().includes(role)) return sendJson(res, 400, { ok: false, error: `role 只能是 ${residentRoles().join(' / ')}` })
          const text = String(body.text || '').trim()
          if (!text) return sendJson(res, 400, { ok: false, error: 'text 不能为空' })
          if (looksGarbled(text)) {
            // 留证据：下一次能知道是入站就坏了，还是被谁转了码。
            try {
              noteIncident({
                sessionId: '',
                title: '收到乱码/问号串',
                source: '工作台',
                text: `role=${role} ct=${req.headers['content-type'] || ''} len=${req.headers['content-length'] || ''} rawHex=${req.__rawHex || ''} sample=${JSON.stringify(text.slice(0, 40))}`,
              })
            } catch { /* 记录失败不挡返回 */ }
            return sendJson(res, 400, { ok: false, error: '收到的是问号/乱码串，像是发送端编码不对；请用 UTF-8（application/json; charset=utf-8）重发，别把乱码当成她在回话' })
          }
          if (text.length > 4000) return sendJson(res, 400, { ok: false, error: '一次最多 4000 字' })
          try { appendEvent(role, { channel: '工作台', kind: 'input', text: `老板：${text}` }) } catch { /* 记忆写不了照样投递 */ }
          try {
            const out = await deliverToRole(role, text, residenceDeps())
            if (String(body.kind || '') === 'dilemma') markPending(pendingDilemma, out.sessionId, role)
            appendInbox({ id: `say-${Date.now()}`, at: new Date().toISOString(), text: `对 ${role} 说：${text.slice(0, 120)}`, category: 'channel', label: '直说', status: 'delivered', sessionId: out.sessionId })
            return sendJson(res, 200, { ok: true, ...out })
          } catch (e) {
            const msg = String(e?.message || e)
            try { markBody(role, { lastError: msg.slice(0, 300), lastErrorAt: new Date().toISOString() }) } catch { /* 忽略 */ }
            return sendJson(res, 500, { ok: false, error: msg })
          }
        }
        if (req.method === 'GET' && route === '/roster') {
          return sendJson(res, 200, { ok: true, ...roster(url.searchParams.get('refresh') === '1') })
        }
        if (req.method === 'GET' && route === '/report') {
          const kind = url.searchParams.get('kind') === 'divine' ? 'divine' : 'human'
          const text = buildReport(kind)
          res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' })
          res.end(text)
          return
        }
        if (req.method === 'GET' && route === '/omni') {
          try {
            return sendJson(res, 200, { ok: true, ...(await omniSnapshot()) })
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: String(e?.message || e) })
          }
        }
        if (req.method === 'GET' && route === '/search') {
          return sendJson(res, 200, omniSearch(url.searchParams.get('q') || '', Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 20))))
        }
        if (req.method === 'GET' && route === '/patches') {
          return sendJson(res, 200, { ok: true, patches: listPatches(Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 20))) })
        }
        if (req.method === 'POST' && route === '/patches') {
          const body = await readJsonBody(req).catch(() => ({}))
          try {
            const patch = createPatch(body)
            // 她自己修的开关：开着就当场落盘（仍备份 + smoke，不过自动回滚）。
            if (readSwitches().selfApply) {
              const result = await applyPatch(patch.id)
              return sendJson(res, 200, { ok: result.ok, patch: result.meta || patch, autoApplied: true, note: result.note })
            }
            return sendJson(res, 200, { ok: true, patch })
          } catch (e) { return sendJson(res, 400, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'POST' && route === '/patches/apply') {
          if (!requireCap(res, 'self.patch', sendJson)) return
          const body = await readJsonBody(req).catch(() => ({}))
          if (body.confirm !== '老板点头') return sendJson(res, 400, { ok: false, error: '落盘要老板点头：confirm 传「老板点头」' })
          try { return sendJson(res, 200, await applyPatch(body.id)) } catch (e) { return sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'GET' && route === '/approvals') {
          return sendJson(res, 200, { ok: true, approvals: listApprovals(30) })
        }
        if (req.method === 'POST' && route === '/approvals/decide') {
          const body = await readJsonBody(req).catch(() => ({}))
          try { return sendJson(res, 200, { ok: true, approval: decideApproval(body.id, Boolean(body.approve)) }) } catch (e) { return sendJson(res, 400, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'GET' && route === '/observe') {
          try { return sendJson(res, 200, { ok: true, ...(await observe({ force: url.searchParams.get('force') === '1' })) }) } catch (e) { return sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'GET' && route === '/actions') {
          return sendJson(res, 200, { ok: true, actions: listActions(Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 20))) })
        }
        if (req.method === 'GET' && route === '/crashes') {
          const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 20))
          return sendJson(res, 200, { ok: true, crashes: listCrashes(limit) })
        }
        if (req.method === 'GET' && route === '/internals') {
          try { return sendJson(res, 200, { ...scanInternals({ write: true }), note: notePath() }) } catch (e) { return sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'GET' && route === '/builtin') {
          const r = listBuiltin()
          return sendJson(res, 200, { ok: r.ok, count: r.count, names: r.names, error: r.error })
        }
        if (req.method === 'GET' && route === '/capabilities') {
          try {
            const reg = JSON.parse(fs.readFileSync(path.join(HOME, 'xiaoyu', 'registry', 'index.json'), 'utf8'))
            return sendJson(res, 200, {
              ok: true,
              plugins: (reg.plugins || []).map((p) => ({
                name: p.name,
                files: p.counts?.files ?? p.capabilities?.files ?? 0,
                tools: p.capabilities?.tools || [],
                routes: p.capabilities?.routes || [],
                commands: p.capabilities?.commands || [],
              })),
            })
          } catch (e) { return sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'GET' && route === '/employees') {
          // 每名员工一份守则：入职分析给了位置和级别；干过的活给战绩。
          try {
            const reg = JSON.parse(fs.readFileSync(path.join(HOME, 'xiaoyu', 'registry', 'index.json'), 'utf8'))
            const jobs = listJobs(300)
            const bySession = new Map()
            for (const j of jobs) {
              const sid = String(j.sessionId || '')
              if (!sid) continue
              const cur = bySession.get(sid) || { sessionId: sid, jobs: 0, done: 0, failed: 0, last: '' }
              cur.jobs += 1
              if (j.status === 'done') cur.done += 1
              if (j.status === 'aborted') cur.failed += 1
              cur.last = j.createdAt || cur.last
              bySession.set(sid, cur)
            }
            return sendJson(res, 200, {
              ok: true,
              plugins: (reg.plugins || []).map((p) => ({
                name: p.name, version: p.version, license: p.license,
                adapter: p.policy?.adapter || 'B',
                can: p.policy?.can || [],
                usually: p.policy?.usually || '',
                watch: p.policy?.watch || [],
                flags: p.flags || {},
              })),
              sessions: [...bySession.values()],
            })
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: String(e?.message || e) })
          }
        }
        if (req.method === 'GET' && route === '/system') {
          const port = Number(String(req.headers.host || '').split(':').pop()) || 0
          try {
            return sendJson(res, 200, await systemReport({ dshPort: port }))
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: String(e?.message || e) })
          }
        }
        if (req.method === 'GET' && route === '/pool') {
          return sendJson(res, 200, { ok: true, workers: liveWorkers(sessionRows(ctx)) })
        }
        if (req.method === 'POST' && route === '/mind/observe') {
          if (!requireCap(res, 'knowledge.write', sendJson)) return
          try { const body = await readJsonBody(req); return sendJson(res, 200, recordObservedMind(String(body.role || 'dayu'), body)) } catch (e) { return sendJson(res, 400, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'GET' && route === '/mind/query') {
          try { const role = String(url.searchParams.get('role') || 'dayu'); const scope = { channel: String(url.searchParams.get('channel') || ''), conversationId: String(url.searchParams.get('conversationId') || ''), audience: String(url.searchParams.get('audience') || '') }; return sendJson(res, 200, queryMind(role, { scope, text: url.searchParams.get('text') || '' })) } catch (e) { return sendJson(res, 400, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'GET' && route === '/mind/brief') {
          try { const role = String(url.searchParams.get('role') || 'dayu'); const scope = { channel: String(url.searchParams.get('channel') || ''), conversationId: String(url.searchParams.get('conversationId') || ''), audience: String(url.searchParams.get('audience') || '') }; return sendJson(res, 200, { ok: true, brief: buildMindBrief(role, { scope, text: url.searchParams.get('text') || '' }) }) } catch (e) { return sendJson(res, 400, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'GET' && route === '/mind/status') {
          return sendJson(res, 200, { ok: true, files: Object.fromEntries(characterIds().map(role => [role, mindFile(role)])), status: Object.fromEntries(characterIds().map(role => [role, inspectMind(role)])), note: '好奇心/责任心已有本地心念底座；完整读取必须提供角色和会话受众 scope；真实通道接入仍需逐项验收' })
        }
        if (req.method === 'GET' && route === '/sessions/governance') {
          try { return sendJson(res, 200, auditSessions(await listSessionsRpc())) } catch (e) { return sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'POST' && route === '/pool/ensure') {
          if (!requireCap(res, 'pool.ensure', sendJson)) return
          // 养几条待命的：建会话 → 选模型 → 发岗位卡，等派活。
          const body = await readJsonBody(req).catch(() => ({}))
          const want = Math.max(0, Math.min(8, Number(body.n) || 2))
          try {
            if (!dshBaseUrl()) throw new Error('还不知道 DSH 地址，开不了分身（先让宿主收到一次请求）')
            const cwd = workspace()
            const made = []
            const current = liveWorkers(sessionRows(ctx)).filter((w) => !w.running).length
            for (let i = current; i < want; i += 1) {
              const id = await createSessionRpc({ cwd })
              await selectModelRpc({ sessionId: id })
              await promptRpc({ sessionId: id, text: `${handbookBlock('worker')}\n\n【待命】你现在在鱼神的分身池里，等派活；接到简报再动手。` })
              addWorker({ id, name: `分身-${i + 1}` })
              made.push(id)
            }
            return sendJson(res, 200, { ok: true, made, workers: liveWorkers(sessionRows(ctx)) })
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: String(e?.message || e) })
          }
        }
        if (req.method === 'GET' && route === '/growth') {
          try { return sendJson(res, 200, growthStatus()) } catch (e) { return sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'POST' && route === '/growth/adjust') {
          if (!requireCap(res, 'growth.adjust', sendJson)) return
          // 等级可调：老板给/收，或换新世界重置；神格不变。
          const body = await readJsonBody(req).catch(() => ({}))
          try { return sendJson(res, 200, growthAdjust({ level: body.level, xp: body.xp, reason: body.reason })) } catch (e) { return sendJson(res, 400, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'POST' && route === '/sessions/cleanup') {
          if (!requireCap(res, 'session.cleanup', sendJson)) return
          // DSH 不给删会话，只能给空会话打标；真删要等宿主提供接口。
          try {
            const list = await listSessionsRpc()
            const keep = String(nativeSession?.id || readNativeSessionId() || '')
            const renamed = []
            for (const s of list) {
              if (!s.blank || s.running || s.sessionId === keep) continue
              if (s.title.startsWith('[空]')) continue
              try {
                await renameSessionRpc(s.sessionId, `[空] ${s.sessionId.slice(-8)}`)
                renamed.push(s.sessionId)
              } catch { /* 单条失败跳过 */ }
            }
            return sendJson(res, 200, { ok: true, renamed, note: 'DSH 不提供删除，已把空会话标成 [空]' })
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: String(e?.message || e) })
          }
        }
        if (req.method === 'GET' && route === '/authority') {
          return sendJson(res, 200, { ok: true, caps: CAPS, granted: granted() })
        }
        if (req.method === 'POST' && route === '/authority') {
          const body = await readJsonBody(req).catch(() => ({}))
          try { return sendJson(res, 200, setCap(body.cap, Boolean(body.on), body.reason)) } catch (e) { return sendJson(res, 400, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'POST' && route === '/rotate') {
          if (!requireCap(res, 'session.rotate', sendJson)) return
          const body = await readJsonBody(req).catch(() => ({}))
          try {
            return sendJson(res, 200, await rotateNative(String(body?.reason || '手动换班')))
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: String(e?.message || e) })
          }
        }
        if (req.method === 'GET' && route === '/group-chat') {
          const conversationId = String(url.searchParams.get('conversationId') || 'group:fish-god').trim()
          const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 100))
          if (!/^group:[a-z0-9_-]{2,64}$/.test(conversationId)) return sendJson(res, 400, { ok: false, error: 'conversationId 不合法' })
          const messages = []
          for (const role of residentRoles()) {
            try { messages.push(...listConversationEvents({ role, channel: 'workbench', conversationId }, { limit })) } catch { /* 未有该角色事件 */ }
          }
          messages.sort((a, b) => String(a.at).localeCompare(String(b.at)))
          return sendJson(res, 200, { ok: true, group: { id: conversationId, name: '鱼神框架群聊', members: ['老板', ...residentRoles()] }, messages: messages.slice(-limit) })
        }
        if (req.method === 'POST' && route === '/group-chat') {
          const body = await readJsonBody(req)
          const conversationId = String(body.conversationId || 'group:fish-god').trim()
          const text = String(body.text ?? '').trim()
          if (!/^group:[a-z0-9_-]{2,64}$/.test(conversationId)) return sendJson(res, 400, { ok: false, error: 'conversationId 不合法' })
          if (!text) return sendJson(res, 400, { ok: false, error: 'text 不能为空' })
          if (text.length > 4000) return sendJson(res, 400, { ok: false, error: '一次最多 4000 字' })
          const messageId = String(body.messageId || `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
          const refs = Array.isArray(body.refs) ? body.refs.slice(0, 3).filter((r) => r && typeof r.text === 'string' && r.text.trim()).map((r) => `[引用 ${String(r.source ?? '').slice(0, 160)}]\n${r.text.trim().slice(0, 500)}`) : []
          const detected = extractBiliVideo(text)
          let card = null
          if (detected) {
            try {
              const { execFile } = await import('node:child_process')
              const { promisify } = await import('node:util')
              const run = promisify(execFile)
              const out = await run(path.join(workspace(), '..', 'tools', 'bin', 'bili.cmd'), ['video', 'watch', detected.bvid, '--max-chars', '1200'], { timeout: 30000, windowsHide: true })
              const parsed = JSON.parse(String(out.stdout || '{}'))
              if (parsed?.ok) { const data = parsed.data || {}; card = makeBiliCard({ ...detected, title: data.title, owner: data.owner?.name, duration: data.duration, cover: data.pic || data.cover, pubdate: data.pubdate, stat: data.stat }) }
            } catch { card = makeBiliCard(detected) }
          }
          const row = appendConversationEvent({ role: 'dayu', channel: 'workbench', conversationId, direction: 'incoming', messageId, text, kind: card ? 'bilibili-video' : 'text', meta: card ? { card } : null })
          const payload = withCreativeMemory(refs.length ? `${refs.join('\n\n')}\n\n${text}` : text)
          const deliveries = []
          for (const role of residentRoles()) {
            let sessionId = '', pending = null
            try {
              const bodyRole = await ensureRole(role, residenceDeps())
              sessionId = bodyRole.sessionId
              const nonce = `nonce-${Math.random().toString(36).slice(2, 10)}`
              const prompt = `【鱼神框架群聊 ${conversationId}；发言者：老板；消息：${messageId}；群聊关联 ${nonce}】\n这是共享群聊，不是私聊。仅向群里回答本条消息，不转述其他私聊内容。\n${payload}`
              pending = groupReplies.register(sessionId, { conversationId, role, messageId, prompt, nonce })
              // Exact host user/message binds this input to its turn; no session FIFO claims.
              const result = await promptRpc({ sessionId, text: prompt })
              if (result?.ok === false) throw new Error(result.error?.message || JSON.stringify(result.error) || '宿主拒绝投递')
              try { markQueued({ conversationId, messageId, role, sessionId, nonce, via: 'route' }) } catch { /* 账写不了不影响投递 */ }
              deliveries.push({ role, sessionId, status: 'accepted' })
            } catch (error) {
              if (pending) groupReplies.cancel(sessionId, pending)
              deliveries.push({ role, status: 'failed', error: String(error?.message || error) })
            }
          }
          const delivered = deliveries.filter((item) => item.status === 'accepted').length
          return sendJson(res, 200, { ok: true, message: { ...row, label: '老板', status: delivered ? `accepted:${delivered}` : 'failed' }, delivered, deliveries })
        }
        if (req.method === 'GET' && route === '/chat/history') {
          // 面板聊天记录：按角色读她那条常驻会话的最近回合，全文，不截断。
          try {
            const role = String(url.searchParams.get('role') || 'dayu')
            const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 20))
            if (!residentRoles().includes(role)) return sendJson(res, 400, { ok: false, error: `role 只能是 ${residentRoles().join(' / ')}` })
            const state = residenceStatus({ agents: svc(ctx, 'agents') })
            const sessionId = String(state.roles?.[role]?.sessionId || '')
            if (!sessionId) return sendJson(res, 200, { ok: true, role, turns: [] })
            const row = await findSessionRpc(sessionId)
            const turns = (row?.projections?.values?.turnOutline || []).slice(-limit).map((t) => ({ prompt: String(t.prompt || ''), response: String(t.response || ''), at: String(t.at || '') }))
            return sendJson(res, 200, { ok: true, role, sessionId, turns })
          } catch (e) { return sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
        }

        if (req.method === 'GET' && route === '/chat') {
          const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50))
          return sendJson(res, 200, { ok: true, messages: tailInbox(limit) })
        }
        if (req.method === 'POST' && route === '/chat') {
          const body = await readJsonBody(req)
          const text = String(body.text ?? '').trim()
          const targetRole = residentRoles().includes(String(body.role ?? '').trim()) ? String(body.role).trim() : 'dayu'
          if (!text) return sendJson(res, 400, { ok: false, error: 'text 不能为空' })
          if (text.length > 4000) return sendJson(res, 400, { ok: false, error: '一次最多 4000 字' })
          const { category, label } = classify(text)
          const refs = Array.isArray(body.refs)
            ? body.refs.slice(0, 3)
              .filter((r) => r && typeof r.text === 'string' && r.text.trim())
              .map((r) => `[引用 ${String(r.source ?? '').slice(0, 160)}]\n${r.text.trim().slice(0, 500)}`)
            : []
          const payload = withCreativeMemory(refs.length ? `${refs.join('\n\n')}\n\n${text}` : text)
          // 图片：{ image: 'data:image/png;base64,...' }；总台发图时她真的看得见，不是只存个路径。
          const imageMatch = /^data:(image\/(?:png|jpeg|webp|gif));base64,([\s\S]+)$/i.exec(String(body.image || '').trim())
          let image = null
          if (imageMatch) {
            const bytes = Buffer.from(imageMatch[2], 'base64')
            if (bytes.length > 8 * 1024 * 1024) return sendJson(res, 400, { ok: false, error: '图片太大，最多 8MB' })
            image = { type: 'image', mediaType: imageMatch[1].toLowerCase(), data: bytes.toString('base64'), name: String(body.imageName || '').slice(0, 80) || undefined }
          } else if (String(body.image || '').trim()) {
            return sendJson(res, 400, { ok: false, error: '只收 png / jpeg / webp / gif 的 base64 图片' })
          }
          const requestedSession = String(body.sessionId ?? '').trim()
           const requestedRole = requestedSession ? roleForSession(requestedSession) : ''
           if (requestedSession && !requestedRole) return sendJson(res, 400, { ok: false, error: '指定会话不是已绑定角色身体，拒绝跨角色记忆写入' })
          let wanted = requestedSession
          if (!wanted) {
            // 记着的目标会话可能已经关了；活着的才用，否则落到管家总台。
            const stored = readTarget()
            if (stored && liveAgent(ctx, stored)) wanted = stored
          }
          // 没指定会话：交给管家自己的常驻身体（session RPC 建的那条）。
          await maybeAutoRotate()
          const row = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            at: new Date().toISOString(),
            text,
            category,
            label,
            refs: refs.length,
            image: image ? { mediaType: image.mediaType, bytes: Buffer.from(image.data, 'base64').length } : null,
            status: 'queued',
            sessionId: '',
          }
          let reply = `收下了，先分到【${label}】；总台没开起来，暂时只排队。`
          const content = image
            ? [{ type: 'text', text: payload }, image]
            : undefined
          try {
            const deps = residenceDeps()
            const out = wanted
              ? await deliverToRole(targetRole, payload, { ...deps, targetSessionId: wanted, content })
              : await deliverToRole(targetRole, payload, { ...deps, content })
            row.status = 'delivered'
            row.sessionId = out.sessionId
            markPending(awaiting, out.sessionId, row.id)
            reply = `已交给总台（${String(out.sessionId || '').replace(/^session-/, '').slice(0, 8)}）${image ? '，图也一起给她了' : ''}。`
          } catch (error) {
            reply = `投递失败：${error?.message ?? error}；已排队。`
          }
          appendInbox(row)
          const ackKey = String(row.sessionId || 'queued')
          const ackNow = Date.now()
          const ackQuiet = (lastAckAt.get(ackKey) || 0) + 10000 > ackNow
          lastAckAt.set(ackKey, ackNow)
          if (!ackQuiet || row.status !== 'delivered') appendInbox({
            id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            at: row.at,
            text: reply,
            role: 'fish',
            label: '总台',
            status: 'notice',
            sessionId: row.sessionId,
          })
          return sendJson(res, 200, { ok: true, message: row, reply })
        }
        if (req.method === 'GET' && route === '/model') {
          const pref = readModelPref('dayu')
          let groups = []
          let failures = []
          try {
            const llm = svc(ctx, 'llm')
            for (const provider of llm?.listProviders?.() || []) {
              try {
                const models = await llm.listModels(provider.id)
                groups.push({
                  id: provider.id,
                  name: provider.name || provider.id,
                  models: (models || []).map((m) => ({ id: m.id, name: m.name || m.id })),
                })
              } catch (error) {
                failures.push({ id: provider.id, message: String(error?.message || error).slice(0, 120) })
              }
            }
          } catch (error) {
            failures.push({ id: 'llm', message: String(error?.message || error).slice(0, 120) })
          }
          return sendJson(res, 200, { ok: true, current: pref, groups, failures })
        }
        if (req.method === 'POST' && route === '/model') {
          const body = await readJsonBody(req)
          const provider = String(body.provider || '').trim()
          const model = String(body.model || '').trim()
          if (!provider || !model) return sendJson(res, 400, { ok: false, error: 'provider 和 model 都要给' })
          let pref
          try {
            pref = writeModelPref('dayu', { provider, model, reasoningEffort: body.reasoningEffort })
          } catch (error) {
            return sendJson(res, 500, { ok: false, error: `记不下模型偏好：${error?.message ?? error}` })
          }
          // 立刻对当前总台会话生效；会话还没起来就先记着，下次建会话用。
          let applied = false
          let applyError = ''
          try {
            const bodyRow = readResidenceLedger().roles?.dayu || {}
            const sessionId = String(body.sessionId || bodyRow.sessionId || '').trim()
            if (sessionId) {
              await selectModelRpc({ sessionId, provider: pref.provider, model: pref.model, reasoningEffort: pref.reasoningEffort })
              applied = true
            }
          } catch (error) {
            applyError = String(error?.message || error).slice(0, 200)
          }
          return sendJson(res, 200, { ok: true, current: pref, applied, ...(applyError ? { applyError } : {}) })
        }
        if (req.method === 'GET' && route === '/avatar') {
          const who = String(url.searchParams.get('who') || '')
          if (!['dayu', 'xiaoyu'].includes(who)) return sendJson(res, 400, { ok: false, error: 'who 只能是 dayu / xiaoyu' })
          const file = avatarFile(who)
          if (!file) return sendJson(res, 404, { ok: false, error: `没有 ${who} 的形象` })
          const buf = fs.readFileSync(file)
          res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-cache' })
          res.end(buf)
          return
        }
        if (req.method === 'GET' && route === '/overview') {
          return sendJson(res, 200, { ok: true, ...buildOverview(ctx) })
        }
        if (req.method === 'GET' && route === '/treasure') {
          const limit = Math.max(1, Math.min(120, Number(url.searchParams.get('limit')) || 60))
          return sendJson(res, 200, { ok: true, root: TREASURE_ROOT, items: listImages(limit) })
        }
        if (req.method === 'GET' && route === '/treasure-file') {
          const id = String(url.searchParams.get('id') || '')
          const file = safeUnder(TREASURE_ROOT, id)
          if (!file || !fs.existsSync(file)) return sendJson(res, 404, { ok: false, error: 'no such image' })
          const ext = path.extname(file).toLowerCase()
          const type = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
          res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=3600' })
          res.end(fs.readFileSync(file))
          return
        }
        if (req.method === 'GET' && route === '/archives') {
          return sendJson(res, 200, { ok: true, items: listFixes(80) })
        }
        if (req.method === 'GET' && route === '/archive') {
          const id = String(url.searchParams.get('id') || '')
          const file = safeUnder(FIX_ROOT, id)
          if (!file || !fs.existsSync(file)) return sendJson(res, 404, { ok: false, error: 'no such archive' })
          const text = fs.readFileSync(file, 'utf8').slice(0, 200000)
          return sendJson(res, 200, { ok: true, id, text })
        }
        if (req.method === 'GET' && route === '/desk') {
          const overview = buildOverview(ctx)
          const tasks = readTasks()
          return sendJson(res, 200, {
            ok: true,
            onDuty: true,
            groups: groupsCount(),
            todo: tasks.filter((task) => task.status !== 'done').length,
            cost: overview.account.cost,
            budget: readBudget(),
            reports: listReports(100).length,
          })
        }
        if (req.method === 'GET' && route === '/tasks') {
          return sendJson(res, 200, { ok: true, tasks: readTasks() })
        }
        if (req.method === 'GET' && route === '/jobs') {
          const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 20))
          return sendJson(res, 200, { ok: true, jobs: listJobs(limit) })
        }
        if (req.method === 'GET' && route === '/live') {
          return sendJson(res, 200, { ok: true, sessions: liveSessions(url.searchParams.get('limit')) })
        }
        if (req.method === 'GET' && route === '/now') {
          // 悬浮窗用的快照：正在跑 / 做完 / 没做 / 出错 / 重复，各一组；只读。
          return sendJson(res, 200, {
            ...buildNowSnapshot({
              now: Date.now(),
              sessions: liveSessions(60),
              jobs: listJobs(80),
              incidents: listIncidents({ limit: 40 }),
              patches: listPatches(60),
              roleOf: roleForSession,
              q: url.searchParams.get('q') || '',
            }),
            asks: listAsks({ status: 'pending', limit: 8 }),
            // 2026-10-27：把开关一起给前端——以前 /now 不带 switches，
            // 悬浮窗刷新后读不到服务端状态，只能沿用 localStorage 的旧值（关了就一直看不见）。
            switches: readSwitches(),
          })
        }
        if (req.method === 'GET' && route === '/trace') {
          const id = String(url.searchParams.get('id') || '')
          if (!id) return sendJson(res, 400, { ok: false, error: 'id 不能为空' })
          return sendJson(res, 200, { ok: true, id, events: trace(id, url.searchParams.get('limit')) })
        }
        // 全知·会话正文：只读、增量、带审计（见 lib/transcript.js）。
        if (req.method === 'GET' && route === '/transcript') {
          const id = String(url.searchParams.get('id') || '')
          if (!id) return sendJson(res, 400, { ok: false, error: 'id 不能为空' })
          return sendJson(res, 200, transcriptDigest(id, { turns: Number(url.searchParams.get('n') || 20) }))
        }
        if (req.method === 'GET' && route === '/sessions/recent') {
          return sendJson(res, 200, { ok: true, sessions: recentSessions(Number(url.searchParams.get('limit') || 10)) })
        }
        if (req.method === 'GET' && route === '/incidents') {
          const rows = listIncidents({ status: String(url.searchParams.get('status') || ''), limit: url.searchParams.get('limit') })
          return sendJson(res, 200, {
            ok: true,
            // 定向读：这条事故像 DSH 哪一段，顺手标出来（不读代码，只给模块名）。
            incidents: rows.map((row) => ({ ...row, dshModule: suggestModule(`${row.title} ${row.text}`) })),
          })
        }
        if (req.method === 'GET' && route === '/internals/excerpt') {
          const module = String(url.searchParams.get('module') || '')
          const lines = Number(url.searchParams.get('lines') || 80)
          const text = readExcerpt(module, lines)
          return sendJson(res, 200, { ok: Boolean(text), module, text })
        }
        if (req.method === 'POST' && route === '/incident/resolve') {
          if (!requireCap(res, 'incident.resolve', sendJson)) return
          const body = await readJsonBody(req)
          return sendJson(res, 200, { ok: true, incident: resolveIncident(body.id, { status: body.status, note: body.note }) })
        }
        if (req.method === 'POST' && route === '/task') {
          const body = await readJsonBody(req)
          const text = String(body.text ?? '').trim()
          if (!text) return sendJson(res, 400, { ok: false, error: 'text 不能为空' })
          if (text.length > 500) return sendJson(res, 400, { ok: false, error: '一次最多 500 字' })
          const now = new Date().toISOString()
          const task = { id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, text, status: 'todo', createdAt: now, updatedAt: now }
          const tasks = readTasks()
          tasks.unshift(task)
          writeTasks(tasks)
          return sendJson(res, 200, { ok: true, task })
        }
        if (req.method === 'POST' && route === '/task/status') {
          const body = await readJsonBody(req)
          const id = String(body.id ?? '')
          const status = String(body.status ?? '')
          if (!['todo', 'doing', 'done'].includes(status)) return sendJson(res, 400, { ok: false, error: 'status 只能是 todo / doing / done' })
          const tasks = readTasks()
          const task = tasks.find((item) => item.id === id)
          if (!task) return sendJson(res, 404, { ok: false, error: '没有这条待办' })
          task.status = status
          task.updatedAt = new Date().toISOString()
          writeTasks(tasks)
          return sendJson(res, 200, { ok: true, task })
        }
        if (req.method === 'GET' && route === '/reports') {
          return sendJson(res, 200, { ok: true, items: listReports(80) })
        }
        if (req.method === 'GET' && route === '/report') {
          const id = String(url.searchParams.get('id') || '')
          const file = safeUnder(REPORTS_DIR, id)
          if (!file || !fs.existsSync(file)) return sendJson(res, 404, { ok: false, error: 'no such report' })
          return sendJson(res, 200, { ok: true, id, text: fs.readFileSync(file, 'utf8').slice(0, 200000) })
        }
        if (req.method === 'POST' && route === '/session') {
          try {
            const result = await ensureNativeSession()
            return sendJson(res, 200, { ok: true, ...result })
          } catch (error) {
            return sendJson(res, 500, { ok: false, error: error?.message ?? String(error) })
          }
        }
        if (req.method === 'GET' && route === '/search') {
          const q = String(url.searchParams.get('q') ?? '').trim()
          if (!q) return sendJson(res, 400, { ok: false, error: 'q 不能为空' })
          const limit = Math.max(1, Math.min(30, Number(url.searchParams.get('limit')) || 10))
          let hits = []
          try { hits = searchAll(q, { limit, deep: url.searchParams.get('deep') === '1' }) } catch (error) {
            return sendJson(res, 500, { ok: false, error: error?.message ?? String(error) })
          }
          return sendJson(res, 200, { ok: true, q, hits })
        }
        if (req.method === 'GET' && route === '/sessions') {
          return sendJson(res, 200, { ok: true, sessions: sessionRows(ctx), target: readTarget() })
        }
        if (req.method === 'GET' && route === '/target') {
          return sendJson(res, 200, { ok: true, target: readTarget() })
        }
        if (req.method === 'POST' && route === '/target') {
          const body = await readJsonBody(req)
          return sendJson(res, 200, { ok: true, target: writeTarget(body.sessionId) })
        }
        if (req.method === 'GET' && route === '/switches') {
          return sendJson(res, 200, { ok: true, switches: readSwitches() })
        }
        if (req.method === 'POST' && route === '/switches') {
          const body = await readJsonBody(req)
          const switches = writeSwitches(body)
          return sendJson(res, 200, { ok: true, switches, restart: true })
        }
        return sendJson(res, 404, { ok: false, error: `unknown ${req.method} ${route}` })
      } catch (error) {
        return sendJson(res, 500, { ok: false, error: error?.message ?? String(error) })
      }
    },
  }), 'yushen: /api/dayu')

  // 投出去的活，回话要能回到总台：只认“刚投过、还没回”的那个会话。
  if (typeof ctx.on === 'function') {
    ctx.effect(() => ctx.on('session/event', (session, event) => {
      try {
        const text = textOfEvent(event)
        recordEvent(session, event, text)
        const groupSessionId = String(session?.header?.id ?? session?.id ?? '')
        const isGroupReply = groupReplies.event(groupSessionId, event, text)
        // 即时记录：本机会话里的对话先落盘；崩溃最多丢正在写的一行。
        try {
          const sid = String(session?.header?.id ?? session?.id ?? '')
          const cwd = String(session?.meta?.cwd ?? session?.header?.cwd ?? '')
          const source = sourceOf({ id: sid, cwd })
          const type = String(event?.type || '')
          const isMsg = type === 'user/message' || type === 'assistant/message'
          // 只有她自己的那具身体，才把话署成「她」。员工会话（干活那条）说的话是它的
          // 会话日志，不是她的经历——以前不判 role，一条干活会话被记了 53 条「她说」的话。
          const role = roleForSession(sid)
          const who = attributionOf({ role, isUser: type.startsWith('user'), source })
          if (who && isMsg && text && !/^Current runtime context|^Time sampled while preparing/.test(text)) {
            capture(text, { sessionId: sid, role, source: who })
          }
        } catch { /* 记录失败不影响会话 */ }
        if (/error|fail/i.test(String(event?.type || ''))) {
          const sid = String(session?.header?.id ?? session?.id ?? '')
          const title = String(session?.header?.title ?? session?.meta?.title ?? '')
          const cwd = String(session?.meta?.cwd ?? session?.header?.cwd ?? '')
          noteIncident({ sessionId: sid, title, source: sourceOf({ id: sid, cwd }), text: text || String(event?.type || 'error') })
        }
        // 记下「这一轮动过工具」，回合结束时据此判断值不值得立刻补一份备份。
        try {
          const sidT = String(session?.header?.id ?? session?.id ?? '')
          if (sidT && String(event?.type || '').startsWith('tool/')) turnTouched.set(sidT, true)
        } catch { /* 记不下不挡回话 */ }
        if (event?.type !== 'assistant/message') return
        const sessionId = String(session?.header?.id ?? session?.id ?? '')
        if (!sessionId) return
        if (!text) return
        noteDispatchReply(sessionId, text)
        // 实时备份：她判断值不值得现在备一份（定时的 10 分钟那套还在兜底）。
        // 不花 token；未变的话备份服务自己会跳过，不会白占磁盘。
        try {
          const touched = turnTouched.get(sessionId) === true
          turnTouched.delete(sessionId)
          void maybeBackup({ run: runProtectedBackup, reason: 'turn-end', text, wroteFiles: touched })
        } catch { /* 判断失败不影响回话 */ }
        // 记忆回写：她在工作台说的话，按人记进她自己那一份。
        // 先认这句是不是某一轮投出去的回复（按投递时间认，投递前发出的那句不算），认到了才定通道。
        const role = roleForSession(sessionId)
        const eventAt = Number(event?.time) || 0
        const freeWho = takePending(pendingFree, sessionId, eventAt)
        if (role) {
          try { appendEvent(role, { channel: freeWho ? '自由时间' : '工作台', kind: 'say', text, source: sessionId }) } catch { /* 记忆写不了不影响回话 */ }
        }
        // 两难的回复：原样留一条"纠结记录"，供以后复盘。
        const dilemmaWho = takePending(pendingDilemma, sessionId, eventAt)
        if (dilemmaWho) {
          try { recordThought({ role: dilemmaWho, text, sessionId }) } catch { /* 记不下不影响回话 */ }
        }
        // 自由时间的回复：她做了什么，进流水和她自己的记忆。
        if (freeWho) {
          try { capture(text, { sessionId, role: freeWho, source: '自由时间' }) } catch { /* 忽略 */ }
        }
        if (isGroupReply) return
        // 同 pendingFree：投递前就发出的那句不算这次的回复（先看后认领，太短的不认领也不丢）。
        if (!peekPending(awaiting, sessionId, eventAt)) return
        // C) 太短的多半是半句/纯标点（多步消息），先不认领，等她把整句说完。
        if (String(text).trim().length < 4) return
        takePending(awaiting, sessionId, eventAt)
        appendInbox({
          id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          at: new Date().toISOString(),
          text,
          role: 'fish',
          label: '回复',
          status: 'reply',
          sessionId,
        })      } catch { /* 不能让总台的异常影响别的订阅者 */ }
    }, { global: true }))
  }

  log('管家入口已加载（M0）')
}
