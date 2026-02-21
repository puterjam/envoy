import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { loadConfig, MCPConfig } from "@envoy/core";

function getConfigPath(): string {
  return join(homedir(), ".config", "envoy", "servers.json");
}

export async function removeCommand(
  serverName: string,
  configPath?: string
) {
  const path = configPath || getConfigPath();

  if (!existsSync(path)) {
    console.error("Config file not found.");
    process.exit(1);
  }

  const config = loadConfig(path);

  if (!config.mcpServers[serverName]) {
    console.error(`Server "${serverName}" not found.`);
    process.exit(1);
  }

  delete config.mcpServers[serverName];

  writeFileSync(path, JSON.stringify(config, null, 2));

  console.log(`Removed server "${serverName}" from ${path}`);
}
