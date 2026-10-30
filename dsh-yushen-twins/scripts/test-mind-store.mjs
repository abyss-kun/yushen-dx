import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
process.env.DSH_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'mind-store-'))
const m=await import('../lib/mind-store.js?test='+Date.now())
const scope={channel:'workbench',conversationId:'direct-test',audience:'private'}
const x=m.recordInterest('dayu',{text:'主动理解新事物',detail:'不是只等命令',scope,source:{quote:'用户定义',speaker:'owner',messageId:'m1',at:new Date().toISOString()},epistemic:'inferred',confidence:.8,weight:4})
assert.equal(x.ok,true);assert.equal(m.listMindItems('dayu',{scope}).length,1)
assert.equal(m.queryMind('dayu',{scope,text:'理解新事物'}).items.length,1)
assert.throws(()=>m.confirmMindItem('dayu',x.item.id,{scope,evidence:'',basis:'explicit_statement'}))
const p=m.recordPromise('dayu',{text:'持续核对主动学习接入',detail:'不因换窗口遗忘',scope,source:{quote:'用户要求',speaker:'owner',messageId:'m2',at:new Date().toISOString()},epistemic:'confirmed',confidence:1,confirmation:{basis:'explicit_statement',evidence:'用户明确要求',observations:1}})
assert.equal(m.queryMind('dayu',{scope,text:'无关',includePromises:true}).items.some(i=>i.id===p.item.id),true)
console.log('mind-store: 4 passed')
