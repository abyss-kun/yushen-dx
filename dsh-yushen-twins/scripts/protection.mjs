// Portable entry: node scripts/protection.mjs status|run|list|verify ID|preview ID|restore ID --confirm
import { backupStatus, runProtectedBackup, listProtectedSnapshots, verifyProtectedSnapshot, restoreProtectedSnapshot } from '../lib/backup-service.js'
const [cmd='status',id,...flags]=process.argv.slice(2)
try {
 let result
 if(cmd==='status')result=backupStatus()
 else if(cmd==='run')result=await runProtectedBackup()
 else if(cmd==='list')result=await listProtectedSnapshots()
 else if(cmd==='verify')result=await verifyProtectedSnapshot(id)
 else if(cmd==='preview')result=await restoreProtectedSnapshot({id,apply:false})
 else if(cmd==='restore'){if(!flags.includes('--confirm'))throw Error('Use preview first; real restore requires --confirm');result=await restoreProtectedSnapshot({id,apply:true})}
 else throw Error('Unknown command; use status|run|list|verify ID|preview ID|restore ID --confirm')
 console.log(JSON.stringify(result,null,2))
}catch(error){console.error('Protection failed: '+error.message);process.exitCode=1}
