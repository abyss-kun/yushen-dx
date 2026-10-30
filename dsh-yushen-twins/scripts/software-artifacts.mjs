// Explicit capture of a user-selected installer candidate. Never installs or restores.
import os from 'node:os'
import path from 'node:path'
import { captureArtifact, verifyArtifact, listArtifacts } from '../lib/software-artifacts.js'
const base=path.join(process.env.DSH_HOME||path.join(os.homedir(),'.dsh'),'dayu','protection','software-artifacts')
const [cmd='list',source,...args]=process.argv.slice(2)
try {
 let result
 if(cmd==='list')result=await listArtifacts({store:base})
 else if(cmd==='capture'){
  if(!source||!args.length)throw Error('Usage: node scripts/software-artifacts.mjs capture <installer-path> <version>')
  const [version]=args
  result=await captureArtifact({source,store:base,metadata:{product:'DeepSeek Harness',version,platform:process.platform,arch:process.arch}})
 }else if(cmd==='verify'){
  if(!source)throw Error('Usage: node scripts/software-artifacts.mjs verify <artifact-id>')
  result=await verifyArtifact({store:base,id:source})
 }else throw Error('Use list|capture|verify')
 console.log(JSON.stringify(result,null,2))
}catch(e){console.error('Software artifact protection failed: '+e.message);process.exitCode=1}
