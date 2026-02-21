import { loadConfig, ClientPool } from "@envoy/core";

interface Tool {
  name: string;
  description?: string;
}

export async function grepCommand(
  pattern: string,
  configPath?: string
) {
  const config = loadConfig(configPath);
  const pool = new ClientPool(config);

  const servers = pool.listServers();
  const matches: { server: string; tool: string }[] = [];

  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  const regex = new RegExp(`^${regexPattern}$`);

  for (const serverName of servers) {
    const client = pool.getClient(serverName);
    if (!client) continue;

    try {
      const result = await client.call("tools/list") as { tools?: Tool[] };
      const tools = result.tools || [];

      for (const tool of tools) {
        if (regex.test(tool.name)) {
          matches.push({
            server: serverName,
            tool: tool.name,
          });
        }
      }
    } catch (error) {
      console.error(`Error listing tools for ${serverName}:`, error);
    } finally {
      pool.close(serverName);
    }
  }

  // Force exit to ensure process terminates
  setTimeout(() => process.exit(0), 100);

  if (matches.length === 0) {
    console.log("No matching tools found.");
    return;
  }

  // Output format: server/tool
  for (const match of matches) {
    console.log(`${match.server}/${match.tool}`);
  }
}
