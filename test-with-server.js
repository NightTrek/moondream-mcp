import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runTest() {
  // Start the Moondream server
  const server = spawn('node', ['build/index.js'], {
    stdio: 'pipe',
    env: process.env
  });

  // Wait for server to start
  await new Promise((resolve) => {
    server.stderr.on('data', (data) => {
      const output = data.toString();
      console.error('[Server]', output);
      if (output.includes('Moondream MCP server running on stdio')) {
        resolve();
      }
    });
  });

  console.log('Server started, running test...');

  // Run the test
  const test = spawn('node', ['test-webpage-analysis.js'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      MCP_SERVER_PID: server.pid.toString()
    }
  });

  // Handle test completion
  test.on('close', (code) => {
    console.log(`Test exited with code ${code}`);
    server.kill();
    process.exit(code);
  });

  // Handle cleanup
  process.on('SIGINT', () => {
    server.kill();
    test.kill();
    process.exit(1);
  });
}

runTest().catch(console.error);
