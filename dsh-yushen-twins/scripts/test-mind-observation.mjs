import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
process.env.DSH_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'mind-observe-'))
const m=await import('../lib/mind-store.js?observe='+Date.now())
const scope={channel:'bili',conversationId:'BV-observe',audience:'group'}
const item=m.recordObservedMind('dayu',{kind:'interest',text:'视频里的新知识',detail:'先作为兴趣，不声称已经理解',source:{quote:'字幕原文',speaker:'up',messageId:'BV-observe',at:new Date().toISOString()},scope,confidence:.6,weight:3})
assert.equal(item.item.epistemic,'inferred')
assert.equal(m.queryMind('dayu',{scope,text:'新知识'}).count,1)
assert.throws(()=>m.recordObservedMind('dayu',{kind:'interest',text:'越权',source:{quote:'x'},scope:{channel:'bili',conversationId:'BV-observe',audience:'group'},epistemic:'confirmed'}),/confirmation/)
assert.throws(()=>m.queryMind('dayu',{text:'无 scope'}),/scope/)
const dragon=m.recordObservedMind('dragon',{kind:'question',text:'照微的观察问题',source:{quote:'已获准来源',speaker:'owner',messageId:'m3',at:new Date().toISOString()},scope:{channel:'workbench',conversationId:'dragon-test',audience:'private'}})
assert.equal(dragon.item.role,'dragon')
console.log('mind-observation: 5 passed')
