#!/usr/bin/env node

// Trae Agent Anthropic Proxy Example
// This example demonstrates how to configure Anthropic API calls through a localhost proxy

import fs from 'fs';
import path from 'path';
import { AnthropicClientWithProxy } from './anthropic-client-with-proxy.js';

interface AnthropicConfig {
  model: string;
  api_key?: string;
  base_url: string;
  max_tokens: number;
  temperature: number;
}

interface TraeConfig {
  model_providers: {
    anthropic: AnthropicConfig;
  };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Load configuration
function loadConfig(): AnthropicConfig {
  try {
    const configPath = path.join(process.cwd(), 'trae_config.json');
    const configData: TraeConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return configData.model_providers.anthropic;
  } catch (error) {
    console.error('❌ Failed to load configuration:', (error as Error).message);
    console.log('💡 Make sure trae_config.json exists and is properly formatted');
    process.exit(1);
  }
}

// Display configuration info
function displayConfig(config: AnthropicConfig): void {
  console.log('\n🔧 Configuration:');
  console.log(`   Model: ${config.model}`);
  console.log(`   Base URL: ${config.base_url}`);
  console.log(`   Using OAuth Proxy: ${config.base_url.includes('localhost') ? 'Yes' : 'No'}`);
  console.log(`   Max Tokens: ${config.max_tokens}`);
  console.log(`   Temperature: ${config.temperature}`);
  console.log('');
}

// Main application
async function main(): Promise<void> {
  console.log('🚀 Trae Agent - Anthropic Proxy Example');
  console.log('='.repeat(50));
  
  // Load configuration
  const config = loadConfig();
  displayConfig(config);
  
  // Check if API key is set
  if (!config.api_key || config.api_key === 'your-anthropic-api-key-here') {
    console.log('⚠️  API Key Setup Required:');
    console.log('   1. Get your API key from: https://console.anthropic.com/');
    console.log('   2. Set it in trae_config.json or as ANTHROPIC_API_KEY environment variable');
    console.log('   3. For this demo, you can also set: export ANTHROPIC_API_KEY=your-key-here');
    console.log('');
    
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('❌ No API key found. Exiting...');
      process.exit(1);
    }
    console.log('✅ Using API key from environment variable');
  }
  
  // Check base URL configuration
  if (config.base_url && (config.base_url.includes('localhost') || config.base_url.includes('127.0.0.1'))) {
    console.log('🔗 Proxy configuration detected via base_url');
    console.log(`   Base URL: ${config.base_url}`);
    console.log('');
  } else {
    console.log('ℹ️  Using standard Anthropic API endpoint');
    console.log('');
  }
  
  // Create client with proxy support
  const client = new AnthropicClientWithProxy(config);
  
  // Test connection
  console.log('🔍 Testing connection...');
  const connectionOk = await client.testConnection();
  
  if (!connectionOk) {
    console.log('\n💡 Troubleshooting tips:');
    console.log('   1. Ensure your proxy server is running if using custom base_url');
    console.log('   2. Check that the proxy allows HTTPS connections');
    console.log('   3. Verify your API key is valid');
    console.log('   4. Try with default Anthropic endpoint first to isolate the issue');
    return;
  }
  
  // Example conversation
  console.log('\n💬 Starting example conversation...');
  
  const conversation: Message[] = [
    {
      role: 'user',
      content: 'Explain what a proxy server is and why someone might use one for API calls.'
    }
  ];
  
  try {
    const response = await client.sendMessage(conversation, {
      max_tokens: 500
    });
    
    console.log('\n📝 Claude\'s Response:');
    console.log('-'.repeat(50));
    if (response.content[0] && 'text' in response.content[0]) {
      console.log(response.content[0].text);
    }
    console.log('-'.repeat(50));
    
    console.log('\n📊 Usage Stats:');
    console.log(`   Input tokens: ${response.usage.input_tokens}`);
    console.log(`   Output tokens: ${response.usage.output_tokens}`);
    console.log(`   Total tokens: ${response.usage.input_tokens + response.usage.output_tokens}`);
    
  } catch (error) {
    console.error('\n❌ Conversation failed:', (error as Error).message);
  }
  
  console.log('\n✅ Example completed!');
}

// Handle errors gracefully
process.on('unhandledRejection', (error: Error) => {
  console.error('\n💥 Unhandled error:', error.message);
  process.exit(1);
});

// Run the example
main().catch(console.error);
