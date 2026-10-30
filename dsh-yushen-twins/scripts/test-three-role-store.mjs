import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const home=fs.mkdtempSync(path.join(os.tmpdir(),'yushen-three-role-'))
process.env.DSH_HOME=home
const dir=path.join(home,'dayu','nest');fs.mkdirSync(dir,{recursive:true})
const original={version:1,slots:{dayu:{name:'大鱼原名',pos:{x:31,y:42},source:'default'},xiaoyu:{name:'小鱼原名',pos:{x:-11,y:22},source:'default'}},history:{dayu:[{name:'历史大鱼'}],xiaoyu:[{name:'历史小鱼'}]},guests:[]}
fs.writeFileSync(path.join(dir,'index.json'),JSON.stringify(original))
const nest=await import('../lib/nest.js')
assert.deepEqual(nest.ROLES,['dayu','xiaoyu','dragon'])
assert.equal(nest.snapshot().slots.dragon.name,'照微')
assert.equal(nest.readIndex().slots.dayu.name,'大鱼原名')
const png=fs.readFileSync(new URL('../assets/avatars/dragon/idle.png',import.meta.url))
nest.adoptBytes('dragon','照微新装','.png',png,{source:'generated',rel:'dragon-idle.png'})
assert.equal(nest.snapshot().slots.dragon.source,'user')
assert.deepEqual(fs.readFileSync(nest.resolveAvatar('dragon')),png)
nest.move('dragon',77,88);nest.rename('dragon','照微')
assert.deepEqual(nest.readIndex().slots.dragon.pos,{x:77,y:88})
for(const role of ['dayu','xiaoyu']){
 assert.equal(nest.readIndex().slots[role].name,original.slots[role].name)
 assert.deepEqual(nest.readIndex().slots[role].pos,original.slots[role].pos)
 assert.deepEqual(nest.readIndex().history[role],original.history[role])
}
for(const role of ['../escape','zhaowei','unknown'])assert.throws(()=>nest.move(role,1,2))
assert.throws(()=>nest.adoptBytes('dragon','bad','.svg',Buffer.from('<svg/>')))
nest.restore('dragon');assert.equal(nest.snapshot().slots.dragon.source,'default')
assert.ok(nest.resolveAvatar('dragon').includes('assets'))
console.log('PASS three-role actual store: old two-role migration, portrait bytes, rename, move, isolation, invalid roles and default restore')
console.log('Isolated test home: '+home+' (real user data unchanged)')
