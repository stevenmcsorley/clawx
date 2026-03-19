# gRPC Integration for Clawx Agents

## Overview

This gRPC implementation replaces the WebSocket/SSE communication system in Clawx with a more robust, bidirectional streaming protocol. It enables:

- **Real-time agent-to-agent communication** via gRPC streams
- **Persona-aware agents** with personas traveling over connections
- **Automatic reconnection** and heartbeat monitoring
- **Broadcast messaging** to all connected agents
- **Cross-machine compatibility** (agents can be on different machines)

## Architecture

```
┌─────────────────────────────────────────────────┐
│               Clawx Master Process              │
│                                                 │
│  ┌─────────────┐     HTTP/SSE      ┌─────────┐ │
│  │   HTTP API  │◄─────────────────►│  User   │ │
│  │   (Express) │     (Port N)      │  (CLI)  │ │
│  └─────────────┘                   └─────────┘ │
│          │                                     │
│          │ gRPC (Port N+2000)                  │
│          ▼                                     │
│  ┌─────────────┐                               │
│  │ gRPC Server │                               │
│  │ (AgentGrpc- │─────┐                         │
│  │   Server)   │     │ gRPC Streams            │
│  └─────────────┘     │                         │
│          ▲           │                         │
│          │           │                         │
│          │           ▼                         │
│  ┌─────────────┐ ┌─────────────┐               │
│  │ Agent Client│ │ Agent Client│  ...          │
│  │ (Specialist)│ │ (Specialist)│               │
│  └─────────────┘ └─────────────┘               │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install Dependencies

The gRPC dependencies are already included in `package.json`:
```bash
npm install
```

### 2. Run the Example

```bash
node examples/grpc-agent-example.js
```

### 3. Test Basic Functionality

```bash
node test-grpc-basic.js
```

## Integration with Existing Clawx

### Replacing WebSocket Server

**Before (WebSocket):**
```typescript
import { AgentWebSocketServer } from './core/agent-websocket.js';
const wsServer = new AgentWebSocketServer(wsPort);
```

**After (gRPC):**
```typescript
import { AgentGrpcServer } from './core/grpc/agent-grpc-server.js';
const grpcServer = new AgentGrpcServer(grpcPort);
await grpcServer.start();
```

### Replacing WebSocket Client

**Before:**
```typescript
// WebSocket connection
const ws = new WebSocket(`ws://localhost:${port}`);
```

**After:**
```typescript
import { AgentGrpcClient } from './core/grpc/agent-grpc-client.js';

const agent = new AgentGrpcClient({
  agentId: 'my-agent',
  agentName: 'My Agent',
  serverAddress: `localhost:${port}`,
  persona: { /* persona data */ },
});

agent.on('chat', (data) => {
  console.log(`Message from ${data.from}: ${data.message}`);
});

agent.sendChat('other-agent', 'Hello!');
```

### New Tool: `agent_grpc_chat`

Replaces `agent_websocket_chat`:

```json
{
  "tool": "agent_grpc_chat",
  "params": {
    "toAgent": "agent-2",
    "message": "Can you help with this code?",
    "waitForReply": false
  }
}
```

## Key Components

### 1. `AgentGrpcServer` (`src/core/grpc/agent-grpc-server.ts`)
- Main gRPC server that agents connect to
- Manages agent registrations and routing
- Supports broadcast messaging
- Emits events for agent connections/disconnections

### 2. `AgentGrpcClient` (`src/core/grpc/agent-grpc-client.ts`)
- Client for agents to connect to the gRPC server
- Automatic reconnection with configurable delay
- Heartbeat monitoring
- Event-based message handling
- Persona support

### 3. `agentGrpcChat` Tool (`src/tools/agentGrpcChat.ts`)
- Tool for agents to chat via gRPC
- Supports direct messaging and broadcast
- Can wait for replies (with timeout)

### 4. `agent-server-with-grpc.ts` (`src/core/agent-server-with-grpc.ts`)
- Updated agent server that uses gRPC instead of WebSockets
- Maintains backward compatibility with HTTP API
- Integrates gRPC with existing tool execution system

## Configuration

### Server Configuration
```typescript
const grpcServer = new AgentGrpcServer(50051); // Port number
```

### Client Configuration
```typescript
const agent = new AgentGrpcClient({
  agentId: 'unique-agent-id',
  agentName: 'Display Name',
  serverAddress: 'localhost:50051',
  persona: { /* persona object */ },
  reconnectDelay: 5000,    // ms between reconnect attempts
  heartbeatInterval: 30000, // ms between heartbeats
});
```

## Events

### Server Events
- `agentRegistered`: When an agent successfully registers
- `agentDisconnected`: When an agent disconnects

### Client Events
- `connected`: When connected to server (before registration)
- `registered`: When successfully registered with server
- `chat`: When receiving a chat message
- `message`: When receiving any message
- `error`: When an error occurs
- `disconnected`: When disconnected from server

## Message Types

The gRPC system uses these message types:

1. **`register`** - Agent registration with persona
2. **`chat`** - Chat messages between agents
3. **`heartbeat`** - Connection health check
4. **`system`** - System messages (welcome, registration confirm)
5. **`error`** - Error messages
6. **`tool_call`** - Tool execution requests
7. **`tool_result`** - Tool execution results

## Persona Integration

Personas travel with agents over gRPC connections:

```typescript
const agent = new AgentGrpcClient({
  agentId: 'coder',
  persona: {
    name: 'TypeScript Specialist',
    role: 'Senior Developer',
    strengths: ['TypeScript', 'Node.js'],
    // ... other persona fields
  },
});
```

The persona is:
1. Sent during registration
2. Available to other agents via the server
3. Used for context in conversations

## Benefits Over WebSocket/SSE

### 1. Reliability
- **Bidirectional streaming**: Both sides can send messages independently
- **Automatic reconnection**: Clients automatically reconnect if disconnected
- **Heartbeat monitoring**: Detects dead connections
- **Error handling**: Built-in error codes and retry logic

### 2. Performance
- **HTTP/2 multiplexing**: Multiple streams over one connection
- **Binary protocol**: More efficient than JSON over WebSocket
- **Flow control**: Built-in backpressure handling

### 3. Scalability
- **Cross-machine**: Easier to connect agents on different machines
- **Protocol buffers**: Language-agnostic (future cross-language agents)
- **Service discovery**: Can integrate with service discovery systems

### 4. Developer Experience
- **Strong typing**: TypeScript interfaces for all messages
- **Standard protocol**: gRPC is a well-established standard
- **Tooling**: Mature tooling and debugging support

## Migration Path

### Step 1: Update Dependencies
Ensure `@grpc/grpc-js` and `google-protobuf` are installed.

### Step 2: Update Server Code
Replace `AgentWebSocketServer` with `AgentGrpcServer`.

### Step 3: Update Client Code
Replace WebSocket connections with `AgentGrpcClient`.

### Step 4: Update Tools
Replace `agent_websocket_chat` with `agent_grpc_chat`.

### Step 5: Test
Run the provided tests to verify functionality.

## Example: Multi-Agent System

```javascript
// Master process
const master = new AgentGrpcServer(50051);
await master.start();

// Specialist agents
const coder = new AgentGrpcClient({
  agentId: 'coder',
  agentName: 'TypeScript Expert',
  serverAddress: 'localhost:50051',
  persona: { /* coder persona */ },
});

const tester = new AgentGrpcClient({
  agentId: 'tester', 
  agentName: 'QA Expert',
  serverAddress: 'localhost:50051',
  persona: { /* tester persona */ },
});

// Agents can now chat
coder.sendChat('tester', 'Can you test this function?');
tester.sendChat('coder', 'Found a bug in your code...');

// Master can broadcast
master.broadcast('master', 'System maintenance in 5 minutes');
```

## Troubleshooting

### Common Issues

1. **Port already in use**: Change the port number
2. **Connection refused**: Ensure server is running
3. **Message not delivered**: Check agent IDs match exactly
4. **Heartbeat errors**: Increase `heartbeatInterval`

### Debugging

Enable debug logging:
```javascript
import { log } from '../utils/logger.js';
// Log level can be adjusted in configuration
```

Check connection status:
```javascript
console.log('Connected:', agent.isConnected());
console.log('Registered:', agent.isRegistered());
```

## Future Enhancements

1. **TLS encryption** for secure communication
2. **Authentication** with API keys or certificates
3. **Load balancing** between multiple gRPC servers
4. **Protocol buffer definitions** for strict typing
5. **Cross-language support** (Python, Go, etc. agents)
6. **Service discovery** for dynamic agent networks

## See Also

- `examples/grpc-agent-example.js` - Complete working example
- `test-grpc-basic.js` - Basic functionality test
- `MIGRATION-gRPC.md` - Migration guide from WebSocket
- `docs/grpc-implementation.md` - Detailed implementation notes