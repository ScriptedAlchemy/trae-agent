#!/usr/bin/env node

import { AnthropicClient } from './trae_agent/utils/anthropic_client.js';
import { SequentialThinkingTool } from './trae_agent/tools/sequential_thinking_tool.js';
import { ModelParameters, LLMMessage } from './trae_agent/utils/llm_basics.js';

async function testAnthropicFix() {
  const modelParameters: ModelParameters = {
    model: 'claude-sonnet-4-20250514',
    api_key: 'proxy-placeholder',
    base_url: 'http://localhost:8080',
    temperature: 0.7,
    max_tokens: 1000,
    max_retries: 3,
  };

  const client = new AnthropicClient(modelParameters);
  const sequentialThinkingTool = new SequentialThinkingTool();
  
  const messages: LLMMessage[] = [
    {
      role: 'user',
      content: 'Hello! Please use the sequential thinking tool to process this greeting and confirm you can access the Anthropic API.',
    },
  ];

  try {
    console.log('Making first API call...');
    const response = await client.chat(
      messages, 
      modelParameters, 
      [sequentialThinkingTool],
      false // Don't reuse history
    );

    console.log('Response:', JSON.stringify(response, null, 2));
    
    if (response.toolCalls && response.toolCalls.length > 0) {
      console.log('Tool calls detected:', response.toolCalls.length);
      
      // Simulate what the agent would do
      for (const toolCall of response.toolCalls) {
        const toolResult = await sequentialThinkingTool.execute(toolCall.arguments);
        
        // Add the tool result
        messages.push({
          role: 'assistant',
          toolCall: toolCall,
        });
        
        messages.push({
          role: 'user',
          toolResult: {
            call_id: toolCall.call_id,
            result: toolResult.result || '',
            success: toolResult.success,
            error: toolResult.error,
          },
        });
      }
      
      console.log('Making second API call with tool results...');
      const response2 = await client.chat(
        messages,
        modelParameters,
        [sequentialThinkingTool],
        false
      );
      
      console.log('Second response:', JSON.stringify(response2, null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testAnthropicFix().catch(console.error);