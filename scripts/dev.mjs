import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if (!existsSync('.venv/bin/python')) { console.error('Run npm run setup first.'); process.exit(1); }
const children = [spawn('.venv/bin/python', ['backend/server.py'], { stdio: 'inherit' }), spawn('node', ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' })];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; children.forEach(child => child.kill('SIGTERM')); process.exitCode = code; }
children.forEach(child => { child.on('error', error => { console.error(error); stop(1); }); child.on('exit', code => stop(code ?? 0)); });
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
