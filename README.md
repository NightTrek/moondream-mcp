# Moondream MCP Server

An MCP (Model Context Protocol) server that provides image analysis capabilities using the Moondream model. This server acts as a bridge between MCP clients and the Moondream model server, enabling image analysis through a standardized protocol.

## Features

- Image captioning
- Object detection
- Visual question answering
- Automatic model downloading and management
- Standardized MCP interface for tool usage

## Prerequisites

- Node.js (v18 or higher)
- Python 3.8+ with pip
- Virtual environment for Python dependencies

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd moondream-server
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Set up Python virtual environment and install Moondream:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install moondream
```

4. Build the TypeScript code:
```bash
npm run build
```

## How It Works

The server operates in two parts:

1. **MCP Server**: Handles MCP protocol communication and provides the `analyze_image` tool interface.
2. **Moondream Model Server**: A Python server that runs the actual Moondream model for image analysis.

When a request is made:
1. The MCP server receives the request through stdio
2. If not already running, it starts the Moondream model server
3. It converts the image to base64 and forwards the request to the model server
4. The response is formatted and returned through the MCP protocol

## Usage

### Starting the Server

```bash
node build/index.js
```

### Testing with the Test Client

A test client is provided to verify server functionality:

```bash
node test-mcp-client.js
```

### Available Tools

#### analyze_image

Analyzes images using the Moondream model.

Parameters:
- `image_path`: Path to the image file to analyze
- `prompt`: Command to analyze the image. Supports:
  - `"generate caption"` for image captioning
  - `"detect: [object]"` for object detection
  - Any question for visual question answering

Example usage through MCP:
```javascript
{
  "jsonrpc": "2.0",
  "method": "call_tool",
  "params": {
    "name": "analyze_image",
    "arguments": {
      "image_path": "/path/to/image.jpg",
      "prompt": "generate caption"
    }
  }
}
```

## Model Information

The server uses the Moondream model, specifically the quantized 8-bit version for efficient inference. The model is automatically downloaded on first use from Hugging Face.

Supported model variants:
- `moondream-0_5b-int8.mf.gz` (default)
- `moondream-2b-int8.mf.gz` (optional)

## Development

### Project Structure

```
moondream-server/
├── src/
│   └── index.ts         # Main MCP server implementation
├── build/               # Compiled JavaScript
├── models/             # Downloaded model files
├── test-mcp-client.js  # Test client for server verification
└── .venv/              # Python virtual environment
```

### Building

```bash
npm run build
```

This compiles the TypeScript code and makes the output executable.

## Troubleshooting

1. **Model Server Not Starting**
   - Verify Python virtual environment is activated
   - Check Python dependencies are installed
   - Ensure model file exists in models directory

2. **Communication Errors**
   - Verify the server is running
   - Check the test client is using correct method names
   - Ensure image paths are absolute or relative to working directory

## License

[Add your license information here]
