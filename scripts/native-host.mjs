#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function readMessage() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let expected = null;
    const onData = (chunk) => {
      chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (expected === null && buf.length >= 4) {
        expected = buf.readUInt32LE(0);
      }
      if (expected !== null && buf.length >= 4 + expected) {
        process.stdin.off('data', onData);
        process.stdin.off('end', onEnd);
        const json = buf.slice(4, 4 + expected).toString('utf8');
        try {
          resolve(JSON.parse(json));
        } catch (e) {
          reject(e);
        }
      }
    };
    const onEnd = () => {
      process.stdin.off('data', onData);
      resolve(null);
    };
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
  });
}

function writeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([len, json]));
}

function runGitPull(cwd) {
  return new Promise((resolve) => {
    const child = spawn('git', ['-C', cwd, 'pull', '--ff-only'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => resolve({ ok: false, error: String(e) }));
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, stdout: stdout.trim(), stderr: stderr.trim() });
      else resolve({ ok: false, error: `git exited ${code}: ${stderr.trim() || stdout.trim()}` });
    });
  });
}

async function getHead(cwd) {
  return new Promise((resolve) => {
    const child = spawn('git', ['-C', cwd, 'rev-parse', '--short', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(out.trim()));
  });
}

async function main() {
  process.stdin.pause();
  process.stdin.resume();

  const msg = await readMessage();
  if (!msg) {
    writeMessage({ ok: false, error: 'no message received' });
    return;
  }
  if (msg.action === 'ping') {
    writeMessage({ ok: true, pong: true, repoRoot });
    return;
  }
  if (msg.action === 'pull') {
    const before = await getHead(repoRoot);
    const result = await runGitPull(repoRoot);
    if (!result.ok) {
      writeMessage({ ok: false, error: result.error, repoRoot });
      return;
    }
    const after = await getHead(repoRoot);
    writeMessage({
      ok: true,
      repoRoot,
      before,
      after,
      changed: before !== after,
      stdout: result.stdout,
    });
    return;
  }
  writeMessage({ ok: false, error: `unknown action: ${msg.action}` });
}

main().catch((e) => {
  try {
    writeMessage({ ok: false, error: String(e) });
  } catch {}
  process.exit(1);
});
