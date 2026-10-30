import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
process.env.DSH_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'session-governance-'))
const { auditSessions }=await import('../lib/session-governance.js?x='+Date.now())
const out=auditSessions([
 {sessionId:'empty-stopped',blank:true,running:false,title:''},
 {sessionId:'empty-running',blank:true,running:true,title:''},
 {sessionId:'named-stopped',blank:false,running:false,title:'我的重要窗口'},
 {sessionId:'named-running',blank:false,running:true,title:'当前窗口'},
])
assert.equal(out.total,4);assert.equal(out.blankStopped.length,1);assert.equal(out.blankRunning.length,1);assert.equal(out.namedStopped.length,1)
assert.equal(out.recommendations.find(x=>x.action==='mark-empty').count,1)
assert.match(out.warning,/不自动杀进程/)
console.log('session-governance: 4 passed')
