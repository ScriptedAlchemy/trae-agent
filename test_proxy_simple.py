#!/usr/bin/env python3
"""Simple test for OAuth proxy with direct Anthropic client"""

import json
from pathlib import Path
from anthropic import Anthropic

def test_simple_message():
    """Test a simple message through the proxy"""
    
    print("🧪 Testing Direct Anthropic Client with OAuth Proxy")
    print("=" * 60)
    
    # Create client pointing to proxy
    client = Anthropic(
        api_key="proxy-placeholder",
        base_url="http://localhost:8080"
    )
    
    print("✅ Client created pointing to proxy")
    
    # Test 1: Simple message
    print("\n📝 Test 1: Simple message...")
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=100,
            messages=[
                {"role": "user", "content": "Say 'OAuth proxy test successful!' and nothing else."}
            ]
        )
        
        print(f"✅ Response: {response.content[0].text}")
        print(f"   Tokens used: {response.usage.input_tokens + response.usage.output_tokens}")
    except Exception as e:
        print(f"❌ Failed: {e}")
        return False
    
    # Test 2: Message with tool
    print("\n🔧 Test 2: Message with tool calling...")
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[
                {"role": "user", "content": "What's the weather in San Francisco? Use the get_weather tool."}
            ],
            tools=[
                {
                    "name": "get_weather",
                    "description": "Get weather for a city",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "city": {"type": "string", "description": "City name"}
                        },
                        "required": ["city"]
                    }
                }
            ]
        )
        
        # Check if tool was called
        has_tool_call = False
        tool_call_id = None
        tool_name = None
        tool_input = None
        
        for content in response.content:
            if content.type == "tool_use":
                has_tool_call = True
                tool_call_id = content.id
                tool_name = content.name
                tool_input = content.input
                print(f"✅ Tool called: {tool_name}")
                print(f"   Tool ID: {tool_call_id}")
                print(f"   Input: {tool_input}")
        
        if not has_tool_call:
            print("⚠️  No tool call in response")
        
        # Test 3: Continue conversation with tool result
        if has_tool_call:
            print("\n📊 Test 3: Continuing with tool result...")
            
            # Build proper conversation with tool use and result
            messages = [
                {"role": "user", "content": "What's the weather in San Francisco? Use the get_weather tool."},
                {"role": "assistant", "content": response.content},  # Include the assistant's tool use
                {
                    "role": "user", 
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_call_id,
                            "content": "The weather in San Francisco is 68°F and sunny."
                        }
                    ]
                }
            ]
            
            try:
                response2 = client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=200,
                    messages=messages
                )
                
                print(f"✅ Continued response: {response2.content[0].text}")
                return True
                
            except Exception as e:
                print(f"❌ Failed to continue: {e}")
                return False
        
    except Exception as e:
        print(f"❌ Tool test failed: {e}")
        return False
    
    return True


def test_trae_style_conversation():
    """Test a conversation flow similar to how TraeAgent would use it"""
    
    print("\n\n🧪 Testing TraeAgent-style Conversation Flow")
    print("=" * 60)
    
    client = Anthropic(
        api_key="proxy-placeholder",
        base_url="http://localhost:8080"
    )
    
    # Simulate what TraeAgent does
    messages = []
    
    # Step 1: Initial system message and user task
    messages.append({
        "role": "user", 
        "content": "You are a helpful coding assistant. Task: Write a function to calculate factorial."
    })
    
    print("📝 Step 1: Sending initial task...")
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=messages,
            tools=[
                {
                    "name": "str_replace_based_edit_tool",
                    "description": "Edit a file",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "filename": {"type": "string"},
                            "old_str": {"type": "string"},
                            "new_str": {"type": "string"}
                        },
                        "required": ["filename", "old_str", "new_str"]
                    }
                }
            ]
        )
        
        # Add assistant response to history
        messages.append({"role": "assistant", "content": response.content})
        
        print("✅ Assistant responded")
        
        # Check if tool was used
        for content in response.content:
            if content.type == "text":
                print(f"   Text: {content.text[:100]}...")
            elif content.type == "tool_use":
                print(f"   Tool use: {content.name} (id: {content.id})")
                
                # Step 2: Add tool result and continue
                print("\n📊 Step 2: Adding tool result...")
                messages.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": content.id,
                        "content": "File created successfully"
                    }]
                })
                
                # Continue conversation
                response2 = client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=500,
                    messages=messages
                )
                
                print("✅ Continued successfully")
                for content2 in response2.content:
                    if content2.type == "text":
                        print(f"   Final response: {content2.text[:100]}...")
                
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("🚀 OAuth Proxy Simple Tests")
    print("Make sure the OAuth proxy is running on http://localhost:8080\n")
    
    # Run tests
    success1 = test_simple_message()
    success2 = test_trae_style_conversation()
    
    print("\n\n📊 Test Summary:")
    print(f"   Simple message test: {'✅' if success1 else '❌'}")
    print(f"   TraeAgent-style test: {'✅' if success2 else '❌'}")
    
    if success1 and success2:
        print("\n🎉 All tests passed!")
    else:
        print("\n💥 Some tests failed!")