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

  constructor() {
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

        default:
          throw new Error("Unknown tool");
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Moondream MCP server running on stdio");
  }
}

const server = new MoondreamServer();
server.run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
