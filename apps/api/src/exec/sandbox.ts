import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunResult } from '@tgi/shared';

interface LanguageSpec {
  image: string;
  file: string;
  /** Shell command run inside the container; the source is mounted read-only at /work. */
  cmd: string;
  memory: string;
}

export const LANGUAGES: Record<string, LanguageSpec> = {
  javascript: { image: 'node:24-alpine', file: 'main.js', cmd: 'node --no-warnings /work/main.js', memory: '256m' },
  typescript: { image: 'node:24-alpine', file: 'main.ts', cmd: 'node --no-warnings /work/main.ts', memory: '256m' },
  python: { image: 'python:3.12-alpine', file: 'main.py', cmd: 'python /work/main.py', memory: '256m' },
  java: { image: 'eclipse-temurin:21-jdk-alpine', file: 'Main.java', cmd: 'java /work/Main.java', memory: '512m' },
  cpp: {
    image: 'tgi-sandbox-cpp',
    file: 'main.cpp',
    cmd: 'g++ -O1 -std=c++17 -o /tmp/a.out /work/main.cpp && /tmp/a.out',
    memory: '384m',
  },
};

export const MAX_CODE_BYTES = 100_000;
export const MAX_STDIN_BYTES = 10_000;
const WALL_TIME_MS = 15_000; // covers compile + run
const KEEP_BYTES = 64_000; // per stream shown to users
const KILL_BYTES = 1_000_000; // total output at which a runaway program is killed

const knownImages = new Set<string>();

export function imageAvailable(image: string): boolean {
  if (knownImages.has(image)) return true;
  const ok = spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' }).status === 0;
  if (ok) knownImages.add(image);
  return ok;
}

/**
 * Runs untrusted code in a throwaway container: no network, no privileges, read-only root filesystem,
 * capped memory/CPU/processes, non-root user, and a wall-clock kill.
 */
export async function runInSandbox(language: string, code: string, stdin: string): Promise<RunResult> {
  const spec = LANGUAGES[language];
  const dir = await mkdtemp(join(tmpdir(), 'tgi-run-'));
  const name = `tgi-run-${randomUUID()}`;
  try {
    await chmod(dir, 0o755);
    const file = join(dir, spec.file);
    await writeFile(file, code, { mode: 0o644 });

    const args = [
      'run', '--rm', '-i', '--name', name,
      '--network', 'none',
      '--memory', spec.memory, '--memory-swap', spec.memory,
      '--cpus', '1',
      '--pids-limit', '128',
      '--ulimit', 'nofile=256',
      '--read-only',
      '--tmpfs', '/tmp:rw,exec,nosuid,size=64m',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--user', '65534:65534',
      '-e', 'HOME=/tmp',
      '-v', `${dir}:/work:ro`,
      '-w', '/tmp',
      spec.image, 'sh', '-c', spec.cmd,
    ];

    const started = Date.now();
    return await new Promise<RunResult>((resolve) => {
      const child = spawn('docker', args);
      let stdout = '';
      let stderr = '';
      let total = 0;
      let truncated = false;
      let timedOut = false;
      let killed = false;

      const kill = () => {
        if (killed) return;
        killed = true;
        spawn('docker', ['kill', name], { stdio: 'ignore' }); // killing the CLI alone would leave the container running
      };
      const timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, WALL_TIME_MS);

      const collect = (which: 'out' | 'err') => (chunk: Buffer) => {
        total += chunk.length;
        const current = which === 'out' ? stdout : stderr;
        if (current.length < KEEP_BYTES) {
          const next = current + chunk.toString('utf8');
          const cut = next.length > KEEP_BYTES;
          if (cut) truncated = true;
          if (which === 'out') stdout = cut ? next.slice(0, KEEP_BYTES) : next;
          else stderr = cut ? next.slice(0, KEEP_BYTES) : next;
        } else {
          truncated = true;
        }
        if (total > KILL_BYTES) {
          truncated = true;
          kill();
        }
      };
      child.stdout.on('data', collect('out'));
      child.stderr.on('data', collect('err'));
      child.stdin.on('error', () => {}); // program may exit without reading stdin
      child.stdin.end(stdin);

      child.on('error', (e) => {
        clearTimeout(timer);
        resolve({ stdout, stderr: `Could not start sandbox: ${e.message}`, exitCode: null, timedOut: false, truncated, durationMs: Date.now() - started });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: timedOut || killed ? null : code,
          timedOut,
          truncated,
          durationMs: Date.now() - started,
        });
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
