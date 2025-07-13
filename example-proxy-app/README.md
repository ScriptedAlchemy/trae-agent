# Trae Agent Anthropic Proxy Demo (TypeScript)

This demo workspace shows how to configure Trae Agent to use Anthropic API through a localhost proxy server using TypeScript.

## Prerequisites

- Node.js 18+ installed
- TypeScript support
- Anthropic API key
- A proxy server running on localhost:8080

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure your API key:**
   
   Option A - Environment variable (recommended):
   ```bash
   export ANTHROPIC_API_KEY="your-actual-api-key-here"
   ```
   
   Option B - Edit `trae_config.json`:
   ```json
   {
     "model_providers": {
       "anthropic": {
         "api_key": "your-actual-api-key-here"
       }
     }
   }
   ```

3. **Start your proxy server on localhost:8080**
   
   The demo is configured to route Anthropic API calls through `http://localhost:8080`

## TypeScript Configuration

The demo includes:
- **TypeScript configuration** (`tsconfig.json`) with ES2022 target
- **Type definitions** for all interfaces and classes
- **Strict type checking** enabled
- **Source maps** for debugging

### Key TypeScript Features:

- `ProxyConfig` interface for configuration typing
- `Message` interface for chat messages
- `AnthropicConfig` interface for provider settings
- Proper error handling with typed catch blocks
- Generic type support for Anthropic SDK responses

## Configuration

The `trae_config.json` file contains the proxy configuration:

```json
{
  "default_provider": "anthropic",
  "model_providers": {
    "anthropic": {
      "model": "claude-3-5-sonnet-20241022",
      "proxy_url": "http://localhost:8080",
      "base_url": "https://api.anthropic.com",
      "max_tokens": 4096,
      "temperature": 0.7
    }
  }
}
```

### Key Configuration Options:

- `proxy_url`: The localhost proxy endpoint
- `base_url`: Anthropic API base URL (target for proxy)
- `model`: Claude model to use
- `max_tokens`: Maximum response length
- `temperature`: Response creativity (0-1)

## Running the Demo

```bash
# Build and run the example
npm start

# Development mode with watch
npm run dev

# Test Trae Agent CLI with proxy configuration
npm run test-cli

# Build only
npm run build

# Clean build artifacts
npm run clean
```

### Testing Trae Agent CLI

The `npm run test-cli` command runs a test that:
1. **Verifies prerequisites** - checks if Trae CLI is built and config exists
2. **Runs Trae Agent** with a simple test prompt
3. **Uses local config** - automatically uses `trae_config.json` in this directory
4. **Tests proxy connectivity** - verifies the HTTP proxy setup works correctly
5. **Provides clear feedback** - shows success/failure with helpful error messages

This is useful for:
- **Validating setup** - ensuring your proxy configuration works
- **Testing changes** - verifying modifications to `trae_config.json`
- **Debugging issues** - getting clear error messages for troubleshooting

## What the Demo Does

1. **Loads configuration** from `trae_config.json` with type safety
2. **Creates proxy-enabled client** using `https-proxy-agent`
3. **Tests connectivity** through the proxy
4. **Sends example message** to Claude via proxy
5. **Displays response** and usage statistics
6. **Handles errors** with proper TypeScript error typing

## TypeScript Files Overview

### `anthropic-client-with-proxy.ts`
- Enhanced Anthropic client with proxy support
- Type-safe configuration interface
- Proper error handling and type guards
- Support for both HTTP and HTTPS proxies

### `index.ts`
- Main application with full TypeScript typing
- Configuration loading with type validation
- Async/await with proper error handling
- Type-safe message interfaces

### `tsconfig.json`
- TypeScript compiler configuration
- ES2022 target with ESNext modules
- Strict type checking enabled
- Source map generation for debugging

## Proxy Server Requirements

Your proxy server should:
- Accept HTTP connections on localhost:8080
- Support HTTPS tunneling (CONNECT method)
- Allow connections to api.anthropic.com:443

### Example Proxy Server (using mitmproxy)

```bash
# Install mitmproxy
pip install mitmproxy

# Run proxy on localhost:8080
mitmdump --listen-port 8080 --mode regular
```

### Example Proxy Server (using Node.js)

```typescript
import http from 'http';
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer({});

const server = http.createServer((req, res) => {
  console.log(`Proxying: ${req.method} ${req.url}`);
  proxy.web(req, res, {
    target: 'https://api.anthropic.com',
    changeOrigin: true,
    secure: true
  });
});

server.listen(8080, () => {
  console.log('Proxy server running on localhost:8080');
});
```

## Troubleshooting

### TypeScript Issues
- Ensure TypeScript is installed: `npm install -g typescript`
- Check `tsconfig.json` configuration
- Verify all type definitions are installed
- Run `npm run build` to check for compilation errors

### Connection Issues
- Ensure proxy server is running on localhost:8080
- Check that proxy allows HTTPS connections
- Verify API key is valid
- Test without proxy first to isolate issues

### Common Errors
- `ECONNREFUSED`: Proxy server not running
- `401 Unauthorized`: Invalid API key
- `ENOTFOUND`: DNS resolution issues (check proxy config)
- `TS2307`: Module not found (run `npm install`)

## Integration with Trae Agent

To integrate this proxy configuration into the main Trae Agent TypeScript version:

1. Add `proxy_url` field to `ModelParameters` interface in `config.ts`
2. Modify `AnthropicClient` constructor to use proxy agents
3. Update configuration loading to support proxy settings
4. Add proper TypeScript types for proxy configuration

See the example implementation in `anthropic-client-with-proxy.ts` for reference.

## Development Notes

- Uses ES modules with `.js` extensions in imports (TypeScript requirement)
- Includes proper type definitions for all external dependencies
- Follows TypeScript best practices for error handling
- Supports both development and production builds
- Includes source maps for debugging compiled JavaScript
