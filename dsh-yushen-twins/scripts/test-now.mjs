// 「现在在发生什么」快照：跑 / 做完 / 没做 / 出错 / 重复。
import assert from 'node:assert/strict'
import { buildNowSnapshot } from '../lib/now.js'

const NOW = Date.parse('2026-10-25T12:00:00.000Z')
const at = (secondsAgo) => new Date(NOW - secondsAgo * 1000).toISOString()

const snap = buildNowSnapshot({
  now: NOW,
  roleOf: (id) => (id === 'session-a' ? 'xiaoyu' : ''),
  sessions: [
    { id: 'session-a', title: 'session-', status: '用工具', lastAt: at(5), lastText: '正在读文件', source: '本机会话', cwd: 'D:\\AiTOOLS' },
    { id: 'session-x', title: 'session-', status: 'step/start', lastAt: at(3), lastText: '子窗口在跑测试', source: '本机会话', cwd: 'D:\\AiTOOLS', parentId: 'session-a' },
    { id: 'session-b', title: '制作抖音自动刷视频工具', status: 'turn/end', lastAt: at(300), lastText: '写完了插件', source: '本机会话' },
    { id: 'session-c', title: 'session-', status: 'llm/retry', lastAt: at(20), lastText: '模型重试中', source: '本机会话' },
    { id: 'session-d', title: 'session-', status: 'turn/end', lastAt: at(4000), lastText: '很久以前' },
  ],
  jobs: [
    { id: 'job-1', status: 'waiting', brief: '等前单', createdAt: at(600), coordination: '等待前任务' },
    { id: 'job-2', status: 'dispatched', brief: '在跑的单', createdAt: at(120) },
    { id: 'job-3', status: 'returned', brief: '交回来的单', createdAt: at(900) },
    { id: 'job-4', status: 'returned', brief: '同一件事', createdAt: at(1000) },
    { id: 'job-5', status: 'returned', brief: '同一件事', createdAt: at(1100) },
    { id: 'job-9', status: 'returned', sessionId: 'session-b', employee: '新开的助手会话', brief: '抖音插件', createdAt: at(300) },
  ],
  incidents: [
    { id: 'inc-1', status: 'open', title: '真机探活失败', text: 'Failed to parse URL', lastAt: at(30) },
    { id: 'inc-2', status: 'fixed', title: '已修', text: 'x', lastAt: at(3000) },
  ],
  patches: [
    { id: 'p-1', title: '修 live-check 地址拼接', at: at(2000) },
    { id: 'p-2', title: '修 live-check 地址拼接', at: at(1800) },
  ],
})

// 正在跑：只有最近 3 分钟内、状态不是 turn/end 的
assert.deepEqual(snap.running.map((x) => x.id), ['x', 'a'])
assert.equal(snap.running.find((x) => x.id === 'a').role, 'xiaoyu')
// 没标题也要能认人：工作区 + 谁在跑，不是一句“session-”
assert.ok(!snap.running.some((x) => /^session-$/.test(x.title)))
assert.match(snap.running.find((x) => x.id === 'a').title, /AiTOOLS/)
// 做完：turn/end 且在 30 分钟内；派活过来的要能看出是谁派的
assert.deepEqual(snap.done.map((x) => x.id), ['b'])
assert.match(snap.done[0].provenance, /派活：新开的助手会话/)
// 会话树：a 底下有一个子窗口，子窗口在跑测试
const root = snap.tree.find((n) => n.id === 'a')
assert.ok(root, '要有 a 这个根')
assert.equal(root.children.length, 1, 'a 底下应该有一个子窗口')
assert.equal(root.children[0].id, 'x')
assert.match(root.children[0].doing, /跑测试/)
assert.match(root.children[0].provenance, /子代理|本机窗口/)
// 出错：重试会话 + 未结事故
assert.equal(snap.error.length, 2)
assert.ok(snap.error.some((x) => x.kind === 'session' && x.id === 'c'))
assert.ok(snap.error.some((x) => x.kind === 'incident' && x.id === 'inc-1'))
// 没做：waiting / dispatched
assert.deepEqual(snap.pending.map((x) => x.id).sort(), ['job-1', 'job-2'])
// 重复：两张同名单 + 两份同名补丁
assert.equal(snap.duplicate.length, 2)
assert.ok(snap.duplicate.some((x) => x.kind === 'job' && /2 单同内容/.test(x.title)))
assert.ok(snap.duplicate.some((x) => x.kind === 'patch' && /2 份同类补丁/.test(x.title)))
// 计数对得上
assert.deepEqual(snap.counts, { running: 2, done: 1, pending: 2, error: 2, duplicate: 2, search: 0 })
// 超过 30 分钟的旧会话不出现
assert.ok(![...snap.running, ...snap.done, ...snap.error].some((x) => x.id === 'd'))

// 搜索：跨会话/派活，大小写不敏感；空结果要老实返回 0
const s1 = buildNowSnapshot({
  now: NOW,
  sessions: [{ id: 'session-z', title: 'session-', status: '用工具', lastAt: at(2), lastText: '在跑测试', cwd: 'D:\\AiTOOLS' }],
  q: 'aitools',
})
assert.equal(s1.counts.search, 1)
assert.equal(s1.search[0].id, 'z')
const s2 = buildNowSnapshot({ now: NOW, jobs: [{ id: 'job-x', status: 'waiting', brief: '修 live-check', createdAt: at(10) }], q: 'live-check' })
assert.ok(s2.search.some((x) => x.kind === 'job' && x.id === 'job-x'))
const s3 = buildNowSnapshot({ now: NOW, q: '没有这个东西' })
assert.equal(s3.counts.search, 0)

console.log(JSON.stringify({ ok: true, running: snap.running.length, done: snap.done.length, pending: snap.pending.length, error: snap.error.length, duplicate: snap.duplicate.length, search: s1.counts.search }))
