import { spawn, type ChildProcess } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Never installs software or downloads model weights during an MCP session. */
export class PythonSetup {
  private process: ChildProcess | undefined;
  private generation = 0;
  private pending: Promise<void> | undefined;

  async setup(): Promise<void> {
    if (process.env.MOONDREAM_EXTERNAL_SERVER === '1') return;
    if (!this.pending) {
      this.pending = this.start().catch(error => {
        this.cleanup();
        throw error;
      });
    }
    return this.pending;
  }

  private async start(): Promise<void> {
    const generation = this.generation;
    const root = join(homedir(), '.local', 'share', 'moondream-mcp');
    const executable = process.env.MOONDREAM_EXECUTABLE || join(root, 'venv', process.platform === 'win32' ? 'Scripts/moondream.exe' : 'bin/moondream');
    const model = process.env.MOONDREAM_MODEL_PATH || join(root, 'models', 'moondream-0_5b-int4.mf.gz');
    try {
      await access(executable);
      await access(model);
    } catch {
      throw new Error('Moondream is not configured. Follow the README backend setup, or set MOONDREAM_EXTERNAL_SERVER=1 for a server on 127.0.0.1:3475. No software or models are installed automatically.');
    }
    if (generation !== this.generation) throw new Error('Backend startup cancelled');
    const child = spawn(executable, ['serve', '--model', model], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.process = child;
    child.stdout?.pipe(process.stderr, { end: false });
    child.stderr?.pipe(process.stderr, { end: false });
    let failure: Error | undefined;
    child.once('error', error => { failure = error; });
    child.once('exit', code => {
      failure = new Error(`Moondream exited (${code})`);
      if (this.process === child) {
        this.process = undefined;
        this.pending = undefined;
      }
    });
    for (let attempt = 0; attempt < 30; attempt++) {
      if (generation !== this.generation) throw new Error('Backend startup cancelled');
      if (failure) throw failure;
      try {
        await fetch('http://127.0.0.1:3475/caption', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: 'data:image/jpeg;base64,/9j' }),
          signal: AbortSignal.timeout(1000),
        });
        if (failure) throw failure;
        return;
      } catch {
        if (failure) throw failure;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Moondream did not become ready within 30 attempts');
  }

  cleanup(): void {
    this.generation++;
    this.process?.kill();
    this.process = undefined;
    this.pending = undefined;
  }
}
