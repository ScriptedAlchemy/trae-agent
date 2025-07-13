# Trae Agent (Python)

An LLM-based agent for general purpose software engineering tasks.

> 📝 **Note**: For the TypeScript/JavaScript version, see [README_JS.md](README_JS.md)

## Overview

Trae Agent is a powerful AI-driven software engineering assistant that can understand problems, explore codebases, reproduce bugs, implement fixes, and perform rigorous testing. This is the original Python implementation.

## Features

- 🤖 **Multi-LLM Support**: Works with OpenAI, Anthropic, Google, Azure, Ollama, OpenRouter, and Doubao
- 🛠️ **Rich Tool Set**: Built-in tools for code editing, bash execution, JSON manipulation, and sequential thinking
- 🔄 **Git Integration**: Automatic diff generation, patch creation, and base commit support
- 🧪 **Testing Framework**: Comprehensive test suite with unittest and pytest
- 📊 **SWE-bench Integration**: Built-in evaluation framework for software engineering benchmarks
- 🐍 **Pure Python**: Native Python implementation with async/await support

## Installation

```bash
# Install with pip
pip install -e .

# Or with uv (recommended)
uv install -e .

# Install development dependencies
pip install -e ".[dev]"
```

## Development

```bash
# Run tests
python -m pytest tests/

# Run specific test
python -m pytest tests/test_trae_agent.py

# Run with coverage
python -m pytest --cov=trae_agent tests/

# Type checking
python -m mypy trae_agent/

# Code formatting
python -m black trae_agent/ tests/

# Linting
python -m flake8 trae_agent/
```

## Usage

### Command Line Interface

```bash
# Run a specific task
python -m trae_agent.cli run "Fix the bug in the authentication module"

# Interactive mode
python -m trae_agent.cli interactive

# With specific provider and model
python -m trae_agent.cli run "Implement user registration" --provider openai --model gpt-4

# With working directory and patch generation
python -m trae_agent.cli run "Fix memory leak in data processing" \
  --working-dir /path/to/project \
  --must-patch \
  --patch-path ./fix.patch
```

### Programmatic Usage

```python
from trae_agent import TraeAgent
from trae_agent.utils.config import Config

# Load configuration
config = Config()

# Create agent
agent = TraeAgent(config)

# Execute task
task = 'Implement a new feature for user authentication'
agent.new_task(task, {
    'project_path': '/path/to/project',
    'issue': 'Add JWT authentication with middleware',
    'base_commit': 'abc123'
})

result = await agent.execute_task()
print(f"Task completed: {result.success}")
```

## Configuration

Create a `trae_config.json` file in your project root:

```json
{
  "default_provider": "anthropic",
  "max_steps": 20,
  "model_providers": {
    "anthropic": {
      "api_key": "sk-ant-api03-...",
      "model": "claude-sonnet-4-20250514",
      "max_tokens": 4096,
      "temperature": 0.5,
      "top_p": 1,
      "top_k": 0,
      "parallel_tool_calls": false,
      "max_retries": 10
    },
    "openai": {
      "api_key": "sk-proj-...",
      "model": "gpt-4",
      "max_tokens": 4096,
      "temperature": 0.5,
      "parallel_tool_calls": true,
      "max_retries": 10
    }
  }
}
```

### Environment Variables

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export OPENAI_API_KEY="sk-proj-..."
export AZURE_OPENAI_API_KEY="your-azure-key"
export GOOGLE_API_KEY="AIza..."
```

## Project Structure

```
trae_agent/
├── agent/              # Core agent implementations
│   ├── base.py        # Abstract base agent class
│   ├── trae_agent.py  # Main TraeAgent implementation
│   └── agent_basics.py # Agent data structures
├── tools/              # Tool implementations
│   ├── base.py        # Abstract tool base
│   ├── bash_tool.py   # Shell command execution
│   ├── edit_tool.py   # File editing operations
│   ├── json_edit_tool.py # JSON manipulation
│   ├── sequential_thinking_tool.py # Multi-step reasoning
│   └── task_done_tool.py # Task completion
├── utils/              # Utility modules
│   ├── llm_client.py  # Main LLM client
│   ├── config.py      # Configuration management
│   ├── anthropic_client.py # Anthropic integration
│   ├── openai_client.py    # OpenAI integration
│   └── trajectory_recorder.py # Execution recording
├── cli.py              # Command line interface
└── __init__.py         # Package initialization

tests/                  # Test suite
evaluation/             # SWE-bench evaluation
sdk/                    # SDK interfaces
```

## Available Tools

1. **BashTool** (`bash`) - Execute shell commands with persistent sessions
2. **TextEditorTool** (`str_replace_based_edit_tool`) - File editing with view/create/replace/insert
3. **JSONEditTool** (`json_edit_tool`) - JSON manipulation with JSONPath support
4. **SequentialThinkingTool** (`sequentialthinking`) - Multi-step reasoning framework
5. **TaskDoneTool** (`task_done`) - Task completion signaling

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## TypeScript Version

A complete TypeScript implementation with 1:1 functional parity is available! See [README_JS.md](README_JS.md) for:

- ✅ **Full Feature Parity**: All tools and capabilities
- ✅ **Shared Configurations**: Use the same config files
- ✅ **Compatible Data**: Share trajectory recordings and patches
- ✅ **Enhanced Testing**: 134 comprehensive tests (vs 57 Python tests)
- ✅ **Modern Tooling**: TypeScript type safety and development tools

Choose the implementation that best fits your development environment!
