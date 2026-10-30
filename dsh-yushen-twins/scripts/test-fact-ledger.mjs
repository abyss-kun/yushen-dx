import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
process.env.DSH_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'fact-ledger-'))
const m=await import('../lib/fact-ledger.js?test='+Date.now())
const t=m.createMatter({matterId:'memory-unified',kind:'requirement',title:'跨窗口共享同一事实状态',source:'framework:v1.59'})
m.recordMatterEvent({matterId:'memory-unified',stage:'planned',summary:'需要统一事项、沿革、实施状态和证据',source:'framework:v1.59',evidence:'defined in framework',revision:1})
m.recordMatterEvent({matterId:'memory-unified',stage:'in-progress',summary:'账本核心已实现，尚未接入所有入口',source:'implementation:fact-ledger.js',evidence:'test-fact-ledger.mjs',revision:2})
const a=m.matterPreflight({query:'跨窗口'}),b=await import('../lib/fact-ledger.js?second='+Date.now())
assert.equal(a.completeness,'matched-records-only');assert.equal(a.items[0].current.stage,'in-progress')
assert.equal(b.readMatterHistory('memory-unified').history.length,2)
assert.throws(()=>m.recordMatterEvent({matterId:'memory-unified',stage:'completed',summary:'说完成了'}),/evidence|summary|required/)
assert.equal(m.matterPreflight({query:'不存在'}).completeness,'no-match-is-not-proof-of-absence')
console.log('fact-ledger: 4 passed')
