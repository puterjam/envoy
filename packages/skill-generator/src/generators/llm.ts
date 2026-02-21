import type { ServerInfo, Tool } from "../discovery.js";
import type { LLMProvider, LLMConfig as CoreLLMConfig } from "@envoy/core";

// Re-export types from core
export type { LLMProvider, LLMConfig } from "@envoy/core";

// Supported LLM providers

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

// Default models for each provider
const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-4o",
  anthropic: "claude-3-5-sonnet-20241022",
  minimax: "MiniMax-M2.5",
  kimi: "kimi-k2.5",
  google: "gemini-2.0-flash",
  azure: "gpt-4o",
};

function getModel(provider: LLMProvider, model?: string): string {
  return model || DEFAULT_MODELS[provider];
}

function formatToolForPrompt(tool: Tool): string {
  const schema = tool.inputSchema;
  if (!schema || !schema.properties) {
    return `  - ${tool.name}: ${tool.description || "No description"}`;
  }

  const props = schema.properties as Record<string, { description?: string; type?: string; enum?: string[] }>;
  const required = schema.required as string[] | undefined;

  let paramsStr = "";
  const params = Object.entries(props).map(([name, info]) => {
    const requiredFlag = required?.includes(name) ? " (required)" : "";
    let paramDesc = info.description || info.type || "any";
    if (info.enum) {
      paramDesc += ` (options: ${info.enum.join(", ")})`;
    }
    return `    - ${name}${requiredFlag}: ${paramDesc}`;
  });

  if (params.length > 0) {
    paramsStr = `\n  Parameters:\n${params.join("\n")}`;
  }

  return `  - ${tool.name}: ${tool.description || "No description"}${paramsStr}`;
}

function buildLLMPrompt(serverInfo: ServerInfo): string {
  const toolsList = serverInfo.tools.map(formatToolForPrompt).join("\n\n");

  return `Write SKILL.md for MCP server.

# ${serverInfo.name}
${serverInfo.description || ""}

## Tools
${toolsList}

- No tool calls
- Markdown only
- No explanations
- thinking using <think> tags`;
}

export async function generateLLMSkill(
  serverInfo: ServerInfo,
  config: LLMConfig
): Promise<string> {
  const model = getModel(config.provider, config.model);
  const prompt = buildLLMPrompt(serverInfo);

  // Use OpenAI-compatible API for minimax, kimi, and openai
  // For others, we need their specific SDKs (not yet implemented)
  const baseURLs: Record<LLMProvider, string | undefined> = {
    openai: "https://api.openai.com/v1",
    anthropic: undefined,
    minimax: "https://api.minimax.chat/v1",
    kimi: "https://api.moonshot.cn/v1",
    google: undefined,
    azure: "https://your-resource.openai.azure.com",
  };

  const baseURL = baseURLs[config.provider];

  if (!baseURL) {
    throw new Error(`Provider ${config.provider} is not supported yet. Use openai, minimax, or kimi.`);
  }

  // Dynamically import OpenAI SDK
  const { OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL,
  });

  // reasoning_effort only supported by OpenAI
  const supportsReasoningEffort = config.provider === "openai";

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    ...(supportsReasoningEffort && { reasoning_effort: "none" }),
  });

  let content = response.choices[0]?.message?.content || "";
  
  // Strip thinking tags if present (<think> used by MiniMax/Kimi, <thinking> used by others)
  content = content.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/g, "").trim();
  
  return content;
}

// Helper to get LLM config from environment or config file
export interface LLMConfigOptions {
  provider?: LLMProvider;
  apiKey?: string;
  model?: string;
  configFile?: CoreLLMConfig;
}

export function getLLMConfig(options: LLMConfigOptions): LLMConfig | null {
  // Priority: CLI options > config file > environment variables

  // 1. Check CLI options first
  if (options.provider && options.apiKey) {
    return {
      provider: options.provider,
      apiKey: options.apiKey,
      model: options.model,
    };
  }

  // 2. Check config file
  if (options.configFile) {
    return {
      provider: options.configFile.provider,
      apiKey: options.configFile.apiKey,
      model: options.configFile.model || options.model,
    };
  }

  // 3. Check environment variables
  const provider = options.provider || (process.env.LLM_PROVIDER as LLMProvider) || null;
  const apiKey = options.apiKey || process.env.LLM_API_KEY || null;

  if (!provider || !apiKey) {
    return null;
  }

  return {
    provider,
    apiKey,
    model: options.model || process.env.LLM_MODEL || undefined,
  };
}
