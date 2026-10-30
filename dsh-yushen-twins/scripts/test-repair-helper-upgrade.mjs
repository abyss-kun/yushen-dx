// 离线测试：修复助手的自动升级与“别人的快捷方式不许覆盖”。
//
// 用注入了 env / resolveDesktop / createShortcut 的 installer 跑，完全不碰真实桌面和真实 LOCALAPPDATA。

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createInstaller } from '../lib/repair-helper-install.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yushen-upgrade-test-'));
const src = path.join(root, 'src');
const localAppData = path.join(root, 'localappdata');
const desktop = path.join(root, 'desktop');
const linkName = '鱼神修复助手.lnk';
const linkPath = path.join(desktop, linkName);

await fs.mkdir(src, { recursive: true });
await fs.mkdir(localAppData, { recursive: true });
await fs.mkdir(desktop, { recursive: true });

// 伪造一份“发行包里的助手”
const exeBytes = Buffer.from('fake-helper-binary-v2');
const exeHash = crypto.createHash('sha256').update(exeBytes).digest('hex');
await fs.writeFile(path.join(src, 'YushenRepair.exe'), exeBytes);
await fs.writeFile(path.join(src, 'SHA256SUMS.txt'), `${exeHash}  YushenRepair.exe\n`);

const installer = createInstaller({
  platform: 'win32',
  env: { ...process.env, LOCALAPPDATA: localAppData },
  sourceDir: src,
  resolveDesktop: async () => desktop,
  // 用文本文件模拟 .lnk：内容就是 TargetPath，便于断言。（读也走注入，避免真去解析假 lnk）
  createShortcut: async ({ shortcutPath, targetPath }) => fs.writeFile(shortcutPath, targetPath),
  readShortcut: async (shortcutPath) => (await fs.readFile(shortcutPath, 'utf8')).trim(),
});

let failures = 0;
async function check(name, run) {
  try { await run(); console.log('PASS ', name); }
  catch (error) { failures += 1; console.log('FAIL ', name, '->', error?.message ?? error); }
}

const oldHash = 'a'.repeat(64);
const oldDir = path.join(localAppData, 'Yushen', 'RepairHelper', oldHash);
const rootDir = path.join(localAppData, 'Yushen', 'RepairHelper');
const newDir = path.join(rootDir, exeHash);

await check('upgrade: points the shortcut at the new version and archives the old dir', async () => {
  await fs.mkdir(oldDir, { recursive: true });
  await fs.writeFile(path.join(oldDir, 'YushenRepair.exe'), Buffer.from('old'));
  await fs.writeFile(linkPath, path.join(oldDir, 'YushenRepair.exe'));

  const result = await installer.autoUpgradeIfInstalled();

  assert.equal(result.upgraded, true, 'should report an upgrade');
  assert.equal(result.shortcutUpdated, true, 'should update the shortcut');
  assert.equal(result.to, exeHash, 'should install the bundled hash');
  assert.deepEqual(result.archivedOldVersions, [oldHash], 'should archive the old version');

  const target = (await fs.readFile(linkPath, 'utf8')).trim();
  assert.equal(target, path.join(newDir, 'YushenRepair.exe'), 'shortcut should point at the new exe');
  await fs.access(path.join(newDir, 'YushenRepair.exe')).then(() => {}, () => { throw new Error('new exe missing'); });

  const oldExists = await fs.access(oldDir).then(() => true, () => false);
  assert.equal(oldExists, false, 'old version dir should be moved away');
  const archived = await fs.readdir(path.join(rootDir, '.old'));
  assert.ok(archived.some((n) => n.startsWith(oldHash)), 'old version should be under .old');

  const backups = (await fs.readdir(desktop)).filter((n) => n.includes('.lnk.bak-'));
  assert.equal(backups.length >= 1, true, 'old shortcut should be backed up');
});

await check('upgrade: already up to date only repairs the shortcut', async () => {
  const result = await installer.autoUpgradeIfInstalled();
  assert.equal(result.skipped, 'up-to-date');
});

await check('safety: a shortcut pointing elsewhere is never overwritten', async () => {
  const foreign = path.join(root, 'other-app.exe');
  await fs.writeFile(foreign, 'x');
  await fs.writeFile(linkPath, foreign);
  let threw = null;
  try { await installer.installRepairHelper({ confirm: 'INSTALL LOCAL UNSIGNED HELPER', desktop: true }); }
  catch (error) { threw = String(error.message || error); }
  assert.ok(threw && threw.includes('refusing to overwrite'), 'should refuse foreign shortcut');
  assert.equal((await fs.readFile(linkPath, 'utf8')).trim(), foreign, 'foreign shortcut must stay untouched');
});

await check('first install: nothing installed -> auto upgrade does nothing', async () => {
  await fs.rm(path.join(localAppData, 'Yushen'), { recursive: true, force: true });
  const result = await installer.autoUpgradeIfInstalled();
  assert.equal(result.skipped, 'not-installed');
});

console.log('');
console.log(`Upgrade tests: ${4 - failures}/4 passed`);
console.log(`fixture: ${root}`);
if (failures > 0) process.exit(1);
