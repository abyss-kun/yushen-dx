import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-observe-'))
const { biliSource, chooseBiliObservation } = await import('../lib/bili-observation.js')
const event = biliSource({ channel: 'bili', role: 'xiaoyu', audience: 'group' }, { kind: 'subtitle', videoId: 'BV1abc', quote: '视频原文摘录', messageId: 'subtitle:1' })
assert.deepEqual(event.scope, { channel: 'bili', conversationId: 'subtitle:BV1abc', audience: 'group' })
assert.equal(chooseBiliObservation(event).skipped, true)
const row = chooseBiliObservation(event, { kind: 'question', text: '这个现象为什么会这样？' })
assert.equal(row.item.scope.conversationId, 'subtitle:BV1abc')
assert.equal(row.item.source.messageId, 'subtitle:1')
assert.equal(row.item.source.quote, '视频原文摘录')
assert.equal(row.item.epistemic, 'inferred')
assert.deepEqual(biliSource({ channel: 'bili', role: 'xiaoyu', audience: 'private' }, { kind: 'comment', videoId: 'BV1abc', quote: '私聊素材', messageId: 'comment:9' }).scope.audience, 'private')
assert.throws(() => chooseBiliObservation({ scope: { channel: 'qq', role: 'xiaoyu', audience: 'group' }, source: event.source, role: 'xiaoyu' }, { kind: 'interest', text: '越权' }))
assert.throws(() => chooseBiliObservation({ ...event, role: 'bad' }, { kind: 'interest', text: '越权' }))
assert.throws(() => chooseBiliObservation(event, { kind: 'owner_preference', text: '越权' }))
console.log('bili observation boundary: source granularity, opt-in choice, provenance, scope and refusal passed')
