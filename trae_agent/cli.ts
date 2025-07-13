// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Command Line Interface for Trae Agent.
 */

import { readFileSync, existsSync } from 'fs';
import { Command } from 'commander';
import { config as dotenvConfig } from 'dotenv';
import chalk from 'chalk';
import { TraeAgent } from './agent/index.js';
import { Config, loadConfig } from './utils/config.js';
import { CLIConsole } from './utils/cli_console.js';
import { toolsRegistry } from './tools/index.js';

interface RunCommandOptions {
  provider?: string;
  model?: string;
  modelBaseUrl?: string;
  apiKey?: string;
  maxSteps?: number;
  workingDir?: string;
  mustPatch?: boolean;
  configFile?: string;
  trajectoryFile?: string;
  patchPath?: string;
}

interface InteractiveCommandOptions {
  provider?: string;
  model?: string;
  modelBaseUrl?: string;
  apiKey?: string;
  configFile?: string;
  maxSteps?: number;
  trajectoryFile?: string;
}

interface ShowConfigOptions {
  configFile?: string;
}

// Load environment variables
dotenvConfig();

/**
 * Create a Trae Agent with the specified configuration.
 * @param config Agent configuration. It is expected that the config comes from loadConfig.
 * @returns TraeAgent object
 */
function createAgent(config: Config): TraeAgent {
  try {
    // Create agent
    const agent = new TraeAgent(config);
    return agent;
  } catch (error) {
    console.error(chalk.red(`Error creating agent: ${error}`));
    if (error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Create the CLI program
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name('trae-agent')
    .description('Trae Agent - LLM-based agent for software engineering tasks')
    .version('0.1.0');

  // Run command
  program
    .command('run')
    .description('Run a task using Trae Agent')
    .argument('<task>', 'The task that you want your agent to solve')
    .option('-p, --provider <provider>', 'LLM provider to use')
    .option('-m, --model <model>', 'Specific model to use')
    .option('--model-base-url <url>', 'Base URL for the model API')
    .option('-k, --api-key <key>', 'API key (or set via environment variable)')
    .option(
      '--max-steps <steps>',
      'Maximum number of execution steps',
      parseInt
    )
    .option('-w, --working-dir <dir>', 'Working directory for the agent')
    .option('--mp, --must-patch', 'Whether to patch the code', false)
    .option(
      '--config-file <file>',
      'Path to configuration file',
      'trae_config.json'
    )
    .option('-t, --trajectory-file <file>', 'Path to save trajectory file')
    .option('--pp, --patch-path <path>', 'Path to patch file')
    .action(async (task: string, options: RunCommandOptions) => {
      await runCommand(task, options);
    });

  // Interactive command
  program
    .command('interactive')
    .description('Start an interactive session with Trae Agent')
    .option('-p, --provider <provider>', 'LLM provider to use')
    .option('-m, --model <model>', 'Specific model to use')
    .option('--model-base-url <url>', 'Base URL for the model API')
    .option('-k, --api-key <key>', 'API key (or set via environment variable)')
    .option(
      '--config-file <file>',
      'Path to configuration file',
      'trae_config.json'
    )
    .option(
      '--max-steps <steps>',
      'Maximum number of execution steps',
      parseInt,
      20
    )
    .option('-t, --trajectory-file <file>', 'Path to save trajectory file')
    .action(async (options: InteractiveCommandOptions) => {
      await interactiveCommand(options);
    });

  // Show config command
  program
    .command('show-config')
    .description('Show current configuration settings')
    .option(
      '--config-file <file>',
      'Path to configuration file',
      'trae_config.json'
    )
    .action((options: ShowConfigOptions) => {
      showConfigCommand(options);
    });

  // Tools command
  program
    .command('tools')
    .description('Show available tools and their descriptions')
    .action(() => {
      showToolsCommand();
    });

  return program;
}

/**
 * Run command implementation
 */
async function runCommand(task: string, options: RunCommandOptions): Promise<void> {
  const {
    provider,
    model,
    modelBaseUrl,
    apiKey,
    maxSteps,
    workingDir,
    mustPatch,
    configFile,
    trajectoryFile,
    patchPath,
  } = options;

  // Change working directory if specified
  const currentWorkingDir = workingDir || process.cwd();
  try {
    process.chdir(currentWorkingDir);
    console.log(
      chalk.blue(`Changed working directory to: ${currentWorkingDir}`)
    );
  } catch (error) {
    console.error(chalk.red(`Error changing directory: ${error}`));
    process.exit(1);
  }

  // Check if task is a file path
  if (existsSync(task)) {
    try {
      task = readFileSync(task, 'utf-8');
    } catch (error) {
      console.error(chalk.red(`Error reading task file: ${error}`));
      process.exit(1);
    }
  }

  const config = loadConfig({
    configFile: configFile || 'trae_config.json',
    provider,
    model,
    modelBaseUrl,
    apiKey,
    maxSteps,
  });

  // Create agent
  const agent = createAgent(config);

  // Set up trajectory recording
  let trajectoryPath: string;
  if (trajectoryFile) {
    trajectoryPath = agent.setupTrajectoryRecording(trajectoryFile);
  } else {
    trajectoryPath = agent.setupTrajectoryRecording();
  }

  // Create CLI Console
  const cliConsole = new CLIConsole(config);
  cliConsole.printTaskDetails(
    task,
    currentWorkingDir,
    config.default_provider,
    config.model_providers[config.default_provider].model,
    config.max_steps
  );

  console.log(`Config File: ${configFile}`);
  console.log(`Trajectory Path: ${trajectoryPath}`);

  agent.setCLIConsole(cliConsole);

  try {
    const taskArgs: Record<string, string> = {
      project_path: currentWorkingDir,
      issue: task,
      must_patch: mustPatch ? 'true' : 'false',
    };
    if (patchPath) {
      taskArgs.patch_path = patchPath;
    }
    agent.newTask(task, taskArgs);
    await agent.executeTask();

    console.log(chalk.green(`\nTrajectory saved to: ${trajectoryPath}`));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(chalk.yellow('\nTask execution interrupted by user'));
      if (trajectoryPath) {
        console.log(
          chalk.blue(`Partial trajectory saved to: ${trajectoryPath}`)
        );
      }
      process.exit(1);
    } else {
      console.error(chalk.red(`\nUnexpected error: ${error}`));
      if (error instanceof Error) {
        console.error(error.stack);
      }
      if (trajectoryPath) {
        console.log(chalk.blue(`Trajectory saved to: ${trajectoryPath}`));
      }
      process.exit(1);
    }
  }
}

/**
 * Interactive command implementation
 */
async function interactiveCommand(options: InteractiveCommandOptions): Promise<void> {
  const {
    provider,
    model,
    modelBaseUrl,
    apiKey,
    configFile = 'trae_config.json',
    maxSteps,
    trajectoryFile,
  } = options;

  const config = loadConfig({
    configFile: configFile || 'trae_config.json',
    provider,
    model,
    modelBaseUrl,
    apiKey,
    maxSteps,
  });

  console.log(
    chalk.green.bold(
      '\n┌─────────────────────────────────────────────────────────┐'
    )
  );
  console.log(
    chalk.green.bold('│') +
      chalk.white.bold(
        '        Welcome to Trae Agent Interactive Mode!        '
      ) +
      chalk.green.bold('│')
  );
  console.log(
    chalk.green.bold(
      '├─────────────────────────────────────────────────────────┤'
    )
  );
  console.log(
    chalk.green.bold('│') +
      chalk.cyan(' Provider: ') +
      chalk.white(config.default_provider.padEnd(42)) +
      chalk.green.bold('│')
  );
  console.log(
    chalk.green.bold('│') +
      chalk.cyan(' Model: ') +
      chalk.white(
        config.model_providers[config.default_provider].model.padEnd(45)
      ) +
      chalk.green.bold('│')
  );
  console.log(
    chalk.green.bold('│') +
      chalk.cyan(' Max Steps: ') +
      chalk.white(config.max_steps.toString().padEnd(41)) +
      chalk.green.bold('│')
  );
  console.log(
    chalk.green.bold('│') +
      chalk.cyan(' Config File: ') +
      chalk.white(configFile.padEnd(39)) +
      chalk.green.bold('│')
  );
  console.log(
    chalk.green.bold(
      '└─────────────────────────────────────────────────────────┘'
    )
  );

  // Create agent
  const agent = createAgent(config);

  // Import readline for interactive input
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise(resolve => {
      rl.question(prompt, resolve);
    });
  };

  while (true) {
    try {
      const task = await question(chalk.blue.bold('\nTask: '));

      if (task.toLowerCase() === 'exit' || task.toLowerCase() === 'quit') {
        console.log(chalk.green('Goodbye!'));
        break;
      }

      if (task.toLowerCase() === 'help') {
        console.log(
          chalk.yellow.bold(
            '\n┌─────────────────────────────────────────────────────────┐'
          )
        );
        console.log(
          chalk.yellow.bold('│') +
            chalk.white.bold(
              '                    Available Commands                   '
            ) +
            chalk.yellow.bold('│')
        );
        console.log(
          chalk.yellow.bold(
            '├─────────────────────────────────────────────────────────┤'
          )
        );
        console.log(
          chalk.yellow.bold('│') +
            chalk.white(
              ' • Type any task description to execute it              '
            ) +
            chalk.yellow.bold('│')
        );
        console.log(
          chalk.yellow.bold('│') +
            chalk.white(
              " • 'status' - Show agent status                         "
            ) +
            chalk.yellow.bold('│')
        );
        console.log(
          chalk.yellow.bold('│') +
            chalk.white(
              " • 'clear' - Clear the screen                           "
            ) +
            chalk.yellow.bold('│')
        );
        console.log(
          chalk.yellow.bold('│') +
            chalk.white(
              " • 'exit' or 'quit' - End the session                  "
            ) +
            chalk.yellow.bold('│')
        );
        console.log(
          chalk.yellow.bold(
            '└─────────────────────────────────────────────────────────┘'
          )
        );
        continue;
      }

      const workingDir = await question(chalk.blue.bold('Working Directory: '));

      if (task.toLowerCase() === 'status') {
        console.log(
          chalk.blue.bold(
            '\n┌─────────────────────────────────────────────────────────┐'
          )
        );
        console.log(
          chalk.blue.bold('│') +
            chalk.white.bold(
              '                     Agent Status                       '
            ) +
            chalk.blue.bold('│')
        );
        console.log(
          chalk.blue.bold(
            '├─────────────────────────────────────────────────────────┤'
          )
        );
        console.log(
          chalk.blue.bold('│') +
            chalk.cyan(' Provider: ') +
            chalk.white(agent.llmClient.provider.padEnd(42)) +
            chalk.blue.bold('│')
        );
        console.log(
          chalk.blue.bold('│') +
            chalk.cyan(' Model: ') +
            chalk.white(
              config.model_providers[config.default_provider].model.padEnd(45)
            ) +
            chalk.blue.bold('│')
        );
        console.log(
          chalk.blue.bold('│') +
            chalk.cyan(' Available Tools: ') +
            chalk.white(agent.tools.length.toString().padEnd(35)) +
            chalk.blue.bold('│')
        );
        console.log(
          chalk.blue.bold('│') +
            chalk.cyan(' Config File: ') +
            chalk.white((configFile || 'trae_config.json').padEnd(39)) +
            chalk.blue.bold('│')
        );
        console.log(
          chalk.blue.bold('│') +
            chalk.cyan(' Working Directory: ') +
            chalk.white(process.cwd().padEnd(33)) +
            chalk.blue.bold('│')
        );
        console.log(
          chalk.blue.bold(
            '└─────────────────────────────────────────────────────────┘'
          )
        );
        continue;
      }

      if (task.toLowerCase() === 'clear') {
        console.clear();
        continue;
      }

      // Set up trajectory recording for this task
      const trajectoryPath = agent.setupTrajectoryRecording(trajectoryFile);

      console.log(chalk.blue(`Trajectory will be saved to: ${trajectoryPath}`));

      const taskArgs = {
        project_path: workingDir,
        issue: task,
        must_patch: 'false',
      };

      // Execute the task
      console.log(chalk.blue(`\nExecuting task: ${task}`));
      agent.newTask(task, taskArgs);

      // Configure agent for progress display
      await agent.executeTask();

      console.log(chalk.green(`\nTrajectory saved to: ${trajectoryPath}`));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(chalk.yellow("\nUse 'exit' or 'quit' to end the session"));
      } else if (error instanceof Error && error.message === 'EOF') {
        console.log(chalk.green('\nGoodbye!'));
        break;
      } else {
        console.error(chalk.red(`Error: ${error}`));
      }
    }
  }

  rl.close();
}

/**
 * Show config command implementation
 */
function showConfigCommand(options: ShowConfigOptions): void {
  const { configFile = 'trae_config.json' } = options;

  if (!existsSync(configFile)) {
    console.log(
      chalk.yellow.bold(
        '\n┌─────────────────────────────────────────────────────────┐'
      )
    );
    console.log(
      chalk.yellow.bold('│') +
        chalk.white.bold(
          '                 Configuration Status                   '
        ) +
        chalk.yellow.bold('│')
    );
    console.log(
      chalk.yellow.bold(
        '├─────────────────────────────────────────────────────────┤'
      )
    );
    console.log(
      chalk.yellow.bold('│') +
        chalk.yellow(
          ` No configuration file found at: ${configFile}`.padEnd(55)
        ) +
        chalk.yellow.bold('│')
    );
    console.log(
      chalk.yellow.bold('│') +
        chalk.white(
          ' Using default settings and environment variables.      '
        ) +
        chalk.yellow.bold('│')
    );
    console.log(
      chalk.yellow.bold(
        '└─────────────────────────────────────────────────────────┘'
      )
    );
    return;
  }

  const config = new Config(configFile);

  // Display general settings
  console.log(chalk.cyan.bold('\nGeneral Settings:'));
  console.log(
    chalk.cyan('Default Provider: ') +
      chalk.green(config.default_provider || 'Not set')
  );
  console.log(
    chalk.cyan('Max Steps: ') +
      chalk.green(config.max_steps?.toString() || 'Not set')
  );

  // Display provider settings
  for (const [providerName, providerConfig] of Object.entries(
    config.model_providers
  )) {
    console.log(
      chalk.cyan.bold(
        `\n${providerName.charAt(0).toUpperCase() + providerName.slice(1)} Configuration:`
      )
    );
    console.log(
      chalk.cyan('Model: ') + chalk.green(providerConfig.model || 'Not set')
    );
    console.log(
      chalk.cyan('API Key: ') +
        chalk.green(providerConfig.apiKey ? 'Set' : 'Not set')
    );
    console.log(
      chalk.cyan('Max Tokens: ') +
        chalk.green(providerConfig.maxTokens.toString())
    );
    console.log(
      chalk.cyan('Temperature: ') +
        chalk.green(providerConfig.temperature.toString())
    );
    console.log(
      chalk.cyan('Top P: ') + chalk.green(providerConfig.topP.toString())
    );

    if (providerName === 'anthropic' && 'topK' in providerConfig) {
      console.log(
        chalk.cyan('Top K: ') +
          chalk.green((providerConfig as { topK?: number }).topK?.toString() || 'Not set')
      );
    }
  }
}

/**
 * Show tools command implementation
 */
function showToolsCommand(): void {
  console.log(chalk.cyan.bold('\nAvailable Tools:'));
  console.log(chalk.cyan('─'.repeat(60)));

  for (const toolName of Object.keys(toolsRegistry)) {
    try {
      const tool = toolsRegistry[toolName]();
      console.log(
        chalk.cyan(tool.name.padEnd(20)) + chalk.green(tool.description)
      );
    } catch (error) {
      console.log(
        chalk.cyan(toolName.padEnd(20)) + chalk.red(`Error loading: ${error}`)
      );
    }
  }
}

/**
 * Main entry point for the CLI.
 */
export function main(): void {
  const program = createProgram();
  program.parse();
}

if (require.main === module) {
  main();
}
