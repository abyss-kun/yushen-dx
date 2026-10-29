// Caller-bound workbench tools. No new model round, no inferred interests, no caller-supplied role/scope.
import { roleForSession } from './memory.js'
import { mindRoles, recordObservedMind, queryMind, buildMindBrief } from './mind-store.js'

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
  if (args?.action !== 'remember') throw new Error('unknown mind action')
  if (!['interest', 'question'].includes(args.kind)) throw new Error('这里只记录角色自己选择的兴趣/疑问；不代确认主人偏好或完成承诺')
  // The quote is the role's own declaration, not a claim of having viewed external media.
  return recordObservedMind(role, { kind: args.kind, text: args.text, detail: args.detail || '', scope,
    source: { quote: args.text, speaker: role, messageId: String(exec?.callId || '') }, epistemic: 'inferred' })
}
export function registerMindTools(tools, output) {
  tools?.register({ name: 'yushen_mind', description: '自己的心念：本地查相关兴趣/疑问和未完承诺；也可以自愿记下自己的兴趣或疑问。不想记可以不调用。身份由当前常驻身体绑定，不接受自报角色；不会新增模型调用、发帖或联网。',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['query', 'brief', 'remember'] }, kind: { type: 'string', enum: ['interest', 'question'] }, text: { type: 'string' }, detail: { type: 'string' } }, required: ['action'], additionalProperties: false }, output,
    async execute(args, exec) { return executeMind(args, exec) } })
}
