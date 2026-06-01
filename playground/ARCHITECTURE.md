# BPL Playground Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Monaco Editor (Code Editing)                              │  │
│  │ - BPL Syntax Highlighting                                 │  │
│  │ - Real-time Editing                                       │  │
│  │ - Auto-formatting                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓ ↑                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Stats Dashboard (Live Updates)                            │  │
│  │ - Server Status: Online/Offline                           │  │
│  │ - Compilation Count: Success/Total                        │  │
│  │ - Average Time: XXms                                      │  │
│  │ - Auto-refresh every 5s                                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓ ↑                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Output Panels (Tabbed)                                    │  │
│  │ - Output: Program execution results                       │  │
│  │ - LLVM IR: Generated intermediate representation          │  │
│  │ - AST: Abstract syntax tree                               │  │
│  │ - Tokens: Lexer output                                    │  │
│  │ - Execution Info: Time & Size metrics                     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            ↓ ↑
                      HTTP REST API
                            ↓ ↑
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Bun HTTP Server (Port 3001)                               │  │
│  │                                                            │  │
│  │ Endpoints:                                                │  │
│  │ - POST /compile    → Compile & Execute BPL code          │  │
│  │ - POST /format     → Format BPL code                      │  │
│  │ - GET  /examples   → Load example programs                │  │
│  │ - GET  /health     → Server health check                  │  │
│  │ - GET  /stats      → Statistics & metrics                 │  │
│  │ - GET  /logs       → Retrieve server logs                 │  │
│  │ - POST /logs/clear → Clear log history                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Logger System                                             │  │
│  │ - Multi-level: info, warn, error, debug                   │  │
│  │ - Colored console output                                  │  │
│  │ - Timestamped entries                                     │  │
│  │ - Request ID tracking                                     │  │
│  │ - Retention: Last 1000 logs                               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Statistics Tracker                                        │  │
│  │ - Total requests                                          │  │
│  │ - Success/failure counts                                  │  │
│  │ - Average compile time                                    │  │
│  │ - Server uptime                                           │  │
│  │ - Real-time calculations                                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ BPL Compilation Pipeline                                  │  │
│  │                                                            │  │
│  │ 1. Lexical Analysis (lexWithGrammar)                      │  │
│  │    └─> Tokens                                             │  │
│  │                                                            │  │
│  │ 2. Parsing (Parser)                                       │  │
│  │    └─> AST                                                │  │
│  │                                                            │  │
│  │ 3. Type Checking (TypeChecker)                            │  │
│  │    └─> Validated AST                                      │  │
│  │                                                            │  │
│  │ 4. Code Generation (CodeGenerator)                        │  │
│  │    └─> LLVM IR                                            │  │
│  │                                                            │  │
│  │ 5. Binary Compilation (Clang)                             │  │
│  │    └─> Executable                                         │  │
│  │                                                            │  │
│  │ 6. Execution                                              │  │
│  │    └─> Output                                             │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      DATA FLOW                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User writes code → POST /compile → Logger logs request         │
│       ↓                                                          │
│  Code → Lexer → Parser → TypeChecker → CodeGen → Clang          │
│       ↓         ↓         ↓            ↓          ↓              │
│     Tokens     AST     Validated     LLVM IR    Binary           │
│                                                   ↓              │
│                                              Execute             │
│                                                   ↓              │
│  Response ← Stats Update ← Logger ← Output + Metrics            │
│       ↓                                                          │
│  Frontend displays results + updates stats dashboard             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  MONITORING FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Every 5 seconds:                                               │
│    Frontend → GET /stats → Backend                              │
│         ↓                      ↓                                 │
│    Display stats          Calculate metrics                     │
│    Update UI              Return JSON                            │
│                                                                  │
│  Every 5 minutes:                                               │
│    Backend → Logger → Console output                            │
│         ↓                                                        │
│    Periodic stats summary                                       │
│                                                                  │
│  On demand:                                                     │
│    GET /health  → Status check                                  │
│    GET /logs    → Recent log entries                            │
│    POST /clear  → Reset logs                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  PERFORMANCE TRACKING                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Request ID: req_1234567890_abc123                              │
│                                                                  │
│  Phase Breakdown:                                               │
│  ├─ Lexing:         15ms                                        │
│  ├─ Parsing:        25ms                                        │
│  ├─ Type Check:     35ms                                        │
│  ├─ Code Gen:       40ms                                        │
│  ├─ LLVM Compile:   50ms                                        │
│  └─ Execute:        10ms                                        │
│                                                                  │
│  Total:            175ms                                        │
│                                                                  │
│  All phases logged with timestamps and durations                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Native execution responses are shaped before `/compile` returns JSON. The
backend runs binaries through argv-vector process execution, pipes stdin
directly, and converts stdout, stderr, nonzero exits, output-limit failures, and
timeouts into the stable payload documented in `playground/README.md`. The
contract is guarded by `tests/PlaygroundNativeExecution.test.ts` and
`tests/PlaygroundProcessRunner.test.ts`.

CI triage keeps that execution boundary narrow. When `/compile` native
execution fails in CI, start with `bun run ci:triage`; failures mentioning
`playground/backend/nativeExecution.ts`,
`playground/backend/processRunner.ts`, `PlaygroundNativeExecution.test`,
`PlaygroundProcessRunner.test`, or argv-vector playground example failures map
to focused local repro commands:

```bash
bun test tests/PlaygroundNativeExecution.test.ts
bun test tests/PlaygroundProcessRunner.test.ts
bun test tests/PlaygroundExamples.test.ts -t "shell metacharacter args|argv-vector execution"
bun test tests/TutorialExamples.test.ts -t "argv-vector execution"
```

## Key Components

### Frontend Components

- **Monaco Editor**: Full-featured code editor
- **Stats Dashboard**: Real-time metrics display
- **Output Tabs**: Multi-view debug information
- **Input Controls**: Stdin and args configuration

### Backend Services

- **HTTP Server**: Bun-based REST API
- **Logger**: Centralized logging system
- **Stats Tracker**: Performance metrics
- **Compiler Pipeline**: Full BPL compilation

### Integration Points

- **REST API**: JSON-based communication
- **Polling**: 5-second stats updates
- **WebSocket** (future): Real-time log streaming
- **Health Checks**: Automated monitoring

### Monitoring & Observability

- **Logs**: Detailed request tracing
- **Metrics**: Performance statistics
- **Health**: Server status checks
- **Debug**: AST/IR/Token inspection
