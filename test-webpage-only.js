#!/usr/bin/env node
import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class McpTestClient {
  constructor(serverPath) {
    this.messageId = 1;
    this.serverPath = serverPath;
  }

  async initialize() {
    this.serverProcess = spawn("node", [this.serverPath], {
      stdio: ["pipe", "pipe", process.stderr],
      env: {
        ...process.env,
        TMPDIR: '/tmp',
        PATH: `${process.env.PATH}:/usr/local/bin:/usr/bin`
      }
    });

    this.serverProcess.on("error", (error) => {
      console.error("Server process error:", error);
    });

    this.serverProcess.on("close", (code) => {
      console.log(`Server process exited with code ${code}`);
    });

    console.log("Waiting for server and model to initialize...");
    // Wait for server initialization
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  async sendRequest(method, params = {}) {
    const request = {
      jsonrpc: "2.0",
      id: this.messageId++,
      method,
      params
    };

    console.log("\nSending request:", JSON.stringify(request, null, 2));
    this.serverProcess.stdin.write(JSON.stringify(request) + "\n");
  }

  async runTest() {
    const testTimeout = 180000; // 3 minutes timeout to account for model loading
    let responseReceived = false;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error("\nTest timeout: No response received within 2 minutes");
        this.close();
        process.exit(1);
      }, testTimeout);

      // Setup response handler
      this.serverProcess.stdout.on("data", (data) => {
        try {
          const output = data.toString();
          const jsonLines = output.split("\n")
            .filter(line => line.trim())
            .filter(line => line.trim().startsWith("{"));
          
          jsonLines.forEach(message => {
            try {
              const response = JSON.parse(message);
              console.error("\nRaw response:", message);
              console.log("\nReceived response:", JSON.stringify(response, null, 2));
              
              if (response.error) {
                console.error(`Error in response: ${response.error.message}`);
              }

              responseReceived = true;
              clearTimeout(timeout);
              this.close();
              process.exit(0);
            } catch (parseError) {
              console.error("Error parsing JSON response:", parseError);
            }
          });
        } catch (error) {
          console.error("Error handling server response:", error);
        }
      });

      // Send webpage analysis request
      try {
        console.log("\n=== Testing webpage analysis ===");
        this.sendRequest("tools/call", {
          name: "analyze_webpage",
          arguments: {
            url: "https://docs.moondream.ai/",
            query: "Looking at the highlighted navigation elements (yellow for sidebar, cyan for top bar), list all visible navigation links. Format your response as 'Sidebar: [list links] / Top bar: [list links]'. Only include links that are clearly visible and highlighted.",
            waitTime: 30000, // Further increased wait time for better content detection
            viewport: {
              width: 1920,
              height: 1080
            }
          }
        });
      } catch (error) {
        console.error("Error running test:", error);
        this.close();
        process.exit(1);
      }
    });
  }

  close() {
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
  }
}

// Create and run test client
const serverPath = join(__dirname, "build", "index.js");
const client = new McpTestClient(serverPath);

// Run test
(async () => {
  try {
    await client.initialize();
    await client.runTest();
  } catch (error) {
    console.error("Test execution error:", error);
    client.close();
    process.exit(1);
  }
})().catch(error => {
  console.error("Test execution error:", error);
  client.close();
  process.exit(1);
});

// Handle cleanup on interrupt
process.on("SIGINT", () => {
  console.log("\nClosing test client...");
  client.close();
  process.exit(0);
});
