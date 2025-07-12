# Trae Agent (TypeScript)

A TypeScript/JavaScript port of the Trae Agent - an LLM-based agent for general purpose software engineering tasks.

## Overview

Trae Agent is a powerful AI-driven software engineering assistant that can understand problems, explore codebases, reproduce bugs, implement fixes, and perform rigorous testing. This TypeScript version maintains the same functionality and structure as the original Python implementation.

## Features

- 🤖 **Multi-LLM Support**: Works with OpenAI, Anthropic, Google, Azure, and other providers
- 🛠️ **Rich Tool Set**: Built-in tools for code editing, bash execution, and sequential thinking
- 📁 **Project Structure**: Maintains exact file structure compatibility with Python version
- 🔧 **Modern Build System**: Uses Rslib for efficient bundling and multiple output formats
- 🧪 **Testing**: Comprehensive test suite with Rstest
- 📦 **Package Management**: NPM/Yarn compatible with proper TypeScript support

## Installation

```bash
npm install
```

## Development

```bash
# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

## Usage

### Command Line Interface

```bash
# Run a specific task
npm run cli run "Fix the bug in the authentication module"

# Interactive mode
npm run cli interactive

# With specific provider and model
npm run cli run "Implement user registration" --provider openai --model gpt-4
```

### Programmatic Usage

```typescript
import { TraeAgent } from 'trae-agent';
import { loadConfig } from 'trae-agent/utils';

// Load configuration
const config = loadConfig();

// Create agent
const agent = new TraeAgent(config);

// Execute task
const task = 'Implement a new feature for user authentication';
agent.newTask(task, { project_path: process.cwd() });
await agent.executeTask();
```

## Configuration

Create a `trae_config.json` file in your project root:

```json
{
  "defaultProvider": "openai",
  "maxSteps": 50,
  "modelProviders": {
    "openai": {
      "model": "gpt-4",
      "apiKey": "your-api-key",
      "baseUrl": "https://api.openai.com/v1"
    }
  }
}
```

## Project Structure

The TypeScript version maintains the exact same directory structure as the Python version:

```
trae_agent/
├── agent/          # Core agent implementations
├── tools/          # Tool implementations
├── utils/          # Utility functions and LLM clients
├── cli.ts          # Command line interface
└── index.ts        # Main package exports
```

## Build System

This project uses Rslib for building, which provides:

- **Multiple Output Formats**: ESM, CommonJS, and UMD
- **Tree Shaking**: Optimized bundle sizes
- **TypeScript Support**: Full type checking and declaration generation
- **Development Mode**: Fast rebuilds during development

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Migration from Python

This TypeScript version is designed to be a drop-in replacement for the Python version, maintaining:

- Same file structure and naming conventions
- Compatible configuration format
- Identical CLI interface
- Same tool and agent APIs

For migration guides and compatibility notes, see the [Migration Guide](docs/migration.md).
