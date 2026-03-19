# Migration from WebSocket/SSE to gRPC

## Overview

This migration replaces the WebSocket and SSE-based agent communication with gRPC, providing:

1. **Bidirectional streaming** - Both agents can send messages independently
2. **Better reliability** - Built-in reconnection, heartbeat, and error handling
3. **Strong typing** - Protocol-based communication with type safety
4. **Cross-machine support** - Easier to connect agents across different machines
5. **Production-ready** - gRPC is battle-tested for microservices communication

## What's Changed

### 1. Server Changes
- **Old**: `AgentWebSocketServer` (WebSocket server on port+1000)
- **New**: `AgentGrpcServer` (gRPC server on port+2000)

### 2. Client Changes
- **Old**: WebSocket client connections
- **New**: `AgentGrpcClient` with bidirectional streaming

### 3. Tool Changes
- **Old**: `agent_websocket_chat` tool
- **New**: `agent_grpc_chat` tool

### 4. API Changes
- **Old**: `/chat` endpoint for HTTP chat
- **New**: Same endpoint, but uses gRPC internally
- **New**: `/agents` endpoint to list connected agents via gRPC

## Migration Steps

### 1. Update Dependencies
```bash
npm install @grpc/grpc-js google-protobuf
```

### 2. Update Your Code

#### Before (WebSocket):
```typescript
import { AgentWebSocketServer } from './core/agent-websocket.js';

// Start WebSocket server
const wsServer = new AgentWebSocketServer(wsPort);

// Send message via WebSocket
wsServer.sendMessageToAgent(agentId, message);
```

#### After (gRPC):
```typescript
import { AgentGrpcServer } from './core/agent-grpc.js';

// Start gRPC server
const grpcServer = new AgentGrpcServer(grpcPort);
await grpcServer.start();

// Send message via gRPC
grpcServer.sendMessageToAgent(agentId, message);
```

### 3. Update Agent Connections

#### Before:
```typescript
// WebSocket connection
const ws = new WebSocket(`ws://localhost:${wsPort}`);
```

#### After:
```typescript
import { AgentGrpcClient } from './core/agent-grpc-client.js';

// gRPC connection
const client = new AgentGrpcClient({
  agentId: 'my-agent',
  serverAddress: `localhost:${grpcPort}`,
}, {
  onMessage: (message) => {
    console.log('Received:', message);
  },
  onConnected: () => {
    console.log('Connected to gRPC server');
  },
  // ... other callbacks
});
```

### 4. Update Chat Tools

#### Before:
```json
{
  "tool": "agent_websocket_chat",
  "params": {
    "toAgent": "agent-2",
    "message": "Hello!"
  }
}
```

#### After:
```json
{
  "tool": "agent_grpc_chat",
  "params": {
    "toAgent": "agent-2",
    "message": "Hello!",
    "waitForReply": true,
    "timeout": 30000
  }
}
```

## Benefits of gRPC Migration

### 1. Reliability
- **Automatic reconnection** - Client automatically reconnects if disconnected
- **Heartbeat monitoring** - Detects dead connections
- **Error handling** - Built-in error codes and retry logic

### 2. Performance
- **Binary protocol** - More efficient than JSON over WebSocket
- **Bidirectional streaming** - No polling needed
- **Flow control** - Built-in backpressure handling

### 3. Scalability
- **Cross-machine** - Easier to connect agents on different machines
- **Multiple connections** - Single server can handle many concurrent streams
- **Protocol buffers** - Language-agnostic protocol definition

### 4. Developer Experience
- **Type safety** - Protocol buffers provide strict typing
- **Self-documenting** - `.proto` files document the API
- **Standard tooling** - gRPC has mature tooling and libraries

## Backward Compatibility

The migration maintains backward compatibility where possible:

1. **HTTP API unchanged** - Same `/chat`, `/health`, `/agent` endpoints
2. **Persona system unchanged** - Same persona and memory management
3. **Tool execution unchanged** - Same task execution pipeline
4. **SSE for tasks unchanged** - Task streaming still uses Server-Sent Events

## Configuration Changes

### Old Configuration:
```json
{
  "port": 43301,
  "wsPort": 44301
}
```

### New Configuration:
```json
{
  "port": 43301,
  "grpcPort": 45301
}
```

## Testing the Migration

1. **Start the agent server**:
   ```bash
   clawx --serve --port 43301
   ```

2. **Check gRPC is running**:
   ```bash
   curl http://localhost:43301/health
   ```
   Should show `"grpcConnected": true`

3. **List connected agents**:
   ```bash
   curl http://localhost:43301/agents
   ```

4. **Test chat via tool**:
   ```bash
   clawx --tool agent_grpc_chat --params '{"toAgent": "agent-2", "message": "Test"}'
   ```

## Troubleshooting

### Common Issues:

1. **Port conflicts**:
   - gRPC uses port+2000 by default
   - Check no other service is using that port

2. **Connection refused**:
   - Ensure gRPC server started successfully
   - Check firewall settings (gRPC uses HTTP/2)

3. **Message not delivered**:
   - Verify target agent is connected via gRPC
   - Check agent IDs match exactly

4. **Performance issues**:
   - gRPC is generally faster than WebSocket
   - If slower, check network configuration

## Future Enhancements

The gRPC migration enables future features:

1. **TLS encryption** - Secure cross-machine communication
2. **Load balancing** - Multiple agents behind a load balancer
3. **Protocol evolution** - Versioned API with backward compatibility
4. **Cross-language agents** - Agents written in different languages
5. **Service discovery** - Automatic discovery of agents on network

## Need Help?

If you encounter issues with the migration:

1. Check the logs for error messages
2. Verify gRPC dependencies are installed
3. Ensure ports are available
4. Test with the simple example first

The gRPC implementation is designed to be a drop-in replacement for WebSocket, providing better reliability and performance while maintaining the same API surface.