import { loadConfig, ClientPool } from "@envoy/core";

export async function infoCommand(
  target?: string,
  configPath?: string
) {
  const config = loadConfig(configPath);
  const pool = new ClientPool(config);

  // If no target, show all servers
  if (!target) {
    const servers = pool.listServers();
    console.log("Configured servers:");
    for (const name of servers) {
      const info = pool.getServerInfo(name);
      console.log(`  - ${name}`);
    }
    pool.close();
    return;
  }

  // Parse server/tool or just server
  let serverName: string;
  let toolName: string | undefined;

  if (target.includes("/")) {
    [serverName, toolName] = target.split("/");
  } else {
    serverName = target;
  }

  const info = pool.getServerInfo(serverName);
  if (!info) {
    console.error(`Server "${serverName}" not found.`);
    pool.close();
    process.exit(1);
  }

  // If tool specified, show tool details
  if (toolName) {
    const tools = await pool.discoverTools(serverName);
    const tool = tools.find(t => t.name === toolName);

    if (!tool) {
      console.error(`Tool "${toolName}" not found on server "${serverName}".`);
      console.error(`Available tools: ${tools.map(t => t.name).join(", ")}`);
      pool.close();
      process.exit(1);
    }

    console.log(`Server: ${serverName}`);
    console.log(`Tool: ${tool.name}`);
    console.log(`\nDescription: ${tool.description || "No description"}`);

    if (tool.inputSchema?.properties) {
      const props = tool.inputSchema.properties as Record<string, { description?: string; type?: string }>;
      const required = tool.inputSchema.required as string[] | undefined;

      console.log("\nParameters:");
      for (const [name, info] of Object.entries(props)) {
        const isRequired = required?.includes(name);
        console.log(`  - ${name}${isRequired ? " (required)" : ""}: ${info.type || "any"}`);
        if (info.description) {
          console.log(`    ${info.description}`);
        }
      }
    }

    console.log(`\nUsage:`);
    console.log(`  envoy call ${serverName}/${tool.name} '<params>'`);
    console.log(`  envoy call ${serverName}/${tool.name} '{"${Object.keys(tool.inputSchema?.properties || {}).join('": "', '": "')}"...}'`);

    pool.close(serverName);

    // Force exit to ensure process terminates
    setTimeout(() => process.exit(0), 100);
    return;
  }

  // Show server info and list tools
  console.log(`Server: ${serverName}`);
  if (info.command) {
    console.log(`Command: ${info.command} ${info.args?.join(" ") || ""}`);
  } else if (info.url) {
    console.log(`URL: ${info.url}`);
  }

  const tools = await pool.discoverTools(serverName);
  console.log(`\nAvailable tools (${tools.length}):`);
  for (const tool of tools) {
    console.log(`  - ${tool.name}`);
    if (tool.description) {
      const firstLine = tool.description.split("\n")[0].slice(0, 60);
      console.log(`    ${firstLine}`);
    }
  }

  pool.close(serverName);

  // Force exit to ensure process terminates
  setTimeout(() => process.exit(0), 100);
}
