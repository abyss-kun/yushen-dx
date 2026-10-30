// Caller-bound workbench tools. No new model round, no inferred interests, no caller-supplied role/scope.
import { roleForSession } from './memory.js'
import { mindRoles, recordObservedMind, queryMind, buildMindBrief, answerQuestion } from './mind-store.js'

export function mindCaller(exec) {
  const session = exec?.agent?.session
  const id = String(session?.header?.id || '')
  const role = roleForSession(id)
  if (!id || !mindRoles().includes(role)) throw new Error('心念工具仅接受已绑定的工作台常驻角色会话；不能自报角色或受众')
  return { role, scope: { channel: 'workbench', conversationId: id, audience: 'private' } }
}
export function executeMind(args, exec) {
  const { role, scope } = mindCaller(exec)
  if (args?.action === 'query') return queryMind(role, { scope, text: args.text || '' })
  if (args?.action === 'brief') return { ok: true, brief: buildMindBrief(role, { scope, text: args.text || '' }) }
  // 2026-10-30 照微：疑问/兴趣也能结掉，不然它永远挂在「没想完」，简报每天报假账。
  // 证据必须非空（答在哪儿），但不要求"验证过"——想通了不需要第三方盖章。
  if (args?.action === 'answer') {
    if (!args.id) throw new Error('结题要带 id（用 query 查到那条的 id）')
    return answerQuestion(role, String(args.id), { scope, evidence: args.evidence || '' })
  }
  if (args?.action !== 'remember') throw new Error('unknown mind action')
  if (!['interest', 'question'].includes(args.kind)) throw new Error('这里只记录角色自己选择的兴趣/疑问；不代确认主人偏好或完成承诺')
  // The quote is the role's own declaration, not a claim of having viewed external media.
  return recordObservedMind(role, { kind: args.kind, text: args.text, detail: args.detail || '', scope,
    source: { quote: args.text, speaker: role, messageId: String(exec?.callId || '') }, epistemic: 'inferred' })
}
export function registerMindTools(tools, output) {
  // 2026-10-30：工具定义提出来存一份，好让 yushen_tools 的目录能收录它（之前她查不到）
  for (const def of mindToolDefs(output)) tools?.register(def)
}

/** 心念工具的定义（给注册和目录共用的唯一来源）。 */
export function mindToolDefs(output) {
  return [{
    name: 'yushen_mind',
    description: '自己的心念：本地查相关兴趣/疑问和未完承诺；也可以自愿记下自己的兴趣或疑问。不想记可以不调用。身份由当前常驻身体绑定，不接受自报角色；不会新增模型调用、发帖或联网。',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['query', 'brief', 'remember', 'answer'] }, kind: { type: 'string', enum: ['interest', 'question'] }, text: { type: 'string' }, detail: { type: 'string' }, id: { type: 'string' }, evidence: { type: 'string' } }, required: ['action'], additionalProperties: false },
    output,
    async execute(args, exec) { return executeMind(args, exec) },
  }]
}
