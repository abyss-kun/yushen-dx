import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createInstaller, INSTALL_CONFIRMATION, UNINSTALL_CONFIRMATION } from '../lib/repair-helper-install.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yushen-install-test-'));
let passed = 0;
async function test(name, run) {
  await run();
  passed++;
  console.log(`ok ${passed} - ${name}`);
}
async function fixture({ platform = 'win32', ...overrides } = {}) {
  const dir = await fs.mkdtemp(path.join(root, 'fixture-'));
  const sourceDir = path.join(dir, 'assets');
  const local = path.join(dir, 'local');
  const desktop = path.join(dir, 'redirected-desktop');
  await Promise.all([sourceDir, local, desktop].map(p => fs.mkdir(p)));
  const calls = [];
  const api = createInstaller({ platform, sourceDir, env: { LOCALAPPDATA: local },
    resolveDesktop: async () => desktop,
    createShortcut: async args => { calls.push(args); await fs.writeFile(args.shortcutPath, JSON.stringify(args)); },
    ...overrides });
  async function build(body = 'fixture executable, not an actual program') {
    const hash = createHash('sha256').update(body).digest('hex');
    await fs.writeFile(path.join(sourceDir, 'YushenRepair.exe'), body);
    await fs.writeFile(path.join(sourceDir, 'SHA256SUMS.txt'), `${hash}  YushenRepair.exe\n`);
    return hash;
  }
  return { api, dir, sourceDir, local, desktop, calls, build };
}
try {
  await test('missing build reports unavailable without creating any installation', async () => {
    const f = await fixture();
    const info = await f.api.helperInfo();
    assert.equal(info.available, false);
    assert.equal(info.reason, 'not-built');
    assert.equal(info.signatureStatus, 'unsigned-local-build');
    assert.deepEqual(await fs.readdir(f.local), []);
  });
  await test('hash validation, explicit confirmation and copy post-verification', async () => {
    const f = await fixture(); const hash = await f.build();
    assert.equal((await f.api.helperInfo()).sha256, hash);
    await assert.rejects(f.api.installRepairHelper({ desktop: true }), /confirmation/);
    const result = await f.api.installRepairHelper({ confirm: INSTALL_CONFIRMATION });
    assert.equal(result.verified, true);
    assert.equal(result.targetPath, path.join(f.local, 'Yushen', 'RepairHelper', hash, 'YushenRepair.exe'));
    assert.equal(await fs.readFile(result.targetPath, 'utf8'), 'fixture executable, not an actual program');
    assert.equal(result.desktopShortcut, null);
    assert.equal(f.calls.length, 0);
    assert.deepEqual(await f.api.installRepairHelper({ confirm: INSTALL_CONFIRMATION }), result);
  });
  await test('redirected desktop uses injected resolver and shortcut with empty args and install working dir', async () => {
    const f = await fixture(); await f.build();
    const result = await f.api.installRepairHelper({ confirm: INSTALL_CONFIRMATION, desktop: true });
    assert.equal(result.desktopShortcut, path.join(f.desktop, '鱼神修复助手.lnk'));
    assert.equal(f.calls[0].arguments, '');
    assert.equal(f.calls[0].targetPath, result.targetPath);
    assert.equal(f.calls[0].workingDirectory, result.installDir);
    assert.deepEqual(await fs.readdir(f.desktop), ['鱼神修复助手.lnk']);
    await assert.rejects(f.api.installRepairHelper({ confirm: INSTALL_CONFIRMATION, desktop: true }), /refusing to overwrite/);
  });
  await test('new versions preserve historical hash directories', async () => {
    const f = await fixture(); await f.build('old');
    const old = await f.api.installRepairHelper({ confirm: INSTALL_CONFIRMATION });
    await f.build('new');
    const next = await f.api.installRepairHelper({ confirm: INSTALL_CONFIRMATION });
    assert.notEqual(old.targetPath, next.targetPath);
    assert.equal(await fs.readFile(old.targetPath, 'utf8'), 'old');
    assert.equal(await fs.readFile(next.targetPath, 'utf8'), 'new');
  });
  await test('tampered bundle or installed bytes fail closed, never overwritten', async () => {
    const f = await fixture(); await f.build();
    const result = await f.api.installRepairHelper({ confirm: INSTALL_CONFIRMATION });
    await fs.writeFile(result.targetPath, 'tampered installation');
    await assert.rejects(f.api.installRepairHelper({ confirm: INSTALL_CONFIRMATION }), /verification failed/);
    assert.equal(await fs.readFile(result.targetPath, 'utf8'), 'tampered installation');
    await fs.writeFile(path.join(f.sourceDir, 'YushenRepair.exe'), 'tampered bundle');
    assert.equal((await f.api.helperInfo()).available, false);
    await assert.rejects(f.api.installRepairHelper({ confirm: INSTALL_CONFIRMATION }), /unavailable/);
  });
  await test('metadata cannot supply executable commands or alternate filenames', async () => {
    const f = await fixture(); await f.build();
    await fs.writeFile(path.join(f.sourceDir, 'SHA256SUMS.txt'), 'powershell.exe -Command evil');
    assert.equal((await f.api.helperInfo()).reason, 'invalid-local-artifact');
    assert.equal(f.calls.length, 0);
    const hash = await f.build();
    await fs.appendFile(path.join(f.sourceDir, 'SHA256SUMS.txt'), `${'a'.repeat(64)}  ../../repair-helper/build.ps1\n`);
    assert.equal((await f.api.helperInfo()).sha256, hash);
    await fs.appendFile(path.join(f.sourceDir, 'SHA256SUMS.txt'), `${hash}  YushenRepair.exe\n`);
    assert.equal((await f.api.helperInfo()).available, false);
  });
  await test('non-Windows refuses installation and uninstall even with confirmation', async () => {
    const f = await fixture({ platform: 'linux' }); await f.build();
    assert.equal((await f.api.helperInfo()).available, false);
    await assert.rejects(f.api.installRepairHelper({ confirm: INSTALL_CONFIRMATION }), /Windows-only/);
    await assert.rejects(f.api.uninstallRepairHelper({ confirm: UNINSTALL_CONFIRMATION }), /Windows-only/);
    assert.deepEqual(await fs.readdir(f.local), []);
  });
  await test('junction/symlink installation root is refused', async () => {
    const f = await fixture(); await f.build();
    const external = path.join(f.dir, 'outside'); await fs.mkdir(external);
    await fs.symlink(external, path.join(f.local, 'Yushen'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(f.api.installRepairHelper({ confirm: INSTALL_CONFIRMATION }), /linked path/);
    assert.deepEqual(await fs.readdir(external), []);
  });
  await test('uninstall requires explicit confirmation and does no untested deletion', async () => {
    const f = await fixture(); await f.build();
    const result = await f.api.installRepairHelper({ confirm: INSTALL_CONFIRMATION });
    await assert.rejects(f.api.uninstallRepairHelper(), /confirmation/);
    const uninstall = await f.api.uninstallRepairHelper({ confirm: UNINSTALL_CONFIRMATION });
    assert.equal(uninstall.uninstalled, false);
    assert.equal(uninstall.supported, false);
    assert.ok(await fs.stat(result.targetPath));
  });
  console.log(`PASS ${passed} repair helper installer tests (fixtures only; no PowerShell, COM or helper execution)`);
} finally {
  // Test owns this unique mkdtemp tree; fixtures never contain user data.
  assert.equal(path.dirname(root), os.tmpdir());
  assert.ok(path.basename(root).startsWith('yushen-install-test-'));
  await fs.rm(root, { recursive: true, force: true });
}
