# Quick Start Guide (TypeScript)

## 🚀 Get Started in 3 Steps

### 1. Setup the Demo
```bash
cd example-proxy-app
./setup.sh
```

### 2. Start Your Proxy Server

**Option A: Using mitmproxy (recommended)**
```bash
# Install mitmproxy
pip install mitmproxy

# Run proxy on localhost:8080
mitmdump --listen-port 8080 --mode regular
```

**Option B: Simple Node.js proxy**
```bash
# Install http-proxy globally
npm install -g http-proxy-cli

# Run proxy
http-proxy-cli --port 8080 --target https://api.anthropic.com
```

### 3. Configure API Key & Run

**Set your API key:**
```bash
export ANTHROPIC_API_KEY="your-actual-api-key-here"
```

**Build and run the demo:**
```bash
npm start
```

## 🔧 TypeScript Configuration

### Project Structure
```
example-proxy-app/
├── anthropic-client-with-proxy.ts  # Typed proxy client
├── index.ts                        # Main application
├── tsconfig.json                   # TypeScript config
├── package.json                    # Dependencies & scripts
├── trae_config.json               # Trae configuration
└── dist/                          # Compiled JavaScript
```

### Build Commands
```bash
# Build TypeScript to JavaScript
npm run build

# Development mode with file watching
npm run dev

# Test Trae Agent CLI with proxy
npm run test-cli

# Clean build artifacts
npm run clean
```

### `trae_config.json` - Main Configuration
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

### Key TypeScript Features:
- **Type Safety**: Full typing for all interfaces and functions
- **Error Handling**: Proper typed error catching
- **Configuration**: Type-safe config loading and validation
- **Proxy Support**: Typed proxy agent configuration

## 🧪 Testing Different Proxy Configurations

### Change Proxy Port
Edit `trae_config.json`:
```json
"proxy_url": "http://localhost:3128"
```

### Use HTTPS Proxy
```json
"proxy_url": "https://localhost:8443"
```

### Add Authentication (TypeScript)
Modify `anthropic-client-with-proxy.ts`:
```typescript
import { HttpsProxyAgent } from 'https-proxy-agent';

const agent = new HttpsProxyAgent({
  host: 'localhost',
  port: 8080,
  auth: 'username:password'
});
```

## 📊 Expected Output

When running successfully, you should see:
```
🚀 Trae Agent - Anthropic Proxy Example
==================================================

🔧 Configuration:
   Model: claude-3-5-sonnet-20241022
   Base URL: https://api.anthropic.com
   Proxy URL: http://localhost:8080
   Max Tokens: 4096
   Temperature: 0.7

🔗 Configuring proxy: http://localhost:8080
✅ Proxy agent configured for HTTPS requests
🔍 Testing connection...
🧪 Testing connection through proxy...
📤 Sending message to Anthropic via proxy...
📥 Received response from Anthropic
✅ Proxy connection test successful!

💬 Starting example conversation...
📤 Sending message to Anthropic via proxy...
📥 Received response from Anthropic

📝 Claude's Response:
--------------------------------------------------
[Response about proxy servers]
--------------------------------------------------

📊 Usage Stats:
   Input tokens: 25
   Output tokens: 150
   Total tokens: 175

✅ Example completed!
```

## 🐛 Troubleshooting

| Error | Solution |
|-------|----------|
| `ECONNREFUSED` | Start proxy server on localhost:8080 |
| `401 Unauthorized` | Check your ANTHROPIC_API_KEY |
| `ENOTFOUND` | Verify proxy configuration |
| `TS2307: Cannot find module` | Run `npm install` |
| `TS2304: Cannot find name` | Check TypeScript types installation |
| Build errors | Run `npm run build` to see compilation issues |

## 🔧 Development Workflow

### 1. Development Mode
```bash
# Start TypeScript compiler in watch mode
npm run dev
```

### 2. Production Build
```bash
# Clean and build
npm run clean && npm run build

# Run compiled version
node dist/index.js
```

### 3. Type Checking
```bash
# Check types without building
npx tsc --noEmit
```

## 🔗 Integration Notes

This TypeScript demo shows how to:
- **Configure Trae Agent** with proxy settings using proper types
- **Route Anthropic API calls** through localhost proxy with type safety
- **Handle proxy authentication** and HTTPS tunneling
- **Test connectivity** and error handling with typed responses
- **Build and deploy** TypeScript applications

### Key TypeScript Patterns:
- Interface definitions for configuration objects
- Generic types for API responses
- Proper error type handling with `Error` casting
- Type guards for runtime type checking
- Module imports with `.js` extensions (TypeScript requirement)

Use this as a reference for integrating proxy support into your TypeScript Trae Agent setup.
