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
    this.serverProcess = spawn("node", [serverPath], {
      stdio: ["pipe", "pipe", process.stderr],
      env: {
        ...process.env,
        TMPDIR: '/tmp', // Ensure we use /tmp for venv
        PATH: `${process.env.PATH}:/usr/local/bin:/usr/bin` // Ensure UV is in path
      }
    });

    this.serverProcess.on("error", (error) => {
      console.error("Server process error:", error);
    });

    this.serverProcess.on("close", (code) => {
      console.log(`Server process exited with code ${code}`);
    });

    // Give the server some time to start up
    console.log("Waiting for server to start...");
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

  async runTests() {
    const testTimeout = 120000; // 2 minutes timeout for initial setup and model loading
    let responsesReceived = 0;
    const expectedResponses = 4; // We're sending 4 requests

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error("\nTest timeout: Not all responses received within 30 seconds");
        this.close();
        process.exit(1);
      }, testTimeout);

      // Setup response handler
      this.serverProcess.stdout.on("data", (data) => {
        try {
          const messages = data.toString().split("\n").filter(line => line.trim());
          messages.forEach(message => {
            try {
              const response = JSON.parse(message);
              console.log("\nReceived response:", JSON.stringify(response, null, 2));
              responsesReceived++;

              if (response.error) {
                console.error(`Error in response: ${response.error.message}`);
              }

              if (responsesReceived >= expectedResponses) {
                clearTimeout(timeout);
                console.log("\nAll test responses received");
                this.close();
                process.exit(0);
              }
            } catch (parseError) {
              console.error("Error parsing JSON response:", parseError);
            }
          });
        } catch (error) {
          console.error("Error handling server response:", error);
        }
      });

      // Run the tests
      try {
        // Test 1: List available tools
        console.log("\n=== Testing ListTools ===");
        this.sendRequest("tools/list");

        // Test 2: Call test tool
        console.log("\n=== Testing test tool ===");
        this.sendRequest("tools/call", {
          name: "test",
          arguments: {
            message: "Hello from test client!"
          }
        });

        // Test 3: Generate caption for image
        console.log("\n=== Testing image caption generation ===");
        this.sendRequest("tools/call", {
          name: "analyze_image",
          arguments: {
            image_path: join(__dirname, "testPhoto.JPEG"),
            prompt: "generate caption"
          }
        });

        // Test 4: Ask a question about the image
        console.log("\n=== Testing visual question answering ===");
        this.sendRequest("tools/call", {
          name: "analyze_image",
          arguments: {
            image_path: join(__dirname, "testPhoto.JPEG"),
            prompt: "What time of day is it in this image?"
          }
        });
      } catch (error) {
        console.error("Error running tests:", error);
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

// Run tests
client.runTests().catch(error => {
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
