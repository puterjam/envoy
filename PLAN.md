# Envoy 项目计划

## 项目名称

**envoy** — 使者

桥接 Agent 与 MCP 工具能力，通过 Dynamic Context Discovery 优化 token 使用，同时提供 TUI 管理界面和 Skill 自动生成功能。

---

## 目标用户

1. **AI Agent 用户** (主要): 通过 CLI 调用 MCP servers，减少 context token
2. **开发者**: 管理本地 MCP servers，测试工具功能
3. **Agent 配置者**: 快速生成 Claude/OpenCode 等 Agent 的 skill 配置

---

## 核心功能

### 1. CLI 功能 (Agent 调用)

**Dynamic Context Discovery 工作流程** (3步按需发现):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  INITIALIZATION (Low Cost)                                                  │
│  0 TOOLS LOADED                                                             │
│  ~400 TOKENS (System Prompt)                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DYNAMIC DISCOVERY LOOP                                                     │
│                                                                             │
│  Step 1: Discovery                                                          │
│  $ envoy grep "*file*"                                                    │
│  → filesystem/read_file, filesystem/list_directory...                       │
│                                                                             │
│  Step 2: Inspection                                                         │
│  $ envoy info filesystem/read_file                                        │
│  → Input Schema (JSON): { path: string, encoding?: string }                 │
│                                                                             │
│  Step 3: Execution                                                          │
│  $ envoy call filesystem/read_file '{"path": "README.md"}'                │
│  → File Content                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Token 对比**:
- 传统方式: 6 servers × 10 tools × 完整 schema = **~47,000 tokens**
- Dynamic Discovery: 按需加载 = **~400-600 tokens** (节省 99%)

| 命令 | 功能 | Token 占用 | 使用场景 |
|------|------|-----------|---------|
| `envoy grep "<pattern>"` | 搜索 tools (支持 glob) | ~50 tokens | **Step 1**: 发现需要的 tool |
| `envoy info <server>/<tool>` | 获取 tool 完整 schema | ~150 tokens | **Step 2**: 查看参数要求 |
| `envoy call <server>/<tool> '<json>'` | 执行 tool 调用 | - | **Step 3**: 执行操作 |
| `envoy list` | 列出所有 servers 和 tools | ~50 tokens | 概览查看 |
| `envoy add <source>` | 添加 MCP server | - | 配置管理 |
| `envoy remove <server>` | 删除 MCP server | - | 配置管理 |
| `envoy skill generate <server>` | 生成 Agent skill | - | 配置导出 |

**命令格式说明**:
- Tool 路径格式: `<server>/<tool>` 或 `<server> <tool>` 两者兼容
- 参数传递: JSON 字符串或 stdin (`echo '{}' | envoy call server tool`)
- 支持管道: 输出可作为下一个命令的输入

### 2. TUI 功能 (管理界面)

基于 OpenTUI React，采用 Persona UI 风格的双栏布局设计：

**界面设计参考**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│ MCP CLI Manager                                          [Connected: 3] │
├──────────────────────────┬──────────────────────────────────────────────┤
│ ▶ filesystem    ●        │ Server: filesystem                            │
│   github        ●        │ Type: stdio                                   │
│   postgres      ○        │ Status: ● Running                             │
│                          │ Tools: 5                                      │
│                          │                                              │
│                          │ Tools:                                       │
│                          │   • read_file                                │
│                          │   • write_file                               │
│                          │   • list_directory                           │
│                          │   • search_files                             │
│                          │   • get_file_info                            │
│                          │                                              │
│                          │ [t] Test  [g] Generate Skill  [e] Edit      │
│                          │                                              │
└──────────────────────────┴──────────────────────────────────────────────┘
↑↓ Navigate | enter Select | a Add | e Edit | d Delete | t Test | g Generate | q Quit
```

**设计特点** (参考 Persona UI):
- **左侧列表栏**: 显示所有 MCP servers，当前选中项高亮显示 (红/橙色背景)
- **右侧详情栏**: 显示选中 server 的完整信息 (类型、状态、tools 列表)
- **底部状态栏**: 快捷键提示 (↑↓ navigate, a/e/d add/edit/del, t test, g generate, q quit)
- **状态指示器**: ● 运行中, ○ 停止, ✗ 错误

**主要界面**:

1. **主界面** (`envoy tui` 或 `envoy`)
   - 双栏布局: 左侧 servers 列表, 右侧详情
   - 支持键盘导航 (↑↓), Enter 选中
   - 快捷键: a/e/d/t/g/q

2. **Tool 测试界面** (按 `t` 进入)
   - 选择 tool → 显示交互式参数表单
   - 执行测试 → 显示结果
   - 支持保存测试用例

3. **Skill 生成器** (按 `g` 进入)
   - 选择 target agent (Claude/OpenCode/OpenClaw)
   - 预览生成的 skill 内容
   - 一键写入到对应 Agent 配置目录

4. **配置编辑界面** (按 `e` 进入)
   - 表单方式编辑 server 配置
   - tool 过滤规则 (allowedTools/disabledTools)
   - 导入/导出配置

**交互模式**:
- Vim-like 快捷键导航
- 模态对话框 (添加/编辑/删除确认)
- 实时状态更新 (server 连接状态)

### 3. Skill 自动生成功能

**输入**: MCP server 的 tools schema
**输出**: Agent-specific skill 文件

**支持的目标 Agent**:
- **Claude Code**: `.claude/skills/{server-name}/SKILL.md`
- **OpenCode**: `.opencode/skills/{server-name}/SKILL.md`
- **OpenClaw**: `.openclaw/skills/{server-name}/SKILL.md`
- **Generic**: JSON/YAML 格式

**生成逻辑**:
1. 解析 MCP server tools schema
2. 使用 LLM (OpenAI/Anthropic) 生成自然语言描述
3. 按目标 Agent 格式组装 skill 文件
4. 写入到对应目录

---

## 技术架构

### Monorepo 结构

```
envoy/
├── package.json                    # Root workspace config
├── bun.lockb
├── README.md
├── PLAN.md                         # 本文档
├── packages/
│   ├── core/                       # MCP 核心逻辑
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── client.ts          # MCP client 封装
│   │   │   ├── pool.ts            # Connection pooling
│   │   │   ├── config.ts          # 配置管理
│   │   │   ├── discovery.ts       # Dynamic discovery 逻辑
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   │
│   ├── cli/                        # CLI 命令行工具
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── list.ts
│   │   │   │   ├── info.ts
│   │   │   │   ├── call.ts
│   │   │   │   ├── grep.ts
│   │   │   │   ├── add.ts
│   │   │   │   ├── remove.ts
│   │   │   │   └── skill.ts
│   │   │   ├── index.ts
│   │   │   └── utils.ts
│   │   └── tsconfig.json
│   │
│   ├── tui/                        # TUI 界面
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── App.tsx
│   │   │   │   ├── ServerList.tsx
│   │   │   │   ├── ServerDetail.tsx
│   │   │   │   ├── ToolTester.tsx
│   │   │   │   └── SkillGenerator.tsx
│   │   │   ├── hooks/
│   │   │   ├── stores/
│   │   │   ├── index.tsx
│   │   │   └── cli.ts             # TUI 入口
│   │   └── tsconfig.json
│   │
│   └── skill-generator/            # Skill 生成器
│       ├── package.json
│       ├── src/
│       │   ├── generators/
│       │   │   ├── claude.ts
│       │   │   ├── opencode.ts
│       │   │   ├── openclaw.ts
│       │   │   └── generic.ts
│       │   ├── llm.ts             # LLM 调用封装
│       │   ├── index.ts
│       │   └── templates/
│       └── tsconfig.json
│
├── apps/
│   └── envoy/                    # 主入口包
│       ├── package.json
│       ├── src/
│       │   └── index.ts           # 统一入口，分发到 cli/tui
│       └── bin/
│           └── envoy            # 可执行脚本
│
└── examples/
    ├── mcp-servers.json           # 示例配置
    └── skills/                    # 示例生成的 skills
```

### 依赖关系

```
cli ──→ core
     ──→ skill-generator (for skill command)

tui ──→ core
     ──→ skill-generator

envoy (entry) ──→ cli
               ──→ tui
```

---

## 关键技术点

### 1. Dynamic Context Discovery 实现

**核心原则**: 按需发现，只返回 Agent 需要的最小信息

**工作流程**:
```
User Request
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ AI Agent                                            │
│  ┌──────────────────────────────────────────────┐  │
│  │ System Prompt (~400 tokens)                  │  │
│  │ - MCP CLI commands reference                 │  │
│  │ - No tool schemas loaded                     │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
     │
     │ Step 1: Discovery
     │ $ envoy grep "*file*"
     ▼
┌─────────────────────────────────────────────────────┐
│ OS / envoy                                        │
│  - Query all MCP servers                            │
│  - Return matching tool names only                  │
└─────────────────────────────────────────────────────┘
     │
     │ Output: filesystem/read_file, filesystem/list_directory
     │ (~50 tokens)
     ▼
     │ Step 2: Inspection
     │ $ envoy info filesystem/read_file
     ▼
┌─────────────────────────────────────────────────────┐
│ OS / envoy                                        │
│  - Get specific tool schema                         │
│  - Return full input schema                         │
└─────────────────────────────────────────────────────┘
     │
     │ Output: { path: string, encoding?: string }
     │ (~150 tokens)
     ▼
     │ Step 3: Execution
     │ $ envoy call filesystem/read_file '{"path": "README.md"}'
     ▼
┌─────────────────────────────────────────────────────┐
│ MCP Server                                          │
│  - Execute tool                                     │
│  - Return result                                    │
└─────────────────────────────────────────────────────┘
     │
     ▼
  Final Answer
```

**数据结构**:
```typescript
// grep/list 命令输出 (极简, ~50 tokens)
interface DiscoveryOutput {
  matches: {
    server: string;
    tool: string;
  }[];
}
// Example: ["filesystem/read_file", "filesystem/list_directory"]

// info 命令输出 (按需 schema, ~150 tokens)
interface ToolInfoOutput {
  name: string;
  description: string;
  inputSchema: JSONSchema;  // 完整的 JSON Schema
  examples?: string[];
}

// call 命令输出
interface CallOutput {
  success: boolean;
  result?: any;
  error?: string;
}
```

**Token 对比**:
| 场景 | 传统方式 | Dynamic Discovery | 节省 |
|------|---------|------------------|------|
| 初始化 | 47k tokens | 400 tokens | 99% |
| 单次调用 | 47k + output | 400 + 50 + 150 + output | 98% |

**优势**:
- 支持更多 MCP servers (不受 context limit 限制)
- 减少 API 调用成本
- 更快的响应速度 (无需加载大量 schema)
- 更清晰的 Agent 推理 (专注于当前 task)

### 2. Bun + TS 实现 MCP Stdio 模式

**核心思路**: 用 Bun 原生能力运行 stdio MCP server，无需 uvx/npx

**MCP 协议**: JSON-RPC 2.0 over stdio

```typescript
// 启动 stdio MCP server
const proc = Bun.spawn(["npx", "-y", "@modelcontextprotocol/server-filesystem", "."], {
  stdout: "pipe",
  stdin: "pipe",
  stderr: "pipe",
  env: { ...userEnv }
});

// MCP 通信流程
// 1. Initialize
const initRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "envoy", version: "0.1.0" }
  }
};
proc.stdin.write(JSON.stringify(initRequest) + "\n");

// 2. 解析响应获取 capabilities
const initResponse = await readJsonRpc(proc.stdout);
// → { capabilities: { tools: {} }, serverInfo: { ... } }

// 3. tools/list - 获取工具列表
const listRequest = {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {}
};

// 4. tools/call - 调用工具
const callRequest = {
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: {
    name: "read_file",
    arguments: { path: "README.md" }
  }
};
```

**支持的方式**:
| 配置类型 | 命令示例 | 说明 |
|---------|---------|------|
| npx | `["npx", "-y", "@modelcontextprotocol/server-filesystem", "."]` | Node.js 包 |
| uvx | `["uvx", "minimax-coding-plan-mcp", "-y"]` | Python 包 |
| python | `["python", "-m", "mcp_server"]` | 直接运行 Python 模块 |
| bunx | `["bunx", "@modelcontextprotocol/server-filesystem"]` | Bun 包 |

**测试用 MCP Server**:
```json
{
  "servers": {
    "minimax": {
      "type": "stdio",
      "command": "uvx",
      "args": ["minimax-coding-plan-mcp", "-y"],
      "env": {
        "MINIMAX_API_KEY": "${MINIMAX_API_KEY}",
        "MINIMAX_API_HOST": "https://api.minimaxi.com"
      }
    }
  }
}
```

**优势**:
- 纯 Bun/TS 实现，无额外运行时依赖
- 支持任意命令行启动的 MCP server
- 继承 Bun 的高性能和原生 TypeScript 支持

### 3. Connection Pooling

实现类似 phil schmid 版本的连接池:
- Lazy spawn: 首次调用时才启动 server
- 60s idle timeout: 空闲自动关闭
- Stale detection: 配置变更时重启

### 4. Skill 生成 Prompt

```
你是一个专业的 AI Agent 技能描述生成器。

给定 MCP server 的 tool schemas，请生成适合 {agent_type} 的 skill 描述。

输入:
- Server name: {name}
- Tools: {tools}

要求:
1. 用自然语言描述 server 的用途
2. 列出可用 tools 及使用场景
3. 提供 2-3 个使用示例
4. 遵循 {agent_type} 的 skill 格式规范

输出格式: Markdown skill file
```

---

## 开发里程碑

### Phase 1: Core + CLI (Week 1-2)
- [ ] 项目脚手架搭建 (Bun workspace)
- [ ] Core package: MCP client, config, pooling
- [ ] CLI package: list, info, call, grep, add, remove
- [ ] 集成测试: 连接 MiniMax MCP server (使用 MINIMAX_API_KEY)

### Phase 2: TUI (Week 3)
- [ ] OpenTUI React 环境配置
- [ ] Server 列表和详情界面
- [ ] Tool 测试界面
- [ ] 配置管理界面

### Phase 3: Skill Generator (Week 4)
- [ ] Skill generator package
- [ ] Claude/OpenCode/OpenClaw 模板
- [ ] LLM 集成 (支持多种 provider)
- [ ] CLI skill 命令
- [ ] TUI skill 生成器界面

### Phase 4: Polish (Week 5)
- [ ] 文档和示例
- [ ] 错误处理和边界情况
- [ ] 性能优化
- [ ] 发布准备

---

## 配置设计

### 配置文件: `~/.config/envoy/servers.json`

```json
{
  "version": "1.0",
  "servers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "allowedTools": ["read_*", "list_*"],
      "disabledTools": ["delete_*"],
      "env": {}
    },
    "github": {
      "type": "http",
      "url": "https://api.github.com/mcp",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      }
    }
  },
  "settings": {
    "poolTimeout": 60,
    "defaultSkillAgent": "claude"
  }
}
```

### 环境变量

```bash
# CLI 行为
MCP_NO_DAEMON=1              # 禁用连接池
MCP_DAEMON_TIMEOUT=120       # 连接池超时
MCP_CONFIG_PATH=...          # 自定义配置路径

# Skill 生成
MCP_LLM_PROVIDER=openai      # openai | anthropic | ollama
MCP_LLM_API_KEY=...
MCP_LLM_MODEL=gpt-4
```

---

## 竞品分析

| 工具 | 优点 | 缺点 | 我们的差异 |
|------|------|------|-----------|
| [phil schmid/envoy](https://github.com/philschmid/envoy) | Dynamic discovery, 轻量 | 无 TUI, 无 skill 生成 | +TUI +Skill 生成 |
| [envoy](https://github.com/wong2/envoy) | Python, 功能全 | 无 Dynamic discovery | Token 优化 |
| [mcp-manager](https://github.com/modelcontextprotocol/mcp-manager) | 官方, 稳定 | 无 CLI, 无 skill 生成 | CLI + TUI + Skill |

---

## 待决策事项

1. **✅ TUI 框架**: OpenTUI React (已确定)
2. **LLM Provider**: 默认 OpenAI？支持哪些？
   - OpenAI (GPT-4/GPT-4o)
   - Anthropic (Claude)
   - Ollama (本地)
   - 其他 (Gemini, DeepSeek?)
3. **配置格式**: JSON vs YAML vs TOML？
4. **Skill 生成**: 本地 LLM (Ollama) 是否必须支持？
5. **发布渠道**: npm registry? GitHub releases? Homebrew? Bun 直接 install?

---

## 成功指标

- [ ] CLI 支持所有核心命令
- [ ] Token 使用减少 95%+
- [ ] TUI 支持完整的 server 管理
- [ ] 支持 3+ Agent 的 skill 生成
- [ ] 测试覆盖率 > 80%
- [ ] 文档完整，有示例

---

*计划创建时间: 2025-02-20*
*版本: v0.1.0-plan*
