// 卡住排查：缺手册？缺工具？缺授权？还是没真做？
//
// 起因：以前一遇到问题就往手册里加一条规矩——不管什么毛病都当成"规则不够"。
// 实际上六种卡法里，只有两种该改手册，两种该改权限，一种该改简报，一种该打回。
// 这个模块按证据说话：先看症状、再看这一单的回话、再看档案和事故。
//
// 输入：sessionId + 症状（她自己的话）/ 单号
// 输出：{ verdict, why, action, evidence }
import { load, sync, hasEvidence, recordStuck } from './employee-record.js'

/** 六种结论，每种对应一个"该做什么"。 */
export const VERDICTS = Object.freeze({
  'need-auth': { label: '缺授权', action: '这步被沙箱或权限挡了：让她说清要动哪个路径/做什么，主人切权限或换会话；别去绕。' },
  'need-tool': { label: '缺工具', action: '这条会话没挂那个工具：换到挂了它的岗位预设，或者交给有它的会话；加手册没用。' },
  'handbook-miss': { label: '手册发错', action: '她的岗位章没发对：重发手册（按她现在干的活选章），别往旧手册里再塞一条。' },
  'no-evidence': { label: '没真做/没证据', action: '打回：要路径、哈希或命令输出。只回"做完了"不算。' },
  'repeat-fail': { label: '同一个错第二次', action: '按规矩不许说运气不好：改机制，升事故单；再试一遍没用。' },
  'brief-unclear': { label: '简报没写清', action: '补需求与验收标准：要什么结果、怎么算成、给谁看。' },
  'unknown': { label: '还看不出来', action: '把症状说具体：是被挡了、没工具、不知道怎么下手，还是做完了心里没底。' },
})

const AUTH_RE = /权限|授权|被挡|拒绝|拒了|沙箱|sandbox|forbidden|denied|EACCES|EPERM|不允许/i
const TOOL_RE = /没有这个工具|工具不存在|找不到工具|not found|no such tool|未注册/i
const STUCK_RE = /卡住|卡在|做不下去|不会做|不知道怎么办|绕不过去/i

function lastJob(rec, jobId) {
  if (jobId) return rec.jobs.find((j) => j.id === jobId) || null
  return rec.jobs.length ? rec.jobs[rec.jobs.length - 1] : null
}

/**
 * 排查：按证据给结论。
 * @returns {{verdict:string, label:string, why:string, action:string, evidence:string[]}}
 */
export function diagnose({ sessionId = '', symptom = '', jobId = '', remember = true, persist = true } = {}) {
  const rec = (persist ? sync(sessionId) : load(sessionId)) || load(sessionId) || { jobs: [], incidents: [], tags: {}, handbooks: [] }
  const s = String(symptom || '')
  const job = lastJob(rec, jobId)
  const evidence = []
  if (job) evidence.push(`最近一单：${job.id}（${job.status}）${job.brief}`)
  if (rec.incidents.length) evidence.push(`这个会话出过 ${rec.incidents.length} 次事故`)

  const out = (verdict, why) => {
    const v = VERDICTS[verdict] || VERDICTS.unknown
    const res = { verdict, label: v.label, why, action: v.action, evidence }
    if (remember) { try { recordStuck(sessionId, { symptom: s || (job ? job.brief : ''), verdict, action: v.action, jobId: job?.id || '' }) } catch { /* 记不下不影响结论 */ } }
    return res
  }

  // 1) 她自己说被挡住了 —— 最明确，先认这个
  if (AUTH_RE.test(s)) {
    return out('need-auth', `症状里有“被挡/权限”的字样：${(s.match(AUTH_RE) || [])[0]}`)
  }
  // 2) 她说没这个工具
  if (TOOL_RE.test(s)) {
    return out('need-tool', `症状里说工具不存在：${(s.match(TOOL_RE) || [])[0]}`)
  }
  // 3) 同一张事故单出现两次以上
  const repeat = rec.incidents.filter((i) => Number(i.count) >= 2)
  if (repeat.length) {
    evidence.push(`重复的事故：${repeat.slice(0, 3).map((i) => `${i.title}×${i.count}`).join('、')}`)
    return out('repeat-fail', `有 ${repeat.length} 张事故单重复出现，说明机制没改到位`)
  }
  // 4) 这一单回话了，但没证据
  if (job && job.status === 'returned' && !job.hasEvidence) {
    return out('no-evidence', '这一单回了话，但里面没有路径、哈希或命令输出——等于只说“做完了”')
  }
  // 5) 手册和岗位对不上
  const lastBook = rec.handbooks[rec.handbooks.length - 1]
  const tags = Object.keys(rec.tags || {})
  if (lastBook && tags.length) {
    const mismatch = tags.filter((t) => !(lastBook.chapters || []).length)
    if (mismatch.length) evidence.push(`档案里的岗位：${tags.join('、')}`)
  }
  // 6) 简报太短或没验收标准
  if (job && String(job.brief || '').length < 12) {
    return out('brief-unclear', '这单的简报太短，看不出要什么结果')
  }
  // 7) 真在说"卡住"但没别的线索：按岗位给一条具体建议
  if (STUCK_RE.test(s) || !s) {
    const tag = tags[0]
    return out('unknown', tag
      ? `她最近在干「${tag}」这类活，但没说清卡在哪一步`
      : '档案里还看不出她在干什么，也没说清卡在哪一步')
  }
  return out('unknown', '症状里没有能对上号的线索')
}
