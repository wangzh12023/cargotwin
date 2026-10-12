// Runs the Blender asset pipeline headlessly:
//   blender -b --factory-startup -P blender/build_assets.py
//   blender -b --factory-startup -P blender/render_thumbs.py
// Blender is located via $BLENDER_PATH, PATH, the Windows registry, or common install dirs.
import { spawnSync, execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function findBlender() {
  if (process.env.BLENDER_PATH && existsSync(process.env.BLENDER_PATH)) return process.env.BLENDER_PATH;
  const probe = process.platform === 'win32' ? 'where blender' : 'command -v blender';
  try {
    const p = execSync(probe, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/)[0].trim();
    if (p && existsSync(p)) return p;
  } catch {}
  if (process.platform === 'win32') {
    try {
      const out = execSync(
        String.raw`reg query HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall /s /f Blender /d`,
        { stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString();
      for (const m of out.matchAll(/InstallLocation\s+REG_SZ\s+(.+)/g)) {
        const exe = join(m[1].trim(), 'blender.exe');
        if (existsSync(exe)) return exe;
      }
    } catch {}
    const root = String.raw`C:\Program Files\Blender Foundation`;
    if (existsSync(root)) {
      for (const d of readdirSync(root).sort().reverse()) {
        const exe = join(root, d, 'blender.exe');
        if (existsSync(exe)) return exe;
      }
    }
  }
  if (process.platform === 'darwin') {
    const mac = '/Applications/Blender.app/Contents/MacOS/Blender';
    if (existsSync(mac)) return mac;
  }
  return null;
}

const blender = findBlender();
if (!blender) {
  console.error('Blender not found. Install Blender (tested with 5.2) or set BLENDER_PATH. (Prebuilt assets are already in public/.)');
  process.exit(1);
}
console.log(`Using Blender: ${blender}`);
const only = process.argv[2]; // optional: "assets" | "thumbs"
const jobs = [
  ['assets', 'blender/build_assets.py'],
  ['thumbs', 'blender/render_thumbs.py'],
].filter(([k]) => !only || only === k);
for (const [, script] of jobs) {
  if (!existsSync(script)) { console.warn(`skip ${script} (missing)`); continue; }
  console.log(`\n> ${script}`);
  const r = spawnSync(blender, ['-b', '--factory-startup', '-P', script], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`${script} failed (${r.status})`); process.exit(r.status ?? 1); }
}
console.log('\nDone.');
