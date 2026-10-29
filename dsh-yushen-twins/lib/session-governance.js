// Cross-entry session governance: inventory first, conservative cleanup second.
// DSH currently exposes no verified delete/close RPC, so this module never guesses or kills sessions.
import { createMatter, recordMatterEvent, registerSource, ingestObservation, readMatterHistory } from './fact-ledger.js'

const MATTER = 'session-governance'
const SOURCE = 'dsh-session-list'
let initialized = false
function init(){
  if(initialized)return
  try { readMatterHistory(MATTER) } catch { createMatter({matterId:MATTER,kind:'capability',title:'DSH会话生命周期与清理治理',source:'session-governance.js'}) }
  registerSource({sourceId:SOURCE,kind:'direct-session',scope:'只读 session/list 摘要；不读正文，不代表可关闭'})
  initialized=true
}
function safe(row){return {id:String(row?.id||row?.sessionId||''),title:String(row?.title||'').slice(0,160),running:Boolean(row?.running),blank:Boolean(row?.blank),cwd:String(row?.cwd||'').slice(0,240)}}
export function observeSessionEvent({sessionId,eventType,stage='unknown',summary,evidence=''}){
  init()
  const sid=String(sessionId||'').slice(0,160)
  if(!sid||!String(eventType||'').trim()) return {ok:false,reason:'missing-session-event'}
  return ingestObservation({matterId:MATTER,sourceId:SOURCE,observedAt:new Date().toISOString(),stage,summary:`会话 ${sid}：${String(eventType).slice(0,80)}；${String(summary||'').slice(0,240)}`,evidence:String(evidence||'').slice(0,600),evidenceQuality:'observed'})
}
export function auditSessions(rows=[]){
  init()
  const items=rows.map(safe).filter(x=>x.id)
  const blankStopped=items.filter(x=>x.blank&&!x.running)
  const blankRunning=items.filter(x=>x.blank&&x.running)
  const namedStopped=items.filter(x=>!x.blank&&!x.running)
  const running=items.filter(x=>x.running)
  const recommendations=[]
  if(blankStopped.length) recommendations.push({action:'mark-empty',count:blankStopped.length,reason:'空且未运行，可安全标记供人工清理；当前宿主未提供删除接口'})
  if(namedStopped.length) recommendations.push({action:'review-named-inactive',count:namedStopped.length,reason:'有标题但未运行，可能是用户历史窗口或重要记录，不能自动关闭'})
  if(blankRunning.length) recommendations.push({action:'wait',count:blankRunning.length,reason:'空会话仍在运行，不能标记或关闭'})
  ingestObservation({matterId:MATTER,sourceId:SOURCE,observedAt:new Date().toISOString(),stage:'in-progress',summary:`会话盘点：总 ${items.length}，运行 ${running.length}，空且停止 ${blankStopped.length}，有标题且停止 ${namedStopped.length}`,evidence:JSON.stringify({total:items.length,running:running.length,blankStopped:blankStopped.length,namedStopped:namedStopped.length}),evidenceQuality:'observed'})
  return {ok:true,scope:'session-list-summary-only',total:items.length,running,blankStopped,namedStopped,blankRunning,recommendations,warning:'只读盘点不能证明会话内容已完成；没有关闭/删除接口时不自动杀进程、不删除窗口'}
}
