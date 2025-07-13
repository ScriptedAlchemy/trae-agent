# Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
# SPDX-License-Identifier: MIT

"""OpenAI API client wrapper with tool integration."""

import json
import random
import time
from typing import override

import openai
from openai.types.chat import (
    ChatCompletionMessageParam,
    ChatCompletionToolParam,
    ChatCompletionMessage,
)

from ..tools.base import Tool, ToolCall, ToolResult
from ..utils.config import ModelParameters
from .base_client import BaseLLMClient
from .llm_basics import LLMMessage, LLMResponse, LLMUsage


class OpenAIClient(BaseLLMClient):
    """OpenAI client wrapper with tool schema generation."""

    def __init__(self, model_parameters: ModelParameters):
        super().__init__(model_parameters)

        self.client: openai.OpenAI = openai.OpenAI(api_key=self.api_key, base_url=self.base_url)
        self.message_history: list[ChatCompletionMessageParam] = []

    @override
    def set_chat_history(self, messages: list[LLMMessage]) -> None:
        """Set the chat history."""
        self.message_history = self.parse_messages(messages)

    @override
    def chat(
        self,
        messages: list[LLMMessage],
        model_parameters: ModelParameters,
        tools: list[Tool] | None = None,
        reuse_history: bool = True,
    ) -> LLMResponse:
        """Send chat messages to OpenAI with optional tool support."""
        openai_messages: list[ChatCompletionMessageParam] = self.parse_messages(messages)

        tool_schemas = None
        if tools:
            tool_schemas = [
                ChatCompletionToolParam(
                    type="function",
                    function={
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.get_input_schema(),
                        "strict": True,
                    },
                )
                for tool in tools
            ]

        api_call_input: list[ChatCompletionMessageParam] = []
        if reuse_history:
            api_call_input.extend(self.message_history)
        api_call_input.extend(openai_messages)

        response = None
        error_message = ""
        for i in range(model_parameters.max_retries):
            try:
                request_params = {
                    "messages": api_call_input,
                    "model": model_parameters.model,
                    "top_p": model_parameters.top_p,
                    "max_tokens": model_parameters.max_tokens,
                }
                
                if tool_schemas:
                    request_params["tools"] = tool_schemas
                
                if ("o3" not in model_parameters.model and "o4-mini" not in model_parameters.model):
                    request_params["temperature"] = model_parameters.temperature
                
                response = self.client.chat.completions.create(**request_params)
                break
            except Exception as e:
                this_error_message = str(e)
                error_message += f"Error {i + 1}: {this_error_message}\n"
                sleep_time = random.randint(3, 30)
                print(
                    f"OpenAI API call failed: {this_error_message} will sleep for {sleep_time} seconds and will retry."
                )
                # Randomly sleep for 3-30 seconds
                time.sleep(sleep_time)

        if response is None:
            raise ValueError(
                f"Failed to get response from OpenAI after max retries: {error_message}"
            )

        # Update message history with the assistant's response
        assistant_message: ChatCompletionMessageParam = {
            "role": "assistant",
            "content": response.choices[0].message.content or "",
        }
        if response.choices[0].message.tool_calls:
            assistant_message["tool_calls"] = response.choices[0].message.tool_calls
        
        self.message_history = api_call_input + [assistant_message]

        content = response.choices[0].message.content or ""
        tool_calls: list[ToolCall] = []
        
        if response.choices[0].message.tool_calls:
            for tool_call in response.choices[0].message.tool_calls:
                if tool_call.type == "function":
                    tool_calls.append(
                        ToolCall(
                            call_id=tool_call.id,
                            name=tool_call.function.name,
                            arguments=json.loads(tool_call.function.arguments or "{}"),
                            id=tool_call.id,
                        )
                    )

        usage = None
        if response.usage:
            # Handle optional usage details that may not be present in all responses
            usage = LLMUsage(
                input_tokens=response.usage.prompt_tokens or 0,
                output_tokens=response.usage.completion_tokens or 0,
                cache_read_input_tokens=getattr(getattr(response.usage, "prompt_tokens_details", None), "cached_tokens", None) or 0,
                reasoning_tokens=getattr(getattr(response.usage, "completion_tokens_details", None), "reasoning_tokens", None) or 0,
            )

        llm_response = LLMResponse(
            content=content,
            usage=usage,
            model=response.model,
            finish_reason=response.choices[0].finish_reason,
            tool_calls=tool_calls if len(tool_calls) > 0 else None,
        )

        # Record trajectory if recorder is available
        if self.trajectory_recorder:
            self.trajectory_recorder.record_llm_interaction(
                messages=messages,
                response=llm_response,
                provider="openai",
                model=model_parameters.model,
                tools=tools,
            )

        return llm_response

    @override
    def supports_tool_calling(self, model_parameters: ModelParameters) -> bool:
        """Check if the current model supports tool calling."""

        if "o1-mini" in model_parameters.model:
            return False

        tool_capable_models = [
            "gpt-4-turbo",
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-4.1",
            "gpt-4.5",
            "o1",
            "o3",
            "o3-mini",
            "o4-mini",
        ]
        return any(model in model_parameters.model for model in tool_capable_models)

    def parse_messages(self, messages: list[LLMMessage]) -> list[ChatCompletionMessageParam]:
        """Parse the messages to OpenAI format."""
        openai_messages: list[ChatCompletionMessageParam] = []
        for msg in messages:
            if msg.tool_result:
                openai_messages.append(self.parse_tool_call_result(msg.tool_result))
            elif msg.tool_call:
                openai_messages.append(self.parse_tool_call(msg.tool_call))
            else:
                if not msg.content:
                    raise ValueError("Message content is required")
                if msg.role == "system":
                    openai_messages.append({"role": "system", "content": msg.content})
                elif msg.role == "user":
                    openai_messages.append({"role": "user", "content": msg.content})
                elif msg.role == "assistant":
                    openai_messages.append({"role": "assistant", "content": msg.content})
                else:
                    raise ValueError(f"Invalid message role: {msg.role}")
        return openai_messages

    def parse_tool_call(self, tool_call: ToolCall) -> ChatCompletionMessageParam:
        """Parse the tool call from the LLM response."""
        return {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": tool_call.call_id,
                    "type": "function",
                    "function": {
                        "name": tool_call.name,
                        "arguments": json.dumps(tool_call.arguments),
                    },
                }
            ],
        }

    def parse_tool_call_result(self, tool_call_result: ToolResult) -> ChatCompletionMessageParam:
        """Parse the tool call result from the LLM response."""
        result_content: str = ""
        if tool_call_result.result is not None:
            result_content += str(tool_call_result.result)
        if tool_call_result.error:
            result_content += f"\nError: {tool_call_result.error}"
        result_content = result_content.strip()

        return {
            "role": "tool",
            "content": result_content,
            "tool_call_id": tool_call_result.call_id,
        }
