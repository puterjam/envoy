#!/usr/bin/env bun

import {
  listCommand,
  infoCommand,
  callCommand,
  grepCommand,
  addCommand,
  removeCommand,
  skillCommand,
} from "@envoy/cli";
import { startServer } from "./server.js";

const args = process.argv.slice(2);
const command = args[0];

function getConfigPath(args: string[]): string | undefined {
  const configIndex = args.indexOf("--config");
  return configIndex !== -1 ? args[configIndex + 1] : undefined;
}

async function main() {
  switch (command) {
    case "list": {
      await listCommand(getConfigPath(args));
      break;
    }

    case "info": {
      const target = args[1];
      // Allow no args to list all servers, or server name, or server/tool
      await infoCommand(target, getConfigPath(args));
      break;
    }

    case "call": {
      const target = args[1];
      const params = args[2];

      if (!target) {
        console.error(
          "Usage: envoy call <server/tool> [params-json] [--config <path>]"
        );
        console.error("Example: envoy call filesystem/read_file '{\"path\": \".\"}'");
        process.exit(1);
      }

      await callCommand(target, params, getConfigPath(args));
      break;
    }

    case "grep": {
      const pattern = args[1];

      if (!pattern) {
        console.error("Usage: envoy grep <pattern> [--config <path>]");
        process.exit(1);
      }

      await grepCommand(pattern, getConfigPath(args));
      break;
    }

    case "add": {
      const serverName = args[1];
      const source = args[2];

      if (!serverName || !source) {
        console.error("Usage: envoy add <server-name> <source> [--config <path>]");
        console.error("  source: URL, npx command, uvx command, or JSON config");
        process.exit(1);
      }

      await addCommand(serverName, source, getConfigPath(args));
      break;
    }

    case "remove":
    case "rm": {
      const serverName = args[1];

      if (!serverName) {
        console.error("Usage: envoy remove <server-name> [--config <path>]");
        process.exit(1);
      }

      await removeCommand(serverName, getConfigPath(args));
      break;
    }

    case "skill": {
      const action = args[1];
      const serverName = args[2];
      let agentType = args[3];

      // Parse additional options
      let location: "user" | "project" | undefined;
      let customPath: string | undefined;
      let llmProvider: string | undefined;
      let llmApiKey: string | undefined;
      let llmModel: string | undefined;
      let preview = false;

      // Check if agentType is actually an option (starts with --)
      if (agentType && agentType.startsWith("--")) {
        // No agent type specified, treat as option
        if (agentType === "--preview") {
          preview = true;
        }
        agentType = undefined;
      }

      let startIndex = 4;
      if (!agentType && args[4] && !args[4].startsWith("--")) {
        // Agent type is at position 4
        agentType = args[4];
        startIndex = 5;
      }

      for (let i = startIndex; i < args.length; i++) {
        if (args[i] === "--user") {
          location = "user";
        } else if (args[i] === "--project") {
          location = "project";
        } else if (args[i] === "--path" && args[i + 1]) {
          customPath = args[i + 1];
          i++;
        } else if (args[i] === "--llm-provider" && args[i + 1]) {
          llmProvider = args[i + 1];
          i++;
        } else if (args[i] === "--llm-key" && args[i + 1]) {
          llmApiKey = args[i + 1];
          i++;
        } else if (args[i] === "--llm-model" && args[i + 1]) {
          llmModel = args[i + 1];
          i++;
        } else if (args[i] === "--preview") {
          preview = true;
        }
      }

      if (!action || action === "help") {
        console.log(`Usage: envoy skill <action> [options]

Actions:
  generate <server-name> [agent] [options]  Generate skill for server

Arguments:
  server-name: Name of the MCP server
  agent: claude (default), llm (auto-detected if LLM configured)

Options:
  --user            Save to ~/.claude/skills/<name>/SKILL.md (default)
  --project         Save to .claude/skills/<name>/SKILL.md (current directory)
  --path <path>     Save to custom path
  --config <path>  Path to config file
  --llm-provider    LLM provider: openai, anthropic, minimax, kimi, google
  --llm-key <key>  LLM API key (or set LLM_API_KEY env var)
  --llm-model <model>  LLM model (optional, provider-specific default)
  --preview        Preview only, do not write to file

Examples:
  envoy skill generate filesystem claude
  envoy skill generate minimax llm
  envoy skill generate myserver llm --llm-provider openai --llm-key xxx
  envoy skill generate myserver --preview

LLM Config (in ~/.config/envoy/servers.json):
{
  "llm": {
    "provider": "openai",
    "apiKey": "your-api-key",
    "model": "gpt-4o"
  }
}
`);
        process.exit(action ? 1 : 0);
      }

      if (action === "generate") {
        if (!serverName) {
          console.error("Usage: envoy skill generate <server-name> [agent] [--user|--project|--path <path>] [--preview]");
          process.exit(1);
        }
        await skillCommand(action, serverName, agentType, getConfigPath(args), location, customPath, llmProvider as any, llmApiKey, llmModel, preview);
      } else {
        console.error(`Unknown skill action: ${action}`);
        process.exit(1);
      }
      break;
    }

    case "serve":
    case "server": {
      startServer(args.slice(1));
      break;
    }

    case "tui": {
      console.log("TUI not implemented yet. Use CLI commands instead.");
      process.exit(1);
      break;
    }

    default: {
      console.log(`Usage: envoy <command> [options]

Commands:
  list                         List configured MCP servers
  info <server-name>          Show server configuration
  call <server/tool> [params-json]        Call a tool on a server
  grep <pattern>               Search tools (supports glob: *, ?)
  add <server-name> <source>   Add MCP server
  remove <server-name>        Remove MCP server
  skill generate <server> [agent]  Generate skill for agent (claude, opencode, openclaw)
  serve                       Start in server mode (for Claude Code)
  tui                         Start TUI (not implemented)

Options:
  --config <path>             Path to config file (default: ~/.config/envoy/servers.json)
`);
      process.exit(command ? 1 : 0);
    }
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
