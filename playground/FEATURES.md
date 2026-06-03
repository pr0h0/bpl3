# BPL Playground - Enhanced Features

## Recent Enhancements

### 📊 Real-time Statistics Dashboard

- **Server Status**: Live health monitoring with online/offline indicators
- **Compilation Metrics**: Track total compilations and success rates
- **Performance Tracking**: Average compilation time monitoring
- **Auto-refresh**: Statistics update every 5 seconds

### 📝 Comprehensive Logging System

- **Multi-level Logging**: info, warn, error, and debug levels
- **Timestamped Entries**: Precise tracking of all server activities
- **Request Tracking**: Unique IDs for tracing compilation requests
- **Log Retention**: Maintains last 1000 log entries
- **Colored Console Output**: Easy visual distinction of log levels

### ⏱️ Performance Monitoring

- **Execution Timing**: Track compilation and execution duration
- **Output Metrics**: Monitor output size and performance
- **Phase Breakdown**: Separate timing for lexing, parsing, compilation, and execution
- **Success Rate Tracking**: Real-time compilation success/failure statistics
- **Fast Run Responses**: Run Code returns execution output without IR/AST/token payloads; debug tabs request those artifacts lazily
- **Runtime Object Cache**: Native playground links reuse a cached object form of `runtime.ll` when the host compiler can produce it

### 🔌 Extended API Endpoints

#### `/health` - Server Health Check

```bash
curl http://localhost:3001/health
```

Returns server uptime and status.

#### `/stats` - Detailed Statistics

```bash
curl http://localhost:3001/stats
```

Returns comprehensive server metrics:

- Total requests processed
- Successful vs failed compilations
- Average compilation time
- Success rate percentage
- Server uptime

#### `/logs` - Access Server Logs

```bash
curl http://localhost:3001/logs?limit=50
```

Retrieve recent server logs with customizable limit.

#### `/logs/clear` - Clear Log History

```bash
curl -X POST http://localhost:3001/logs/clear
```

Clear all accumulated logs.

### 🎨 UI Improvements

- **Execution Info Panel**: Display timing and output size after execution
- **Live Stats Sidebar**: Real-time server statistics in the sidebar
- **Enhanced Status Indicators**: Visual feedback for server connectivity
- **Better Error Display**: Improved error formatting and context

### 🔍 Debug Capabilities

- **Request Tracing**: Every compilation gets a unique request ID
- **Detailed Error Logging**: Stack traces and error context preserved
- **Performance Profiling**: Breakdown of compilation pipeline stages
- **Memory Tracking**: Temp file management and cleanup logging

## Usage Examples

### Monitoring Server Performance

```javascript
// Fetch current statistics
const response = await fetch("http://localhost:3001/stats");
const stats = await response.json();

console.log(`Success Rate: ${stats.successRate}`);
console.log(`Avg Compile Time: ${stats.averageCompileTime}ms`);
```

### Accessing Logs

```javascript
// Get last 100 log entries
const response = await fetch("http://localhost:3001/logs?limit=100");
const { logs } = await response.json();

logs.forEach((log) => {
  console.log(`[${log.level}] ${log.timestamp}: ${log.message}`);
});
```

### Health Monitoring

```javascript
// Check if server is responsive
const response = await fetch("http://localhost:3001/health");
const health = await response.json();

if (health.status === "ok") {
  console.log(`Server running for ${health.uptime} seconds`);
}
```

## Configuration

### Logging Configuration

```typescript
// Adjust log retention in server.ts
private maxLogs = 1000; // Keep last 1000 logs

// Change periodic stats logging interval
setInterval(() => {
  logger.info("Periodic stats update", {...});
}, 300000); // Every 5 minutes
```

### Performance Tuning

```typescript
// Execution timeout (in compileAndRun function)
timeout: 5000, // 5 second timeout

// Output buffer limit
maxBuffer: 1024 * 1024, // 1MB buffer
```

### Stats Update Frequency

```javascript
// Frontend polling interval (in app.js)
setInterval(pollServerStats, 5000); // Update every 5 seconds
```

## Monitoring Best Practices

1. **Regular Health Checks**: Use `/health` endpoint for uptime monitoring
2. **Log Review**: Periodically check `/logs` for errors and warnings
3. **Performance Analysis**: Monitor `/stats` for compilation time trends
4. **Clear Logs**: Use `/logs/clear` when logs grow too large
5. **Error Tracking**: Watch for failed compilation patterns in stats

## Future Enhancements

- [ ] WebSocket support for real-time log streaming
- [ ] Persistent statistics storage
- [ ] User session tracking
- [ ] Code sharing via URLs
- [ ] Syntax error highlighting in editor
- [ ] Autocomplete for BPL keywords
- [ ] Multi-file project support
- [ ] Export compiled binaries
- [ ] Performance graphs and charts
- [ ] Code snippet library
