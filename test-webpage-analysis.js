import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function testWebpageAnalysis() {
  const transport = new StdioClientTransport();
  const client = new Client(
    { name: "test-client", version: "0.1.0" }
  );

  try {
    await client.connect(transport);
    
    // Test analyze_webpage tool
    const response = await client.tools.call("moondream-server", "analyze_webpage", {
      url: "https://docs.moondream.ai/",
      query: "What is the main navigation structure of this documentation website?",
      waitTime: 5000, // Increased wait time
      viewport: {
        width: 1920,
        height: 1080
      }
    });

    console.log("Response:", JSON.stringify(response, null, 2));
  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await client.close();
  }
}

testWebpageAnalysis().catch(console.error);
