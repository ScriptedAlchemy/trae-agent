#!/bin/bash

# Trae Agent Anthropic Proxy Demo Setup Script (TypeScript)

echo "🚀 Setting up Trae Agent Anthropic Proxy Demo (TypeScript)..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check if TypeScript is available
if ! command -v npx &> /dev/null; then
    echo "❌ npx is not available. Please ensure you have a recent Node.js version."
    exit 1
fi

echo "✅ npx found for TypeScript compilation"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Test TypeScript compilation
echo "🔧 Testing TypeScript compilation..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ TypeScript compilation failed"
    echo "   Check tsconfig.json and source files for errors"
    exit 1
fi

echo "✅ TypeScript compilation successful"

# Check for API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  ANTHROPIC_API_KEY environment variable not set"
    echo "   You can set it with: export ANTHROPIC_API_KEY='your-key-here'"
    echo "   Or edit the api_key field in trae_config.json"
else
    echo "✅ ANTHROPIC_API_KEY environment variable found"
fi

# Display proxy configuration
echo ""
echo "🔧 Current proxy configuration:"
echo "   Proxy URL: http://localhost:8080"
echo "   Target API: https://api.anthropic.com"
echo "   Model: claude-3-5-sonnet-20241022"
echo "   Language: TypeScript"

echo ""
echo "📋 Next steps:"
echo "   1. Start your proxy server on localhost:8080"
echo "   2. Set your ANTHROPIC_API_KEY (if not already set)"
echo "   3. Run: npm start (builds and runs TypeScript)"
echo "   4. Or run: npm run dev (development mode with watch)"

echo ""
echo "🎯 TypeScript demo workspace setup complete!"
echo "📁 Files created:"
echo "   - anthropic-client-with-proxy.ts (typed proxy client)"
echo "   - index.ts (main application)"
echo "   - tsconfig.json (TypeScript configuration)"
echo "   - dist/ (compiled JavaScript output)"
