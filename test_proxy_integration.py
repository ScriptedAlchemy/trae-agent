#!/usr/bin/env python3
"""Test TraeAgent with OAuth proxy integration"""

import asyncio
import os
import sys
import json
from pathlib import Path

# Add trae_agent to Python path
sys.path.insert(0, str(Path(__file__).parent))

from trae_agent.agent.trae_agent import TraeAgent
from trae_agent.utils.config import Config
from trae_agent.utils.cli_console import CLIConsole


async def test_proxy_integration():
    """Test TraeAgent with OAuth proxy configuration"""
    
    print("🧪 Testing TraeAgent with OAuth Proxy Configuration")
    print("=" * 60)
    
    # 1. Load proxy configuration
    config_path = Path(__file__).parent / "example-proxy-app" / "trae_config.json"
    
    if not config_path.exists():
        print(f"❌ Config file not found: {config_path}")
        return False
        
    with open(config_path) as f:
        config_data = json.load(f)
    
    print(f"✅ Loaded config from: {config_path}")
    print(f"   Model: {config_data['model_providers']['anthropic']['model']}")
    print(f"   Base URL: {config_data['model_providers']['anthropic']['base_url']}")
    
    # 2. Create TraeAgent with config
    config = Config(config_data)
    agent = TraeAgent(config)
    
    # Set up CLI console for output
    cli_console = CLIConsole(quiet=False)
    agent.set_cli_console(cli_console)
    
    # 3. Create a simple test project
    test_dir = Path("/tmp/trae-proxy-test")
    test_dir.mkdir(exist_ok=True)
    
    # Create a simple Python file with an error
    test_file = test_dir / "calculator.py"
    test_file.write_text("""
def add(a, b):
    return a + b

def multiply(a, b):
    # Bug: should be a * b
    return a + b

def divide(a, b):
    return a / b

# Test the functions
print(f"2 + 3 = {add(2, 3)}")
print(f"4 * 5 = {multiply(4, 5)}")  # This will show wrong result
print(f"10 / 2 = {divide(10, 2)}")
""")
    
    print(f"\n📁 Created test project at: {test_dir}")
    print(f"   Test file: {test_file}")
    
    # 4. Create task for agent
    task = """Fix the bug in the calculator.py file. 
The multiply function is returning the wrong result. 
It should multiply the two numbers, not add them.
After fixing, verify the fix works by running the script."""
    
    print(f"\n🎯 Task: {task}")
    
    # 5. Configure agent with simpler tools to avoid text_editor issues
    # Use only basic tools that work with all Claude models
    tool_names = [
        "bash",  # For running commands
        "str_replace_based_edit_tool",  # For editing files (if available)
        "sequentialthinking",  # For thinking
        "task_done"  # For marking completion
    ]
    
    # Check which tools are actually available
    from trae_agent.tools import tools_registry
    available_tools = []
    for tool_name in tool_names:
        if tool_name in tools_registry:
            available_tools.append(tool_name)
            print(f"   ✅ Tool available: {tool_name}")
        else:
            print(f"   ❌ Tool not found: {tool_name}")
    
    # 6. Run the agent
    print(f"\n🏃 Running TraeAgent...")
    print("=" * 60)
    
    try:
        # Set up the task
        agent.new_task(
            task=task,
            extra_args={
                "project_path": str(test_dir),
                "issue": "Fix multiply function bug",
                "base_commit": "HEAD",
                "must_patch": "false"
            },
            tool_names=available_tools
        )
        
        # Set up trajectory recording
        trajectory_path = agent.setup_trajectory_recording()
        print(f"📊 Trajectory will be saved to: {trajectory_path}")
        
        # Execute the task
        execution = await agent.execute_task()
        
        print("=" * 60)
        print(f"\n📊 Execution Results:")
        print(f"   Success: {'✅' if execution.success else '❌'}")
        print(f"   Steps taken: {len(execution.steps)}")
        print(f"   Execution time: {execution.execution_time:.2f}s")
        
        if execution.total_tokens:
            print(f"   Total tokens used: {execution.total_tokens}")
        
        if execution.final_result:
            print(f"\n📝 Final Result:")
            print(f"   {execution.final_result[:200]}...")
        
        # 7. Verify the fix
        print(f"\n🔍 Verifying fix...")
        fixed_content = test_file.read_text()
        if "return a * b" in fixed_content:
            print("   ✅ Bug fixed correctly!")
        else:
            print("   ❌ Bug not fixed")
            
        return execution.success
        
    except Exception as e:
        print(f"\n❌ Error during execution: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_simple_conversation():
    """Test a simple conversation without tools"""
    
    print("\n\n🧪 Testing Simple Conversation (No Tools)")
    print("=" * 60)
    
    # Load config
    config_path = Path(__file__).parent / "example-proxy-app" / "trae_config.json"
    with open(config_path) as f:
        config_data = json.load(f)
    
    # Modify config to reduce tokens for faster response
    config_data['model_providers']['anthropic']['max_tokens'] = 200
    
    config = Config(config_data)
    agent = TraeAgent(config)
    
    # Simple task that doesn't require tools
    task = "Explain what Python decorators are in 2-3 sentences."
    
    print(f"🎯 Task: {task}")
    
    try:
        # Create task with no tools
        agent.new_task(
            task=task,
            extra_args={
                "project_path": "/tmp",
                "issue": "Explain Python decorators",
                "base_commit": "HEAD",
                "must_patch": "false"
            },
            tool_names=[]  # No tools
        )
        
        execution = await agent.execute_task()
        
        print(f"\n✅ Success: {execution.success}")
        if execution.final_result:
            print(f"\n📝 Response:\n{execution.final_result}")
            
        return execution.success
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return False


if __name__ == "__main__":
    print("🚀 TraeAgent OAuth Proxy Integration Test")
    print("Make sure the OAuth proxy is running on http://localhost:8080")
    print("")
    
    # Run both tests
    loop = asyncio.get_event_loop()
    
    # Test 1: Simple conversation
    simple_success = loop.run_until_complete(test_simple_conversation())
    
    # Test 2: Full agent with tools (if simple test passed)
    if simple_success:
        full_success = loop.run_until_complete(test_proxy_integration())
    else:
        full_success = False
    
    print("\n\n📊 Test Summary:")
    print(f"   Simple conversation: {'✅' if simple_success else '❌'}")
    print(f"   Full agent test: {'✅' if full_success else '❌'}")
    
    if simple_success and full_success:
        print("\n🎉 All tests passed!")
        exit(0)
    else:
        print("\n💥 Some tests failed!")
        exit(1)