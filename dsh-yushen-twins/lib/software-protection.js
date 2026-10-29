// Software coverage inventory only. It never copies installers, profiles, sessions, or secrets.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readBackupConfig } from './backup-service.js'
const safeStat = filename => { try { const s = fs.statSync(filename); return { exists: s.isFile() || s.isDirectory(), bytes: s.isFile() ? s.size : null } } catch { return { exists: false } } }
export function softwareProtectionStatus() {
 const home=process.env.DSH_HOME||path.join(os.homedir(),'.dsh'), config=readBackupConfig()
 const isDesktop=/DeepSeek Harness(?:\.exe)?$/i.test(path.basename(process.execPath)), install=isDesktop?path.dirname(process.execPath):null
 const artifacts=[]
 if(install)for(const relative of [path.basename(process.execPath),'resources/app.asar','resources/app.asar.unpacked','resources/runtime/versions.json']){
  const filename=path.join(install,relative), stat=safeStat(filename)
  artifacts.push({name:relative,...stat,coveredByConfiguredRoots:config.roots.some(r=>{const rel=path.relative(r.path,filename);return !rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)}),exceedsBackupLimit:stat.bytes!==null&&stat.bytes>config.maxFileBytes})
 }
 const downloads=path.join(os.homedir(),'Downloads')
 const installerCandidates=[]
 try {for(const name of fs.readdirSync(downloads)){if(!/^deepseek-harness-.*\.exe$|^dsh-.*windows.*\.exe$/i.test(name))continue;installerCandidates.push({name,...safeStat(path.join(downloads,name)),validated:false})}}catch{}
 return {scope:'software-coverage-inventory-only',rootIds:config.roots.map(r=>r.id),host:{discovered:isDesktop,electronVersion:process.versions.electron||null,applicationVersion:null,artifacts},profile:{exists:fs.existsSync(path.join(home,'profiles','desktop')),coveredByConfiguredRoots:config.roots.some(r=>{const f=path.join(home,'profiles','desktop'),rel=path.relative(r.path,f);return !rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)}),note:'May contain credentials; excluded from auto backup; use a reviewed sanitized export.'},sessions:{protected:false,note:'Use host-supported consistent export; copying a live database is not a verified recovery point.'},installerCandidates:{items:installerCandidates,validated:false,note:'Presence alone proves neither signature, version match nor offline usability.'},constraints:['Inventory does not imply backup. Host binaries and app.asar are often larger than the per-file limit and node_modules may be excluded.','Do not restore host binaries/profile while DSH is running.','Only explicitly qualified healthy snapshots may be applied; no auto restart or recovery loop.','Separate signed installer/artifact verification and second-disk storage remain necessary for software disaster recovery.']}
}
