// SPDX-License-Identifier: MIT

/**
 * Lake View utility for agent step analysis and trajectory processing
 */

import { AgentStep } from '../agent/agent_basics.js';
import { Config, ModelParameters } from './config.js';
import { LLMMessage } from './llm_basics.js';
import { LLMClient } from './llm_client.js';

type StepType = [
  string, // content for human (will write into result file)
  string | null, // content for llm, or None if no need to analyze
];

const EXTRACTOR_PROMPT = `
Given the preceding excerpt, your job is to determine "what task is the agent performing in <this_step>".
Output your answer in two granularities: <task>...</task><details>...</details>.
In the <task> tag, the answer should be concise and general. It should omit ANY bug-specific details, and contain at most 10 words.
In the <details> tag, the answer should complement the <task> tag by adding bug-specific details. It should be informative and contain at most 30 words.

Examples:

<task>The agent is writing a reproduction test script.</task><details>The agent is writing "test_bug.py" to reproduce the bug in XXX-Project's create_foo method not comparing sizes correctly.</details>
<task>The agent is examining source code.</task><details>The agent is searching for "function_name" in the code repository, that is related to the "foo.py:function_name" line in the stack trace.</details>
<task>The agent is fixing the reproduction test script.</task><details>The agent is fixing "test_bug.py" that forgets to import the function "foo", causing a NameError.</details>

Now, answer the question "what task is the agent performing in <this_step>".
Again, provide only the answer with no other commentary. The format should be "<task>...</task><details>...</details>".
`;

const TAGGER_PROMPT = `
Given the trajectory, your job is to determine "what task is the agent performing in the current step".
Output your answer by choosing the applicable tags in the below list for the current step.
If it is performing multiple tasks in one step, choose ALL applicable tags, separated by a comma.

<tags>
WRITE_TEST: It writes a test script to reproduce the bug, or modifies a non-working test script to fix problems found in testing.
VERIFY_TEST: It runs the reproduction test script to verify the testing environment is working.
EXAMINE_CODE: It views, searches, or explores the code repository to understand the cause of the bug.
WRITE_FIX: It modifies the source code to fix the identified bug.
VERIFY_FIX: It runs the reproduction test or existing tests to verify the fix indeed solves the bug.
REPORT: It reports to the user that the job is completed or some progress has been made.
THINK: It analyzes the bug through thinking, but does not perform concrete actions right now.
OUTLIER: A major part in this step does not fit into any tag above, such as running a shell command to install dependencies.
</tags>

<examples>
If the agent is opening a file to examine, output <tags>EXAMINE_CODE</tags>.
If the agent is fixing a known problem in the reproduction test script and then running it again, output <tags>WRITE_TEST,VERIFY_TEST</tags>.
If the agent is merely thinking about the root cause of the bug without other actions, output <tags>THINK</tags>.
</examples>

Output only the tags with no other commentary. The format should be <tags>...</tags>
`;

const KNOWN_TAGS: Record<string, string> = {
  WRITE_TEST: '☑️',
  VERIFY_TEST: '✅',
  EXAMINE_CODE: '👁️',
  WRITE_FIX: '📝',
  VERIFY_FIX: '🔥',
  REPORT: '📣',
  THINK: '🧠',
  OUTLIER: '⁉️',
};

const tagsRegex = /<tags>([A-Z_,\s]+)<\/tags>/;

export interface LakeViewStep {
  descTask: string;
  descDetails: string;
  tagsEmoji: string;
}

export class LakeView {
  private modelParameters?: ModelParameters;
  private lakeviewLlmClient?: LLMClient;
  private steps: string[] = [];

  constructor(config: Config) {
    if (!config.lakeview_config) {
      return;
    }

    const modelProvider =
      config.model_providers[config.lakeview_config.model_provider];
    this.modelParameters = {
      model: config.lakeview_config.model_name,
      api_key: modelProvider.api_key,
      max_tokens: modelProvider.max_tokens,
      temperature: modelProvider.temperature,
      top_p: modelProvider.top_p,
      top_k: modelProvider.top_k,
      parallel_tool_calls: modelProvider.parallel_tool_calls,
      max_retries: modelProvider.max_retries,
      base_url: modelProvider.base_url,
      api_version: modelProvider.api_version,
    };

    this.lakeviewLlmClient = new LLMClient(
      config.lakeview_config.model_provider,
      this.modelParameters,
      config.max_steps
    );
  }

  getLabel(tags?: string[] | null, emoji: boolean = true): string {
    if (!tags || tags.length === 0) {
      return '';
    }

    return tags
      .map(tag => (emoji ? `${KNOWN_TAGS[tag]}${tag}` : tag))
      .join(' · ');
  }

  async extractTaskInStep(
    prevStep: string,
    thisStep: string
  ): Promise<[string, string]> {
    if (!this.lakeviewLlmClient || !this.modelParameters) {
      return ['', ''];
    }

    const llmMessages: LLMMessage[] = [
      {
        role: 'user',
        content: `The following is an excerpt of the steps trying to solve a software bug by an AI agent: <previous_step>${prevStep}</previous_step><this_step>${thisStep}</this_step>`,
      },
      {
        role: 'assistant',
        content: 'I understand.',
      },
      {
        role: 'user',
        content: EXTRACTOR_PROMPT,
      },
      {
        role: 'assistant',
        content:
          'Sure. Here is the task the agent is performing: <task>The agent',
      },
    ];

    this.modelParameters.temperature = 0.1;
    let llmResponse = await this.lakeviewLlmClient.chat(
      llmMessages,
      this.modelParameters,
      undefined,
      false
    );

    let content = llmResponse.content.trim();

    let retry = 0;
    while (
      retry < 10 &&
      (!content.includes('</task>') ||
        !content.includes('<details>') ||
        !content.includes('</details>'))
    ) {
      retry++;
      llmResponse = await this.lakeviewLlmClient.chat(
        llmMessages,
        this.modelParameters,
        undefined,
        false
      );
      content = llmResponse.content.trim();
    }

    if (
      !content.includes('</task>') ||
      !content.includes('<details>') ||
      !content.includes('</details>')
    ) {
      return ['', ''];
    }

    const taskEndIndex = content.lastIndexOf('</task>');
    const descTask = content.substring(0, taskEndIndex);
    let descDetails = content.substring(taskEndIndex + 7); // 7 = '</task>'.length
    descDetails = descDetails
      .replace('<details>', '[italic]')
      .replace('</details>', '[/italic]');

    return [descTask, descDetails];
  }

  async extractTagInStep(step: string): Promise<string[]> {
    if (!this.lakeviewLlmClient || !this.modelParameters) {
      return [];
    }

    const stepsFmt = this.steps
      .map((s, ind) => `<step id="${ind + 1}">\n${s.trim()}\n</step>`)
      .join('\n\n');

    if (stepsFmt.length > 300000) {
      // step_fmt is too long, skip tagging
      return [];
    }

    const llmMessages: LLMMessage[] = [
      {
        role: 'user',
        content: `Below is the trajectory of an AI agent solving a software bug until the current step. Each step is marked within a <step> tag.\n\n${stepsFmt}\n\n<current_step>${step}</current_step>`,
      },
      {
        role: 'assistant',
        content: 'I understand.',
      },
      {
        role: 'user',
        content: TAGGER_PROMPT,
      },
      {
        role: 'assistant',
        content: 'Sure. The tags are: <tags>',
      },
    ];

    this.modelParameters.temperature = 0.1;

    let retry = 0;
    while (retry < 10) {
      const llmResponse = await this.lakeviewLlmClient.chat(
        llmMessages,
        this.modelParameters,
        undefined,
        false
      );

      const content = '<tags>' + llmResponse.content.trimStart();

      const matchedTags = tagsRegex.exec(content);
      if (matchedTags && matchedTags[1]) {
        const tags = matchedTags[1].split(',').map(tag => tag.trim());
        if (tags.every(tag => tag in KNOWN_TAGS)) {
          return tags;
        }
      }

      retry++;
    }

    return [];
  }

  private agentStepStr(agentStep: AgentStep): string | null {
    if (!agentStep.llm_response) {
      return null;
    }

    let content = agentStep.llm_response.content.trim();

    let toolCallsContent = '';
    if (agentStep.llm_response.toolCalls) {
      toolCallsContent = agentStep.llm_response.toolCalls
        .map(
          toolCall =>
            `[\`${toolCall.name}\`] \`${JSON.stringify(toolCall.arguments)}\``
        )
        .join('\n');
      toolCallsContent = toolCallsContent.trim();
      content = `${content}\n\nTool calls:\n${toolCallsContent}`;
    }

    return content;
  }

  async createLakeviewStep(agentStep: AgentStep): Promise<LakeViewStep | null> {
    const previousStepStr =
      this.steps.length > 1 ? this.steps[this.steps.length - 1] : '(none)';
    const thisStepStr = this.agentStepStr(agentStep);

    if (thisStepStr) {
      const [descTask, descDetails] = await this.extractTaskInStep(
        previousStepStr,
        thisStepStr
      );
      const tags = await this.extractTagInStep(thisStepStr);
      const tagsEmoji = this.getLabel(tags);

      // Add this step to our history
      this.steps.push(thisStepStr);

      return {
        descTask,
        descDetails,
        tagsEmoji,
      };
    }

    return null;
  }
}
