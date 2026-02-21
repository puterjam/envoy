import { loadConfig, ClientPool } from "@envoy/core";

export async function listCommand(configPath?: string) {
  const config = loadConfig(configPath);
  const pool = new ClientPool(config);

  const servers = pool.listServers();

  if (servers.length === 0) {
    console.log("No servers configured.");
    pool.close();
    return;
  }

  console.log("Configured MCP servers:");
  for (const name of servers) {
    const info = pool.getServerInfo(name);
    if (info) {
      if (info.url) {
        console.log(`  - ${name}: ${info.url}`);
      } else if (info.command) {
        console.log(`  - ${name}: ${info.command} ${info.args?.join(" ") || ""}`);
      }
    }
  }

  pool.close();

  // Force exit to ensure process terminates
  setTimeout(() => process.exit(0), 100);
}
