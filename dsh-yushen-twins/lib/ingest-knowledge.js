/* 标签
 * id: lib-ingest-knowledge
 * kind: module
 * summary: 知识层：书上/别人给的/查到的进手抄本；只从 culture 单向下游同步，不回写。
 * audience: 框架（culture 的同步脚本）、她（翻知识）
 * owner: 框架；单向同步的口径别改（否则两条写路径争真源）
 * mutable: 可改（只加字段）
 * usage: ingestKnowledge(row) 写入；LAYER="知识"
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 22:50｜大鱼·子会话（工作台）｜授权：主人（本次任务书：外部知识要进知识层）｜lib/ingest-knowledge.js:1-110｜新增：ingestKnowledge（culture 条目 → 手抄本/知识 + 待提炼指针，sourceLevel:'书上'，ref=culture 条目 id，去重 key=sha1('culture|'+id)）｜为什么：culture 库只有「借来的答案」这一份，手抄本那层没有入口，以后精提炼翻不到它学过什么｜验证：node --check lib/ingest-knowledge.js；node scripts/test-ingest-culture.mjs（spawn 真跑 culture.mjs add，断言手抄本那一行与 culture 里的 id 对得上、同一 id 只写一次）；node scripts/regression.mjs 不新增红｜可改：可改（只许单向：culture → 手抄本；手抄本不回收写回 culture）
//
// 知识层：书上来的、别人给的、查到的——不是她自己经历的。
//
// 单向同步（任务书定的）：scripts/culture.mjs add 成功之后调这里写一条进手抄本；
// 手抄本这边不回写 culture。理由：culture 是「借来的答案」的唯一账本（add/use/verdict 都在那），
// 手抄本是下游的完整层；反过来同步就成了两条写路径争同一个真源。
import { clip, sha, stamp, writeRows } from './ingest-store.js'
import { keywords } from './library-chain.js'

export const LAYER = '知识'

/**
 * 记一条外部知识。
 * cultureId = scripts/culture.mjs 里那一行的 id（ref 就指它，不编路径）。
 */
export function ingestKnowledge({ id, book = '', quote = '', zh = '', scene = '', use = '', at, text = '' } = {}) {
  try {
    const cultureId = clip(id, 60)
    if (!cultureId) return { ok: false, reason: '没有 culture id' }
    const { at: iso, day } = stamp(at)
    const body = clip(
      text || [book ? `《${book}》` : '', quote, zh ? `— ${zh}` : '', use ? `用在：${use}` : ''].filter(Boolean).join(' '),
      500,
    )
    if (!body) return { ok: false, reason: '没有内容' }
    const row = {
      id: 'k-' + sha(`culture|${cultureId}`),
      cultureId,
      kind: LAYER,
      layer: LAYER,
      event: false,
      type: 'knowledge',
      at: iso,
      day,
      channel: LAYER,
      who: book || '书上',
      book: clip(book, 60),
      // 2026-11-02 23:35 主人改口径：手抄本不存全文（原文在 culture/library.jsonl，ref 就是那条），
      // 只留 head(≤60) + 关键词 + 标签；quote/zh/scene/use 都不再抄一份进手抄本。
      head: clip(body, 60),
      keywords: keywords(body),
      tags: ['书上', clip(book, 20)].filter(Boolean),
      // 任务书：ref 指 culture 条目 id。
      ref: cultureId,
      sourceLevel: '书上',
      confidence: '确定',
      importance: '普通',
      coarse: true,
      chars: body.length,
    }
    const w = writeRows({ layer: LAYER, day, rows: [row] })
    return { ...w, id: row.id, day, row, reason: w.ok ? '' : (w.err || '写不进去') }
  } catch (e) {
    return { ok: false, reason: clip(e?.message || e, 120) }
  }
}
