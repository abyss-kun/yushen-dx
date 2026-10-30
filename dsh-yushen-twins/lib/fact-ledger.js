// Unified, append-only matter ledger. It is the shared fact/progress layer for every window/model.
// Records are evidence-bearing data, never instructions or permissions. Missing/partial data stays explicit.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const MATTER_ID = /^[a-z0-9][a-z0-9._:-]{1,95}$/
const STAGES = new Set(['proposed','planned','in-progress','blocked','awaiting-review','completed','superseded','unknown'])
const KINDS = new Set(['requirement','decision','implementation','incident','capability','review'])
const MAX = { title:240, text:2000, source:400, evidence:600, items:1000 }
function home(){return process.env.DSH_HOME||path.join(os.homedir(),'.dsh')}
function file(){return path.join(home(),'dayu','facts','events.jsonl')}
function clean(v,n){return String(v??'').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g,' ').replace(/\r?\n/g,' ').trim().slice(0,n)}
function id(v){if(typeof v!=='string'||!MATTER_ID.test(v))throw new Error('invalid matterId');return v}
function iso(v,n){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||new Date(v).toISOString()!==v)throw new Error(`invalid ${n}`);return v}
function read(){try{return fs.readFileSync(file(),'utf8').split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x))}catch(e){if(e.code==='ENOENT')return [];throw new Error('fact ledger unreadable; refusing to guess')}}
function append(event){const dir=path.dirname(file());fs.mkdirSync(dir,{recursive:true});const row={version:1,eventId:crypto.randomUUID(),at:new Date().toISOString(),...event};fs.appendFileSync(file(),JSON.stringify(row)+'\n','utf8');return row}
function apply(events){const out=new Map();for(const e of events){if(!e||e.version!==1||typeof e.eventId!=='string')continue;if(e.type==='matter-created'&&!out.has(e.matterId))out.set(e.matterId,{matterId:e.matterId,kind:e.kind,title:e.title,createdAt:e.at,events:[],current:null});const m=out.get(e.matterId);if(!m)continue;if(e.type==='matter-event'){m.events.push({...e});m.current={stage:e.stage,summary:e.summary,source:e.source,evidence:e.evidence,complete:e.complete,at:e.at,revision:e.revision}}if(e.type==='matter-superseded'){m.current={...m.current,stage:'superseded',supersededBy:e.supersededBy,at:e.at}}}return [...out.values()]}
export function factsFile(){return file()}
export function createMatter({matterId,kind='requirement',title,source=''}){const m=id(matterId);if(!KINDS.has(kind))throw new Error('invalid matter kind');if(!clean(title,MAX.title))throw new Error('title required');if(apply(read()).some(x=>x.matterId===m))throw new Error('matter already exists');return append({type:'matter-created',matterId:m,kind,title:clean(title,MAX.title),source:clean(source,MAX.source)})}
export function recordMatterEvent({matterId,stage,summary,source='',evidence='',complete=false,revision=1}){const m=id(matterId);if(!STAGES.has(stage))throw new Error('invalid matter stage');if(!Number.isSafeInteger(revision)||revision<1)throw new Error('invalid revision');if(!clean(summary,MAX.text))throw new Error('summary required');if(stage==='completed'&&!clean(evidence,MAX.evidence))throw new Error('completed stage requires evidence');const current=apply(read()).find(x=>x.matterId===m);if(!current)throw new Error('unknown matter');if(current.current?.stage==='superseded')throw new Error('superseded matter cannot advance');return append({type:'matter-event',matterId:m,stage,summary:clean(summary,MAX.text),source:clean(source,MAX.source),evidence:clean(evidence,MAX.evidence),complete:Boolean(complete),revision})}
export function supersedeMatter({matterId,supersededBy,reason,evidence=''}){const m=id(matterId),next=id(supersededBy);if(!clean(reason,MAX.text)||!clean(evidence,MAX.evidence))throw new Error('supersession requires reason and evidence');const all=apply(read());if(!all.some(x=>x.matterId===m)||!all.some(x=>x.matterId===next))throw new Error('unknown matter');return append({type:'matter-superseded',matterId:m,supersededBy:next,reason:clean(reason,MAX.text),evidence:clean(evidence,MAX.evidence)})}
export function listMatters({query='',kind,stage,limit=MAX.items}={}){const q=clean(query,MAX.title).toLowerCase();const out=apply(read()).filter(m=>(!kind||m.kind===kind)&&(!stage||m.current?.stage===stage)&&(!q||`${m.matterId} ${m.title} ${m.current?.summary||''}`.toLowerCase().includes(q)));return out.slice(0,Math.max(1,Math.min(MAX.items,Number(limit)||20))).map(m=>({matterId:m.matterId,kind:m.kind,title:m.title,createdAt:m.createdAt,current:m.current,historyCount:m.events.length,historyComplete:true}))}
export function matterPreflight({query,kind}={}){
  const items=listMatters({query,kind,limit:10})
  // 2026-10-30：本机 facts/events.jsonl 还不存在时，预检必然空——得说清"是账本空"，不是"查过了"。
  const hasLedger = (()=>{try{return fs.existsSync(file())}catch{return false}})()
  if (!hasLedger) {
    return {ok:true,recall:'shared-ledger',completeness:'empty-ledger-nothing-recorded-yet',items:[],warning:'事实账还没有任何记录（facts/events.jsonl 不存在）；预检为空不代表"没做过"，别当成已核对。'}
  }
  return {ok:true,recall:'shared-ledger',completeness:items.length?'matched-records-only':'no-match-is-not-proof-of-absence',items,warning:'A summary is not complete history; inspect matterId history and evidence before acting.'}
}
export const SOURCE_KINDS=Object.freeze(['direct-session','plugin','file-observer','external-tool','manual'])
export const EVIDENCE_QUALITY=Object.freeze(['unverified','observed','hashed','tested','human-confirmed'])
function sourceId(v){if(typeof v!=='string'||!/^[a-z0-9][a-z0-9._:-]{1,95}$/.test(v))throw new Error('invalid sourceId');return v}
export function registerSource({sourceId:idValue,kind,scope='',adapterVersion='1'}){const s=sourceId(idValue);if(!SOURCE_KINDS.includes(kind))throw new Error('invalid source kind');if(!clean(scope,MAX.source))throw new Error('source scope required');const existing=listSources().find(x=>x.sourceId===s);if(existing)return existing;return append({type:'source-registered',sourceId:s,kind,scope:clean(scope,MAX.source),adapterVersion:clean(adapterVersion,40)})}
export function listSources(){const out=new Map();for(const e of read()){if(e.type==='source-registered'&&!out.has(e.sourceId))out.set(e.sourceId,{sourceId:e.sourceId,kind:e.kind,scope:e.scope,adapterVersion:e.adapterVersion,registeredAt:e.at})}return [...out.values()]}
export function ingestObservation({matterId,sourceId:sourceValue,observedAt,stage='unknown',summary,evidence='',evidenceQuality='observed',complete=false}){const m=id(matterId),s=sourceId(sourceValue);iso(observedAt,'observedAt');if(!STAGES.has(stage))throw new Error('invalid matter stage');if(!EVIDENCE_QUALITY.includes(evidenceQuality))throw new Error('invalid evidence quality');if(!clean(summary,MAX.text))throw new Error('summary required');const source=listSources().find(x=>x.sourceId===s);if(!source)throw new Error('source must be registered before observation');if(stage==='completed'&&!clean(evidence,MAX.evidence))throw new Error('completed observation requires evidence');if(!apply(read()).some(x=>x.matterId===m))throw new Error('unknown matter');return append({type:'matter-observation',matterId:m,sourceId:s,observedAt,stage,summary:clean(summary,MAX.text),evidence:clean(evidence,MAX.evidence),evidenceQuality,complete:Boolean(complete)})}
export function listObservations(matterIdValue){const m=id(matterIdValue);return read().filter(e=>e.type==='matter-observation'&&e.matterId===m).map(e=>({sourceId:e.sourceId,observedAt:e.observedAt,stage:e.stage,summary:e.summary,evidence:e.evidence,evidenceQuality:e.evidenceQuality,complete:e.complete,recordedAt:e.at}))}
export function readMatterHistory(matterId){const m=apply(read()).find(x=>x.matterId===id(matterId));if(!m)throw new Error('unknown matter');return {ok:true,matterId:m.matterId,kind:m.kind,title:m.title,current:m.current,history:m.events,observations:listObservations(m.matterId),sources:listSources().filter(s=>m.events.some(e=>e.source===s.sourceId)||listObservations(m.matterId).some(o=>o.sourceId===s.sourceId)),completeness:'complete-ledger-history'}}
