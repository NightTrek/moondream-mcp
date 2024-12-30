# 🌙 Moondream MCP Server

A powerful Model Context Protocol (MCP) server that brings advanced image analysis capabilities to your applications using the Moondream vision model. This server seamlessly integrates with Claude and Cline, providing a bridge between AI assistants and sophisticated computer vision tasks.

![Moondream Banner](https://raw.githubusercontent.com/vikhyat/moondream/main/assets/banner.png)

## ✨ Features

- 🖼️ **Image Captioning**: Generate natural language descriptions of images
- 🔍 **Object Detection**: Identify and locate specific objects within images
- 💭 **Visual Question Answering**: Ask questions about image content and receive intelligent responses
- 🚀 **High Performance**: Uses quantized 8-bit models for efficient inference
- 🔄 **Automatic Setup**: Handles model downloading and environment setup
- 🛠️ **MCP Integration**: Standardized protocol for seamless tool usage

## 🎯 Use Cases

- **Content Analysis**: Automatically generate descriptions for image content
- **Accessibility**: Create alt text for visually impaired users
- **Data Extraction**: Extract specific information from images through targeted questions
- **Object Verification**: Confirm the presence of specific objects in images
- **Scene Understanding**: Analyze complex scenes and their components

## 🚀 Quick Start

### Prerequisites

- Node.js v18 or higher
- Python 3.8+
- UV package manager (automatically installed if not present)

### Installation

1. **Clone and Setup**
```bash
git clone <repository-url>
cd moondream-server
pnpm install
```

2. **Build the Server**
```bash
pnpm run build
```

The server handles the rest automatically:
- Creates Python virtual environment
- Installs UV if not present
- Downloads and sets up the Moondream model
- Manages the model server process

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
- Default: `moondream-0_5b-int8.mf.gz`
- Efficient 8-bit quantization
- Automatic download from Hugging Face
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
   wget https://huggingface.co/vikhyatk/moondream2/resolve/main/moondream-0_5b-int8.mf.gz
   ```

2. **Server Port Conflicts**
   - Default port: 3475
   - Check for process using: `lsof -i :3475`

3. **Python Environment**
   - UV manages dependencies
   - Check logs in temp directory
   - Virtual env in system temp folder

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
Made with ❤️ by the Moondream MCP Server Team
</p>
