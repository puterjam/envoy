import { loadConfig, ClientPool } from "@envoy/core";

export async function callCommand(
  target: string,
  params?: string,
  configPath?: string
) {
  const config = loadConfig(configPath);
  const pool = new ClientPool(config);

  // Support both formats:
  // 1. server/method (e.g., filesystem/read_file)
  // 2. server method (e.g., filesystem read_file)
  let serverName: string;
  let method: string;

  if (target.includes("/")) {
    [serverName, method] = target.split("/");
  } else {
    console.error("Usage: envoy call <server/tool> [params-json] [--config <path>]");
    console.error("Example: envoy call filesystem/read_file '{\"path\": \".\"}'");
    process.exit(1);
  }

  const client = pool.getClient(serverName);

  if (!client) {
    console.error(`Server "${serverName}" not found.`);
    process.exit(1);
  }

  let parsedParams: Record<string, unknown> | undefined;

  if (params) {
    try {
      parsedParams = JSON.parse(params);
    } catch (error) {
      console.error("Invalid JSON params:", error);
      process.exit(1);
    }
  }

  try {
    // Check if calling a tool (not a JSON-RPC method)
    // MCP tools should be called via "tools/call" method
    const result = await client.callTool(method, parsedParams);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error calling method:", error);
    process.exit(1);
  } finally {
    pool.close(serverName);
    // Force exit to ensure process terminates
    setTimeout(() => process.exit(0), 100);
  }
}
