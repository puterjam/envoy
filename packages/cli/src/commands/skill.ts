import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { loadConfig } from "@envoy/core";
import { getServerInfo, generateClaudeSkill, generateLLMSkill, getLLMConfig, type LLMProvider } from "@envoy/skill-generator";

type AgentType = "claude" | "opencode" | "openclaw" | "llm";
type LocationType = "user" | "project";

export async function skillCommand(
  action: string,
  serverName: string,
  agentType?: string,
  configPath?: string,
  location?: LocationType,
  customPath?: string,
  llmProvider?: LLMProvider,
  llmApiKey?: string,
  llmModel?: string
) {
  if (action !== "generate") {
    console.error(`Unknown action: ${action}`);
    console.error("Usage: envoy skill generate <server-name> [agent] [--user|--project|--path <path>]");
    console.error("  agent: claude (default), opencode, openclaw");
    console.error("  --user: Save to ~/.claude/skills/<name>/SKILL.md");
    console.error("  --project: Save to .claude/skills/<name>/SKILL.md (current directory)");
    console.error("  --path <path>: Save to custom path");
    process.exit(1);
  }

  // Load config first to check LLM settings
  const config = loadConfig(configPath);

  // Determine agent type:
  // - If explicitly specified, use that
  // - If not specified and LLM is configured, default to llm
  // - Otherwise default to claude
  let agent = (agentType as AgentType);
  if (!agent) {
    if (config.llm || process.env.LLM_PROVIDER) {
      agent = "llm";
    } else {
      agent = "claude";
    }
  }

  // Get server info
  const serverInfo = await getServerInfo(serverName, configPath);

  if (!serverInfo) {
    console.error(`Server "${serverName}" not found or failed to connect.`);
    process.exit(1);
  }

  // Generate skill content
  let content: string;

  switch (agent) {
    case "claude":
      content = generateClaudeSkill(serverInfo);
      break;
    case "llm": {
      // Try to get LLM config from options, config file, or environment
      const llmConfig = getLLMConfig({
        provider: llmProvider,
        apiKey: llmApiKey,
        model: llmModel,
        configFile: config.llm,
      });

      if (!llmConfig) {
        console.error("LLM provider not configured.");
        console.error("Configure in ~/.config/envoy/servers.json:");
        console.error(`{
  "llm": {
    "provider": "openai",
    "apiKey": "your-api-key",
    "model": "gpt-4o"
  }
}`);
        console.error("Or set LLM_PROVIDER and LLM_API_KEY environment variables.");
        console.error("Or use --llm-provider and --llm-key flags.");
        process.exit(1);
      }

      console.log(`[LLM] Generating skill for "${serverInfo.name}" with ${llmConfig.provider}...`);
      console.log(`[LLM] Tools: ${serverInfo.tools.map((t: any) => t.name).join(', ')}`);
      content = await generateLLMSkill(serverInfo, llmConfig);
      break;
    }
    default:
      console.error(`Unsupported agent type: ${agent}`);
      process.exit(1);
  }

  console.log("Generated skill:");
  console.log("---");
  console.log(content);
  console.log("---");

  // Determine skill path
  let skillPath: string;

  if (customPath) {
    skillPath = customPath;
  } else {
    const loc = location || "user";
    switch (loc) {
      case "user":
        skillPath = join(homedir(), ".claude", "skills", serverName, "SKILL.md");
        break;
      case "project":
        skillPath = join(process.cwd(), ".claude", "skills", serverName, "SKILL.md");
        break;
    }
  }

  console.log(`\nSkill will be saved to: ${skillPath}`);

  // Write the file
  const dir = join(skillPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(skillPath, content);
  console.log(`Skill saved!`);

  // Force exit to ensure process terminates
  setTimeout(() => process.exit(0), 100);
}
