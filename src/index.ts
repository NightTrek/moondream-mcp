#!/usr/bin/env node

/**
 * MCP server that provides image analysis capabilities using the Moondream model.
 * It implements tools for:
 * - Image captioning
 * - Object detection
 * - Visual question answering
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Request,
} from "@modelcontextprotocol/sdk/types.js";
import { join } from "path";
import * as fs from "fs/promises";
import { PythonSetup } from "./utils/python-setup.js";
import { PuppeteerSetup, ViewportConfig } from "./utils/puppeteer-setup.js";

interface ListToolsRequest extends Request {
  method: "tools/list";
}

interface CallToolRequest extends Request {
  method: "tools/call";
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

class MoondreamServer {
  private server: Server;
  private pythonSetup: PythonSetup;
  private puppeteerSetup: PuppeteerSetup;

  constructor() {
    this.pythonSetup = new PythonSetup();
    this.puppeteerSetup = new PuppeteerSetup();
    this.server = new Server(
      {
        name: "moondream-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {
            test: {
              description: "Test tool to verify server functionality",
              inputSchema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    description: "Test message to echo back"
                  }
                },
                required: ["message"]
              }
            },
            analyze_image: {
              description: "Analyze an image using the Moondream model",
              inputSchema: {
                type: "object",
                properties: {
                  image_path: {
                    type: "string",
                    description: "Path to the image file to analyze"
                  },
                  prompt: {
                    type: "string",
                    description: "Command to analyze the image. Use 'generate caption' for image captioning, 'detect: [object]' for object detection, or any question for image querying."
                  }
                },
                required: ["image_path", "prompt"]
              }
            },
            analyze_webpage: {
              description: "Take a screenshot of a webpage and analyze it using Moondream",
              inputSchema: {
                type: "object",
                properties: {
                  url: {
                    type: "string",
                    description: "URL to screenshot (defaults to http://localhost:3000)"
                  },
                  query: {
                    type: "string",
                    description: "Question to ask about the webpage"
                  },
                  waitTime: {
                    type: "number",
                    description: "Time to wait after page load in milliseconds (default: 15000)"
                  },
                  viewport: {
                    type: "object",
                    description: "Optional viewport settings",
                    properties: {
                      width: {
                        type: "number",
                        description: "Viewport width (default: 1280, max: 2560)"
                      },
                      height: {
                        type: "number",
                        description: "Viewport height (default: 720, max: 1440)"
                      }
                    }
                  }
                },
                required: ["query"]
              }
            }
          },
        },
      }
    );

    this.setupToolHandlers();
    this.server.onerror = (error) => console.error("[MCP Error]", error);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async (request: ListToolsRequest) => {
      return {
        tools: [
          {
            name: "test",
            description: "Test tool to verify server functionality",
            inputSchema: {
              type: "object",
              properties: {
                message: {
                  type: "string",
                  description: "Test message to echo back"
                }
              },
              required: ["message"]
            }
          },
          {
            name: "analyze_image",
            description: "Analyze an image using the Moondream model",
            inputSchema: {
              type: "object",
              properties: {
                image_path: {
                  type: "string",
                  description: "Path to the image file to analyze"
                },
                prompt: {
                  type: "string",
                  description: "Command to analyze the image. Use 'generate caption' for image captioning, 'detect: [object]' for object detection, or any question for image querying."
                }
              },
              required: ["image_path", "prompt"]
            }
          },
          {
            name: "analyze_webpage",
            description: "Take a screenshot of a webpage and analyze it using Moondream",
            inputSchema: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "URL to screenshot (defaults to http://localhost:3000)"
                },
                query: {
                  type: "string",
                  description: "Question to ask about the webpage"
                },
                waitTime: {
                  type: "number",
                  description: "Time to wait after page load in milliseconds (default: 1000)"
                },
                viewport: {
                  type: "object",
                  description: "Optional viewport settings",
                  properties: {
                    width: {
                      type: "number",
                      description: "Viewport width (default: 1280, max: 2560)"
                    },
                    height: {
                      type: "number",
                      description: "Viewport height (default: 720, max: 1440)"
                    }
                  }
                }
              },
              required: ["query"]
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      switch (request.params.name) {
        case "test": {
          const message = String(request.params.arguments?.message);
          if (!message) {
            throw new Error("Message is required");
          }

          return {
            content: [{
              type: "text",
              text: `Test successful! Received message: ${message}`
            }]
          };
        }

        case "analyze_image": {
          const imagePath = String(request.params.arguments?.image_path);
          const prompt = String(request.params.arguments?.prompt);

          if (!imagePath || !prompt) {
            throw new Error("Image path and prompt are required");
          }

          try {
            // Verify image exists
            await fs.access(imagePath);

            // Read image file and convert to base64
            const imageBuffer = await fs.readFile(imagePath);
            const base64Image = imageBuffer.toString("base64");

            // Ensure proper padding
            const paddedBase64 = base64Image.padEnd(Math.ceil(base64Image.length / 4) * 4, '=');

            // Determine which endpoint to use based on the prompt
            let endpoint = "query";
            let body: any = {
              image_url: `data:image/jpeg;base64,${paddedBase64}`,
              question: prompt
            };

            if (prompt.toLowerCase() === "generate caption") {
              endpoint = "caption";
              body = { image_url: `data:image/jpeg;base64,${paddedBase64}` };
            } else if (prompt.toLowerCase().startsWith("detect:")) {
              endpoint = "detect";
              body = {
                image_url: `data:image/jpeg;base64,${paddedBase64}`,
                object: prompt.slice(7).trim()
              };
            }

            console.error(`[Debug] Sending request to ${endpoint} endpoint`);
            console.error(`[Debug] Request body keys:`, Object.keys(body));

            // Query the model server
            const response = await fetch(`http://127.0.0.1:3475/${endpoint}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Model server error: ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();
            console.error(`[Debug] Response:`, result);
            
            let responseText = "";
            if (endpoint === "caption") {
              responseText = result.caption;
            } else if (endpoint === "detect") {
              responseText = `Detected objects: ${JSON.stringify(result.objects)}`;
            } else {
              responseText = result.answer;
            }

            return {
              content: [{
                type: "text",
                text: responseText,
              }],
            };
          } catch (error: unknown) {
            console.error("Error analyzing image:", error);
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            throw new Error(`Failed to analyze image: ${errorMessage}`);
          }
        }

        case "analyze_webpage": {
          const url = String(request.params.arguments?.url || "http://localhost:3000");
          const query = String(request.params.arguments?.query);
          const waitTime = Number(request.params.arguments?.waitTime || 15000);
          const viewport = request.params.arguments?.viewport as ViewportConfig | undefined;

          if (!query) {
            throw new Error("Query is required");
          }

          try {
            console.error("[Debug] Analyzing webpage:", url);
            console.error("[Debug] Query:", query);
            
            // Enhanced error handling with retries
            let screenshotPath = "";
            let retries = 3;
            
            while (retries > 0) {
              try {
                console.error(`[Debug] Attempt ${4 - retries}/3: Capturing screenshot`);
                screenshotPath = await this.puppeteerSetup.captureScreenshot(url, waitTime, viewport);
                break;
              } catch (error) {
                retries--;
                console.error(`[Debug] Screenshot attempt failed, ${retries} retries left:`, error instanceof Error ? error.message : String(error));
                if (retries === 0) throw error;
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
            console.error("[Debug] Screenshot saved to:", screenshotPath);

            // Read screenshot and convert to base64
            const imageBuffer = await fs.readFile(screenshotPath);
            console.error("[Debug] Screenshot size:", imageBuffer.length, "bytes");
            const base64Image = imageBuffer.toString("base64");
            console.error("[Debug] Base64 length:", base64Image.length);

            // Query the model
            const response = await fetch("http://127.0.0.1:3475/query", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                image_url: `data:image/jpeg;base64,${base64Image}`,
                question: query
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Model server error: ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();
            console.error("[Debug] Model response:", result);
            return {
              content: [{
                type: "text",
                text: result.answer,
              }],
            };
          } catch (error: unknown) {
            console.error("Error analyzing webpage:", error);
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            throw new Error(`Failed to analyze webpage: ${errorMessage}`);
          }
        }

        default: {
          throw new Error("Unknown tool");
        }
      }
    });
  }

  async cleanup() {
    this.pythonSetup.cleanup();
    await this.puppeteerSetup.cleanup();
  }

  async run() {
    try {
      await this.pythonSetup.setup();
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Moondream MCP server running on stdio");

      // Handle cleanup on exit
      process.on('SIGINT', async () => {
        await this.cleanup();
        await this.server.close();
        process.exit(0);
      });
      
      process.on('SIGTERM', async () => {
        await this.cleanup();
        await this.server.close();
        process.exit(0);
      });
    } catch (error) {
      console.error("Failed to start server:", error);
      process.exit(1);
    }
  }
}

const server = new MoondreamServer();
server.run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
