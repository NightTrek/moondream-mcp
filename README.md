# 🌙 Moondream MCP Server

A powerful Model Context Protocol (MCP) server that brings advanced image analysis capabilities to your applications using the Moondream vision model. This server seamlessly integrates with Claude and Cline, providing a bridge between AI assistants and sophisticated computer vision tasks.

This IS NOT an offical Moondream package. All credit to [moondream.ai](https://github.com/vikhyat/moondream) for making the best open source vision model that you can run on consumer hardware.

<div align="center" style="height: 150px; overflow: hidden; display: flex; align-items: center; margin: 20px 0;">
  <img src="https://github.com/user-attachments/assets/e999ada0-9dfa-4f3d-a489-e4ce58434ecb" alt="Moondream MCP Banner" style="width: 100%; object-fit: cover;">
</div>


## ✨ Features

- 🖼️ **Image Captioning**: Generate natural language descriptions of images
- 🔍 **Object Detection**: Identify and locate specific objects within images
- 💭 **Visual Question Answering**: Ask questions about image content and receive intelligent responses
- 🚀 **High Performance**: Uses quantized 8-bit models for efficient inference
- 🔄 **Explicit Setup**: No software installers or model downloads during MCP sessions
- 🛠️ **MCP Integration**: Standardized protocol for seamless tool usage

## 🎯 Use Cases

- **Content Analysis**: Automatically generate descriptions for image content
- **Accessibility**: Create alt text for visually impaired users
- **Data Extraction**: Extract specific information from images through targeted questions
- **Object Verification**: Confirm the presence of specific objects in images
- **Scene Understanding**: Analyze complex scenes and their components

## 🚀 Quick Start

### Prerequisites

- Node.js v22.12.0 or higher
- Python 3.8+
- UV package manager, installed separately from https://docs.astral.sh/uv/

### Installation

1. **Clone and Setup**
```bash
git clone https://github.com/NightTrek/moondream-mcp.git
cd moondream-mcp
npm ci --ignore-scripts
```

2. **Build the Server**
```bash
npm run build
```

3. **Start the Server**
```bash
npm start
```

This is a stdio MCP server, not a web UI: it waits for JSON-RPC on stdin. Connect it through the Claude/Cline configuration below, or run `npm test` for an automated initialize/list-tools/test-tool handshake. Diagnostics are printed only to stderr. Always rebuild from TypeScript before starting; do not copy TypeScript source into `build/`.

The MCP handshake and `test` tool work without Python, a browser, or model weights.
Analysis starts the backend lazily. Setup never executes a downloaded installer, invokes a shell, or downloads model files.

### Backend setup (explicit, one-time)

Install UV separately using its official instructions. Then, on macOS/Linux:

```bash
mkdir -p "$HOME/.local/share/moondream-mcp/models"
uv venv "$HOME/.local/share/moondream-mcp/venv"
uv pip install --python "$HOME/.local/share/moondream-mcp/venv/bin/python" moondream
curl --fail --location --output "$HOME/.local/share/moondream-mcp/models/moondream-0_5b-int4.mf.gz" \
  https://huggingface.co/vikhyatk/moondream2/resolve/9dddae84d54db4ac56fe37817aeaeb502ed083e2/moondream-0_5b-int4.mf.gz
```

Set `MOONDREAM_EXECUTABLE` and `MOONDREAM_MODEL_PATH` in your MCP client's environment to override these paths (required for other layouts, including Windows). Paths are passed as literal arguments, never shell commands. Alternatively, start a compatible Moondream server yourself on `127.0.0.1:3475` and set `MOONDREAM_EXTERNAL_SERVER=1`. Only use a backend you trust; image content is sent to that local service.

For `analyze_webpage`, explicitly install Puppeteer's Chrome browser after dependency installation:

```bash
npx puppeteer browsers install chrome
```

Browser sandbox and web security remain enabled. Use a host with Chrome sandbox support; do not disable it to work around container restrictions. Screenshots use private temporary directories and are removed on normal shutdown. Only analyze trusted URLs and files; localhost access is intentionally supported.

### Verification

```bash
npm ci --ignore-scripts
npm test
npm audit --omit=dev --audit-level=high
```

These checks do not install Python/Chrome or download/run model weights. Actual inference and browser capture require the explicit setup above.

### Integration with Claude/Cline

Add to your MCP settings file (`claude_desktop_config.json` or `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "moondream": {
      "command": "node",
      "args": ["/path/to/moondream-server/build/index.js"]
    }
  }
}
```

## 🛠️ Available Tools

### analyze_image

Powerful image analysis tool with multiple modes:

```typescript
{
  "name": "analyze_image",
  "arguments": {
    "image_path": string,  // Path to image file
    "prompt": string       // Analysis command
  }
}
```

**Prompt Types:**
- `"generate caption"` - Creates natural language description
- `"detect: [object]"` - Finds specific objects (e.g., "detect: car")
- `"[question]"` - Answers questions about the image

**Examples:**

```javascript
// Image Captioning
{
  "image_path": "photo.jpg",
  "prompt": "generate caption"
}

// Object Detection
{
  "image_path": "scene.jpg",
  "prompt": "detect: person"
}

// Visual Q&A
{
  "image_path": "painting.jpg",
  "prompt": "What colors are used in this painting?"
}
```

## 🔧 Technical Details

### Architecture

The server operates as a dual-component system:

1. **MCP Interface Layer**
   - Handles protocol communication
   - Manages tool interfaces
   - Processes requests/responses

2. **Moondream Model Server**
   - Runs the vision model
   - Processes image analysis
   - Provides HTTP API endpoints

### Model Information

Uses the Moondream quantized model:
- Default: `moondream-0_5b-int4.mf.gz`
- Efficient 4-bit quantization
- Explicit download from a pinned Hugging Face revision
- ~500MB model size

### Performance

- Fast startup with automatic caching
- Efficient memory usage through quantization
- Responsive API endpoints
- Concurrent request handling

## 🔍 Debugging

Common issues and solutions:

1. **Model Download Issues**
   ```bash
   # Manual model download
   wget https://huggingface.co/vikhyatk/moondream2/resolve/main/moondream-0_5b-int4.mf.gz
   ```

2. **Server Port Conflicts**
   - Default port: 3475
   - Check for process using: `lsof -i :3475`

3. **Python Environment**
   - UV manages dependencies
   - Diagnostics go to stderr, never the MCP stdout channel
   - Virtual env in `$HOME/.local/share/moondream-mcp/venv`

## 🤝 Contributing

Contributions welcome! Areas of interest:

- Additional model support
- Performance optimizations
- New analysis capabilities
- Documentation improvements

## 📄 License

[Add your license information here]

## 🙏 Acknowledgments

- [Moondream Model Team](https://github.com/vikhyat/moondream)
- Model Context Protocol (MCP) Community
- Contributors and maintainers

---

<p align="center">
Made with ❤️ by Nighttrek
</p>
