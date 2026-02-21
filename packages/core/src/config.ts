import { homedir } from "os";
import { join } from "path";
import { readFileSync, existsSync } from "fs";

export interface MCPServer {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export type LLMProvider = "openai" | "anthropic" | "minimax" | "kimi" | "google" | "azure";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServer>;
  llm?: LLMConfig;
}

function getConfigPath(): string {
  return join(homedir(), ".config", "envoy", "servers.json");
}

export function loadConfig(configPath?: string): MCPConfig {
  const path = configPath || getConfigPath();

  if (!existsSync(path)) {
    return { mcpServers: {} };
  }

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as MCPConfig;
  } catch (error) {
    console.error(`Failed to load config from ${path}:`, error);
    return { mcpServers: {} };
  }
}

export function resolveEnv(env?: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = { ...process.env };

  if (env) {
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result;
}
