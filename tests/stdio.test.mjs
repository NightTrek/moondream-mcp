import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { PythonSetup } from '../build/utils/python-setup.js';

test('clean startup, initialize, tools/list and test call need no backend', { timeout: 10000 }, async t => {
  const child = spawn(process.execPath, ['build/index.js'], {
    env: { ...process.env, MOONDREAM_EXTERNAL_SERVER: '', MOONDREAM_EXECUTABLE: '/nonexistent/moondream', MOONDREAM_MODEL_PATH: '/nonexistent/model' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  const replies = new Map();
  const invalid = [];
  lines.on('line', line => {
    try {
      const message = JSON.parse(line);
      replies.get(message.id)?.(message);
    } catch { invalid.push(line); }
  });
  async function request(id, method, params) {
    const reply = new Promise(resolve => replies.set(id, resolve));
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return reply;
  }
  const initialized = await request(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'regression-test', version: '1' } });
  assert.equal(initialized.result.serverInfo.name, 'moondream-server');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const list = await request(2, 'tools/list', {});
  assert.deepEqual(list.result.tools.map(tool => tool.name), ['test', 'analyze_image', 'analyze_webpage']);
  const echo = await request(3, 'tools/call', { name: 'test', arguments: { message: 'hello' } });
  assert.match(echo.result.content[0].text, /hello/);
  const analysis = await request(4, 'tools/call', { name: 'analyze_image', arguments: { image_path: '/nonexistent/image', prompt: 'caption' } });
  assert.match(JSON.stringify(analysis), /not configured/);
  assert.deepEqual(invalid, [], `Non-protocol stdout: ${invalid}`);
  assert.doesNotMatch(stderr, /installing|Downloading model/i);
  const exit = once(child, 'exit');
  child.stdin.end();
  const [code] = await exit;
  assert.equal(code, 0);
});

test('missing backend fails clearly without installing anything', async () => {
  const prior = { ...process.env };
  process.env.MOONDREAM_EXECUTABLE = '/nonexistent/a path; echo injected';
  process.env.MOONDREAM_MODEL_PATH = '/nonexistent/model';
  delete process.env.MOONDREAM_EXTERNAL_SERVER;
  try {
    await assert.rejects(new PythonSetup().setup(), /No software or models are installed automatically/);
  } finally { process.env = prior; }
});

test('backend paths are literal and child stdout never enters MCP stdout', { timeout: 15000 }, async t => {
  const { mkdtemp, writeFile, chmod, rm, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'moondream test; '));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = join(dir, 'fake backend');
  const model = join(dir, 'model $(touch injected).mf');
  const argsFile = join(dir, 'args.json');
  await writeFile(model, 'test fixture, not model weights');
  await writeFile(executable, `#!${process.execPath}\nconst http = require('node:http');\nrequire('node:fs').writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));\nconsole.log('backend diagnostic');\nhttp.createServer((req,res) => { res.statusCode=400; res.end('{}'); }).listen(3475, '127.0.0.1');\n`);
  await chmod(executable, 0o700);
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import { PythonSetup } from './build/utils/python-setup.js'; const setup = new PythonSetup(); try { await setup.setup(); } finally { setup.cleanup(); }`], {
    env: { ...process.env, MOONDREAM_EXTERNAL_SERVER: '', MOONDREAM_EXECUTABLE: executable, MOONDREAM_MODEL_PATH: model },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, stderr);
  assert.equal(stdout, '');
  assert.match(stderr, /backend diagnostic/);
  assert.deepEqual(JSON.parse(await readFile(argsFile, 'utf8')), ['serve', '--model', model]);
});

test('cleanup cancels setup before any backend can spawn', async () => {
  const prior = { ...process.env };
  process.env.MOONDREAM_EXECUTABLE = process.execPath;
  process.env.MOONDREAM_MODEL_PATH = 'package.json';
  delete process.env.MOONDREAM_EXTERNAL_SERVER;
  const setup = new PythonSetup();
  try {
    const pending = setup.setup();
    setup.cleanup();
    await assert.rejects(pending, /startup cancelled/);
  } finally { process.env = prior; }
});

test('failed startup cannot kill a replacement launched before its rejection', { timeout: 15000 }, async t => {
  const { mkdtemp, writeFile, chmod, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'moondream-retry-'));
  const prior = { ...process.env };
  const setup = new PythonSetup();
  t.after(async () => { setup.cleanup(); process.env = prior; await rm(dir, { recursive: true, force: true }); });
  const first = join(dir, 'exit-backend');
  const second = join(dir, 'healthy-backend');
  const model = join(dir, 'fixture');
  await writeFile(model, 'fixture');
  await writeFile(first, `#!${process.execPath}\nsetTimeout(() => process.exit(1), 50);\n`);
  await writeFile(second, `#!${process.execPath}\nrequire('node:http').createServer((req,res) => { res.statusCode=400; res.end('{}'); }).listen(3475, '127.0.0.1');\n`);
  await chmod(first, 0o700); await chmod(second, 0o700);
  process.env.MOONDREAM_EXECUTABLE = first;
  process.env.MOONDREAM_MODEL_PATH = model;
  delete process.env.MOONDREAM_EXTERNAL_SERVER;
  const failed = setup.setup();
  const rejected = assert.rejects(failed, /exited/);
  while (!setup.process) await new Promise(resolve => setTimeout(resolve, 1));
  await once(setup.process, 'exit');
  process.env.MOONDREAM_EXECUTABLE = second;
  const replacement = setup.setup();
  // Attach rejection handling before awaiting the original polling loop.
  const replacementResult = replacement.then(() => null, error => error);
  await rejected;
  assert.equal(await replacementResult, null, 'old failure must not cancel the replacement');
  assert.ok(setup.process && setup.process.exitCode === null, 'replacement stays alive');
});
