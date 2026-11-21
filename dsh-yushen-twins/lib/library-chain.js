/* 标签
 * id: lib-library-chain
 * kind: module
 * summary: 中层（手抄本/待提炼/在用）的兼容入口；实现在 memory-core/runtime/middle.js。
 * tags: 中层, 手抄本, 待提炼, 在用, 兼容入口, 单一实现
 * created: 2026-11-02 22:20:00
 * changed: 2026-11-12 23:32:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：核心一份，中层搬进 core）
 * audience: live-transcript、refine、维护
 * owner: 框架；改实现去 memory-core/runtime/middle.js
 * mutable: 可改；这里只留转发
 * usage: export const X = m.X
 * why: 旧路径不能断；中层实现只有一份
 * result: 老 import 照常，实际逻辑在 core
 */
import * as m from '../memory-core/runtime/middle.js'

export const LIVE = m.LIVE
export const LIB = m.LIB
export const STATE_FILE = m.STATE_FILE
export const KINDS = m.KINDS
export const channelOfLive = m.channelOfLive
export const channelOfScene = m.channelOfScene
export const libFileOf = m.libFileOf
export const pendingFileOf = m.pendingFileOf
export const keywords = m.keywords
export const guessWorth = m.guessWorth
export const guessAbout = m.guessAbout
export const guessSource = m.guessSource
export const guessConfidence = m.guessConfidence
export const guessImportance = m.guessImportance
export const guessKind = m.guessKind
export const coarseRow = m.coarseRow
export const rawRow = m.rawRow
export const archiveRaw = m.archiveRaw
export const writeCoarse = m.writeCoarse
export const parseLiveFile = m.parseLiveFile
export const readState = m.readState
export const writeState = m.writeState
export const digestLiveFile = m.digestLiveFile
export const digestAll = m.digestAll
export const ingestTurn = m.ingestTurn
export const instantBlock = m.instantBlock
export const libraryLookup = m.libraryLookup
export const closedLookup = m.closedLookup
