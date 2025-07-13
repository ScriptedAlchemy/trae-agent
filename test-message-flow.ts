#!/usr/bin/env node

// This script tests the message flow to understand the issue

const messages = [
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: [{ type: 'tool_use', id: 'tool_1', name: 'test', input: {} }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: 'Result 1' }] },
  { role: 'assistant', content: [{ type: 'tool_use', id: 'tool_2', name: 'test', input: {} }] },
  // Missing tool_result for tool_2
  { role: 'assistant', content: 'Some text' }, // This would cause the error
];

console.log('Message flow that would cause the error:');
messages.forEach((msg, i) => {
  console.log(`[${i}] ${msg.role}:`, msg.content);
});

console.log('\n\nThe issue is that message [3] has a tool_use (tool_2) but message [4] is not a tool_result for it.');
console.log('This violates Anthropic\'s requirement that each tool_use must be immediately followed by its tool_result.');