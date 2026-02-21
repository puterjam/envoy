import { loadConfig, ClientPool, type Tool } from "@envoy/core";

interface ServerInfo {
  name: string;
  description?: string;
  tools: Tool[];
}

export type { ServerInfo, Tool };

interface InitializeResult {
  serverInfo?: {
    name?: string;
    version?: string;
  };
}

export async function getServerInfo(
  serverName: string,
  configPath?: string
): Promise<ServerInfo | null> {
  const config = loadConfig(configPath);
  const pool = new ClientPool(config);

  const serverInfo = pool.getServerInfo(serverName);
  if (!serverInfo) {
    return null;
  }

  const client = pool.getClient(serverName);
  if (!client) {
    return null;
  }

  try {
    let description: string | undefined;
    try {
      const initResult = await client.call("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "envoy", version: "0.0.1" },
      }) as InitializeResult;
      description = initResult?.serverInfo?.name;
    } catch {
      // initialize not required by all servers, ignore failure
    }

    const result = await client.call("tools/list") as { tools?: Tool[] };
    return {
      name: serverName,
      description,
      tools: result.tools || [],
    };
  } catch (error) {
    console.error(`Error getting server info for ${serverName}:`, error);
    return null;
  } finally {
    pool.close(serverName);
  }
}
