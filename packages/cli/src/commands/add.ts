import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { loadConfig, MCPServer, MCPConfig } from "@envoy/core";

function getConfigPath(): string {
  return join(homedir(), ".config", "envoy", "servers.json");
}

function ensureConfigDir(): string {
  const dir = join(homedir(), ".config", "envoy");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export async function addCommand(
  serverName: string,
  source: string,
  configPath?: string
) {
  const path = configPath || getConfigPath();
  const config = loadConfig(path);

  // Parse source - could be:
  // 1. URL: https://...
  // 2. npx command: npx -y @some/mcp-server
  // 3. uvx command: uvx some-mcp
  // 4. JSON: {"command": "...", "args": [...]}

  let server: MCPServer;

  if (source.startsWith("http://") || source.startsWith("https://")) {
    // HTTP server
    server = {
      url: source,
    };
  } else if (source.startsWith("npx") || source.startsWith("npx ")) {
    // npx command
    const args = source.split(" ").slice(1);
    server = {
      command: "npx",
      args,
    };
  } else if (source.startsWith("uvx") || source.startsWith("uvx ")) {
    // uvx command
    const args = source.split(" ").slice(1);
    server = {
      command: "uvx",
      args,
    };
  } else if (source.startsWith("bunx") || source.startsWith("bunx ")) {
    // bunx command
    const args = source.split(" ").slice(1);
    server = {
      command: "bunx",
      args,
    };
  } else if (source.startsWith("{")) {
    // JSON config
    try {
      server = JSON.parse(source) as MCPServer;
    } catch {
      console.error("Invalid JSON config");
      process.exit(1);
    }
  } else {
    // Assume it's a command with args
    const parts = source.split(" ");
    server = {
      command: parts[0],
      args: parts.slice(1),
    };
  }

  // Add to config
  config.mcpServers[serverName] = server;

  // Ensure directory exists
  ensureConfigDir();

  // Save config
  writeFileSync(path, JSON.stringify(config, null, 2));

  console.log(`Added server "${serverName}" to ${path}`);
}
