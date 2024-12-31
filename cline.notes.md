# Moondream MCP Server Notes

## System Overview

### Core Components
1. MCP Server Layer (TypeScript)
   - Handles MCP protocol communication
   - Manages tool interfaces
   - Processes requests/responses

2. Python Backend
   - Moondream model server
   - Image analysis processing
   - HTTP API endpoints (port 3475)

### Key Dependencies
- UV Package Manager
- Node.js (v18+)
- Python 3.8+
- Moondream Python package
- MCP SDK

## Installation Requirements

### System Requirements
1. Node.js v18 or higher
2. Python 3.8+
3. UV package manager
4. Sufficient disk space (~1GB for model and environments)

### Environment Setup
1. UV installation (automatic)
2. Python virtual environment (managed by UV)
3. Moondream package installation
4. Model download (~500MB)

## Integration Points

### Claude Desktop
Configuration in `~/Library/Application Support/Claude/claude_desktop_config.json`:
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

### Cline
Configuration in `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`:
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

## Available Tools

### analyze_image
- Purpose: Image analysis using Moondream model
- Capabilities:
  1. Image captioning
  2. Object detection
  3. Visual question answering
- Input Schema:
  ```typescript
  {
    image_path: string,  // Path to image file
    prompt: string       // Analysis command
  }
  ```

## Technical Implementation

### Server Architecture
1. Main Server (index.ts)
   - MCP protocol handling
   - Tool registration
   - Request routing

2. Python Setup (python-setup.ts)
   - UV installation
   - Virtual environment management
   - Model download and setup
   - Moondream server process management

### Model Details
- Name: moondream-0_5b-int4.mf.gz
- Size: ~500MB
- Type: 8-bit quantized
- Source: Hugging Face
- Location: models/ directory

### API Endpoints
- Base URL: http://127.0.0.1:3475
- Endpoints:
  1. /caption - Image captioning
  2. /detect - Object detection
  3. /query - Visual Q&A

## Maintenance Notes

### Common Issues
1. Model Download
   - Check network connectivity
   - Verify Hugging Face accessibility
   - Ensure sufficient disk space

2. Server Startup
   - Port 3475 conflicts
   - Python environment issues
   - Model file accessibility

3. UV Setup
   - Installation verification
   - Path configuration
   - Permission issues

### Performance Considerations
1. Model Loading
   - First request may be slower
   - Subsequent requests benefit from caching
   - Memory usage peaks during analysis

2. Concurrent Requests
   - Server handles multiple requests
   - Resource intensive operations
   - Monitor memory usage

## Future Improvements

### Potential Enhancements
1. Model Options
   - Support for larger models
   - Alternative model architectures
   - Custom model integration

2. Performance
   - Response time optimization
   - Memory usage improvements
   - Caching strategies

3. Features
   - Batch processing
   - Image preprocessing options
   - Additional analysis modes

### Development Tasks
- [ ] Add support for larger models
- [ ] Implement batch processing
- [ ] Optimize memory usage
- [ ] Add error recovery mechanisms
- [ ] Improve documentation
