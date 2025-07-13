// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Configuration management for Trae Agent.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Model parameters for a model provider.
 */
export interface ModelParameters {
  model: string;
  api_key: string;
  max_tokens: number;
  temperature: number;
  top_p: number;
  top_k: number;
  parallel_tool_calls: boolean;
  max_retries: number;
  base_url?: string;
  api_version?: string;
  candidate_count?: number; // Gemini specific field
  stop_sequences?: string[];
}

/**
 * Configuration for Lakeview.
 */
export interface LakeviewConfig {
  model_provider: string;
  model_name: string;
}

interface ConfigData {
  default_provider?: string;
  max_steps?: number;
  enable_lakeview?: boolean;
  model_providers?: Record<string, {
    model?: string;
    api_key?: string;
    base_url?: string;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    max_retries?: number;
    parallel_tool_calls?: boolean;
    api_version?: string;
    candidate_count?: number;
    stop_sequences?: string[];
  }>;
  lakeview_config?: {
    model_provider?: string;
    model_name?: string;
  };
}

/**
 * Configuration manager for Trae Agent.
 */
export class Config {
  public default_provider: string;
  public max_steps: number;
  public model_providers: Record<string, ModelParameters>;
  public lakeview_config?: LakeviewConfig;
  public enable_lakeview: boolean;
  private _config: ConfigData;

  constructor(
    configOrConfigFile: string | ConfigData = 'trae_config.json'
  ) {
    // Accept either file path or direct config dict
    if (typeof configOrConfigFile === 'object') {
      this._config = configOrConfigFile;
    } else {
      const configPath = path.resolve(configOrConfigFile);
      if (fs.existsSync(configPath)) {
        try {
          const configContent = fs.readFileSync(configPath, 'utf-8');
          this._config = JSON.parse(configContent);
        } catch (e) {
          console.warn(
            `Warning: Could not load config file ${configOrConfigFile}: ${e}`
          );
          this._config = {};
        }
      } else {
        this._config = {};
      }
    }

    this.default_provider = this._config.default_provider || 'anthropic';
    this.max_steps = this._config.max_steps || 20;
    this.model_providers = {};
    this.enable_lakeview = this._config.enable_lakeview !== false;

    const modelProvidersConfig = this._config.model_providers || {};
    if (Object.keys(modelProvidersConfig).length === 0) {
      this.model_providers = {
        anthropic: {
          model: 'claude-sonnet-4-20250514',
          api_key: '',
          base_url: 'https://api.anthropic.com',
          max_tokens: 4096,
          temperature: 0.5,
          top_p: 1,
          top_k: 0,
          parallel_tool_calls: false,
          max_retries: 10,
        },
      };
    } else {
      for (const provider in modelProvidersConfig) {
        const providerConfig = modelProvidersConfig[provider] || {};
        const candidateCount = providerConfig.candidate_count;

        this.model_providers[provider] = {
          model: String(providerConfig.model || ''),
          api_key: String(providerConfig.api_key || ''),
          base_url: providerConfig.base_url
            ? String(providerConfig.base_url)
            : undefined,
          max_tokens: Number(providerConfig.max_tokens || 1000),
          temperature: Number(providerConfig.temperature || 0.5),
          top_p: Number(providerConfig.top_p || 1),
          top_k: Number(providerConfig.top_k || 0),
          max_retries: Number(providerConfig.max_retries || 10),
          parallel_tool_calls: Boolean(
            providerConfig.parallel_tool_calls || false
          ),
          api_version: providerConfig.api_version
            ? String(providerConfig.api_version)
            : undefined,
          candidate_count:
            candidateCount !== undefined ? Number(candidateCount) : undefined,
          stop_sequences: providerConfig.stop_sequences || undefined,
        };
      }
    }

    if (this._config.lakeview_config) {
      this.lakeview_config = {
        model_provider: String(
          this._config.lakeview_config.model_provider || 'anthropic'
        ),
        model_name: String(
          this._config.lakeview_config.model_name || 'claude-sonnet-4-20250514'
        ),
      };
    }
  }

  toString(): string {
    return `Config(default_provider=${this.default_provider}, max_steps=${this.max_steps}, model_providers=${JSON.stringify(this.model_providers)})`;
  }
}

/**
 * Load configuration with CLI overrides.
 */
export function loadConfig(options?: {
  config_file?: string;
  provider?: string;
  model?: string;
  model_base_url?: string;
  api_key?: string;
  max_steps?: number;
}): Config {
  const {
    config_file = 'trae_config.json',
    provider,
    model,
    model_base_url,
    api_key,
    max_steps = 20,
  } = options || {};

  const config = new Config(config_file);

  const resolvedProvider =
    resolveConfigValue(provider, config.default_provider) || 'openai';
  config.default_provider = String(resolvedProvider);

  // Resolve configuration values with CLI overrides
  const resolvedModel = resolveConfigValue(
    model,
    config.model_providers[String(resolvedProvider)]?.model
  );

  const modelParameters = config.model_providers[String(resolvedProvider)];
  if (resolvedModel !== undefined && resolvedModel !== null) {
    modelParameters.model = String(resolvedModel);
  }

  // Map providers to their environment variable names
  const envVarApiKey = String(resolvedProvider).toUpperCase() + '_API_KEY';
  const envVarApiBaseUrl = String(resolvedProvider).toUpperCase() + '_BASE_URL';

  const resolvedApiKey = resolveConfigValue(
    api_key,
    config.model_providers[String(resolvedProvider)]?.api_key,
    envVarApiKey
  );

  const resolvedApiBaseUrl = resolveConfigValue(
    model_base_url,
    config.model_providers[String(resolvedProvider)]?.base_url,
    envVarApiBaseUrl
  );

  if (resolvedApiKey !== undefined && resolvedApiKey !== null) {
    modelParameters.api_key = String(resolvedApiKey);
  }

  if (resolvedApiBaseUrl !== undefined && resolvedApiBaseUrl !== null) {
    modelParameters.base_url = String(resolvedApiBaseUrl);
  }

  const resolvedMaxSteps = resolveConfigValue(max_steps, config.max_steps);
  if (resolvedMaxSteps !== undefined && resolvedMaxSteps !== null) {
    config.max_steps = Number(resolvedMaxSteps);
  }

  return config;
}

/**
 * Resolve configuration value with priority: CLI > ENV > Config > Default.
 */
export function resolveConfigValue(
  cliValue?: string | number | boolean | null,
  configValue?: string | number | boolean | null,
  envVar?: string
): string | number | boolean | null | undefined {
  if (cliValue !== undefined && cliValue !== null) {
    return cliValue;
  }

  if (envVar && process.env[envVar] && process.env[envVar]!.trim() !== '') {
    return process.env[envVar];
  }

  if (configValue !== undefined && configValue !== null) {
    return configValue;
  }

  return undefined;
}

/**
 * Helper function to create ModelParameters.
 */
export function createModelParameters(
  model: string,
  api_key: string,
  options?: {
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    parallel_tool_calls?: boolean;
    max_retries?: number;
    base_url?: string;
    api_version?: string;
    candidate_count?: number;
    stop_sequences?: string[];
  }
): ModelParameters {
  return {
    model,
    api_key,
    max_tokens: options?.max_tokens || 1000,
    temperature: options?.temperature || 0.5,
    top_p: options?.top_p || 1,
    top_k: options?.top_k || 0,
    parallel_tool_calls: options?.parallel_tool_calls || false,
    max_retries: options?.max_retries || 10,
    base_url: options?.base_url,
    api_version: options?.api_version,
    candidate_count: options?.candidate_count,
    stop_sequences: options?.stop_sequences,
  };
}
