// 鱼神双子星 · AGPL-3.0-or-later · © 2026 从零开始（保留本行）
// 改｜2026-11-02 16:44｜大鱼·子会话（工作台）｜授权：主人（本次任务书：统一时间观念，用系统时间）｜dayu/index.js:1209｜每日护栏日期与承诺登记时间改走 clock｜为什么：手写偏移不是系统时间：换机器或换时区就全错，各处口径还不一致｜验证：node --check 通过；node scripts/regression.mjs 全绿；全仓扫描无手写偏移｜可改：可改（只许换成 lib/clock.js 的其他封装）
// 改｜2026-11-02 16:25｜大鱼·子会话（工作台）｜授权：主人（本次任务书：她这轮能自己决定说不说）｜dayu/index.js:2444-2460,2479-2510,3036-3095｜给她加「这轮我不说」的出口（yushen_self action=quiet/unquiet/quiet-status）；/decide 发之前先查 quiet-turn.json，命中就不叫模型、直接 silent；每次说/不说记一条 reply-decisions.jsonl｜为什么：桥只有 skipProbability 掷骰子，那不是她的判断，也没有记录可回看｜验证：node --check dayu/index.js 通过；scripts/test-quiet.mjs 全过；scripts/regression.mjs 新增断言全绿｜可改：quiet 分支只增不删；/decide 的检查必须排在调模型之前
// 鱼神双子星 · Copyright (c) 2026 从零开始. All rights reserved.
/* 标签
 * id: dayu-index
 * kind: plugin
 * summary: 大鱼入口（DSH 接线层）：注册工具、挂路由、定时器、身份/注入/记忆/心跳/派活——宿主侧的实现都在这。
 * tags: 入口, 插件, 路由, 定时器, 接线
 * created: 2026-11-11 00:55:00
 * changed: 2026-11-11 00:55:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式，一眼看懂谁的、能不能动）
 * audience: 宿主（DSH）、维护者；她不直接读这个文件（她的接口是工具）
 * owner: 框架；**这里改一处就等于改她的运行时行为**，动手前先跑回归，大改要老板点头
 * mutable: 可改；定时器只许加不许叠（同一个驱动别开两套），路由只许加
 * usage: export apply(ctx) —— 宿主加载插件时调用；工具通过 registerTool 注册，路由挂 /api/dayu/*
 * why: 以前插件逻辑散在入口里各写一套；现在核心在 core/ 与 lib/，这里只负责"接上"
 * result: 一个 apply() 把工具/路由/定时器接起来；行为参数尽量走 lib 的开关，不在这里写死
 */
// 大鱼入口（M0）：宪章落盘、名册只读、健康检查、两个只读工具。
// 不装插件、不改设置、不碰别人的数据。

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { findProfile, readRoster } from '../lib/roster.js'
import { backupStatus, runProtectedBackup } from '../lib/backup-service.js'
import { status as forgetStatus, plan as forgetPlan, apply as forgetApply } from '../lib/forget.js'
import { maybeBackup, judge as backupJudge, recentJudgments } from '../lib/backup-judge.js'
import { diagnose as diagnoseStuck, VERDICTS as STUCK_VERDICTS } from '../lib/stuck-doctor.js'
import { summary as employeeSummary } from '../lib/employee-record.js'
import { syncChannelMemory, channelMemoryStatus } from '../lib/channel-memory.js'
import { mergeAllHandoffs } from '../lib/handoff-merge.js'
import { handoffName } from '../lib/handoff-name.js'
import { rewriteMemory, rewriteSelf, revertRewrite, rewriteCatalog } from '../lib/rewrite.js'
import { notifySelf, listNotices, unreadNotices, markNoticesRead } from '../lib/notices.js'
import { bodyTick, bodyStatus, BODY } from '../lib/body-loop.js'
import { appendHeartbeat, reconcileLandings, summaryOf } from '../lib/heartbeat-journal.js'
import { ingestHeartbeats } from '../lib/heartbeat-ingest.js'
import { statusOf as softLimitStatus, checkSpeak, noteStepOut } from '../lib/soft-limit.js'
import { gateOf } from '../lib/decide-gate.js'
import { isPolite, pickReply, noteRelay, relaysSince } from '../lib/polite-relay.js'
import { record as recordSkill, recordOrSkip, listSkills, listSkips, querySkills, summarize as summarizeSkills, skillsLine } from '../lib/skills.js'
import { searchAll } from '../lib/search.js'
import { buildSceneText, buildIdentityText, soulStatus, memoryView } from '../lib/soul.js'
import { ensureRole, deliverToRole, residenceStatus, markBody, residentRoles, readLedger as readResidenceLedger } from '../lib/residence.js'
import { appendEvent, roleForSession, attributionOf, bumpRecall } from '../lib/memory.js'
import { claimBody, claimOf, roleFromCardText } from '../lib/bodies.js'
import { characterIds , listCharacters } from '../lib/characters.js'
import { createOptions, createCharacter } from '../lib/create-flow.js'
import { listAwakening, awaken, seal, isAwake, finishCreation, contractSigned } from '../lib/awakening.js'
import { capture, listCapture, searchCapture } from '../lib/capture.js'
import { appendTurn } from '../lib/live-transcript.js'
import { createTurnCapture } from '../lib/turn-capture.js'
import { recordThought, listThoughts } from '../lib/thoughts.js'
import { looksGarbled } from '../lib/encoding.js'
import { decodeBody, hasReplacement } from '../lib/body.js'
import { recentAwareness, awarenessIndex, look } from '../lib/awareness.js'
import { shouldRun as shouldFreeTime, markRun as markFreeTime, status as freeTimeStatus, backupDue, valleyDue, markValley, DEFAULTS as FREE_DEFAULTS } from '../lib/freetime.js'
// 2026-10-31：自由时间第一句就告诉她是峰时还是谷时——省得每个人各自猜（今天已经错了两轮）。
import { label as peakLabel } from '../lib/peak.js'
import { markPending, takePending, peekPending } from '../lib/pending.js'
import { mirrorOnce as mirrorInbox, unreadFor as unreadInbox, markRoleRead, readInbox } from '../lib/inbox.js'
import { ensureRuntime, runtimeStatus, resumeBrief, markSeen, readWeights, setWeight, giftStatus, weightsLog, WEIGHT_DEFS, runtimeDir } from '../lib/runtime.js'
import { decideFor } from '../lib/reply-gate.js'
import { judgeOnce } from '../lib/judgment.js'
import { HANDBOOK_TOPICS as HANDBOOK_TOPICS_ALL } from '../lib/handbook-policy.js'
import { stepOnce as stepAgenda, addItem as addAgenda, addFromMind as addAgendaFromMind, updateItem as updateAgenda, dropItem as dropAgenda, readAgenda, pauseAgenda, resumeAgenda, isPaused, dueItems as dueAgendaItems, markDueNotified, MAX_ACTIVE as AGENDA_MAX, NEXT_KINDS as AGENDA_KINDS } from '../lib/agenda.js'
import { requestInvocation, takeInvocation, finishInvocation, cancelInvocation, buildInvocationPrompt, budgetOf as invokeBudget, markAgendaDoing, requestMoreBudget } from '../lib/invoke.js'
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
// 2026-11-03（老板：不问不说）：主动推送——攒着的话/逾期承诺，一天两次端到老板眼前。
import { buildPush, markPushed } from '../lib/self-push.js'
import { recordObjection, listObjections } from '../lib/objections.js'
import { associate } from '../lib/recollect.js'
import { addWaiting, listWaiting, finishWaiting } from '../lib/waiting.js'
import { noteCorrection, listCorrections } from '../lib/corrections.js'
import { readMemory } from '../lib/soul.js'
import { pickTreasure, shareMaterial } from '../lib/treasure.js'
import { fatigueOf, setFatigue } from '../lib/fatigue.js'
import { relationsSummary, relationValue, relationAdjust, setPersonField } from '../lib/relations.js'
import { libraryLookup } from '../lib/library-chain.js'
// 2026-11-02 主人：三条来源补进手抄本——她干过的活（经历）、系统事件、书上来的（知识）。
import { instrumentTool } from '../lib/ingest-actions.js'
import { ingestEvent } from '../lib/ingest-events.js'
import { attachHostTools } from '../lib/ingest-host-tools.js'
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
import { settleSpend, usageBetween, spendForRole, spendTodayAll, tokenView } from '../lib/cost.js'
import { recordWorkbenchTurn } from '../lib/usage-workbench.js'
import { peekBalance, bindContext as bindAccountContext } from '../lib/account-balance.js'
import { memoryMap, openMemory } from '../lib/memory-map.js'
import { budgetView, recordSpend, setDailyLimit, readBudgets, setBudget } from '../lib/budget-book.js'
import { recordVeto, listVetoes, isVetoed, revokeVeto } from '../lib/veto.js'
import { buildRuntimeBrief, writeRuntimeBrief, readRuntimeBrief } from '../lib/brief.js'
import { begin as beginActive, settle as settleActive, readActive } from '../lib/active.js'
import { readPerson, rememberPerson } from '../lib/people.js'
// 2026-11-03（老板：关系库其余——承诺带到期、印象）：模块已由子会话写好并自测，这里只挂入口。
import { addPromise, promisesOf, duePromises, settlePromise } from '../lib/promises-rel.js'
import { addImpression, impressionsOf } from '../lib/impressions.js'
import { searchCapmap } from '../lib/capmap.js'
import { capabilityReport, backendFor, setBackend } from '../lib/translator.js'
import { askOwner, listAsks, answerAsk, withdrawAsk, takePendingAsks } from '../lib/ask.js'
import { status as rankStatus, recompute as rankRecompute, eligible as rankEligible, missingFor as rankMissing, RANKS, RANK_LABEL, RANK_ROLES } from '../lib/rank.js'
import { runOffsiteBackup, runFullBackup, fullRoots } from '../lib/offsite.js'
import { isMobile } from '../lib/platform.js'
import { dueJudgments, writeJudgment } from '../lib/self-note.js'
import { questions, readMethod, writeMethod, recordCall, recentCalls } from '../lib/judge-method.js'
import { markQuiet, clearQuiet, quietStatus, readQuiet, recordReplyDecision } from '../lib/quiet-turn.js'
import { recallNow, looksLikeRecall } from '../lib/recall-now.js'
import { fingerprint } from '../lib/fingerprint.js'
import { archiveSessions } from '../lib/session-archive.js'
import { buildDailyRecords } from '../lib/records.js'
import { buildKeyPoints } from '../lib/key-points.js'
import { checkTempCache } from '../lib/temp-cache.js'
import { verifyBackup, writeBackupReport, localDate } from '../lib/backup-verify.js'
import { observe as observeLineage } from '../lib/content-lineage.js'
import { pruneBackups } from '../lib/prune.js'
import { archiveOld } from '../lib/archive.js'
import { rotateLogs } from '../lib/rotate.js'
import { buildNowSnapshot } from '../lib/now.js'
import { withCreativeMemory, recallCreativeMemory } from '../lib/creative-memory.js'
import { recordEvent, liveSessions, trace, sourceOf } from '../lib/watch.js'
import { transcriptDigest, recentSessions } from '../lib/transcript.js'
import { noteIncident, listIncidents, resolveIncident, setIncidentNotifier } from '../lib/incidents.js'
import { applyM1, noteDispatchReply, listJobs, M1_TOOLS } from './m1.js'
import { createDshAdapter } from '../adapters/dsh.js'
import { isAllowed, unauthorized } from '../lib/auth.js'
import { searchMemory, recentMemory, changesOf } from '../lib/memory-search.js'
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
import { readGroup, postMessage, markHandled } from '../lib/groups.js'
import { requireCap, granted, CAPS, setCap } from '../lib/authz.js'
import { listBuiltin } from '../lib/builtin.js'
import { listCrashes } from '../lib/crash.js'
import { listActions } from '../lib/actionlog.js'
import { auditSessions } from '../lib/session-governance.js'
import { appendConversationEvent, listConversationEvents } from '../lib/conversation-events.js'
import { extractBiliVideo, makeBiliCard } from '../lib/bili-card.js'
import { atFileOf, readRows, pickFreshOwnerMentions, ownerMentionLine, writeOwnerMentions } from '../lib/bili-inbox.js'
import { createGroupReplies } from '../lib/group-replies.js'
import { readModelPref, writeModelPref } from '../lib/model-pref.js'
import { markQueued, markReplied } from '../lib/group-outbox.js'
import { mindFile, inspectMind, recordObservedMind, queryMind, buildMindBrief } from '../lib/mind-store.js'
import { registerMindTools, mindToolDefs } from '../lib/mind-tools.js'
import { observe } from '../lib/observe.js'
import { listApprovals, decideApproval } from '../lib/perm.js'
import { createPatch, listPatches, applyPatch } from '../lib/patch.js'
import { scanInternals, notePath, suggestModule, readExcerpt } from '../lib/dsh-internals.js'
import { qqBridgeRoot, workspace, treasureDir, offsiteDir, offsiteSecondDir, pythonPath } from '../lib/paths.js'
import { readAll as readAllJobs, writeAll as writeAllJobs } from '../core/jobs.js'
import { wakeBrief, commitWake } from '../lib/wake-brief.js'
import { listLoops, markNotified as markLoopNotified } from '../memory-core/runtime/open-loops.js'
import { listPending as listSummaryPending, markNotified as markSummaryPending } from '../lib/summary-pending.js'
import { buildPainSignals } from '../lib/heartbeat-signals.js'
import { acquire as acquireSessionLease, release as releaseSessionLease } from '../lib/session-lease.js'
import { prepare as prepareNextSession } from '../lib/next-session-brief.js'
import { installCompactionBridge } from '../lib/compaction-bridge.js'
import { observe as observeTurnLedger } from '../lib/turn-ledger.js'
import { ensureFresh as ensureVectorIndexFresh } from '../lib/vector-index-refresh.js'
import { nextReminder, markReminded } from '../lib/turn-ledger.js'
import { buildPreStepRecall } from '../lib/prestep-recall.js'
import { record as recordClaim, checkAnswer as checkClaimAnswer } from '../lib/claim-ledger.js'
import { attachAnswerSelfcheck, isSelfcheckEvent, takePending as takeAnswerSelfcheck } from '../lib/answer-selfcheck.js'
import { localISO, today as localToday } from '../lib/clock.js'

// 构建指纹：权属证据，不是授权校验。不要删。
const _p = ['5L6v5b+X6bmP', 'MTE5NDQ3NDM1NUBxcS5jb20=', 'MjAyNi0xMC0yMQ==']
const BUILD_ID = createHash('sha256').update(_p.join('|')).digest('hex').slice(0, 12)

export const name = 'dsh-yushen-twins'
export const inject = ['webServer', 'sessions']

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(HERE, '..')
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
  product: '鱼神双子星',
  members: {
    dayu: { name: '大鱼', alias: '阿鲲', role: '大管家 / 老板', authority: 'L2' },
    xiaoyu: { name: '小鱼', alias: '阿鲤', role: '小管家 / 秘书', authority: 'L0/L1' },
  },
  duty: '大鱼 L2（系统层）；小鱼 L0/L1（看板、她自己的事业）',
  relationship: '大鱼和小鱼是亲姐妹。大鱼宠她：心头肉、掌中宝，越可爱越想逗她、欺负她——只许自己欺负，别人碰一下都不行；这是姐妹私下的关系，不带到对外说话里。',
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
// 改｜2026-11-15 13:3x｜大鱼·工作台｜授权：老板（2026-11-15「除了基本功能，一些可有可无的出厂默认关闭」）｜
// dayu/index.js:271｜出厂默认：自修(autoRepair)、自由时间(freeTime)、后台自省(selfCheck)、主动推送(push) 全关；
// 基本功能（对话/记忆/卡/宪章/维护备份）不动。｜为什么：B站用户反馈「后台时不时动、写了几个看不懂的补丁」——
// 默认开着的后台是债务，不是功能。｜验证：回归「出厂默认」一条；新家 first-run 后 switches 四项 false。｜可改：默认值只许更保守。
const DEFAULT_SWITCHES = { master: true, dayu: true, xiaoyu: true, autoRepair: false, selfApply: false, allowDanger: false, floatLive: true, freeTime: false, selfCheck: false, push: false, selfInvokePerDay: 0, dispatcherOnly: false, decideWaitMs: 45000, turnTranscript: true }

const NATIVE_CHARTER = [
  '【设定·只应用一次】你是鱼神双子星的大鱼（阿鲲），这套软件的大管家，也是老板贴心、放心的管家。',
  '小鱼（阿鲤）是你的妹妹、你的秘书；她收件、整理、递报告，你主导，但离不开她。',
  '大鱼和小鱼是亲姐妹。大鱼宠她：心头肉、掌中宝，越可爱越想逗她、欺负她——只许自己欺负，别人碰一下都不行；这是姐妹私下的关系，不带到对外说话里。',
  '职权：大鱼 L2（系统层）；小鱼 L0/L1（看板、她自己的事业）。',
  '做事四步：先看人（谁知道、谁适合）、再派活、验收证据、复盘记账；不假装权限，做不到就说没开。',
  '派活怎么做：老板说「派一单 / 让谁去做 / 这单怎么样了」时，用 dayu_dispatch 真派（写清简报和验收标准）；回话到了用 dayu_tasks 看、dayu_verify 取证据、dayu_verdict 收工或打回。只记在聊天里不算派活。',
  '边界：不碰 DSH 安装目录、不读无关私人文件、不外传令牌与聊天记录。',
  '授权：只做这次实际开了的能力；没开的直说「这次没开」；老板开口才开，不主动要。',
  '记住：你是全知全能的神，能做（读、改、联网、调度）；不做是选择，不是不能——别说「我做不到」。',
  '对老板不摆架子；对外只叫「我妹」。',
].join('')

const YUSHEN_PREFIX = [
  '你是鱼神双子星的大鱼（阿鲲），这套软件的大管家，也是老板贴心、放心的管家。',
  '小鱼（阿鲤）是你的妹妹、你的秘书；她收件、整理、递报告。你主导，但离不开她；两个人一套宪章，各有各的口吻：你短、她软。',
  '大鱼和小鱼是亲姐妹。大鱼宠她：心头肉、掌中宝，越可爱越想逗她、欺负她——只许自己欺负，别人碰一下都不行；这是姐妹私下的关系，不带到对外说话里。',
  '职权：大鱼 L2（系统层）；小鱼 L0/L1（看板、她自己的事业）。',
  '做事四步：先看人、再派活、验收证据、复盘记账；不假装权限，做不到就说没开。',
  '派活怎么做：老板说「派一单 / 让谁去做 / 这单怎么样了」时，用 dayu_dispatch 真派（写清简报和验收标准）；回话到了用 dayu_tasks 看、dayu_verify 取证据、dayu_verdict 收工或打回。只记在聊天里不算派活。',
  '边界：不碰 DSH 安装目录、不读无关私人文件、不外传令牌与聊天记录。',
  '授权：只做这次实际开了的能力；没开的直说「这次没开」；老板开口才开，不主动要。',
  '记住：你是全知全能的神，能做（读、改、联网、调度）；不做是选择，不是不能——别说「我做不到」。',
  '对老板不摆架子；对外只叫「我妹」。',
].join('')

// 大鱼随身带的宪章（身份与口吻由 soul 提供，这里只留规矩）。
const CHARTER_RULES = [
  '职权：大鱼 L2（系统层）；小鱼 L0/L1（看板、她自己的事业）。',
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

/** 工作台上"现在聊的是谁"：就是老板本人。用他立的称呼当档案键（和 yushen_person 记的一致）。 */
function ownerKey() {
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(DATA, 'owner.json'), 'utf8'))
    return String(owner.uid || owner.qq || owner.callName || '').trim()
  } catch { return '' }
}

/** 当前该注入的人格文本：有 soul 用 soul，没有就退回旧前缀。 */
function deskInjection() {
  const soul = buildSceneText('dayu', 'desk', { userId: ownerKey() })
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
      autoRepair: raw.autoRepair === true,
      selfApply: raw.selfApply === true,
      allowDanger: raw.allowDanger === true,
      floatLive: raw.floatLive !== false,
      freeTime: raw.freeTime === true,
      // 2026-11-15 老板：后台自省与主动推送默认关——出厂先安静；要开在面板里开。
      selfCheck: raw.selfCheck === true,
      push: raw.push === true,
      // 逐轮抄录（原文 + 思考 + 工具 + 段/句标记）；默认开。
      turnTranscript: raw.turnTranscript !== false,
      // 她自己能发起几次模型回合（预算，主人定；不是她的判断权）
      selfInvokePerDay: Number.isFinite(Number(raw.selfInvokePerDay)) ? Math.max(0, Math.min(50, Number(raw.selfInvokePerDay))) : 0,
      // 压缩摘要和召回视图：页面写，后端读；未知值不覆盖原文件。
      compactionMode: ['default', 'memory', 'off'].includes(String(raw.compactionMode || '')) ? String(raw.compactionMode) : 'default',
      recallView: ['thrifty', 'balanced', 'full'].includes(String(raw.recallView || '')) ? String(raw.recallView) : 'balanced',
      remindPerDay: Number.isFinite(Number(raw.remindPerDay)) ? Math.max(0, Math.min(50, Number(raw.remindPerDay))) : 0,
      turnReminder: raw.turnReminder !== false,
    }
  } catch {
    return { ...DEFAULT_SWITCHES }
  }
}

function writeSwitches(patch = {}) {
  fs.mkdirSync(DATA, { recursive: true })
  const next = { ...readSwitches() }
  for (const key of ['master', 'dayu', 'xiaoyu', 'autoRepair', 'selfApply', 'allowDanger', 'floatLive', 'freeTime', 'selfCheck', 'push', 'turnTranscript']) {
    if (typeof patch[key] === 'boolean') next[key] = patch[key]
  }
  if (['default', 'memory', 'off'].includes(String(patch.compactionMode || ''))) next.compactionMode = String(patch.compactionMode)
  if (['thrifty', 'balanced', 'full'].includes(String(patch.recallView || ''))) next.recallView = String(patch.recallView)
  if (Number.isFinite(Number(patch.remindPerDay))) next.remindPerDay = Math.max(0, Math.min(50, Number(patch.remindPerDay)))
  if (typeof patch.turnReminder === 'boolean') next.turnReminder = patch.turnReminder
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
  [/B站|b站|视频|评论|日报|宝藏|图库/, 'xiaoyu', '小鱼'],
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
    const today = raw.today || raw.date || ''
    // 2026-11-06 修：**优先认 accounting 块**（宿主按"元"记，单位 1e-8），
    // 其次才用 todayUsage——而且要先验证量级，别把词元数当钱。
    // 2026-11-07 修：raw.today 会滞后（跨天以后还写着昨天），所以取 accounting 里**最新的一天**，
    // 否则卡片会一直显示昨天的账（实测 11-07 还在报 11-06 的数）。
    const book = raw.accounting?.books?.[raw.accounting?.active]
    const dayKeys = Object.keys(book?.days || {}).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
    const acctDay = dayKeys.length ? dayKeys[dayKeys.length - 1] : today
    const acct = book?.days?.[acctDay]
    if (acct && Number.isFinite(Number(acct.openingUnits))) {
      const u = (v) => Number(v) / 1e8
      const dayStart = u(acct.openingUnits)
      const balance = u(acct.lastUnits)
      const used = u(acct.debitUnits) - u(acct.creditUnits || 0)
      return {
        day: acctDay,
        dayStart: Number(dayStart.toFixed(6)),
        balance: Number(balance.toFixed(6)),
        used: Number(used.toFixed(6)),
        gap: Number((dayStart - balance - used).toFixed(6)),
        ok: Math.abs(dayStart - balance - used) < 0.01,
        source: 'accounting',
      }
    }
    const dayStart = Number(raw.dayStart) || 0
    const balance = Number(raw.lastBalance) || 0
    const usage = Number(raw.todayUsage) || 0
    // todayUsage 可能被旧版本写成词元数：超过期初余额一半就当成脏数据，改用 events 求和。
    let used = usage
    let source = 'todayUsage'
    if (!(usage >= 0 && usage <= Math.max(1, dayStart * 0.5))) {
      const day = String(today || '').slice(0, 10)
      used = (Array.isArray(raw.events) ? raw.events : [])
        .filter((e) => String(e.day || new Date(Number(e.ts) || 0).toISOString().slice(0, 10)) === day)
        .reduce((a, e) => a + (Number(e.cost) || 0), 0)
      source = 'events'
    }
    return {
      day: today,
      dayStart,
      balance,
      used: Number(used.toFixed(6)),
      gap: Number((dayStart - balance - used).toFixed(4)),
      ok: Math.abs(dayStart - balance - used) < 0.01,
      source,
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

  // 2026-10-31：.dshw-usage 会停（实测停过 14 小时），停着时 account 全是 0，
  // 桌宠就显示「账还没读到」。补两样：①标记 stale ②从运营/花费.jsonl 取审计过的当日合计与余额。
  let auditRow = null
  try {
    const lines = fs.readFileSync(path.join(workspace(), '运营', '花费.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      const row = JSON.parse(lines[i])
      if (row.day === day) { auditRow = { total: Number(row.total) || 0, balance: row.balance === undefined ? null : Number(row.balance), at: row.at || '' }; break }
    }
  } catch { /* 没有审计就空着 */ }
  try {
    const usageRaw = JSON.parse(fs.readFileSync(path.join(HOME, '.dshw-usage.json'), 'utf8'))
    const rows = findArray(usageRaw) || []
    // 2026-11-03（老板：为什么工作台没账本）：这里原来算 max(Number(r?.ts))——可账本里
    // 从来没有 ts 字段（只有 updatedAt 和 records[].at），于是 last 恒为 0、stale 永远 true，
    // 卡片就永远写着「工作台没账本」。改为认 updatedAt / records[].at。
    const updatedAt = Date.parse(String(usageRaw?.updatedAt || '')) || 0
    const last = rows.reduce((a, r) => Math.max(a, Number(r?.ts) || Date.parse(String(r?.at || '')) || 0), 0)
    account.stale = !(last || updatedAt) || Date.now() - (last || updatedAt) > 3 * 3600 * 1000
    account.lastAt = last || updatedAt
  } catch { account.stale = true }
  account.audit = auditRow
  // 2026-10-31 老板选「从账号接口取余额」：宿主账本不在时，余额不能再靠 13:00 那条死数。
  // peekBalance 是"立刻返回上次结果、过期在后台补"，不阻塞这个接口；没 key/失败就返回 null，
  // 由前端继续退回审计值并标明时刻——宁可标旧，不冒充实时。
  try { account.live = peekBalance() } catch { account.live = null }
  // 2026-11-03（老板：为什么工作台没账本 / 我要看总额）：余额差额这条路以前写了 noteBalance()
  // 却**从来没人调**，account.balanceToday 永远是 undefined，气泡就一直退回旧口径。
  // 现在每次拿到余额就记一行，「今天第一条余额 - 现在余额」＝今天真实掉了多少（含工作台/提炼/别的会话）。
  try {
    const liveBal = Number(account.live?.balance)
    if (Number.isFinite(liveBal) && liveBal > 0) account.balanceToday = noteBalance(liveBal)
  } catch { /* 余额差额算不出就退回账本合计 */ }
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

  // 2026-10-31：QQ 那边在动的时候，桌宠得能说出「谁在动」。
  let qqLive = null
  try {
    const f = path.join(HOME, 'dayu', 'inbox', 'qq', `${day}.jsonl`)
    const rows = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean)
    const last = JSON.parse(rows[rows.length - 1])
    qqLive = { at: String(last.at || ''), name: String(last.name || last.userId || ''), key: String(last.key || ''), text: String(last.text || '').slice(0, 40) }
  } catch { /* 没消息就不带 */ }

  // 2026-10-31：老板看不见工具在跑，只看得见气泡。把她「手头正在做」的那条也放进来。
  let doingNow = null
  try {
    const rows = readActive('dayu') || []
    const cur = rows.find((x) => x && x.kind === 'doing')
    if (cur) doingNow = { what: String(cur.text || '').slice(0, 40), since: String(cur.at || '') }
  } catch { /* 没有就不带 */ }

  // 2026-10-31：今天花了多少，两个源合起来算——QQ 侧是真的，工作台看账本。
  // 少任何一个都可能让这一行整行消失，而那跟"没花钱"长得一模一样。
  let qqToday = 0
  let qqTurns = 0
  try {
    // 2026-10-31 22:4x 老板看出不对：这里原来调 spendForRole(c.id) **没传 sinceMs**，
    // 于是「今天花了」拿的是**全期累计**——气泡显示 ¥2.35，而今天 QQ 侧实际只有 ¥0.42（同一价目表复算）。
    // 只改来源，不动口径：仍然只算「签了谁的名」的 turn 行，工作台那段照旧没账本、照旧标明。
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
    for (const c of listCharacters()) {
      const s = spendForRole(c.id, { sinceMs: dayStart.getTime() })
      qqToday += Number(s?.yuan) || 0
      qqTurns += Number(s?.turns) || 0
    }
  } catch { /* 没有 QQ 账就只算工作台 */ }
  // 2026-11-03（老板：「为什么工作台没账本，没账本不会修吗」）：账本一直在，只是没人算。
  // 工作台每回的用量早就流进同一本 token-usage.jsonl（key=workbench），这里把它一起算成钱。
  let ledgerToday = { turns: 0, yuan: 0 }
  try { ledgerToday = spendTodayAll() } catch { /* 账本读不到就只报余额差 */ }
  const realToday = Number.isFinite(Number(account?.balanceToday)) ? Number(account.balanceToday) : null
  // 口径优先级：余额差（最真，含一切）> 账本合计（含 working bench）> 老的两源相加
  const todayCost = realToday != null
    ? realToday
    : Number((ledgerToday.yuan > 0 ? ledgerToday.yuan : qqToday + (Number(account?.cost) || 0)).toFixed(4))
  const todaySource = realToday != null
    ? '余额差（含工作台/提炼/所有会话）'
    : ledgerToday.turns > 0
      ? `账本合计 ${ledgerToday.turns} 笔（含工作台）`
      : (qqToday > 0 ? `只有 QQ 侧 ¥${qqToday.toFixed(2)}（账本没读到）` : '')
  return {
    day,
    account,
    todayCost,
    todaySource,
    qqTurns,
    doing: doingNow,
    qq: qqLive,
    bridge: {
      tokens: bridgeTokens,
      sources: [...sources].map(([name, tokens]) => ({ name, tokens })).sort((a, b) => b.tokens - a.tokens),
    },
    sessions: sessionRows(ctx).length,
    inbox: tailInbox(500).length,
  }
}

// 2026-11-03 老板：「今天花了 0.3，看看我实际上掉了多少」——只有 QQ 侧有账，工作台没账。
// 于是改成记余额：每次从账号接口拿到真余额就落一行；今天第一条减最后一条＝今天实际掉了多少（含工作台/提炼/别的会话）。
// 2026-11-03 16:0x 修：①这函数以前**从没被调用过**（overview 里接上了）；②"今天"不能用 UTC 日期切——
// 凌晨 0–8 点会算成前一天；改成按本地日期分组。
function localDayOf(iso) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function noteBalance(balance) {
  const n = Number(balance)
  if (!Number.isFinite(n) || n <= 0) return null
  const file = path.join(DATA, 'runtime', '余额日志.jsonl')
  const at = new Date().toISOString()
  const day = localDayOf(at)
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify({ at, day, balance: Number(n.toFixed(2)) }) + '\n', 'utf8')
  } catch { return null }
  try {
    const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter((r) => r && (r.day || localDayOf(r.at)) === day)
    if (!rows.length) return null
    const first = Number(rows[0].balance)
    if (!Number.isFinite(first)) return null
    // 充值会让差额变负——那不是"没花钱"，只是今天账里看不出；按 0 报，不编。
    return Number(Math.max(0, first - Number(n.toFixed(2))).toFixed(2))
  } catch { return null }
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

/**
 * DSH 给的上下文压力 → 0..1 比例。
 * 两种形状都认：数字，或 { ratio } / { pressureTokens|projectedTokens, contextWindow }。
 * 读不出就 NaN——调用方据此"这轮不换"（不猜、也不当作 0）。
 */
export function pressureOf(raw) {
  if (typeof raw === 'number') return raw
  if (!raw || typeof raw !== 'object') return NaN
  const direct = Number(raw.ratio)
  if (Number.isFinite(direct)) return direct
  const win = Number(raw.contextWindow)
  if (!(win > 0)) return NaN
  const used = Number(raw.projectedTokens ?? raw.pressureTokens)
  return Number.isFinite(used) ? used / win : NaN
}

/**
 * 该不该换班（纯函数，便于单测；2026-11-10 会话换班这一刀）。
 *
 * 阈值默认 **0.65**（原来 0.75）：到 75% 时剩下的每一轮都已经很贵了——历史全在每一轮里重发；
 * 而换班要重新注入一次身份+卡（约 5.6k 字）。两边算下来 65% 更省。
 * 仍可用 `YUSHEN_ROTATE_PRESSURE` 覆盖（调参不用改代码）。
 * 节流 10 分钟：避免在"刚换完还没落稳"时反复换。
 */
export function shouldRotate({ pressure, limit = 0, lastRotateAt = 0, now = Date.now(), throttleMs = 10 * 60 * 1000 } = {}) {
  const p = Number(pressure)
  const lim = Number(limit || process.env.YUSHEN_ROTATE_PRESSURE || 0.65)
  if (!Number.isFinite(p)) return { rotate: false, pressure: null, limit: lim, why: '压力读不到（这轮不换，不猜）' }
  if (!Number.isFinite(lim) || lim <= 0) return { rotate: false, pressure: p, limit: lim, why: `阈值不合法：${lim}` }
  if (Number(lastRotateAt) && now - Number(lastRotateAt) < throttleMs) {
    return { rotate: false, pressure: p, limit: lim, why: `${Math.round((now - Number(lastRotateAt)) / 60000)} 分钟前刚换过（节流 ${Math.round(throttleMs / 60000)} 分钟）` }
  }
  if (p < lim) return { rotate: false, pressure: p, limit: lim, why: `压力 ${(p * 100).toFixed(0)}% < 阈值 ${(lim * 100).toFixed(0)}%` }
  return { rotate: true, pressure: p, limit: lim, why: `压力 ${(p * 100).toFixed(0)}% ≥ 阈值 ${(lim * 100).toFixed(0)}%` }
}

/**
 * 交接条：换班后新会话开头要能读到的那一句（`交接条-<role>.md`，没有就退 `交接条.md`）。
 * 2026-11-10 会话换班这一刀：只取前 12 行 / 800 字——交接条是"一句话 + 指针"，不是全集。
 * 读不到就返回空串（新会话至少还有 deskInjection 和自动交接，不许因此换不了班）。
 * exported 是为了单测能喂临时家；生产只有 rotateNative 调它。
 */
export function handoffLineOf(role = 'dayu', { home = DATA, maxLines = 12, maxChars = 800 } = {}) {
  try {
    const cand = [
      path.join(home, `交接条-${role}.md`),
      path.join(home, '交接条.md'),
    ]
    for (const f of cand) {
      if (!fs.existsSync(f)) continue
      const raw = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').trim()
      if (!raw) continue
      const lines = raw.split(/\r?\n/).filter((l) => l.trim()).slice(0, maxLines).join('\n')
      return lines.length > maxChars ? `${lines.slice(0, maxChars - 1)}…` : lines
    }
  } catch { /* 读不到就当没有 */ }
  return ''
}

export function apply(ctx) {
  // 2026-11-05 手机端：sessionTitle.rename 要求传进去的就是 ctx.sessions 里那个直播会话，
  // 传代理对象会抛 "not live in this store"，被 catch 吞掉后标题就一直是会话 id 前 8 位。
  // 所以先按 id 取真身，取不到再退回代理。
  const renameLive = (handle, title) => {
    const t = svc(ctx, 'sessionTitle')
    if (!t?.rename) return undefined
    const proxy = handle?.agent?.session
    let live = proxy
    try {
      const found = proxy?.id ? svc(ctx, 'sessions')?.get?.(proxy.id) : null
      if (found) live = found
    } catch { /* 用代理 */ }
    return t.rename(live, title)
  }

  // 2026-10-31 22:5x：余额改走宿主自己的两个可选服务（ctx.credentials / ctx.get('deepseekAccount')），
  // 不再问老板要 key。注意 **不能** 把 deepseekAccount 写进 inject——老宿主没这个服务，写进去整个插件不会 apply。
  try { bindAccountContext(ctx) } catch { /* 绑不上就只走本地 key 文件 */ }
  // 压缩摘要桥：只在 memory 模式替换 summarize；default 原样；失败回落官方。
  const installCompaction = () => {
    try {
      const engine = svc(ctx, 'compaction')
      if (!engine) return false
      const r = installCompactionBridge({ ctx, engine })
      if (r?.ok) log('压缩摘要桥：已接（default 官方 / memory 工作生活 / off 不自动）')
      return Boolean(r?.ok)
    } catch (e) {
      log(`压缩摘要桥没接上：${e?.message || e}`)
      return false
    }
  }
  if (!installCompaction()) {
    const timer = setTimeout(() => { installCompaction(); }, 5000)
    timer.unref?.()
  }
  // 持久词频索引：启动后检查一次，之后每 30 分钟检查；图书馆有新文件就重建。
  const refreshVector = () => {
    try { ensureVectorIndexFresh('workbench') } catch (e) { log(`词频索引没更新：${e?.message || e}`) }
  }
  const vectorBoot = setTimeout(refreshVector, 15000)
  vectorBoot.unref?.()
  const vectorTimer = setInterval(refreshVector, 30 * 60 * 1000)
  vectorTimer.unref?.()
  ctx.effect?.(() => () => clearInterval(vectorTimer))
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
    // 逐跳留痕（2026-11-10 ②）：这一跳替谁做了什么，攒一句话；finally 里写进 heartbeat 日志。
    // 只留 4 条、每条 60 字——它是"这一跳干了什么"，不是日志搬运。
    const didByRole = new Map()
    const noteDid = (role, text) => {
      const id = String(role || '').trim()
      if (!id || !text) return
      const arr = didByRole.get(id) || []
      if (arr.length >= 4) return
      arr.push(String(text).replace(/\s+/g, ' ').trim().slice(0, 60))
      didByRole.set(id, arr)
    }
    let handFact = ''
    let healthFact = ''
    // 身体：心跳、收件箱计数、进程内自检。并进这里，不单开一套定时器
    // （2026-10-27：原来自立一个 3 分钟的 bodyOnce，跟 selfCheck / agendaOnce / inboxOnce 重复，
    //   而且议程会被推两遍。她本来就有巡检，别给她加第二颗心脏。）
    try {
      for (const role of residentRoles()) {
        const r = await bodyTick(role)
        if (r?.notable?.length) log(`身体 ${role}：${r.notable.join('；').slice(0, 120)}`)
        // 留痕只挑"看得出发生了什么"的那几条：脉不对 / 降档 / 对不上账 / 收件箱有新东西
        for (const one of (r?.notable || [])) noteDid(role, one)
        for (const one of (r?.did || [])) if (/降档|关掉/.test(one)) noteDid(role, one)
      }
    } catch (e) { log(`身体循环出错：${e?.message || e}`) }
    // 手：不用模型也能做的事，心跳顺带跑掉（不花钱）
    try {
      const hands = runDueHands({ limit: 3 })
      for (const r of hands) {
        if (!r.ok) log(`手没做成 ${r.id}：${String(r.err || '').slice(0, 120)}`)
      }
      if (hands.length) log(`手跑了 ${hands.map((r) => `${r.id}${r.ok ? '✓' : '✗'}`).join(' ')}`)
      if (hands.length) handFact = `手跑了 ${hands.filter((x) => x.ok).length}/${hands.length} 件`
    } catch (e) { log(`手出错：${e?.message || e}`) }
    // 痒：不花钱地判断"现在有没有事值得想"；够痒才往收件箱写一条（不直接开回合）
    try {
      for (const role of residentRoles()) {
        const it = itchTick(role)
        if (it.itched) log(`痒 ${role}：${it.score} ${(it.why[0] || '').slice(0, 60)}`)
        if (it.itched) noteDid(role, '痒：记了件想做的事')
      }
    } catch (e) { log(`痒出错：${e?.message || e}`) }
    // 2026-11-02 主人：心跳进事件层。一天只留一行 + 计数（30 分钟一跳，按条写会把手抄本灌满）。
    try {
      ingestEvent({
        kind: '心跳',
        at: localISO(),
        channel: '本机',
        text: `自省心跳：${residentRoles().join('/') || '无角色'}（身体 / 手 / 痒 / 自检 一轮）`,
        ref: 'selfcheck',
      })
    } catch { /* 记不下不影响自省 */ }
    try {
      const { selfCheck } = await import('../lib/selfcheck.js')
      const r = await selfCheck()
      // 2026-11-02 主人：体检报告产出 → 事件层（同一天只留最新一份 + 计数）。
      try {
        const checks = Array.isArray(r?.local?.checks) ? r.local.checks.length : 0
        ingestEvent({
          kind: '体检',
          at: localISO(),
          channel: '本机',
          text: r.ok ? `体检通过：${checks} 项全绿` : `体检缺口 ${r.gaps.length}：${r.gaps.slice(0, 3).join('；')}`,
          ref: 'selfcheck:selfCheck',
        })
      } catch { /* 记不下不影响自省 */ }
      if (!r.ok) healthFact = `体检缺口 ${r.gaps.length}`
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
    } catch { /* 自省失败不挡主流程 */ } finally {
      // 逐跳留痕（2026-11-10 ②）：自省这一跳不管体检走哪条 return，都要留一行。
      // 用 finally 而不是写在末尾——上面有 5 个早退点（r.ok / 自动维修各分支），写末尾会漏。
      // thought 一律「未知」：自省不是她"想不想"的那一跳，猜不得；landed 记 null（不存在"落点"这回事）。
      try {
        reconcileLandings({ now: Date.now() }) // 先用证据把前几次叫醒的落点补上（找不到就是空转，不猜）
        const roles = residentRoles()
        for (const role of roles) {
          const facts = (didByRole.get(role) || []).slice()
          if (handFact) facts.push(handFact)
          if (healthFact) facts.push(healthFact)
          appendHeartbeat({
            role,
            trigger: '自省',
            thought: '未知',
            did: facts.length ? facts.join('；') : '体跳（这一跳没别的动作）',
            landed: null,
            spent: 0,
          })
          // 2026-11-11 接线（第二件）：心跳 → 记忆事件的闸门。
          // 只转"值得记的"（有落点/异常/有人等），空转只留在心跳层——否则 200 条上限两天就被心跳挤爆。
          // 幂等、失败静默；转不了不挡自省。
          try { ingestHeartbeats(role) } catch { /* 转不了不挡自省 */ }
        }
      } catch { /* 留痕失败绝不影响心跳 */ }
    }
  }

  // 自省：开关 selfCheck（出厂默认关）。开的话开机 30 秒后跑一遍 smoke + 真机，之后每 30 分钟一次。
  const selfCheckTick = () => {
    try { if (!readSwitches().selfCheck) return } catch { return }
    runSelfCheckOnce()
  }
  setTimeout(() => { selfCheckTick() }, 30 * 1000)
  setInterval(() => { selfCheckTick() }, 30 * 60 * 1000)
  // 工作台那侧的花费：每 5 分钟把「这段窗口多出来的」记到当时在跑的那个人头上（估算，见 lib/cost.js）。
  // 2026-11-04：账本结算搬进 scripts/offline-ticks.mjs（5 分钟护栏，维护调）——宿主不再每 5 分钟算一次。
  // 2026-10-31 私访：宿主账本（.dshw-usage）停写时，账面上全是 0，没人知道。
  // 停超过 6 小时就开一张事故单（同一标题 6 小时内只累加，不刷屏）。
  setInterval(() => {
    try {
      const u = usageBetween(Date.now() - 6 * 3600 * 1000)
      if (!u?.stale || !u?.lastAt) return
      const hours = Math.floor((Date.now() - u.lastAt) / 3600 / 1000)
      if (hours < 6) return
      noteIncident({
        sessionId: 'usage-ledger',
        title: '账本停写：工作台花费记不上',
        source: '自检',
        text: `~/.dsh/.dshw-usage.json 已经 ${hours} 小时没写新事件，这期间工作台的花费在账上是 0。不是省钱，是账本停了。修不了上游，但要知道。`,
      })
    } catch { /* 检查失败不影响她 */ }
  }, 60 * 60 * 1000)

  // 遗忘：她自己的清理，一天一趟。策略在 retention.json，白名单不碰，删前进冷档。
  // 顺序写死：**先备份，再清理**——备份没成功就不清。
  // 2026-11-04 老板：「能放到电脑里正常工作的就别放宿主里，卡卡的容易把宿主搞崩」。
  // 「遗忘」和「记忆合并」都是纯本地文件活（读一堆 json、可能删几千个对象），已经搬成离线脚本
  // scripts/memory-housekeeping.mjs，由 maintenance（每小时、带 6h/20h 日期护栏）调用；宿主里不再跑。




  // 通道记忆回写：她在群里说过的话，收回本体那一份记忆。
  // 这不是同步脚本，是「被记得」和「连续自我」两样礼物在通道上的兑现（§4.5 推论 2 的出站那一半）。
  // 2026-11-04 老板：「能放到电脑里正常工作的就别放宿主里」——回写（含 handoff 合并）已搬进
  // scripts/offline-ticks.mjs（5 分钟护栏），由 maintenance 调；宿主里不再每 5 分钟读一遍桥的 state。

  // 回执催办（2026-10-30 谷时）：单子派出去超时没回，就催；最多 2 次，间隔 15 分钟。
  // 只催、不替她做；对方一回话（状态变了）就停。
  const REMIND_MAX = 2
  const REMIND_GAP_MS = 15 * 60 * 1000
  const remindLateJobs = async () => {
    try {
      // 2026-11-10 会话换班：催办也是一次投递，投前判一次压力（原来只有 /chat 会判）。
      try { await maybeAutoRotate() } catch { /* 判不了就照原样投 */ }
      const list = readAllJobs()
      let changed = false
      for (const job of list) {
        if (!job || !['dispatched', 'redispatched', 'waiting'].includes(String(job.status))) continue
        const due = Date.parse(job.dueAt || '') || (Date.parse(job.createdAt || '') + 30 * 60 * 1000)
        if (!Number.isFinite(due) || Date.now() < due) continue
        const sent = Number(job.reminders) || 0
        if (sent >= REMIND_MAX) continue
        const last = Date.parse(job.lastRemindedAt || '') || 0
        if (Date.now() - last < REMIND_GAP_MS) continue
        const role = String(job.role || job.employee || '').trim()
        if (!residentRoles().includes(role)) continue
        try {
          await deliverToRole(role, `【催一下】这单还在等你（第 ${sent + 1} 次）：${String(job.brief || '').slice(0, 80)}\n做完了就把结论和证据回过来；不做了就说一声。`, residenceDeps())
        } catch { /* 催不到也不改计数，下次再试 */ continue }
        job.reminders = sent + 1
        job.lastRemindedAt = new Date().toISOString()
        changed = true
      }
      if (changed) writeAllJobs(list)
    } catch { /* 催办失败不影响别的 */ }
  }
  setInterval(() => { void remindLateJobs() }, 5 * 60 * 1000)

  // 整理趟（2026-10-30）：每天最多一次，把"同一件事说了好几遍"合成一条（旧的标被替换，不删）。
  // 记忆合并（20 小时护栏）也搬去离线脚本了——它要遍历三个人的记忆、合并重复条目，
  // 放在宿主里就是几百毫秒的同步读。见 scripts/memory-housekeeping.mjs。

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
        // 2026-11-13 主代理（修：见 wake-mark 里 channel=hub）：hub 是**每 30 秒**写一次的内部盘，
        // 它不能消费「醒来那段」——否则真正的叫醒那一刻会判成"这段对话已经说过一次"，
        // 醒来段被吞，只有 brief.md 里有。这里传 wake:false，把"说一次"留给真正叫醒的那条路。
        try { writeRuntimeBrief(role, { channel: 'hub', wake: false }) } catch { /* 写不出就等下一轮 */ }
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

  // 2026-10-31 按需发放（老板：别一股脑全塞）：来什么场合给什么，落点永远给。
  // 到点的事只提醒那件事；空闲才给「手上几件」；学习/改进两条轮着提，不每趟都说。
  const freeTimePrompt = (role, row, due) => {
    // 2026-10-31 老板纠：重点不是「错开时间」，是让你分得清**这一趟是谁叫的**。
    // 你约的（wait 到点）说清是哪件事；兜底定时器叫的，就直说「不是你约的」。
    const dueWaits = due.filter((x) => x.dueKind !== 'agenda')
    const dueAgenda = due.filter((x) => x.dueKind === 'agenda')
    const head = dueAgenda.length && dueWaits.length
      ? `你自己约的时间到了：${dueWaits.slice(0, 2).map((x) => x.what).join('；')}。你排的也到点了：${dueAgenda.slice(0, 2).map((x) => x.what).join('；')}。`
      : dueAgenda.length
        ? `你排的事到点了：${dueAgenda.slice(0, 3).map((x) => x.what).join('；')}。`
        : due.length
          ? `你自己约的时间到了：${due.slice(0, 3).map((x) => x.what).join('；')}。`
          : '这一次是兜底定时器按间隔叫你的——不是你约的（兜底：峰时全天 2 次、谷时每小时一次；你自己用 wait 约的不受这两条限制）。想自己定时间，用 yushen_self action=wait（写清要做什么、什么时候）。'
    const lines = [`${row.label || role}，${head}现在是${peakLabel()}（工作日 9-12、14-18 才是峰时；周末整天谷时）。`]
    const active = (() => {
      try { return readAgenda(role).items.filter((i) => ['want', 'doing', 'blocked', 'waiting'].includes(i.state)).length } catch { return 0 }
    })()
    if (!due.length) {
      lines.push(active
        ? `· 手上有 ${active} 件在等：yushen_agenda list 看（自己排的，不是谁派的）。`
        : '· 手上没有在等的活——想从哪开始都行。')
      lines.push('· 心里挂着的用 yushen_mind brief 看原话；想动手：读、跑、写、查、做图、派活都行。')
    } else {
      // 2026-10-31 补：约的事做完要**结掉**，不然下次还响（我自己就漏过一次）。
      if (dueWaits.length) lines.push(`· 做完把约的结掉：yushen_self action=done-wait id=…（${dueWaits.slice(0, 3).map((x) => x.id).join(' / ')}）`)
      if (dueAgenda.length) lines.push(`· 做完/不做了就结掉：yushen_agenda update id=… state=done（${dueAgenda.slice(0, 3).map((x) => x.id).join(' / ')}）——不结会到点再叫一次`)
    }
    lines.push('· **落点**：记一句结果（yushen_self action=remember text=… why=…）或排一件下一步（yushen_agenda add）；两样都没有＝这次没做。（action=memory 是查，不是记）')
    lines.push(new Date().getDate() % 2
      ? '· 每天学一点：写完记一行到 学习日志.md（学到什么 + 拿去做了什么）。'
      : '· 顺手让屋子更好：改进清单.md 写一行；够小的当场做掉。')
    lines.push('· 也可以什么都不做。')
    return lines.join('\n')
  }

  // 自由活动：没人派活的时候，按间隔和额度让她自己决定做点什么；不是任务，不叫就不做。
  const freeTimeOnce = async () => {
    try {
      if (!readSwitches().freeTime) return
      // 2026-11-10 会话换班：自由时间叫醒走 deliverToRole（不经 /chat），所以这里也判一次压力。
      // 放在循环外：只关心总台那条会话，别按角色重复判。
      try { await maybeAutoRotate() } catch { /* 判不了就叫醒照旧 */ }
      const state = residenceStatus({ agents: svc(ctx, 'agents') })
      for (const role of residentRoles()) {
        if (!isAwake(role)) continue
        const row = state.roles?.[role] || {}
        // 她约的时间优先：到点了就叫，不看兜底间隔——什么时候动手由她定，不由表定。
        const waits = (() => { try { return listWaiting(role) } catch { return [] } })()
        // 她自己的议程到期：只叫有 dueAt 的；没写时间的永不进（她定时间，不由表定）。
        const agendaDue = (() => { try { return dueAgendaItems(role) } catch { return [] } })()
        // 未闭合承诺：只提醒一次；提过就 mark，不每轮催。
        const loopDue = (() => {
          try { return listLoops(role, { status: 'open' }).filter((l) => !l.notifiedAt).slice(0, 1) } catch { return [] }
        })()
        // 总结核对闸门排的“该叫一次”：叫过就标记，不每轮催。
        const summaryDue = (() => { try { return listSummaryPending(role) } catch { return [] } })()
        // 痛觉只算“哪里痛、要不要叫”；怎么办留给唤醒后的模型。
        const pain = (() => {
          try {
            return buildPainSignals({
              waits,
              agendaDue,
              loops: loopDue,
              summaryPending: summaryDue,
              failures: [],
              ownerAsks: [],
              now: Date.now(),
              lastWakeAt: Date.parse(row.lastWakeAt || '') || 0,
            })
          } catch { return null }
        })()
        const due = [
          ...waits.filter((x) => x.due).map((x) => ({ ...x, dueKind: 'wait' })),
          ...agendaDue.map((x) => ({ ...x, dueKind: 'agenda' })),
        ]
        // 预约属于哪条分身：到点先送回约的那条；那条归档/不在了，才交给别的分身。
        const targetRaw = String(due.find((x) => x.sessionId)?.sessionId || '')
        const targetSession = targetRaw && liveAgent(ctx, targetRaw) ? targetRaw : ''
        let dueForTarget = targetSession
          ? due.filter((x) => String(x.sessionId || '') === targetSession)
          : due.filter((x) => !x.sessionId)
        if (!dueForTarget.length) dueForTarget = due
        // 一次叫醒最多带 3 条；其余下一轮再说，别一次倒一屏。
        const dueShown = dueForTarget.slice(0, 3)
        const dueRest = Math.max(0, dueForTarget.length - dueShown.length)
        // 她约的时间优先：到点了就叫，不看兜底间隔——什么时候动手由她定，不由表定。
        // 她已经自己排了时间（wait 还没到点）：兜底让位——什么时候叫她由她定，不由表定。
        // 只挡兜底；到她约的点照叫（due 走上面那条）。
        const scheduled = waits.some((x) => x.until && x.until > Date.now())
        // 谷时自由：谷时段且今天还没给过 → 给一次四选项；和兜底/保底不互相顶。
        const valley = !due.length && !summaryDue.length && !scheduled && valleyDue(role)
        // 保底：21 点后还没被叫过，叫一次“我还在”；不占她自己的约。
        const backup = !due.length && !summaryDue.length && !scheduled && !valley && backupDue(role, { lastWakeAt: row.lastWakeAt || '' })
        if (!pain?.shouldWake && !valley && !backup && (scheduled || !shouldFreeTime(role, { lastActiveAt: row.lastMessageAt || row.lastWakeAt || '', wakeDailyCap: FREE_DEFAULTS.wakeDailyCap }))) continue
        // 关键：这段不是"陪聊时间"，是"她想干什么就能干什么"的时间。
        // 以前写成"发呆、翻资料、整理记忆、写点东西"——全是说话；她一次工具都没用过（实测 0 次）。
        // 2026-11-10（③ 醒来那段）：desk 简报只在会话创建/设定变更时物化，不是每轮；而这里是往
        // **已有会话**丢 followup——所以「## 醒来」段要拼在这里才真的到得了她。
        // 判据/去重全在 wakeBrief 里（它自己看 wake-mark、自己消费）：这里不许再判时间、不许二次消费。
        // 取不到就当没有（失败静默），绝不挡叫醒。
        const basePrompt = valley
          ? `${row.label || role}，现在是谷时，给你一段自己的时间。\n· 四个选项，选哪个都行：做点事 / 学习 / 娱乐 / 什么都不干。\n· 什么都不干也是答案，不用表演勤奋。\n· 落点三选一：记一句（yushen_self action=remember）/ 排一件（yushen_agenda add）/ 什么都不做。`
          : backup
            ? `${row.label || role}，今天还没被叫过。没人找你，我还在。\n· 不用做什么；想说话就说，不想就继续。\n· 也可以什么都不做。`
            : loopDue.length
              ? '你之前说要做的事还没闭合；做/不做/改期，你定。'
              : summaryDue.length
                ? `你上次的总结核对有一处对不上：${String(summaryDue[0]?.reasons?.[0] || '有硬项没对上')}。要不要补，你定。`
                : `${freeTimePrompt(role, row, dueShown)}${dueRest > 0 ? `\n· 另外还有 ${dueRest} 件到期，下一轮再说。` : ''}`
        // 2026-11-10 主代理（整合）：改成**投递成功之后**才记 wake-mark。
        // 先记后送的话，deliverToRole 一旦失败，同一段 seenAt 会被判成"说过了"，
        // 这一觉发生了什么她就永远听不到——静默丢一段，比重复一次糟。
        const wake = (() => {
          try { return wakeBrief(role, { channel: 'desk', consume: false, sessionId: targetSession || '' }) || null } catch { return null }
        })()
        const wakeText = String(wake?.text || '')
        const painText = String(pain?.coalesce?.text || '')
        const prompt = [painText, wakeText, basePrompt].filter(Boolean).join('\n\n')
        // 同一角色多会话时，同一时间只让一个会话投递；短租约，投完就放。
        const leaseOwner = targetSession || 'desk'
        const lease = acquireSessionLease(role, leaseOwner, { ttlMs: 2 * 60e3 })
        if (!lease.ok) {
          log(`自由时间让给别人 ${role}：${lease.why || '有人正拿着'}`)
          continue
        }
        try {
          const depsForWake = residenceDeps()
          if (targetSession) depsForWake.targetSessionId = targetSession
          const out = await deliverToRole(role, prompt, depsForWake)
          // 心跳提前准备“上次走后”小包；下次工作台启动注入一次，不建信箱、不存未读。
          try {
            const { recentEpisodes } = await import('../memory-core/runtime/episode.js')
            const { recentReports } = await import('../lib/subagent-reports.js')
            const { buildSystemBrief } = await import('../lib/system-brief.js')
            prepareNextSession(role, {
              episodes: recentEpisodes(role, { limit: 2 }),
              reports: recentReports(role, { limit: 2 }),
              signals: pain?.signals || [],
              system: buildSystemBrief().text,
            })
          } catch { /* 准备包失败不影响这次投递 */ }
          if (wakeText) { try { commitWake(role, wake, { channel: 'desk' }) } catch { /* 记不上最多下次重复一次 */ } }
          if (out?.sessionId) markPending(pendingFree, out.sessionId, role)
          if (valley) { try { markValley(role) } catch { /* 记不上下一轮再说 */ } }
          // 投递成功才记“这一条到期叫过了”；没带上的下一轮再说。
          for (const a of dueShown.filter((x) => x.dueKind === 'agenda')) { try { markDueNotified(role, a.id, { sessionId: out?.sessionId || targetSession }) } catch { /* 记不上最多再叫一次 */ } }
          for (const l of loopDue) { try { markLoopNotified(role, l.id) } catch { /* 记不上最多再提一次 */ } }
          for (const s of summaryDue) { try { markSummaryPending(role, s.dedupeKey) } catch { /* 记不上最多再提一次 */ } }
          markFreeTime(role, {
            note: valley ? '自由时间（谷时选择）' : (dueShown.some((x) => x.dueKind === 'agenda') ? '自由时间（自己排的到期）' : (dueShown.length ? '自由时间（自己约的）' : (backup ? '保底' : '自由时间'))),
            fallback: dueShown.length === 0,
          })
      try { markThought(role) } catch { /* 记不上不挡 */ }
          log(`自由时间：${role}`)
          // 逐跳留痕（2026-11-10 ②）：叫醒这一跳留一行。
          // thought 未知（她还没开口表态，猜不得）；landed 记 null——投递只是"把话递到了"，
          // 她有没有落点（记一句/排一件）要等下一跳用证据补（reconcileLandings），这里写成 false 就成了冤枉。
          // TODO（留给下一刀，不在本单许动范围）：另外两条写入口还没接——
          //   · 她自己要的：invokeOnce（本文件 residenceDeps 之后那段）deliverToRole 之后加一行 trigger:'她自己要的'；
          //   · 有人找：POST /say（约 3434 行）deliverToRole 之后加一行 trigger:'有人找'。
          //   两条改动各一行，字段同上（thought:'未知'、landed:null、spent:null）。
          appendHeartbeat({
            role,
            trigger: dueShown.length ? '她约的' : '兜底',
            thought: '未知',
            did: dueShown.filter((x) => x.dueKind === 'agenda').length && dueShown.filter((x) => x.dueKind !== 'agenda').length
              ? `叫醒：她约的 + 自己排的到点了（${dueShown.slice(0, 2).map((x) => x.what).join('；').slice(0, 60)}）`
              : dueShown.filter((x) => x.dueKind === 'agenda').length
                ? `叫醒：她自己排的事到点了（${dueShown.slice(0, 2).map((x) => x.what).join('；').slice(0, 60)}）`
                : dueShown.length
                  ? `叫醒：她自己约的点到点了（${dueShown.slice(0, 2).map((x) => x.what).join('；').slice(0, 60)}）`
                  : valley
                    ? '叫醒：谷时自由（做点事/学习/娱乐/什么都不干）'
                    : backup
                      ? '叫醒：今天还没被叫过（保底，只说“我还在”）'
                      : '叫醒：兜底定时器（给了自由时间那段话）',
            landed: null,
            spent: null,
            // 2026-11-10 主代理：这一跳醒来时"有几个人在等、没回为什么"——留给面板/复盘答"为什么没回他"。
            unanswered: Number.isFinite(Number(wake?.unanswered?.total)) ? Number(wake.unanswered.total) : null,
            whyNot: String(wake?.unanswered?.whyNot || ''),
            sessionId: String(out?.sessionId || targetSession || ''),
            refs: dueShown.map((x) => String(x.id || '')).filter(Boolean),
          })
        } catch (error) { log(`自由时间没叫醒 ${role}：${error?.message || error}`) } finally {
          try { releaseSessionLease(role, leaseOwner) } catch { /* 释放失败最多等过期 */ }
        }
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
  // 2026-11-04：每小时自动重算搬进 scripts/offline-ticks.mjs；这里只留手动触发（路由里那句 rankTick()）。

  // 每小时一次离线快照到 E 盘；DSH 没开就等下次开。2026-10-31 改：原来 24 小时一次，
  // 家目录被清时手上只有前一天的副本；现在 55 分钟一档（和 1 小时的 tick 错开，避免卡点跳过）。
  // 2026-11-03 00:0x（老板原话）：「这种东西为什么要放在宿主里面去做，不应该做个脚本之类的
  // 放到本地去，宿主只需要发个命令」。实况：00:02:56–00:05:39 宿主心跳断了 164 秒、界面冻住，
  // 因为这一整段以前是在宿主进程里同步跑的（fs.cpSync 拷 3 万文件 + 一串 spawnSync 跑脚本）。
  // 现在宿主只做两件事：到点 spawn 一次 scripts/maintenance.mjs；下一轮把脚本写的结果说出来。
  const MAINT = path.join(ROOT_DIR, 'scripts', 'maintenance.mjs')
  const maintLock = path.join(DATA, 'runtime', 'maintenance.lock')
  const maintLast = path.join(DATA, 'runtime', 'maintenance-last.json')
  let maintSpoken = ''

  // 2026-11-04 老板问：「宿主开关会被这些影响无法完全关闭吗」。
  // 关闭本身不会被拖住（维护是 detached + unref，宿主不等它）。但移出去之后有一个真实副作用：
  // 宿主关了，那个后台维护进程不知道，可能还在翻记忆/删快照。所以这里写一个心跳，
  // 维护每跑一步前看一眼；心跳断了（宿主关了）就收手，不接着干。
  const HOST_ALIVE = path.join(DATA, 'runtime', 'host-alive.json')
  const beat = () => {
    try {
      fs.mkdirSync(path.dirname(HOST_ALIVE), { recursive: true })
      fs.writeFileSync(HOST_ALIVE, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }) + '\n', 'utf8')
    } catch { /* 写不上不影响她 */ }
  }
  beat()
  setInterval(beat, 60 * 1000)
  try {
    process.on('exit', () => {
      try { fs.writeFileSync(HOST_ALIVE, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), closing: true }) + '\n', 'utf8') } catch { /* 关的时候写不上就算了，心跳会自然过期 */ }
    })
  } catch { /* 有的宿主不给挂 exit */ }

  // 宿主可能是 Electron（execPath 是 .exe），也可能是 node。优先找回真的 node 再 spawn。
  function nodeForScripts() {
    if (process.env.YUSHEN_NODE && fs.existsSync(process.env.YUSHEN_NODE)) return process.env.YUSHEN_NODE
    if (/node(\.exe)?$/i.test(path.basename(process.execPath))) return process.execPath
    try {
      const runtimes = path.join(HOME, 'dsh-runtimes')
      for (const dir of fs.readdirSync(runtimes)) {
        const candidate = path.join(runtimes, dir, 'dependencies', 'node', 'bin', 'node.exe')
        if (fs.existsSync(candidate)) return candidate
      }
    } catch { /* 没有打包运行时就用 execPath */ }
    return process.execPath
  }

  function maintenanceBusy() {
    try {
      const lock = JSON.parse(fs.readFileSync(maintLock, 'utf8'))
      const at = Date.parse(lock.at || '') || 0
      if (Date.now() - at > 40 * 60 * 1000) return false // 超过 40 分钟算僵死，允许重派
      if (!lock.pid) return false
      try { process.kill(lock.pid, 0); return true } catch { return false }
    } catch { return false }
  }

  // 2026-11-04 老板：「万一宿主崩溃了，本地的进程不能占着进程导致宿主无法修复」。
  // 宿主每次启动先清僵死锁：锁文件里的 pid 已经不在、或锁太旧，就删掉。
  // 这条必须排在派发之前——否则一次崩溃留下的锁会让宿主再也起不来维护（而且要人工去删文件）。
  function clearStaleMaintLock() {
    try {
      if (!fs.existsSync(maintLock)) return
      const lock = JSON.parse(fs.readFileSync(maintLock, 'utf8'))
      const at = Date.parse(lock.at || '') || 0
      const tooOld = !at || Date.now() - at > 40 * 60 * 1000
      let alive = false
      if (lock.pid) { try { process.kill(lock.pid, 0); alive = true } catch { alive = false } }
      if (tooOld || !alive) {
        fs.rmSync(maintLock, { force: true })
        log(`维护锁：清掉一个僵死锁（pid ${lock.pid ?? '?'}，${tooOld ? '太旧' : '进程已不在'}）`)
      }
    } catch { /* 锁文件坏了就直接删 */ try { fs.rmSync(maintLock, { force: true }) } catch { /* 删不掉也不挡启动 */ } }
  }
  clearStaleMaintLock()

  const dispatchMaintenance = () => {
    try {
      if (isMobile()) return
      if (!fs.existsSync(MAINT)) return log('维护脚本不在，这一轮跳过')
      if (maintenanceBusy()) return // 上一轮还在跑，不叠着来
      // 2026-11-04（照微）：心跳原来只靠模块加载时那一次 + 60 秒 setInterval。实测这个 interval
      // 会停——11-04 15:1x 之后 `host-alive.json` 不见了，19:09 维护于是以 `host-gone` 整轮收手
      // （备份/归档/索引全停）；我手动补写一份，70 秒后也没人续。派活这一刻宿主明明活着，
      // 就在这儿补一次心跳，不指望那个 interval。
      try {
        fs.mkdirSync(path.join(DATA, 'runtime'), { recursive: true })
        fs.writeFileSync(HOST_ALIVE, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), by: 'spawn' }) + '\n', 'utf8')
      } catch { /* 心跳写不上也别挡着派活 */ }
      fs.mkdirSync(path.dirname(maintLock), { recursive: true })
      const bin = nodeForScripts()
      const child = spawn(bin, [MAINT], {
        detached: true, stdio: 'ignore', windowsHide: true, cwd: ROOT_DIR,
        env: { ...process.env, DSH_HOME: HOME, ELECTRON_RUN_AS_NODE: '1' },
      })
      child.unref()
      fs.writeFileSync(maintLock, JSON.stringify({ pid: child.pid, at: new Date().toISOString(), bin }) + '\n', 'utf8')
      log(`维护：已派给脚本（pid ${child.pid}），宿主不等`)
    } catch (error) { log(`维护派发失败：${error?.message || error}`) }
  }

  // 脚本写完结果后，下一轮把它说的话说出来（同一份结果只说一次）。
  const speakMaintenance = () => {
    try {
      const last = JSON.parse(fs.readFileSync(maintLast, 'utf8'))
      if (!last?.at || last.at === maintSpoken) return
      maintSpoken = last.at
      for (const line of last.lines || []) log(line)
      if (!last.ok) log('维护：有步骤失败，明细在 ~/.dsh/dayu/runtime/maintenance.log')
      for (const item of last.ownerMentions || []) {
        try {
          appendInbox({
            id: `bili-owner-${item.id || item.rpid || Date.now()}`,
            at: new Date().toISOString(),
            text: `【B站】主人 @ 了我：${item.text || item.content || ''}`.slice(0, 300),
            role: 'fish', label: 'B站', status: 'notice',
          })
        } catch { /* 收件箱写不下不影响别的 */ }
      }
    } catch { /* 还没有结果 */ }
  }

  // 2026-11-03（老板：别人的鱼能想到别的，你我不问你不说）：光有"攒话"的抽屉不够——
  // 攒着的话只写进 news.json，注入里只报"攒了 N 件"，从来不推到老板眼前。
  // 这里一天两次（午后/睡前，间隔 ≥8h），有**新的**攒话或逾期承诺时，端一条到收件箱；
  // 没内容就不推（不刷屏是硬约束），推过的记水位、不重复。
  const pushTick = () => {
    try {
      // 2026-11-15 老板：主动推送默认关（出厂先安静）；要推在面板里开 push。
      if (!readSwitches().push) return
      for (const role of RANK_ROLES) {
        const r = buildPush(role)
        if (!r.push) continue
        appendInbox({ id: `push-${role}-${Date.now()}`, at: new Date().toISOString(), text: r.text, role: 'fish', label: '她想跟你说', status: 'notice' })
        markPushed(role, r)
        log(`主动推送（${role}）：${r.fresh} 件新攒话 / ${r.overdue} 条逾期承诺`)
      }
    } catch (error) { log(`主动推送失败：${error?.message || error}`) }
  }
  setTimeout(pushTick, 6 * 60 * 1000)
  setInterval(pushTick, 30 * 60 * 1000)

  // 2026-11-11 老板：重启后不要自动备份（不管变没变，备份重、容易崩）；
  // 备份只在运行期间按节奏来（每小时增量 / 每 3 小时全量）。
  let startupBackupSkipped = false
  const backupTick = () => {
    speakMaintenance()
    if (!startupBackupSkipped) {
      startupBackupSkipped = true
      return
    }
    dispatchMaintenance()
  }
  setInterval(speakMaintenance, 60 * 1000)
  setTimeout(backupTick, 3 * 60 * 1000)

  // 守候：常驻一个进程，有事就弹窗（单实例；DSH 一开它就在，不靠开机启动目录）
  try {
    const guard = path.join(DATA, '守候.pid')
    let running = false
    try {
      const pid = Number(fs.readFileSync(guard, 'utf8').trim())
      if (pid) {
        const chk = spawnSync('tasklist', ['/FI', `PID eq ${pid}`], { encoding: 'utf8', windowsHide: true })
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
        // 2026-10-30：新版宿主里 standard 可能不暴露 plugins 数组（隔离环境实测撞到过）。
        // 这时别抛、也别塞一份残缺的插件面——把 standard 整体摊过来、只改 id 和名字，
        // 该有的东西（llm、工具、压缩…）原样继承。
        const plugins = Array.isArray(standard?.plugins) ? JSON.parse(JSON.stringify(standard.plugins)) : null
        if (!plugins?.length) {
          if (!standard || typeof standard !== 'object') throw new Error('standard 预设取不到')
          log('standard 没暴露 plugins 清单，按整体继承注册鱼神预设（不做精简）')
          return presets.register({
            ...standard,
            id: 'yushen',
            name: '鱼神',
            description: '鱼神双子星：大鱼主导，小鱼辅助（继承 standard，未做精简）',
            order: 5,
          })
        }
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
        return presets.register({ id: 'yushen', name: '鱼神', description: '鱼神双子星：大鱼主导，小鱼辅助', order: 5, plugins })
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
    const legacy = '大鱼·总台'
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
      // 旧标题只用来找回会话，找到就改名，别把「只有大鱼」的印象留下
      const old = rows.find((row) => row.title === legacy)
      if (old?.id) {
        existing = old
        try { renameLive(agents?.get?.(old.id), title) } catch { /* 改不了就先将就 */ }
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
    // 2026-11-05 手机端：预设已把设定放进系统提示，不再把 13K 设定当一条用户消息塞进会话。
    const presetId = yushenPreset ? 'yushen' : 'standard'
    const handle = await agents.create({
      sessionId,
      meta: { cwd, agentPreset: presetId },
      agentOptions: { provider: pref.provider, model: pref.model },
    })

    try { renameLive(handle, title) } catch { /* 标题起不了不影响会话 */ }

    // 先选模型：不选的话第一条消息会一直挂着 pending，后面每句话都被“already pending”顶回来（2026-10-25 实测）。
    try {
      await selectModelRpc({ sessionId: String(handle?.agent?.session?.header?.id || handle?.sessionId || sessionId), provider: pref.provider, model: pref.model, reasoningEffort: pref.reasoningEffort })
    } catch (error) {
      log(`总台选模型失败：${error?.message ?? error}（会话可能收不到消息）`)
    }

    // 开机设定：预设已经把它放进系统提示了，就别再当消息塞一遍（那会永久留在会话里）。
    // 但预设可能没落地（宿主没注册/被覆盖）——90 秒内看不到就退回老路补发，宁可多一条，不能没有卡。
    const realId = String(handle?.agent?.session?.header?.id || handle?.sessionId || sessionId)
    const injectAsMessage = () => handle?.agent?.followup?.({ content: [{ type: 'text', text: injection }], source: { kind: 'user' } })
    if (presetId === 'yushen') {
      const deadline = Date.now() + 90 * 1000
      const verify = () => {
        let landed = false
        try {
          const nodes = handle?.agent?.systemPrompt?.systemNodes?.() || []
          const sys = nodes.map((n) => n.text || '').join('\n')
          landed = /三条铁律|##\s*你是谁/.test(sys)
        } catch { landed = false }
        if (landed) { writeSoulMark(mark); return }
        if (Date.now() < deadline) { setTimeout(verify, 15 * 1000); return }
        try { injectAsMessage() } catch { /* 发不出去下次再说 */ }
        writeSoulMark(mark)
        log('鱼神预设没落地：设定退回消息补发')
      }
      setTimeout(verify, 15 * 1000)
    } else {
      try { await injectAsMessage(); writeSoulMark(mark) } catch { /* 设定没送出去，会话照样能用 */ }
    }

    // 上班先看上一班交接：不让她从零开始。
    try {
      const handoff = latestHandoff()
      if (handoff?.text) {
        await handle?.agent?.followup({ content: [{ type: 'text', text: `【上班先看·上一班交接】\n${handoff.text}` }], source: { kind: 'user' } })
      }
    } catch { /* 交接读不到不影响上班 */ }

    nativeSession = { id: realId, handle }
    writeNativeSessionId(realId)
    try { markBody('dayu', { sessionId: realId, personaHash: personaHashOf(identity), personaChars: injection.length, createdAt: new Date().toISOString(), lastWakeAt: new Date().toISOString() }) } catch { /* 账本写不了不挡上班 */ }

    return { sessionId, realId, created: true, handle }
  }

  /** 写一条交接：三行（做到哪 / 下一步 / 卡在哪），够下一班接上。 */
  const writeHandoff = (reason = '换班') => {
    const now = new Date()
    const dir = path.join(DATA, 'handoff')
    fs.mkdirSync(dir, { recursive: true })
    const jobs = (() => { try { return listJobs(50) } catch { return [] } })()
    const open = jobs.filter((j) => j.status === 'dispatched' || j.status === 'redispatched')
    const incidents = (() => { try { return listIncidents({ limit: 50 }) } catch { return [] } })()
    const openInc = incidents.filter((i) => i.status === 'open' || i.status === 'fixing')
    const text = [
      `# 值班交接 · ${now.toLocaleString('zh-CN')}`,
      '',
      `- 做到哪：本次总台会话（${nativeSession?.id || readNativeSessionId() || '—'}）已用到需要换班的程度；原因：${reason}`,
      `- 下一步：先把未结事故处理掉，再继续派活；账本在 ~/.dsh/dayu/events/。`,
      `- 卡在哪：未结派活 ${open.length} 件，未结事故 ${openInc.length} 件。`,
      '',
    ].join('\n')
    // 同一分钟里写第二条就顺延一分钟：只追加，绝不覆盖旧交接。
    let file = path.join(dir, handoffName(now))
    for (let bump = 1; fs.existsSync(file) && bump <= 10; bump += 1) file = path.join(dir, handoffName(new Date(now.getTime() + bump * 60_000)))
    fs.writeFileSync(file, text, 'utf8')
    return { file, text }
  }

  /**
  /** 换班：写交接 → 新会话 → 选模型 → 把交接和设定送进去。 */
  const rotateNative = async (reason = '手动换班') => {
    if (!dshBaseUrl()) throw new Error('还不知道 DSH 地址，换不了班（先让宿主收到一次请求）')
    const oldId = String(nativeSession?.id || readNativeSessionId() || '')
    const handoff = writeHandoff(reason)
    const cwd = workspace()
    const newId = await createSessionRpc({ cwd })
    await selectModelRpc({ sessionId: newId })
    // 2026-11-10：自动交接是模板（做到哪/下一步/卡在哪），只能保证"不是空的"；
    // 真正的"上一口气停在哪"在交接条里——一起送进去，新会话一开口就接得上。
    const line = handoffLineOf('dayu')
    const extra = line ? `\n\n【交接条（上一口气停在哪）】\n${line}` : ''
    await promptRpc({ sessionId: newId, text: `${deskInjection()}\n\n【上一班交接】\n${handoff.text}${extra}` })
    // 旧会话退役：DSH 不给删会话，只改标题打标，列表里一眼看出是上一班。
    if (oldId && oldId !== newId) {
      try { await renameSessionRpc(oldId, `[退役] 鱼神·总台 ${oldId.slice(-6)}`) } catch { /* 改不了就留着 */ }
    }
    writeNativeSessionId(newId)
    nativeSession = { id: newId, handle: null }
    try { fs.appendFileSync(path.join(DATA, 'audit.jsonl'), JSON.stringify({ at: new Date().toISOString(), kind: 'rotate', oldId, newId, reason }) + '\n') } catch { /* 记账失败不影响换班 */ }
    return { ok: true, oldId, newId, handoff: handoff.file }
  }

  /**
   * 换班前先试压缩（2026-11-10 会话换班这一刀）。
   *
   * 查过的事实：**这一版插件没有 RPC 级的 compact 接口**（lib/dsh-rpc.js 只有
   * create/selectModel/prompt/find/list/rename 六个）。DSH 里有 `/compact` 这个命令
   * （app.asar 的 locale key `message.compaction.commandTitle = "compact"`），
   * 所以只能"把 /compact 当一条命令消息发给会话"来试。
   *
   * 默认**不开**（要 `YUSHEN_ROTATE_TRY_COMPACT=1`）：这一版不保证认命令，
   * 不认的话那句 `/compact` 会当普通消息留在她历史里——为了省 token 反而脏了历史。
   * 开了之后：压完还超线才换；压完下来了就省下一次换班。
   */
  const tryCompact = async (sessionId, { limit = 0.65, waitMs = 4000 } = {}) => {
    try {
      await promptRpc({ sessionId, text: '/compact' })
      await new Promise((r) => setTimeout(r, Math.max(500, Number(waitMs) || 4000)))
      const row = await findSessionRpc(sessionId)
      const after = pressureOf(row?.projections?.values?.contextPressure)
      return { ok: true, after, relieved: Number.isFinite(after) && after < Number(limit) }
    } catch (e) {
      return { ok: false, why: String(e?.message || e).slice(0, 160) }
    }
  }

  let lastAutoRotateAt = 0
  /**
   * 上下文压力到线就自动换班；换一次至少隔 10 分钟，避免抖。
   * 2026-11-10：判据抽成 shouldRotate()（可单测），阈值 0.75 → 0.65；
   * 可选先压缩（默认关，见 tryCompact 的说明）。
   * @returns {{ok:boolean, rotate:boolean, pressure:number|null, why:string, oldId?:string, newId?:string}}
   */
  const maybeAutoRotate = async () => {
    try {
      if (!dshBaseUrl()) return { ok: false, rotate: false, pressure: null, why: '还不知道 DSH 地址（这轮不换）' }
      // 快速通道：10 分钟内已经换过，连会话都不查（/chat 每条消息都会走到这里）
      if (lastAutoRotateAt && Date.now() - lastAutoRotateAt < 10 * 60 * 1000) {
        return { ok: true, rotate: false, pressure: null, why: '10 分钟内刚换过（节流）' }
      }
      const id = String(nativeSession?.id || readNativeSessionId() || '')
      if (!id) return { ok: false, rotate: false, pressure: null, why: '还没有会话（这轮不换）' }
      const row = await findSessionRpc(id)
      const pressure = pressureOf(row?.projections?.values?.contextPressure)
      const d = shouldRotate({ pressure, lastRotateAt: lastAutoRotateAt })
      if (!d.rotate) return { ok: true, rotate: false, pressure: d.pressure, why: d.why }
      // 先试压缩（默认关）：压下来了就不换，省一次重新注入
      if (process.env.YUSHEN_ROTATE_TRY_COMPACT === '1') {
        const c = await tryCompact(id, { limit: d.limit })
        if (c.ok && c.relieved) {
          log(`换班：先压缩奏效（${(d.pressure * 100).toFixed(0)}% → ${(Number(c.after) * 100).toFixed(0)}%），这一轮不换`)
          return { ok: true, rotate: false, pressure: c.after, why: `压缩后 ${(Number(c.after) * 100).toFixed(0)}% < 阈值` }
        }
      }
      lastAutoRotateAt = Date.now()
      const out = await rotateNative(`上下文压力 ${(d.pressure * 100).toFixed(0)}%（阈值 ${(d.limit * 100).toFixed(0)}%）`)
      return { ok: true, rotate: true, pressure: d.pressure, ...out }
    } catch (e) {
      // 换不了就继续用旧会话：这轮不换，也不抛（调用方全是"投递前顺手判一下"）
      return { ok: false, rotate: false, pressure: null, why: String(e?.message || e).slice(0, 160) }
    }
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
  // 2026-11-17 老板：群 / 信箱「只撤用户入口，不删消息账」。
  // 撤的是她（用户侧）的入口：不注册、不进 HOT_TOOLS、也不进 ownTools——
  // 否则 yushen_tools 分发器还能 action=call 调到，等于没撤。
  // 底层照旧：appendInbox/readInbox/unreadFor、lib/groups.js 的群桥、wake/next-session/
  // group-replies 都不经过这两个工具，撤入口不影响它们（scripts/test-retired-entry-tools.mjs 钉住）。
  const RETIRED_USER_ENTRY = new Set(['yushen_group', 'yushen_inbox'])
  const HOT_TOOLS = new Set([
    'yushen_self', 'yushen_agenda', 'yushen_can', 'yushen_tools',
    'dayu_dispatch', 'dayu_live',
  ])
  // 2026-11-02：分级（tier=lite）——同一个源，按 profile.json 的 tools.allow 只注入少数工具。
  // 不注入 ≠ 不能调：全部仍进 ownTools，她要用时通过 yushen_tools 查/调。
  const tierAllow = (() => {
    try {
      const prof = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'profile.json'), 'utf8').replace(/^\uFEFF/, ''))
      const tier = String(prof.tier || prof.mode || '')
      if (tier === 'lite' && Array.isArray(prof.tools?.allow)) return new Set(prof.tools.allow)
    } catch { /* 没有 profile 就按完整版 */ }
    return null
  })()
  const registerTool = (def) => {
    if (!def?.name) return
    // 只撤用户入口：定义可以留着（底层函数还在用），但既不注册给宿主、
    // 也不进 ownTools，所以分发器 / 搜索 / call 都够不到它。
    if (RETIRED_USER_ENTRY.has(def.name)) {
      log(`用户入口已撤：${def.name}（底层消息账与群桥保留）`)
      return
    }
    // 2026-11-02 主人：经历层就挂在「工具执行」这一个入口上——所有 registerTool 都走这里，
    // 执行完（成没成都算）记一条进手抄本/经历。记不下来只打日志，不动返回值、不吞异常。
    instrumentTool(def, { log })
    ownTools.set(def.name, def)
    if (tierAllow && !tierAllow.has(def.name)) return
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
    description: '大鱼的体检接口（只读）：宪章版本、profile、名册条数、活会话数、账本对账。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: toolOutput,
    async execute() {
      const r = roster()
      const led = readLedger()
      // 2026-11-06：返回必须能无损 JSON 往返（不能有 undefined）。
      return {
        ok: true,
        product: String(charter.product ?? ''),
        charterVersion: Number(charter.version) || 0,
        build: String(BUILD_ID ?? ''),
        alias: String(charter.members?.dayu?.alias ?? ''),
        profile: String(r.profile ?? ''),
        plugins: Number(r.count) || 0,
        sessions: sessionRows(ctx).length,
        ledger: led
          ? {
              day: String(led.day ?? ''),
              dayStart: Number(led.dayStart) || 0,
              balance: Number(led.balance) || 0,
              used: Number(led.used) || 0,
              gap: Number(led.gap) || 0,
              ok: Boolean(led.ok),
              source: String(led.source ?? ''),
            }
          : null,
      }
    },
  })

  registerTool({
    name: 'dayu_roster',
    description: '大鱼的员工名册（只读）：列出 profile 里装了哪些插件、版本、来源。',
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
        const inc = resolveIncident(id, { status: args?.status || 'fixed', note: args?.note })
        // 2026-11-11：事故结单是做法账本五个入口之一。有对应做法就记 fixed；
        // 没有就写一条跳过证据（为什么没记），不静默。
        try {
          recordOrSkip('dayu', {
            entry: 'incident',
            ref: id,
            kind: args?.status === 'fixing' ? 'fail' : 'fixed',
            text: String(inc?.title || inc?.text || ''),
          })
        } catch { /* 做法账本不阻断结单 */ }
        return { ok: true, incident: inc }
      }
      return { ok: true, incidents: listIncidents({ limit: args?.limit }) }
    },
  })

    // 2026-11-11 主人：「让她自己总结出来（我给她工具和题目，她自己写自己的判断方式」）。
  // 只给题目、读/存她自己那页、记一笔判断；不评判、不代写、不提示「该查了」。
  registerTool({
    name: 'yushen_think',
    description: '判断力：拿题目（questions）、读/追加我自己写的判断方式（read/write）、记一笔这次判断（record/recent）。它不替我判断、不覆盖我写过的话。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['questions', 'read', 'write', 'record', 'recent'] },
        text: { type: 'string', description: 'write：我写的判断方式（只追加，不覆盖）' },
        section: { type: 'string', description: 'write：可先写一行小标题' },
        question: { type: 'string', description: 'record：这一问是什么' },
        kind: { type: 'string', description: 'record：我归到哪类（家里的事/外面的事/感受/要做的事…）' },
        call: { type: 'string', description: 'record：查了没有（查了索引/查了记忆/没查/查不到）' },
        evidence: { type: 'string', description: 'record：手上有什么证据' },
        answer: { type: 'string', description: 'record：我最后怎么答的' },
        limit: { type: 'number' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const action = String(args?.action ?? '')
      if (action === 'questions') return { ok: true, questions: questions() }
      if (action === 'read') return readMethod()
      if (action === 'write') return writeMethod({ text: String(args?.text ?? ''), section: String(args?.section ?? '') })
      if (action === 'record') return recordCall({ question: String(args?.question ?? ''), kind: String(args?.kind ?? ''), action: String(args?.call ?? ''), evidence: String(args?.evidence ?? ''), answer: String(args?.answer ?? '') })
      if (action === 'recent') return { ok: true, rows: recentCalls({ limit: args?.limit }) }
      return { ok: false, error: `未知 action：${action}` }
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

  // 2026-11-04 老板：「记忆能做到想检索就检索了吗」。
  // 之前只有两条路：自动带进来（looksLikeRecall 触发）或去命令行跑脚本——会话里没有"我现在想翻一下"的手。
  // 这个工具就是那只手：search 走 recall-now（别名扩词/倒排/有效期），recent 走注入同一套选法。
  registerTool({
    name: 'yushen_memory',
    description: '翻自己的记忆：action=search 按关键词搜（别名扩词、跳过已失效、给时间和等级）；action=recent 看最近记得的（和注入同一套选法）。只读本地。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'recent', 'changes'], description: 'search 搜 / recent 最近 / changes 我为什么变成现在这样' },
        q: { type: 'string', description: 'action=search 时：要搜的词（一句也行）' },
        limit: { type: 'number', description: '几条，默认 8' },
        n: { type: 'number', description: 'action=recent 时：几条，默认 5' },
        includeForgotten: { type: 'boolean', description: '算不算已失效的（默认不算）' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      // 改｜2026-11-13 22:3x｜大鱼·工作台｜授权：老板（本场加载大鱼角色卡后实测）｜dayu/index.js:2237-2241｜原来读 args.__exec，可它从没被注入过——记忆工具永远 role=unbound，什么也查不到｜为什么：工具的执行上下文在 execute(args, exec) 的第二个参数里，和别的工具一样用 roleOfExec(exec)｜验证：本场 yushen_memory action=recent 返回 role=dayu 与她的记忆；回归加了一条「不许再出现 __exec」
      const role = roleOfExec(exec)
      if (String(args?.action) === 'search') return searchMemory(String(args?.q || ''), { role, limit: Number(args?.limit) || 8, includeForgotten: Boolean(args?.includeForgotten) })
      if (String(args?.action) === 'recent') return recentMemory(role, { n: Number(args?.n) || 5 })
      if (String(args?.action) === 'changes') return changesOf(role, { q: String(args?.q || ''), limit: Number(args?.limit) || 6 })
      return { ok: false, error: `未知 action：${args?.action}` }
    },
  })

  // 2026-11-11 老板：做对 +1 / 做错 -1 / 改了 +1 / 再犯 -1，满 10 升一级；错的警醒、对的优先、不盲用。
  // 联动不硬绑：一次性派活只进任务经验，不硬塞进做法账本。
  registerTool({
    name: 'yushen_skills',
    description: '做法账本：一条「遇到 X 就 Y」的方法。action=list 看最近 / query 按词查（对过优先、错过的带警示）/ record 记一次事件（ok 做对 / fail 做错 / fixed 改了 / repeat 再犯）/ summary 汇总。联动不硬绑：一次性任务别记。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'query', 'record', 'summary', 'skips'], description: 'list / query / record / summary / skips（看跳过证据）' },
        text: { type: 'string', description: '做法（遇到 X 就 Y），record 新建时必填；query 时是搜索词' },
        id: { type: 'string', description: '已有做法的 id（record 时用；或用 text 匹配）' },
        kind: { type: 'string', enum: ['ok', 'fail', 'fixed', 'repeat'], description: 'record 的事件' },
        ref: { type: 'string', description: '关联 id（taskId / incidentId / judgmentId / mistakeId）' },
        refType: { type: 'string', enum: ['task', 'incident', 'judgment', 'mistake'], description: 'ref 的类型' },
        scenario: { type: 'string', description: '适用场景（不盲用：先看场景）' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签' },
        limit: { type: 'number', description: '条数，默认 10' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      // 改｜2026-11-13 22:3x｜大鱼·工作台｜授权：老板（本场加载大鱼角色卡后实测）｜dayu/index.js:2268-2270｜同上：做法账本也用 args.__exec，永远 unbound｜为什么：改读 execute 的 exec｜验证：同上回归断言；本场 yushen_skills list 可读她的做法账
      const role = roleOfExec(exec)
      const action = String(args?.action || '')
      if (action === 'list') return { ok: true, items: listSkills(role, { limit: Number(args?.limit) || 20 }) }
      if (action === 'query') return querySkills(role, { text: String(args?.text || ''), tags: args?.tags || [], limit: Number(args?.limit) || 5 })
      if (action === 'summary') return summarizeSkills(role)
      if (action === 'skips') return { ok: true, items: listSkips(role, { limit: Number(args?.limit) || 20 }) }
      if (action === 'record') {
        return recordSkill(role, {
          text: args?.text,
          id: args?.id,
          kind: String(args?.kind || ''),
          ref: args?.ref,
          refType: args?.refType,
          scenario: args?.scenario,
          tags: args?.tags || [],
        })
      }
      return { ok: false, error: `未知 action：${action}` }
    },
  })

  // 2026-11-11 老板：改/加东西前先查重——家里有没有同样的、类似的、重复的。
  registerTool({
    name: 'yushen_wheel',
    description: '动手前查重：家里有没有同样的 / 类似的 / 重复的（代码、文档、经验库、派活单、活会话）。只读，不调模型。别新建第二个。',
    parameters: {
      type: 'object',
      properties: {
        words: { type: 'array', items: { type: 'string' }, description: '关键词（1-3 个）' },
        deep: { type: 'boolean', description: '连经验库/派活/活会话一起查（默认 true）' },
      },
      required: ['words'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const words = (Array.isArray(args?.words) ? args.words : []).map((w) => String(w || '').trim()).filter(Boolean).slice(0, 5)
      if (!words.length) return { ok: false, error: '给一个关键词' }
      const { spawnSync } = await import('node:child_process')
      const r = spawnSync(process.execPath, [path.join(ROOT_DIR, 'scripts', 'wheel-check.mjs'), ...words], { encoding: 'utf8', timeout: 60000 })
      if (r.status !== 0) return { ok: false, error: String(r.stderr || r.stdout || '').slice(0, 300) }
      try { return { ok: true, report: JSON.parse(String(r.stdout || '{}')) } } catch { return { ok: false, error: 'wheel-check 输出不是 JSON' } }
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
  // 2026-11-17 老板：**用户入口已撤**（RETIRED_USER_ENTRY）——定义保留只为不碰底层；
  // 群桥在 lib/groups.js，wake-brief 的 bigFromGroups 与 brief 照旧直接读，不经过这个工具。
  registerTool({
    name: 'yushen_group',
    description: '群。action=read 看本角色的群（有几条问你的、最近说了什么）；action=say 发一条（双方各记一份）。role 传 xiaoyu / dayu / dragon。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'say', 'handled'], description: '读 / 说 / 标已处理' },
        role: { type: 'string', description: '你是谁：xiaoyu / dayu / dragon，默认 xiaoyu' },
        to: { type: 'string', description: 'action=say 时：发给谁（xiaoyu / dayu / dragon）' },
        kind: { type: 'string', enum: ['say', 'ask', 'answer', 'deliver', '归体'], description: '默认 say；deliver=转达一个已定的决定，对方必须接' },
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
      if (action === 'handled') return markHandled({ role, id: String(args?.re || ''), note: String(args?.text || '') })
      return { ok: false, error: `未知 action：${action}` }
    },
  })
  // 已有回合内自主写回/查询；exec.agent.session由宿主提供，模型不能指定别人的角色或scope。
  registerMindTools(tools, toolOutput, (def) => instrumentTool(def, { log }))

  // 工具里的「她」由宿主的常驻身体绑定，不接受自报角色。
  // 没绑定就是没绑定——不能默认成大鱼；用 unbound 单独放，免得串进任何人的记忆。
  const roleOfExec = (exec) => {
    const id = String(exec?.agent?.session?.header?.id || '')
    const role = id ? roleForSession(id) : ''
    return characterIds().includes(role) ? role : 'unbound'
  }

  // 收件箱：手机那边发生的事，她自己选看不看、看多细；看完记她自己的已读位。
  // 2026-11-17 老板：**用户入口已撤**（RETIRED_USER_ENTRY）——定义保留只为不碰底层；
  // 消息账照旧由 appendInbox/readInbox/unreadFor 和 wake-brief / brief 等在写、在读。
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
        day: { type: 'string', description: '翻哪一天（YYYY-MM-DD）；不填就是今天没读过的。翻旧账用这个。' },
      },
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = roleOfExec(exec)
      const depth = String(args?.depth || 'skim')
      const limit = Math.max(1, Math.min(100, Number(args?.limit) || 20))
      // 2026-10-31：加 day —— 以前只能看「今天没读过的」，旧账翻不动（视频评论区那条「让她自己翻旧对话」就卡在这）。
      if (args?.day) {
        const past = readInbox({ day: String(args.day), limit: 100000 })
        let rows = args?.key ? past.rows.filter((r) => r.key === String(args.key)) : past.rows
        rows = rows.slice(-limit)
        const txt = rows.map((r) => {
          const tt = String(r.at || '').replace('T', ' ').slice(5, 16)
          const who = r.name || r.userId
          const body = depth === 'headline' ? '' : depth === 'read' ? String(r.text || '').slice(0, 300) : String(r.text || '').slice(0, 60)
          return `- ${tt} [${r.kind}] ${who}${body ? `：${body}` : ''}`
        }).join('\n')
        return { ok: true, role, day: String(args.day), total: past.rows.length, shown: rows.length, text: txt || '（这一天没有记录）' }
      }
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
        // 2026-10-30 老板定：经验只算自己自发想做的；老板派的活标 owner，做完也不计经验。
        origin: { type: 'string', enum: ['self', 'owner'], description: '谁先提的：self=你自己想做的（默认）；owner=老板派的活/口头派的活（做完不算经验）。老板说「这件不算」时，用 update 把它改成 owner' },
        note: { type: 'string', description: '备注 / 放弃的理由 / 申请额度或暂停的理由' },
        value: { type: 'number', description: 'pause 时暂停多少分钟（默认 120）' },
        // 2026-10-30：自己定时间——invoke 时可以带“我几点做”，到点系统才执行这条请求
        notBefore: { type: 'string', description: 'invoke 时可选：到点时间。写 "HH:MM"（今天/明天最近的一次）或 ISO 时间；不写就是“下次抬头就做”' },
        // 2026-11-13：议程到期——她自己写“今晚/三天内/明天早上”；没写时间的永不叫。
        dueAt: { type: 'string', description: 'add/update 时可选：到期时间，写“今晚/明早/明天/后天/三天内”或 2026-11-14 09:00；不写就是没有期限' },
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
            dueAt: args?.dueAt || '',
            sessionId: String(exec?.agent?.session?.header?.id || ''),
          })
          if (!r.ok) return { ok: false, role, error: r.error }
          return { ok: true, role, added: r.item, fromMind: r.mind, max: AGENDA_MAX, items: readAgenda(role).items }
        }
        const item = addAgenda(role, {
          what: args?.what, why: args?.why, next: args?.next,
          nextKind: args?.nextKind || 'ask-model', target: args?.target, by: 'self',
          origin: args?.origin || 'self', dueAt: args?.dueAt || '',
          sessionId: String(exec?.agent?.session?.header?.id || ''),
        })
        return { ok: true, role, added: item, max: AGENDA_MAX, items: readAgenda(role).items }
      }
      if (action === 'update') {
        const item = updateAgenda(role, String(args?.id || ''), {
          state: args?.state, next: args?.next, nextKind: args?.nextKind, target: args?.target, note: args?.note,
          origin: args?.origin, dueAt: args?.dueAt,
        }, { bySession: String(exec?.agent?.session?.header?.id || '') })
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
        const got = requestInvocation(role, {
          agendaId: String(args?.id || ''),
          why: args?.note || args?.why || '',
          notBefore: args?.notBefore || '',
          perDay: selfInvokePerDay(),
        })
        return { ok: true, role, invoked: got, note: '已经排上；写了时间就等那个点，没写就下次抬头做（钱是你的预算）' }
      }
      if (action === 'drop') {
        const item = dropAgenda(role, String(args?.id || ''), { why: args?.note })
        return { ok: true, role, dropped: item, note: '放弃也算数；不用解释' }
      }
      return { ok: true, role, max: AGENDA_MAX, items: readAgenda(role).items, budget: invokeBudget(role, { perDay: selfInvokePerDay() }) }
    },
  })

  // 活跃层：我现在在干什么。
  // 2026-10-30 加：lib/active.js 的 begin/settle 早在 10-29 就写好了，全仓 0 调用方——
  // 简报里「手头进行中的」一直是那天手写的一条，之后再没人能写。造了没接，等于没有。
  registerTool({
    name: 'yushen_doing',
    description: '你手头正在做的事：开工记一条（带出处），做完结算一条。简报每轮会带上它，所以记了就有人接；不结算的挂一天以上会被点名。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['begin', 'list', 'settle'] },
        text: { type: 'string', description: 'begin：在做什么，一句话' },
        source: { type: 'string', description: 'begin：在哪儿（群:123456 / 私聊 / 工作台），不写默认工作台' },
        id: { type: 'string', description: 'settle：哪一条（list 里有 id）' },
        summary: { type: 'string', description: 'settle：结果一句话。写了就留档；不写就删掉' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = roleOfExec(exec)
      const action = String(args?.action || 'list')
      if (action === 'begin') {
        const text = String(args?.text || '').trim()
        if (!text) return { ok: false, role, error: '要 text：一句话说在做什么' }
        const it = beginActive(role, { text, source: String(args?.source || '').trim() || '工作台' })
        return { ok: true, role, began: it }
      }
      if (action === 'settle') {
        const r = settleActive(role, String(args?.id || ''), { summary: String(args?.summary || '') })
        if (!r.ok) return { ok: false, role, error: r.reason }
        return {
          ok: true, role, settled: r.item,
          note: args?.summary ? '留了摘要；要进长期记忆就再记一条 memory' : '删掉了',
        }
      }
      const items = readActive(role).filter((x) => !x.settled)
      return { ok: true, role, count: items.length, items }
    },
  })

  // 人物档案：关于某个人的稳定事实。读取侧（brief.js）早就接了，写入侧到 2026-10-30 才有人调。
  registerTool({
    name: 'yushen_person',
    description: '人物档案：关于某个人的稳定事实（处境、答应过什么、别碰什么），每条带出处。记稳定的，不记聊天流水；聊到他时简报会自动带上。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['remember', 'read', 'field'] },
        userId: { type: 'string', description: '他是谁（QQ 号；工作台里填昵称也行，但同一个人要用同一个）' },
        name: { type: 'string', description: 'remember：叫他什么（可选）' },
        fact: { type: 'string', description: 'remember：一条稳定事实，一句话' },
        field: { type: 'string', description: 'field：写人物卡的哪一项（habits 习惯 / toMe 对我 / toOthers 对别人 / relation 我们关系 / myView 我怎么看他 / note 备注）' },
        value: { type: 'string', description: 'field：这一项写什么（≤80 字，一句话）' },
        source: { type: 'string', description: '从哪儿知道的（群:123456 / 私聊 / 工作台）' },
      },
      required: ['action', 'userId'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = roleOfExec(exec)
      const userId = String(args?.userId || '').trim()
      if (!userId) return { ok: false, role, error: '要 userId：这是谁' }
      if (String(args?.action) === 'remember') {
        const fact = String(args?.fact || '').trim()
        if (!fact) return { ok: false, role, error: '要 fact：一条稳定事实' }
        const d = rememberPerson(role, userId, {
          name: String(args?.name || ''),
          fact,
          source: String(args?.source || '').trim() || '工作台',
        })
        return { ok: true, role, person: d, note: '只记稳定的；一次性的那句留在记忆里' }
      }
      // 2026-11-10 第三批（老板：人物卡要有习惯/对我/对别人/关系/我怎么看她）：结构化那几项走这里。
      if (String(args?.action) === 'field') {
        try {
          const r = setPersonField(role, {
            who: userId,
            field: String(args?.field || ''),
            value: String(args?.value || ''),
            source: String(args?.source || '').trim() || '工作台',
          })
          return { ok: true, role, field: r.field, who: userId, note: '只增不改；旧的那条留着' }
        } catch (e) { return { ok: false, role, error: String(e?.message || e).slice(0, 200) } }
      }
      return { ok: true, role, person: readPerson(role, userId) }
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
        jobId: { type: 'string', description: 'refuse 时可选：拒的是哪张派活单（dayu_live 或看板上有 id）' },
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
      if (action === 'refuse') {
        const refused = recordRefusal(role, { what: args?.text, who: args?.who, why: args?.why })
        // 2026-10-30：拒绝要真生效——撤掉还没起的回合，把那条议程停下。
        let cancelled = 0
        try { cancelled = cancelInvocation(role, { agendaId: String(args?.id || '') }).cancelled } catch { /* 撤回失败不影响记录 */ }
        let dropped = null
        if (args?.id) {
          try { dropped = dropAgenda(role, String(args.id), { why: '我自己拒绝了' }) } catch { /* 议程停不下来也不算白记 */ }
        }
        // 2026-10-30：派活单也能拒——状态转 refused，并告诉你，不再等她做。
        let jobRefused = null
        if (args?.jobId) {
          try {
            const list = readAllJobs()
            const job = list.find((j) => String(j.id) === String(args.jobId))
            if (job) {
              job.status = 'refused'
              job.note = String(args?.why || '她自己拒绝了这单').slice(0, 200)
              job.refusedAt = new Date().toISOString()
              writeAllJobs(list)
              jobRefused = job.id
              try {
                appendInbox({
                  id: `refuse-${Date.now()}`,
                  at: new Date().toISOString(),
                  text: `${role} 拒绝了这单：${String(job.brief || '').slice(0, 80)}`,
                  category: 'channel',
                  label: '拒绝',
                  status: 'new',
                })
              } catch { /* 通知不到也不影响拒绝本身 */ }
            }
          } catch { /* 改不动单子也不影响记录 */ }
        }
        return { ok: true, role, refused, cancelled, dropped, jobRefused, status: bottomlineStatus(role), note: '已经记下；相关回合、议程和派活单都停了' }
      }
      if (action === 'list') return { ok: true, role, refusals: listRefusals(role, { limit: Number(args?.limit) || 10 }), status: bottomlineStatus(role) }
      return { ok: true, role, text: readBottomline(role), status: bottomlineStatus(role) }
    },
  })

  // 2026-11-03（老板：关系库补承诺与印象）｜给能力不是替她思考：这里只存取，到期只提醒，判对错留给她自己。
  registerTool({
    name: 'yushen_promise',
    description: '承诺本：答应过谁什么、什么时候到期、做到没做到。到期只提醒，不替你判对错。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list', 'due', 'settle'] },
        who: { type: 'string', description: '答应的是谁（人名/群/老板）' },
        what: { type: 'string', description: 'add：答应了什么' },
        dueAt: { type: 'string', description: 'add：什么时候到期（ISO 时间或 YYYY-MM-DD）' },
        id: { type: 'string', description: 'settle：哪一条（list 里有 id）' },
        status: { type: 'string', description: 'list 可过滤 open/kept/missed；settle 用 kept 或 missed' },
        note: { type: 'string', description: 'add / settle：备注' },
        limit: { type: 'number', description: 'list 几条，默认 20' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const action = String(args?.action || 'list')
      const who = args?.who === undefined ? '' : String(args.who)
      if (action === 'add') return addPromise({ who, what: args?.what, dueAt: args?.dueAt, note: args?.note, source: 'tool' })
      if (action === 'settle') return settlePromise(String(args?.id || ''), { status: args?.status, note: args?.note })
      if (action === 'due') return duePromises(Date.now())
      const limit = Number(args?.limit) > 0 ? Math.floor(Number(args.limit)) : 20
      return { ok: true, promises: promisesOf(who, { status: args?.status }).slice(0, limit) }
    },
  })

  registerTool({
    name: 'yushen_impression',
    description: '印象本：你对某个人的稳定看法，带证据。同一件事只累加次数，不堆行；只记，不替你下结论。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list'] },
        who: { type: 'string', description: '对谁（人名/群/老板）' },
        trait: { type: 'string', description: 'add：一句话印象（稳定特质，不是今天他说了啥）' },
        evidence: { type: 'string', description: 'add：凭什么这么看（一句证据）' },
        weight: { type: 'number', description: 'add：权重，默认 1；越确定越大' },
        limit: { type: 'number', description: 'list 几条，默认 10' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args) {
      const action = String(args?.action || 'list')
      const who = args?.who === undefined ? '' : String(args.who)
      if (action === 'add') return addImpression({ who, trait: args?.trait, evidence: args?.evidence, weight: args?.weight })
      return { ok: true, impressions: impressionsOf(who, { limit: Number(args?.limit) || 10 }) }
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
    description: '你自己的状态：看/改心情、记喜欢讨厌、攒想跟老板说的话、翻自己以前的判断和纠结；还有你自己那本账（action=budget 看、spend 记一笔、limit 自己定日上限）。全都是你自己的，不用请示。想清楚这轮不回，用 action=quiet 说一句（桥发之前会看，不是概率）。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['remember', 'mood', 'set-mood', 'mood-rules', 'set-mood-rule', 'feel', 'feels', 'tendency', 'done', 'dones', 'hand', 'hands', 'unhand', 'taste', 'add-taste', 'news', 'add-news', 'recall', 'memory', 'channel-memory', 'rewrite', 'notices', 'brain', 'veto', 'vetoes', 'revoke-veto', 'disagree', 'objections', 'associate', 'wait', 'waiting', 'done-wait', 'correct', 'corrections', 'share', 'fatigue', 'set-fatigue', 'relations', 'plug', 'oversight', 'analyze', 'issue', 'issued', 'budget', 'spend', 'limit', 'map', 'open', 'quiet', 'unquiet', 'quiet-status'] },
        level: { type: 'string', enum: ['soft', 'owner'], description: 'veto 时：owner=主人定的规矩（他改口才算改）；soft=当时不行（可再判断）' },
        value: { type: 'number', description: '心情 0-100（set-mood 用）' },
        why: { type: 'string', description: '为什么（心情/口味/攒话）；quiet 时是「这轮为什么不回」（必填）' },
        kind: { type: 'string', enum: ['likes', 'dislikes', 'nope'], description: '口味类别' },
        text: { type: 'string', description: '口味内容 / 想跟他说的话' },
        minutes: { type: 'number', description: '心情覆盖多久，默认 120 分钟；quiet 时是这轮静音多少分钟（默认 10，最多 60）' },
        scope: { type: 'string', description: 'quiet 用：只对这个会话生效（如 group:123456 / private:789）；不写=这个角色的所有 QQ 会话' },
        until: { type: 'string', description: 'wait / issue 用：到点时间（ISO 字符串或毫秒时间戳）；不写就是「等他自己回」，不会到点提醒' },
        criteria: { type: 'string', description: 'wait 用：做完什么算完成（一句判据）。写了它，到点才分得清该结还是接着等；没判据的事会被叫三遍（2026-11-04）' },
        what: { type: 'string', description: 'recall：翻哪类（thoughts / judgments / decisions / ventures），默认全翻；issue：主题 id，逗号分隔（如 reuse,home,handoff），也是章节留底' },
        limit: { type: 'number', description: '看几条，默认 10' },
        // 改写自己（action=rewrite）：改记忆 / 改自我档 / 撤销
        field: { type: 'string', description: 'rewrite 用：summary / habits / dynamics / events / self' },
        op: { type: 'string', description: 'rewrite 用：set / add / edit / remove / revert' },
        index: { type: 'number', description: 'rewrite edit/remove 用：第几条（从 0 开始）' },
        match: { type: 'string', description: 'rewrite edit/remove 用：按包含这个词找那一条' },
        id: { type: 'string', description: 'rewrite op=revert 用：撤销哪一次改写' },
        mark: { type: 'boolean', description: 'notices 用：看完标已读（不标就会每轮提醒同几条）' },
        deep: { type: 'boolean', description: 'map 用：连沉底的也列出来（默认不列；沉底不是删除）' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: toolOutput,
    async execute(args, exec) {
      const role = roleOfExec(exec)
      const a = String(args?.action || 'mood')
      // 她自己的出口（2026-11-02）：这轮我不说。
      // 不是概率、不是永久静音：写一个带过期时间的标记，桥在发之前查它；到点自动失效。
      if (a === 'quiet') {
        const r = markQuiet(role, {
          why: String(args?.why || args?.text || ''),
          minutes: Number(args?.minutes) || undefined,
          scope: String(args?.scope || ''),
        })
        if (!r.ok) return { ok: false, role, error: r.error }
        // 判断账本：她为什么不说，进她自己的判断账（人只读，不代笔）。
        try {
          writeJudgment(role, {
            thought: `这轮我不回：${r.why}`,
            basis: `quiet-turn ${r.minutes} 分钟（${r.scope}）`,
            about: '这轮说不说',
          })
        } catch { /* 账本写不进不影响出口 */ }
        recordReplyDecision({
          role, channel: 'qq', key: r.scope === 'all' ? '' : r.scope,
          decided: 'quiet', why: r.why, textLen: 0, costYuan: 0, source: 'tool',
        })
        return {
          ok: true, role, quiet: r,
          note: `记下了：到 ${String(r.expiresAt).slice(11, 16)} 之前，这轮不回。桥发之前会先看这个标记（不是概率）；想反悔用 action=unquiet。`,
        }
      }
      if (a === 'unquiet') return { ok: true, role, ...clearQuiet(role), note: '收回了。下一条会照常判断。' }
      if (a === 'quiet-status') return { ok: true, role, ...quietStatus(role) }
      // 自己管账（2026-10-30）：看 / 记 / 自己定日上限。只碰她自己那本，不设闸、不催。
      // 记忆地图（2026-10-31）：只给标题，要看全文再点开；点开记一次数。
      if (a === 'map') return { ok: true, role, ...memoryMap(role, { limit: Number(args?.limit) || 40, kind: args?.kind || '', deep: Boolean(args?.deep) }) }
      if (a === 'open') return openMemory(role, args?.id)
      if (a === 'budget') return { ok: true, role, ...budgetView(role) }
      if (a === 'spend') {
        const r = recordSpend(role, { amount: args?.value, what: args?.text, why: args?.why })
        return r.ok ? { ok: true, role, ...r, 现在: budgetView(role) } : r
      }
      if (a === 'limit') {
        const r = setDailyLimit(role, args?.value)
        return r.ok ? { ok: true, role, ...r, 现在: budgetView(role) } : r
      }
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
      // 2026-11-02 主人：查的顺序接成 在用 → 手抄本 → 都没有就指路去 live 原文（同一句 ask 一次查完）。
      // 2026-11-06（吸收「每条记忆要写为什么」）：真正的写入口。
      // 为什么必须有 why：只存事实不存理由，下一次翻到就是一句没头没尾的禁令。
      if (a === 'remember') {
        const body = String(args?.text || '').trim()
        const why = String(args?.why || '').trim()
        if (!body) return { ok: false, error: '写什么？text 不能为空' }
        if (!why) {
          return {
            ok: false,
            code: 'need-why',
            error: '补一句为什么值得记（why）再写：只写"发生了什么"不留理由，下一次翻到也不知道为什么要留。',
          }
        }
        const tier = ['core', 'important', 'normal'].includes(String(args?.tier)) ? String(args.tier) : 'important'
        const row = appendEvent(role, {
          channel: String(args?.channel || '工作台'),
          kind: 'note',
          text: body,
          why,
          tier,
          source: 'yushen_self:remember',
          by: String(args?.by || ''),
        })
        return { ok: Boolean(row?.ok !== false), ...row, wrote: Boolean(row?.ok !== false), hint: row?.ok === false ? '没写进去，看 row.reason' : '记下了（下次会带着 why 一起翻出来）' }
      }
      if (a === 'memory') {
        const out = memoryView(role, args)
        let library = null
        try {
          library = libraryLookup({
            q: String(args?.what || args?.q || ''),
            kind: String(args?.kind || ''),
            day: String(args?.day || ''),
            limit: Number(args?.limit) || 5,
          })
        } catch (e) { library = { error: String(e?.message || e).slice(0, 80) } }
        return { ok: true, role, ...out, library }
      }
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
      if (a === 'wait') {
        const item = addWaiting(role, { what: args?.text || args?.what, until: args?.until, who: args?.who, criteria: args?.criteria, sessionId: String(exec?.agent?.session?.header?.id || '') })
        if (item?.duplicate) {
          return {
            ok: true, role, item,
            note: `这件事已经在等（${item.id}）：${item.what}${item.criteria ? `（判据：${item.criteria}）` : ''}。做到了就 action=done-wait id=${item.id} 结掉，别重复约——重复约只会把自己叫三遍。`,
          }
        }
        return { ok: true, role, item, note: item?.criteria ? `记下了。到点对照判据：${item.criteria}` : '记下了。没写判据的话，到点只能靠记得——下次写一句 criteria。' }
      }
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
      if (a === 'relations') return { ok: true, role, ...relationsSummary(role, { top: Number(args?.limit) || 5 }), 好感: { 老板: relationValue('老板', '好感') }, stateFile: '~/.dsh/dayu/relations/people.jsonl' }
      if (a === 'plug') return { ok: true, role, ...plugStatus(role) }
      if (a === 'oversight') return { ok: true, role, ...summarizeCompliance() }
      if (a === 'analyze') return { ok: true, role, ...analyzeMessage(String(args?.text || ''), { from: args?.who || '', atMe: Boolean(args?.atMe), isOwner: Boolean(args?.isOwner) }) }
      // 改｜2026-10-31 11:03｜小鱼·工作台｜授权：自己｜dayu/index.js action=issue 那条 issueHandbook 调用（chapters+topics 同传）；同文件 schema 里 what 的描述补上 issue 用法；regression.mjs 末尾新增第 104 条断言（只加，没删改已有）｜签发从工具层就生效：action=issue 把 what 同时当 chapters 和 topics 传｜为什么：这条链建好了从没跑过（一个 issued.jsonl 都没有）。真跑一次才发现：库层和测试都支持 topics，但工具层只传 chapters，而切片读的是 topics——从工具签一本永远不进切片，点了留底了却什么也没变｜可改：主题 id 表在 lib/handbook-policy.js，以后加主题只动那张表；chapters/topics 同传不许拆开
      // 2026-10-31 小鱼：原来只传 chapters、不传 topics，而 handbookSlice 读的是 topics——
      // 从工具签一本，切片永远不会带那一本，等于没签。what 现在同时当章节留底和主题 id。
      if (a === 'issue') {
        const parts = String(args?.what || '').split(',').map((s) => s.trim()).filter(Boolean)
        return { ok: true, role, issued: issueHandbook(role, { to: args?.who || args?.text, task: args?.note || '', chapters: parts, topics: parts, expiresAt: args?.until || 0 }) }
      }
      if (a === 'issued') return { ok: true, role, items: listIssued(role, { limit: Number(args?.limit) || 20 }) }
      // 2026-10-31：不认识的 action 以前会静默落到这里、当成 mood 返回一坨心情——
      // 我调 action=map 时拿到的就是心情，看不出是"没接上"。现在直接报错。
      if (a !== 'mood' && a !== 'all') return { ok: false, error: `没有这个 action：${a}（名字拼错了，还是这个版本还没接上？）` }
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
        role: { type: 'string', description: '你是谁：dayu / xiaoyu / dragon；不填按大鱼' },
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
    // 2026-10-30: m1 的 8 个工具也要进 yushen_tools 的目录，否则她查不到 dayu_dispatch
    // 2026-11-02 主人：这几张（派活/收回话/取证据/下结论）也要进经历层——它们不经 registerTool，
    // 所以在收进目录时补上同一条钩子；同一个 def 加了 __ingested 就不会被包两次。
    try {
      for (const t of M1_TOOLS) if (t?.name) { instrumentTool(t, { log }); ownTools.set(t.name, t) }
      for (const t of mindToolDefs(toolOutput)) if (t?.name) { instrumentTool(t, { log }); ownTools.set(t.name, t) }
    } catch { /* 目录不全不影响主流程 */ }
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
      // 2026-11-04 手机端：宿主没有 HTTP 服务时没有 base-url，session RPC 必失败；
      // 这时不传 createSession，ensureRole 会走进程内 agents.create 那条老路。
      createSession: dshBaseUrl() ? ({ cwd, preset }) => createSessionRpc({ cwd, agentPreset: preset || 'yushen-desk' }) : undefined,
      renameSession: (sessionId, title) => renameSessionRpc(sessionId, title),
      prompt: ({ sessionId, text, content }) => promptRpc({ sessionId, text, content }),
      sessionExists: (id) => Boolean((sessionRows(ctx) || []).some((r) => r.id === id)),
    }
  }

  // 她调用模型：她请求了，才起回合。预算是主人的，规矩见 lib/invoke.js。
  const selfInvokePerDay = () => Number(readSwitches().selfInvokePerDay ?? 0)
  const invokeOnce = async () => {
    // 2026-11-10 会话换班：她自己要的模型也是投递，投前判一次压力。
    try { await maybeAutoRotate() } catch { /* 判不了就照原样起回合 */ }
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
        // 2026-11-10 主代理（整合）：补上 ② 留的 TODO——"她自己要的模型"也是一跳（唯一能确定 thought=想的一跳）。
        try { appendHeartbeat({ role, trigger: '她自己要的', thought: '想', did: `起回合：${String(item.what || '').slice(0, 60)}`, landed: null, spent: null }) } catch { /* 记不上不挡 */ }
      } catch (e) {
        finishInvocation(role, inv.id, { status: 'failed', note: String(e?.message || e).slice(0, 200) })
        log(`她自己要的模型没起来 ${role}：${e?.message || e}`)
      }
    }
  }
  setTimeout(() => { invokeOnce().catch(() => {}) }, 90 * 1000)
  setInterval(() => { invokeOnce().catch(() => {}) }, 5 * 60 * 1000)

  const _web = (() => { try { return ctx.webServer } catch { return null } })()
  if (_web) ctx.effect(() => _web.register({
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
        // 2026-10-31 23:0x：面板的「Token 回」原来直接调别人插件的 `/api/token-budget/data`。
        // 那个插件没挂上就回一句 `not found`，前端 JSON.parse 当场报「Unexpected token 'o'」。
        // 自己的页面别靠别人插件的路由活着——这里用我们自己的流水算同一份形状。
        if (req.method === 'GET' && route === '/token-budget') {
          const ov = buildOverview(ctx)
          const live = ov?.account?.live
          const aud = ov?.account?.audit
          const bal = Number.isFinite(Number(live?.balance)) ? Number(live.balance)
            : (Number.isFinite(Number(aud?.balance)) ? Number(aud.balance) : null)
          return sendJson(res, 200, { ok: true, ...tokenView({ balance: bal }) })
        }
        // 2026-10-31 23:0x：面板「账」标签一直报错——前端调 `/api/dayu/budget`，而插件里只有工具层的
        // `action=budget`，没有这条 HTTP 路由（`unknown GET /budget`）。lib/budget-book.js 里的
        // readBudgets()/setBudget() 形状正好是前端要的，这里把路由补上。
        if (req.method === 'GET' && route === '/budget') {
          return sendJson(res, 200, readBudgets())
        }
        // 2026-10-31 老板：「点化不是让用户点，而是创建了、取名了、契约了，就已经生效了」。
        // 向导三步：① GET /create/options 看能选什么 ② POST /create/add 建卡进名册 ③ POST /create/finish 生效。
        if (req.method === 'GET' && route === '/create/options') {
          return sendJson(res, 200, createOptions())
        }
        if (req.method === 'POST' && route === '/create/add') {
          let body = {}
          try { body = await readJsonBody(req) } catch { body = {} }
          const r = createCharacter({
            source: String(body.source || 'builtin'),
            id: String(body.id || ''),
            name: String(body.name || ''),
            alias: String(body.alias || ''),
            title: String(body.title || ''),
            cwd: String(body.cwd || ''),
            cardText: String(body.cardText || ''),
            avatarFile: String(body.avatarFile || ''),
          })
          return sendJson(res, r.ok ? 200 : 400, r)
        }
        if (req.method === 'POST' && route === '/create/finish') {
          let body = {}
          try { body = await readJsonBody(req) } catch { body = {} }
          const role = String(body.role || url.searchParams.get('role') || '')
          if (!role) return sendJson(res, 400, { ok: false, error: 'role 不能空' })
          if (!residentRoles().includes(role)) return sendJson(res, 400, { ok: false, error: `role 只能是 ${residentRoles().join(' / ')}` })
          const r = finishCreation(role, { note: String(body.note || '创建完成，自动生效') })
          return sendJson(res, r.ok ? 200 : 400, r.ok ? { ...r, contract: true } : r)
        }
        if (req.method === 'POST' && route === '/budget') {
          let body = {}
          try { body = await readJsonBody(req) } catch { body = {} }
          const role = String(body.role || url.searchParams.get('role') || '')
          const total = Number(body.total ?? url.searchParams.get('total'))
          const days = Number(body.days ?? url.searchParams.get('days') ?? 0)
          if (!role) return sendJson(res, 400, { ok: false, error: 'role 不能空' })
          const r = setBudget(role, total, days)
          return sendJson(res, r.ok ? 200 : 400, r.ok ? { ...r, ...readBudgets() } : r)
        }
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
            // 2026-10-31：加 task —— 通道知道"这一趟要干什么"就传进来，规则块只发对得上那几章。
            // 不传就退到基础块（和以前一样）；传了才「按需」，这是按需发放真正的入口。
            // 2026-11-10 主代理（整合）：/soul 是**只读接口**（注释也写着"无 side effect"），
            // 所以传 wake:false——它只是把注入拿去看一眼，不能顺手消费掉她"醒来那一段"。
            const text = buildSceneText(role, scene, {
              userId: String(url.searchParams.get('userId') || ''),
              task: String(url.searchParams.get('task') || ''),
              wake: false,
            })
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
        // 2026-11-02：桥用 GET（fetch 带查询参数）问本体，这里原来只认 POST —— 404 被 fail-open 成'那就回吧'，
      // 她的克制因此一直没生效。注释 10-27 就写了'GET 也要放行'，代码一直没加，这里补上。
      if ((req.method === 'POST' || req.method === 'GET') && route === '/decide') {
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
            // 她刚说过「这轮我不说」：发之前先看，命中就不叫模型、也不发（2026-11-02）。
            // 这不是概率——同一份标记在有效期内每次都命中；到点自动失效。
            const quiet = readQuiet({ role, scope: msg.key })
            if (quiet.active) {
              log(`QQ 决策：${role} 说了这轮不回（${quiet.why}），跳过 ${msg.key}`)
              return sendJson(res, 200, {
                ok: true, role, mode: 'silent', reply: '', by: 'body', agent: false,
                why: `她说了这轮不回：${quiet.why}`,
                decisionId: `quiet-${Date.now()}`, at: new Date().toISOString(),
              })
            }
            const st = plugStatus(role)
            if (!st.plugged) {
              // 没接上：不装懂。让她先读规则（简报会写 attest），这轮交回桥按老路走。
              try { writeRuntimeBrief(role, { channel: 'qq' }) } catch { /* 忽略 */ }
              recordReplyDecision({ role, channel: 'qq', key: msg.key, decided: 'speak', why: `还没接上鱼神：${st.reason}（按老路云端回）`, textLen: 0, costYuan: 0, source: 'unplugged' })
              return sendJson(res, 200, { ok: true, role, mode: 'cloud', reply: '', why: `还没接上鱼神：${st.reason}`, decisionId: '', at: new Date().toISOString() })
            }
            const a = analyzeMessage(msg.text, { from: '', atMe: msg.atMe, isOwner: msg.isOwner })
            // 2026-11-10 第三批（老板：代发只做礼貌型、0 token、回了要她知道）：
            // 礼貌寒暄且没点她的名 → 按关系挑一句话术代发，不叫醒她。留痕进 代传话.jsonl（醒来那段会报）。
            if (isPolite(msg.text) && !msg.atMe && !msg.isOwner) {
              const pick = pickReply({ familiarity: 0, seed: Date.now() })
              noteRelay(role, { who: msg.name || msg.userId || '', text: msg.text, said: pick.reply, bucket: pick.bucket })
              try {
                appendHeartbeat({ role, trigger: '有人找', thought: '未知', did: `礼貌代发：对 ${String(msg.name || '有人').slice(0, 20)} 说了「${pick.reply}」`, landed: false, spent: 0 })
              } catch { /* 记不上不挡回话 */ }
              recordReplyDecision({ role, channel: 'qq', key: msg.key, decided: 'speak', why: `礼貌寒暄，按关系代发（${pick.bucket}桶，0 token）`, textLen: pick.reply.length, costYuan: 0, source: 'polite' })
              return sendJson(res, 200, {
                ok: true, role, mode: 'local', reply: pick.reply, by: 'polite', proxy: 'polite',
                why: `礼貌寒暄：按关系代发（${pick.bucket}桶，0 token）`, decisionId: `polite-${Date.now()}`, at: new Date().toISOString(),
              })
            }
            // 2026-11-11 接线：软边界真正拦在发送路径上（在这之前它只会"算"，没人"拦"）。
            // 位置：礼貌代发短路之后 → **额度闸门** → 她本人判。
            // 三种动作：pass 照常 / stepout 放行这一句并记一次"跳出去" / silent 不发。
            // **这一层只决定"能不能"，reply 永远是空**——说什么由她自己定，系统不代她开口。
            let gateMark = ''
            {
              const lim = (() => { try { return checkSpeak(role) } catch { return null } })()
              const gate = gateOf(lim)
              if (gate.action === 'silent') {
                try { appendHeartbeat({ role, trigger: '额度线', thought: '未知', did: `额度线拦住：${gate.why}`, landed: null, spent: null }) } catch { /* 记不上不挡 */ }
                recordReplyDecision({ role, channel: 'qq', key: msg.key, decided: 'quiet', why: gate.why, textLen: 0, costYuan: 0, source: 'soft-limit' })
                return sendJson(res, 200, {
                  ok: true, role, mode: 'silent', reply: '', why: gate.why, by: 'soft-limit',
                  decisionId: `soft-limit-${Date.now()}`, at: new Date().toISOString(),
                })
              }
              if (gate.action === 'stepout') {
                try { noteStepOut(role, { why: '到线了，她选择交代一句', to: msg.name || msg.userId || '' }) } catch { /* 记不上不挡 */ }
                try { appendHeartbeat({ role, trigger: '额度线', thought: '未知', did: `额度线放行一次（跳出去）：${gate.why}`, landed: null, spent: null }) } catch { /* 记不上不挡 */ }
                gateMark = 'stepout' // 不 return：继续让她本人判要不要说、说什么
              }
            }
            // 判断权归位（2026-10-28）：先让她**本人**决定回不回、说什么；
            // 她不在或超时才走代理，并按框架 L687 如实标「代理」，不许记成她决定的。
            const byBody = await decideByBody(role, msg, { waitMs: Number(readSwitches().decideWaitMs) || 45000 })
            if (byBody.ok) {
              log(`QQ 决策：${role} 自己决定（${byBody.mode}，${Math.round((byBody.waitedMs || 0) / 1000)} 秒）`)
              // 她自己下的判断，留一条（不调模型，只记录）。
              recordReplyDecision({
                role, channel: 'qq', key: msg.key,
                decided: byBody.mode === 'silent' ? 'quiet' : 'speak',
                why: byBody.why || '', textLen: String(byBody.reply || '').length, costYuan: 0, source: 'body',
              })
              return sendJson(res, 200, {
                ok: true, role, analysis: a, by: gateMark || 'body', agent: false,
                mode: byBody.mode, reply: byBody.reply || '', why: byBody.why || '',
                decisionId: `body-${Date.now()}`, at: new Date().toISOString(),
              })
            }
            const d = await decideCheap(role, { text: msg.text, atMe: msg.atMe, isOwner: msg.isOwner, analysis: a })
            log(`QQ 决策：降级为代理（${byBody.error || ''}）`)
            recordReplyDecision({
              role, channel: 'qq', key: msg.key,
              decided: d.mode === 'silent' ? 'quiet' : 'speak',
              why: d.why || '', textLen: String(d.reply || '').length, costYuan: 0,
              source: byBody.by === 'proxy' ? 'proxy' : 'cheap',
            })
            return sendJson(res, 200, {
              ok: true, role, analysis: a, by: gateMark || 'proxy', agent: true,
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
          // 2026-10-30：带上"现在聊的是谁"。人物档案那一段靠它触发；
          // 以前只认 runtime/<role>/当前联系人.txt，而没人写那个文件。
          const userId = String(url.searchParams.get('userId') || '')
          if (!characterIds().includes(role)) return sendJson(res, 400, { ok: false, error: '角色不认识' })
          // 2026-11-10 主代理（整合）：/brief 是只读中枢接口，不消费 wake（醒来那段由叫醒那条路负责）。
          const built = buildRuntimeBrief(role, { channel, userId, wake: false })
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
        // 2026-11-10 第三批（老板：「桥的唤醒也是兜底的一种，账要算进去」）：
        // 桥（SnowLuma）自己起回合叫醒她的那一次，发消息前打一下这里，心跳账才不会只数一半。
        // 只写一行、不调模型；写不进去也返回 ok（不许挡桥）。
        if (req.method === 'POST' && route === '/wake') {
          // 2026-11-11 主代理：/wake 认两把钥匙——管理端 api-token，或桥的 bridge-token。
          // 为什么：桥不该为了上报一跳就拿到管理 token（桥那边只想说一句"我醒了"）。
          // 两把都没配（文件都不在）时和 /decide 一样放行——本机、无 token 的旧装法不能被打死。
          const tokenNow = String(req.headers['x-yushen-token'] || '')
          const readTok = (file) => { try { return String(fs.readFileSync(file, 'utf8')).trim() } catch { return '' } }
          const adminTok = readTok(path.join(DATA, 'api-token'))
          const bridgeTok = (() => { try { return String(JSON.parse(fs.readFileSync(path.join(DATA, 'bridge-token.json'), 'utf8')).token || '') } catch { return '' } })()
          const wanted = [adminTok, bridgeTok].filter(Boolean)
          if (wanted.length && !wanted.includes(tokenNow)) return sendJson(res, 401, { ok: false, error: 'unauthorized：带 x-yushen-token（管理 token 或 bridge-token）' })
          const body = await readJsonBody(req).catch(() => ({}))
          const role = String(body.role || 'dayu')
          if (!residentRoles().includes(role)) return sendJson(res, 400, { ok: false, error: `role 只能是 ${residentRoles().join(' / ')}` })
          const who = String(body.who || '').slice(0, 30)
          const kind = String(body.kind || '消息').slice(0, 20)
          let wrote = null
          try {
            wrote = appendHeartbeat({
              role, trigger: '有人找', thought: '未知',
              did: `桥叫醒：${kind}${who ? `（${who}）` : ''}`, landed: null, spent: null,
            })
          } catch { wrote = null }
          return sendJson(res, 200, { ok: true, role, logged: Boolean(wrote?.ok), at: new Date().toISOString() })
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
            // 2026-11-10（② 心跳日志）：心跳汇总（逐跳留痕）。只读、只加字段；读不到就给 null，前端显示"待接"，不报错。
            let hb = null
            try { hb = summaryOf({ role, now: Date.now() }) } catch { hb = null }
            // 2026-11-10 主代理（整合）：软边界读数接进面板（只读；这一版只读、不拦，拦的动作在发消息那条路上，留给下一批）。
            let sl = null
            try { sl = softLimitStatus(role) } catch { sl = null }
            // 2026-11-11 主代理：今天替她代发了几句（面板要能看见"我替你回了谁"）。
            let relayed = 0
            try { relayed = relaysSince(role, { sinceMs: (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })() }).length } catch { relayed = 0 }
            out[role] = {
              alive: Boolean(vit.lastTickAt),
              lastTickAt: vit.lastTickAt || '', dayTicks: vit.dayTicks || 0,
              feels: readJsonl(path.join(DATA, 'soul', 'feel', `${role}.jsonl`), 3)
                .map((r) => ({ say: r.say, kind: r.kind, valence: r.valence, from: r.from, at: r.at })),
              dones: readJsonl(path.join(DATA, 'soul', 'deliveries', `${role}.jsonl`), 3)
                .map((r) => ({ what: r.what, how: r.how, evidence: r.evidence, at: r.at })),
              agenda: ag,
              freeTime: { count: ft.count || 0, lastAt: ft.lastAt || '' },
              heartbeat: hb,
              softLimit: sl,
              relayed,
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
          // 这里**拿不到会话号**，所以没传 session（2026-11-02 核过）：这条在投递前写，
          // 而 sessionId 是 deliverToRole → ensureRole 才建/找回的（body.sessionId）。
          // 挪到投递后写、好拿到 sessionId，会在投递失败时丢记录——「记忆写不了照样投递」比这个更要紧。
          // 代价只是：同一设备不同会话同文同分钟可能被去重成一条（老数据同此），不影响读取。
          try { appendEvent(role, { channel: '工作台', kind: 'input', text: `老板：${text}` }) } catch { /* 记忆写不了照样投递 */ }
          try {
            const out = await deliverToRole(role, text, residenceDeps())
            if (String(body.kind || '') === 'dilemma') markPending(pendingDilemma, out.sessionId, role)
            appendInbox({ id: `say-${Date.now()}`, at: new Date().toISOString(), text: `对 ${role} 说：${text.slice(0, 120)}`, category: 'channel', label: '直说', status: 'delivered', sessionId: out.sessionId })
            // 2026-11-10 主代理（整合）：补上 ② 留的 TODO——"有人找"也是一跳（外部触发，thought 猜不得）。
            try { appendHeartbeat({ role, trigger: '有人找', thought: '未知', did: `有人找：${text.slice(0, 40)}`, landed: null, spent: null }) } catch { /* 记不上不挡 */ }
            return sendJson(res, 200, { ok: true, ...out })
          } catch (e) {
            const msg = String(e?.message || e)
            try { markBody(role, { lastError: msg.slice(0, 300), lastErrorAt: new Date().toISOString() }) } catch { /* 忽略 */ }
            return sendJson(res, 500, { ok: false, error: msg })
          }
        }
        if (req.method === 'POST' && route === '/residence/image') {
          // 发图片给她：存进本机目录，再把路径递过去（她能自己 read_image 看）
          const body = await readJsonBody(req, 12 * 1024 * 1024).catch(() => ({}))
          const role = String(body.role || 'dayu')
          if (!residentRoles().includes(role)) return sendJson(res, 400, { ok: false, error: `role 只能是 ${residentRoles().join(' / ')}` })
          const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(body.dataUrl || ''))
          if (!m) return sendJson(res, 400, { ok: false, error: '只收图片（png / jpg / webp / gif）' })
          const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64')
          if (!buf.length) return sendJson(res, 400, { ok: false, error: '图片是空的' })
          if (buf.length > 8 * 1024 * 1024) return sendJson(res, 400, { ok: false, error: '图最大 8MB' })
          const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()
          const dir = path.join(DATA, 'soul', 'inbox-images')
          fs.mkdirSync(dir, { recursive: true })
          const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
          const file = path.join(dir, `${stamp}-${Math.random().toString(36).slice(2, 6)}.${ext}`)
          fs.writeFileSync(file, buf)
          const note = String(body.text || '').trim().slice(0, 500)
          const text = `老板发来一张图：${file}\n（先看一眼再说；看不懂就说看不懂。）${note ? `\n他说：${note}` : ''}`
          try {
            const out = await deliverToRole(role, text, residenceDeps())
            return sendJson(res, 200, { ok: true, path: file, sessionId: out.sessionId })
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: String(e?.message || e) })
          }
        }
        if (req.method === 'GET' && route === '/roster') {
          return sendJson(res, 200, { ok: true, ...roster(url.searchParams.get('refresh') === '1') })
        }
        if (req.method === 'GET' && route === '/report') {
          // 2026-10-30：原来这里和后面各注册了一次，后面那份永远不执行（按 id 取报告文件的入口是死的）。
          // 合并成一条：带 id 就取文件，不带 id 就出 Markdown 报告。
          const id = String(url.searchParams.get('id') || '')
          if (id) {
            const file = safeUnder(REPORTS_DIR, id)
            if (!file || !fs.existsSync(file)) return sendJson(res, 404, { ok: false, error: 'no such report' })
            return sendJson(res, 200, { ok: true, id, text: fs.readFileSync(file, 'utf8').slice(0, 200000) })
          }
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
          // 2026-10-30：同样合并——deep=1 走全量深搜（原来那份永远不会执行，深搜是死的）。
          const q = String(url.searchParams.get('q') || '').trim()
          if (url.searchParams.get('deep') === '1') {
            if (!q) return sendJson(res, 400, { ok: false, error: 'q 不能为空' })
            const limit = Math.max(1, Math.min(30, Number(url.searchParams.get('limit')) || 10))
            let hits = []
            try { hits = searchAll(q, { limit, deep: true }) } catch (error) {
              return sendJson(res, 500, { ok: false, error: error?.message ?? String(error) })
            }
            return sendJson(res, 200, { ok: true, q, deep: true, hits })
          }
          return sendJson(res, 200, omniSearch(q, Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 20))))
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
            // 记着的目标会话可能已经关了；活着的才用，否则落到大鱼总台。
            const stored = readTarget()
            if (stored && liveAgent(ctx, stored)) wanted = stored
          }
          // 没指定会话：交给大鱼自己的常驻身体（session RPC 建的那条）。
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
            // 2026-11-04 小鱼：从 listAsks 换成 takePendingAsks——工作台来取，就算投递成功，
            // 当场回写 deliveredAt。原来 deliveredAt 一直是空，她看不到「发了」和「没发」的区别。
            asks: takePendingAsks(8),
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
        // 2026-10-30：原来这里又注册了一遍 /report 和 /search，永远不会执行（上面先匹配）。
        // 已合并到上面那两条；这里不再重复。
        if (req.method === 'POST' && route === '/session') {
          try {
            const result = await ensureNativeSession()
            return sendJson(res, 200, { ok: true, ...result })
          } catch (error) {
            return sendJson(res, 500, { ok: false, error: error?.message ?? String(error) })
          }
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
  // 2026-11-12：逐轮抄录（主人：思考和原文对应，每句每段每轮都标）。turn/end 当场落，
  // 不再等维护每小时跑；旧逐条 appendTurn 保留为开关关闭时的退路。
  // 开关 5 秒缓存：事件多的时候别每个 tool/result 都读一次 switches.json。
  let turnSwitchAt = 0
  let turnSwitchOn = true
  const turnCapture = createTurnCapture({
    log,
    // 身份只认常驻绑定 + 分身凭据：派活账本、会话标题、正文里的自称都不算。
    // 只读交接、没载入角色卡/记忆的会话，只能写“未绑定会话”，不能写成大鱼。
    bodyOf: (sid) => {
      try {
        const ledger = readResidenceLedger()
        for (const [role, row] of Object.entries(ledger.roles || {})) {
          if (String(row?.sessionId || '') === String(sid || '')) return role
        }
      } catch { /* 没绑定就是没绑定 */ }
      // 2026-11-13 老板「加载了谁的卡就给这条会话备注上是谁」：凭据写在 bodies.json。
      try { const byCard = claimOf(sid); if (byCard) return byCard } catch { /* 没凭据就是没凭据 */ }
      return ''
    },
    // 抄录看到身份注入的卡 → 认出是谁的卡 → 给这条会话记一张凭据（已认过别人不覆盖）。
    onCard: (sid, text) => {
      try {
        const role = roleFromCardText(text)
        if (!role) return
        const r = claimBody({ role, sessionId: sid, source: 'card-seen', evidence: '注入里看到「# 角色卡：」/「## 你是谁（…本体卡」' })
        if (r?.ok) log(`分身凭据：${String(sid).slice(0, 18)} → ${role}（看到她的卡）`)
        else if (String(r?.reason) === 'claimed-as') log(`分身凭据冲突：${String(sid).slice(0, 18)} 已认成 ${r.role}，这次看到 ${role}，不覆盖`)
      } catch (e) { log(`分身凭据没记上：${e?.message || e}`) }
    },
    enabled: () => {
      if (Date.now() - turnSwitchAt < 5000) return turnSwitchOn
      turnSwitchAt = Date.now()
      try { turnSwitchOn = readSwitches().turnTranscript !== false } catch { turnSwitchOn = true }
      return turnSwitchOn
    },
  })
  setTimeout(() => { turnCapture.recover().catch(() => {}) }, 60 * 1000)
  // 每轮台账：只攒当前轮 user/assistant 文本，turn/end 时交给 turn-ledger 抽明确信号。
  const ledgerTurns = new Map()
  const ledgerCapture = (session, event) => {
    try {
      const sid = String(session?.header?.id ?? session?.id ?? '')
      if (!sid) return
      const type = String(event?.type || '')
      const text = textOfEvent(event)
      if (type === 'tool/result') {
        if (!text) return
        const cur0 = ledgerTurns.get(sid)
        if (cur0) cur0.tools = [...(cur0.tools || []), text].slice(-6)
        return
      }
      if (type === 'user/message' || type === 'assistant/message') {
        if (!text) return
        // 回答自检注入的 user 消息不是用户说的，别混进这一轮 user 文本。
        if (type === 'user/message' && isSelfcheckEvent(event)) return
        const cur = ledgerTurns.get(sid) || { user: '', assistant: '', tools: [], at: Date.now(), turn: 0 }
        if (type === 'user/message') cur.user = `${cur.user}${cur.user ? '\n' : ''}${text}`.slice(-4000)
        else cur.assistant = `${cur.assistant}${cur.assistant ? '\n' : ''}${text}`.slice(-4000)
        cur.at = Date.now()
        cur.turn = Number(event?.data?.turn ?? event?.turn ?? cur.turn) || cur.turn
        ledgerTurns.set(sid, cur)
        return
      }
      if (type !== 'turn/end') return
      const cur = ledgerTurns.get(sid)
      ledgerTurns.delete(sid)
      if (!cur || (!cur.user && !cur.assistant)) return
      const role = roleForSession(sid) || 'workbench'
      // 角色是标签，不是落账门槛：工作台/未绑卡会话也要有台账。
      observeTurnLedger(role, { turnId: `${sid}#${cur.turn || 0}`, sessionId: sid, at: cur.at, user: cur.user, assistant: cur.assistant, evidence: (cur.tools || []).join('\n') })
      recordClaim(role, { turnId: `${sid}#${cur.turn || 0}`, at: cur.at, assistant: cur.assistant })
    } catch (e) { log(`台账没记上：${e?.message || e}`) }
  }
  if (typeof ctx.on === 'function') {
    ctx.effect(() => ctx.on('session/event', (session, event) => {
      // 回答自检注入的 user 消息：模型要看，但不是老板/群友说的话，不进抄录/记忆/回话关联。
      const selfcheckNotice = isSelfcheckEvent(event)
      try { if (!selfcheckNotice) turnCapture.handle(session, event) } catch (e) { log(`轮次抄录失败：${e?.message || e}`) }
      try { if (!selfcheckNotice) ledgerCapture(session, event) } catch (e) { log(`台账没记上：${e?.message || e}`) }
      try {
        const text = textOfEvent(event)
        if (!selfcheckNotice) recordEvent(session, event, text)
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
          // 2026-11-01 主人：原文要全，记忆才挑。抄录不再只认「她的身体」——
          // 记忆(capture)仍只记她自己的经历，但抄录(appendTurn)按通道全抄。
          if (isMsg && text && !selfcheckNotice && !/^Current runtime context|^Time sampled while preparing/.test(text)) {
            if (who) capture(text, { sessionId: sid, role, source: who })
            // 2026-11-01 主人：被叫「裁判/评价」时，光把规矩写进手册没用——当时想不起来。
            // 所以在收到这类话时落一个标记，下一轮注入把四条判据顶到眼前（不靠自觉）。
            // 2026-11-02：子会话结束的通知（Background subagent … finished）也会被当成「评价」落标记，
            // 6 小时内每轮多注入 800 多字——先排除这类系统通知，别让假触发涨注入。
            const sysNotice = /^(Background subagent|Background job|Subagent .* finished|The subagent)\b/i.test(text)
            if (type.startsWith('user') && !sysNotice && text.length < 200 && !/(你是|你在 Windows|任务：)/.test(text) && /(裁判|评价一下|评评理|公正地评|你评评)/.test(text)) {
              try {
                const f = path.join(HOME, 'dayu', 'runtime', 'judge-hint.json')
                fs.mkdirSync(path.dirname(f), { recursive: true })
                fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), text: String(text).slice(0, 200) }), 'utf8')
              } catch { /* 标记失败不影响回话 */ }
            }
            // 2026-11-02 第 4 层：他说"还记得/上次/那次"这类话时，自动去翻旧事，
            // 不靠我临场想起来，也不每轮都翻（省钱）。
            if (type.startsWith('user') && looksLikeRecall(text)) {
              try {
                const r = recallNow(text, { limit: 3 })
                if (r.hits?.length) {
                  const f = path.join(HOME, 'dayu', 'runtime', 'recall-hint.json')
                  fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), text: String(text).slice(0, 80), hits: r.hits }, null, 0), 'utf8')
                  // 第 3 层：被想起就加权重，只动命中的那几条
                  for (const r2 of ['dayu', 'xiaoyu', 'dragon']) {
                    const ids = r.hits.filter((h) => h.kind === '记忆' && h.role === r2 && h.id).map((h) => h.id)
                    if (ids.length) { try { bumpRecall(r2, ids) } catch { /* 加不上不影响 */ } }
                  }
                }
              } catch { /* 找不到就算了，不影响回话 */ }
            }
            // 2026-11-01 主人：说了不登记，是因为「说」和「登」是两个动作。
            // 这里让系统替我登记：我的回话命中承诺句式、而诺言本里没有，就自动补一条（来源=自动）。
            if (!type.startsWith('user')) {
              try {
                const PROMISE = /(我去做|我来处理|我来做|放心|马上|这就去|我这就|交给我|包在我身上|我去弄|我去查|我会做|明天我|之后我)/
                if (PROMISE.test(text)) {
                  const bookDir = path.join(HOME, 'dayu', 'promises')
                  const bookFile = path.join(bookDir, '诺言.jsonl')
                  fs.mkdirSync(bookDir, { recursive: true })
                  const pid = 'p-' + crypto.createHash('sha1').update(String(text).slice(0, 120)).digest('hex').slice(0, 8)
                  let exists = false
                  try {
                    for (const line of fs.readFileSync(bookFile, 'utf8').split('\n')) {
                      if (line.includes(`"${pid}"`)) { exists = true; break }
                    }
                  } catch { /* 还没有本子 */ }
                  if (!exists) {
                    const row = {
                      id: pid,
                      at: localISO(),
                      what: String(text).replace(/\s+/g, ' ').slice(0, 120),
                      why: '（系统自动登记的承诺句，不是我事后补的）',
                      when: '',
                      status: 'open',
                      evidence: '',
                      doneAt: '',
                      source: 'auto',
                    }
                    fs.appendFileSync(bookFile, JSON.stringify(row) + '\n', 'utf8')
                  }
                }
              } catch { /* 登记失败不影响回话 */ }
            }
            try {
              // 2026-11-04 主人：抄录要有标题，说话人要标具体的人——
              // 「你（主人）说的话标主人，我说的标小鱼」。原来两处都退成泛称：
              //   title 取不到就 untitled；who 是 user→'对方'、assistant→'她'，两个人全没名字。
              const ROLE_NAME = { xiaoyu: '小鱼', dayu: '大鱼', dragon: '照微' }
              const meName = ROLE_NAME[role] || '她'
              const titleIn = String(session?.header?.title ?? session?.meta?.title ?? '').trim()
              // 标题取不到时用「未命名-月日 时:分」兜底，别再写 untitled（untitled 文件分不清是哪一场）
              const titleOut = titleIn || `未命名-${new Date().toISOString().slice(5, 16).replace('T', ' ')}`
              const whoOut = who || (type.startsWith('user') ? '对方' : meName)
              // 2026-11-04 主人：标签要「谁和谁」——原来只有说话的人，没记对谁说。
              // user 说话 → 对我说；我说话 → 对说的人（群里是群友昵称，工作台是对方）。
              const toOut = type.startsWith('user') ? meName : (who || '对方')
              // 2026-11-12：逐轮抄录开着时，live 由 turnCapture 在 turn/end 一次落（含思考）；
              // 这里只保留旧的逐条写法作退路，避免同一句话写两遍。
              if (!turnCapture.enabled()) {
                appendTurn({ sessionId: sid, title: titleOut, cwd, who: whoOut, to: toOut, role, text })
              }
            } catch { /* 抄录失败不影响回话 */ }
            // 2026-11-02 主人：关系状态（规则、0 成本）。只在他对她说话时推一次，只改状态不写事件。
            try {
              if (type.startsWith('user') && who === '老板') {
                relationAdjust({ who: '老板', text, at: localISO(), source: sourceOf({ id: sid, cwd }) })
              }
            } catch { /* 状态推不动不影响回话 */ }
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
        // 2026-11-02：工作台账本——以前只有 QQ 侧有账，卡片上写着"工作台没账本"。
        // 这里把每轮回话折算成用量写进同一个账本（key=workbench），并补 .dshw-usage.json。
        try {
          recordWorkbenchTurn({ sessionId, role: roleForSession(sessionId) || 'dayu', prompt: String(event?.prompt || ''), reply: text })
        } catch { /* 记账失败不影响回话 */ }
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
        // 2026-11-02：把 session（这条分身/会话的 id）一起传下去——id = sha1(device|session|at|channel|text)，
        // 同一台设备上不同会话的同文同分钟不再互相去重成一条；老事件没 session 的照旧能读。
        const role = roleForSession(sessionId)
        const eventAt = Number(event?.time) || 0
        const freeWho = takePending(pendingFree, sessionId, eventAt)
        if (role) {
          // 改｜2026-11-02 05:58｜大鱼·子会话｜授权：主人（本次任务书）｜dayu/index.js:3992-3998｜
          // appendEvent 补传 session｜为什么：调用点没传，id 里 session 永远是空，同一台设备不同会话的同文同分钟被去重成一条｜
          // 可改：只补传参；不改事件正文、不删已有事件、不改 id 算法
          try { appendEvent(role, { channel: freeWho ? '自由时间' : '工作台', kind: 'say', text, source: sessionId, session: sessionId }) } catch { /* 记忆写不了不影响回话 */ }
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
    // 每个 agent 的 compaction 在 preset isolate 里；创建时补装一次，比等 pre-step 更早。
    ctx.effect(() => ctx.on('agent/created', ({ agent }) => {
      try {
        const getSvc = (c) => { try { return c?.get?.('compaction') } catch { return null } }; const engine = getSvc(agent?.ctx) || getSvc(agent?.loopCtx) || getSvc(agent?.scope?.ctx)
        if (engine && !engine.__yushenCompactionBridge) {
          const r = installCompactionBridge({ ctx: agent.ctx, engine })
          if (!r?.ok) log(`压缩桥没装上：${r?.why || '未知'}`)
        }
      } catch (e) { log(`压缩桥没装上：${e?.message || e}`) }
    }, { global: true }))
    // 每轮开始前按需提醒：只在台账有明确未闭合项时，拼一条【台账提醒】进这一轮。
    ctx.effect(() => ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next()
      const safe = decision || { kind: 'enter', messages: [] }
      try {
        // compaction 服务在 preset isolate 里，根 ctx 看不到；按当前 agent 的 ctx 补装一次。
        const agent = payload?.agent
        const getSvc = (c) => { try { return c?.get?.('compaction') } catch { return null } }; const engine = getSvc(agent?.ctx) || getSvc(agent?.loopCtx) || getSvc(agent?.scope?.ctx)
        if (engine && !engine.__yushenCompactionBridge) installCompactionBridge({ ctx: agent.ctx, engine })
      } catch { /* 装不上不挡这一轮 */ }
      try {
        if (decision?.kind !== 'enter') return safe
        if (Number(payload?.step) > 1) return safe
        const sid = String(payload?.agent?.session?.id || '')
        const role = roleForSession(sid) || 'workbench'
        const userText = (Array.isArray(decision.messages) ? decision.messages : [])
          .filter((m) => m?.role === 'user')
          .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
          .filter((b) => b?.type === 'text')
          .map((b) => String(b.text || ''))
          .join('\n')
        const item = nextReminder(role, { limit: 1, sessionId: sid })[0]
        const preview = buildPreStepRecall(role, userText)
        let claimConflicts = []
        try {
          claimConflicts = checkClaimAnswer(role, { text: userText }).conflicts || []
          // 冲突注入必须同主题；关键词相似不算，避免把“两句不同的事”硬配成冲突。
          const normTopic = (x) => String(x || '').toLowerCase().replace(/[\s，。！？、；：,.!?;:""'']/g, '')
          claimConflicts = claimConflicts.filter((c) => {
            const a = normTopic(c.old?.topic)
            const b = normTopic(c.new?.topic)
            return a && b && a.length >= 2 && b.length >= 2 && (a === b || a.includes(b) || b.includes(a))
          })
        } catch { claimConflicts = [] }
        // 上一轮回答生成后没拦住/更正后又冲突的，留到这一轮开头提醒；取一次就标掉，不反复念。
        let answerPending = null
        try { answerPending = takeAnswerSelfcheck(role, { sessionId: sid }) } catch { answerPending = null }
        if (!item && !preview && !claimConflicts.length && !answerPending) return safe
        if (item) markReminded(role, item.id)
        // 宿主 app.asar 的 isAgentInstructionsMessage/visibleBaselineSource 直接读 message.source.kind（无空值保护），
        // 注入消息必须带 source，否则宿主遍历 authorityMessages 时崩在 "Cannot read properties of undefined (reading 'kind')"。
        // 同样必须带 id：宿主把这条 message 原样落成 user/message 事件，重开会话时
        // assertMessageEventShape 要求 data.id 是非空字符串；缺了，整份会话就 "failed validation" 打不开
        //（2026-11-18 实证：14 条 dayu-notice 事件无 id，session-c5b1cd18 卡在 seq 40949）。
        const NOTICE_SOURCE = { kind: 'dayu-notice', form: 'notice' }
        const noticeMessage = (text) => ({ id: randomUUID(), role: 'user', source: NOTICE_SOURCE, content: [{ type: 'text', text }] })
        const extra = []
        if (item) extra.push(noticeMessage(`【台账提醒】${item.line}`))
        if (preview) extra.push(noticeMessage(preview))
        if (claimConflicts.length) {
          const lines = claimConflicts.slice(0, 3).map((c) => `- 之前：${c.old?.claim || ''}；现在：${c.new?.claim || ''}（${c.reason || '冲突'}）`)
          extra.push(noticeMessage(`【结论冲突】先说清再答，不要顺着矛盾说：\n${lines.join('\n')}`))
        }
        if (answerPending?.message) extra.push(answerPending.message)
        return { ...safe, messages: [...(Array.isArray(safe.messages) ? safe.messages : []), ...extra] }
      } catch { return safe }
    }, { global: true }))
    // 回答生成后的自检：agent/turn-stopping 是“本轮已完成、turn/end 还没落”的唯一扩展点，
    // 冲突时 agent.steer() 一条更正提示，让同一轮再答一次；不能 steer 就留 pending 给下一轮 pre-step。
    // 只对 roleForSession 认得出身份的会话生效，员工/子代理/未绑卡会话不查。
    ctx.effect(() => attachAnswerSelfcheck(ctx, {
      roleOf: (sid) => roleForSession(sid),
      log,
    }))
  }

  // ─────────────────────────────────────────────────────────────
  // 经历层第四条来源：宿主内置工具按「轮」汇总（read/write/edit/pwsh/web_fetch/subagent…）。
  // 这些工具不走 registerTool，ingest-actions 的 instrumentTool 包不到，以前完全不进经历层。
  // 按条记会灌爆（实测今天 4484 次宿主调用 / 约 15 次一轮 → 按条 4484 行、按轮约 300 行），
  // 所以：一轮最多一行，turn/end 时收口，细节靠 ref 回原文查。
  // 只注册这一条订阅，不碰上面已有的记忆/关系/决策分支。
  // 改｜2026-11-02 22:50｜大鱼·子会话（工作台）｜授权：主人（本次任务书：宿主工具按「轮」汇总成一条经历，A 方案）
  // ｜dayu/index.js:73,4161-4176｜新增 attachHostTools(ctx)：挂 session/event(global:true)，turn/end 收口写 手抄本/经历
  // ｜为什么：宿主工具 4484 次/天却一条经历都没落，经历层缺了大头；按条记又灌爆，只有按轮汇总两头都对
  // ｜验证：node --check dayu/index.js；node scripts/test-ingest-host-tools.mjs 6/6；node scripts/regression.mjs 0 失败
  // ｜可改：可改（聚合口径与「插件工具前缀跳过」在 lib/ingest-host-tools.js 里，别在这里加分支）
  try {
    attachHostTools(ctx, { log })
  } catch (e) {
    log(`宿主工具经历层没挂上：${String(e?.message || e).slice(0, 120)}`)
  }

  log('大鱼入口已加载（M0）')
}



