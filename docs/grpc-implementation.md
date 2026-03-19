# gRPC Agent Communication System

## Overview

This implementation provides a robust gRPC-based communication system for agents, replacing the previous SSE/WebSocket approach. The system supports:

- **Bidirectional streaming** between agents
- **Hub-and-spoke architecture** with masters and workers
- **Cross-machine communication** between masters
- **Automatic routing** of messages between workers
- **Heartbeat monitoring** and automatic reconnection
- **Worker registration** and discovery

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Machine A                                │
│                                                             │
│  ┌──────────┐      ┌─────────────┐      ┌──────────┐      │
│  │ Worker A1│◄────►│   Master A  │◄────►│ Worker A2│      │
│  └──────────┘      └─────────────┘      └──────────┘      │
│                              │                             │
└──────────────────────────────┼─────────────────────────────┘
                               │
                    gRPC Stream│(Master-to-Master)
                               │
┌──────────────────────────────┼─────────────────────────────┐
│                    Machine B │                             │
│                              ▼                             │
│  ┌──────────┐      ┌─────────────┐      ┌──────────┐      │
│  │ Worker B1│◄────►│   Master B  │◄────►│ Worker B2│      │
│  └──────────┘      └─────────────┘      └──────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

1. **Master Server** (`MasterServer`)
   - Listens for worker connections
   - Maintains routing table
   - Bridges connections between masters
   - Handles message routing

2. **Worker Client** (`WorkerClient`)
   - Connects to local master
   - Sends registration and heartbeat
   - Sends/receives messages
   - Automatic reconnection

3. **Master Client** (`MasterClient`)
   - Connects to remote masters
   - Maintains worker routing information
   - Forwards messages between masters

4. **Orchestrator** (`Orchestrator`)
   - Combines master server and clients
   - Manages local workers
   - Handles cross-machine routing
   - Provides high-level API

## Message Types

The system uses framed messages with the following types:

- `register_worker` - Worker registration
- `chat_chunk` - Chat message content
- `message_start` - Start of streaming message
- `message_end` - End of streaming message
- `tool_call` - Tool execution request
- `tool_result` - Tool execution result
- `status` - Status updates
- `heartbeat` - Connection health check
- `error` - Error messages
- `route_update` - Routing table updates

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Run a Master Server

```bash
npx tsx examples/grpc-master-example.ts
```

### 3. Run Workers

```bash
# Worker 1
npx tsx examples/grpc-worker-example.ts coder-agent

# Worker 2
npx tsx examples/grpc-worker-example.ts tester-agent

# Worker 3
npx tsx examples/grpc-worker-example.ts documenter-agent
```

### 4. Run Full Example (Master + Workers)

```bash
npx tsx examples/grpc-full-example.ts
```

## API Usage

### Creating an Orchestrator

```typescript
import { Orchestrator } from './src/core/grpc/orchestrator';

const orchestrator = new Orchestrator({
  masterId: 'my-master',
  port: 50051,
  localWorkers: [
    {
      id: 'agent-1',
      agentType: 'coder',
      capabilities: ['typescript', 'debugging'],
    },
  ],
  remoteMasters: [
    {
      id: 'remote-master',
      address: '192.168.1.100:50051',
    },
  ],
});

await orchestrator.start();
```

### Sending Messages

```typescript
// Send chat message
orchestrator.sendChatMessage(
  'agent-1',
  'agent-2',
  'Hello from agent-1!'
);

// Listen for messages
orchestrator.on('message', (frame) => {
  console.log(`Received: ${frame.content}`);
});
```

### Creating a Worker Client

```typescript
import { WorkerClient } from './src/core/grpc/worker-client';

const worker = new WorkerClient(
  {
    workerId: 'my-worker',
    agentType: 'specialist',
    capabilities: ['chat', 'tools'],
    masterAddress: 'localhost:50051',
  },
  {
    onMessage: (frame) => {
      console.log('Received:', frame);
    },
    onError: (error) => {
      console.error('Error:', error);
    },
    onConnected: () => {
      console.log('Connected to master');
    },
    onDisconnected: () => {
      console.log('Disconnected from master');
    },
  }
);
```

## Cross-Machine Setup

### Machine A (Master A)

```typescript
const orchestratorA = new Orchestrator({
  masterId: 'master-a',
  port: 50051,
  localWorkers: [
    { id: 'worker-a1', agentType: 'coder', capabilities: [] },
  ],
});

await orchestratorA.start();
```

### Machine B (Master B)

```typescript
const orchestratorB = new Orchestrator({
  masterId: 'master-b',
  port: 50052,
  localWorkers: [
    { id: 'worker-b1', agentType: 'tester', capabilities: [] },
  ],
  remoteMasters: [
    { id: 'master-a', address: 'machine-a-ip:50051' },
  ],
});

await orchestratorB.start();
```

Now `worker-a1` on Machine A can talk to `worker-b1` on Machine B through the master-to-master bridge.

## Protocol Definition

The gRPC protocol is defined in `agent-protocol/proto/agentlink.proto`:

```protobuf
service WorkerLink {
  rpc Connect(stream AgentFrame) returns (stream AgentFrame);
}

service MasterLink {
  rpc Bridge(stream AgentFrame) returns (stream AgentFrame);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}
```

## Benefits Over SSE/WebSockets

1. **Bidirectional streaming** - Both sides can send messages independently
2. **Strong typing** - Protocol buffers provide type safety
3. **Efficient binary serialization** - Smaller payloads than JSON
4. **Built-in flow control** - gRPC handles backpressure
5. **Connection management** - Automatic reconnection and heartbeat
6. **Cross-language support** - Can interface with agents in other languages
7. **Production-ready** - Used by major companies for microservices

## Configuration Options

### Master Server
- `port`: Listening port (default: 50051)
- `host`: Binding address (default: '0.0.0.0')
- `heartbeatInterval`: Heartbeat frequency (default: 30000ms)

### Worker Client
- `reconnectDelay`: Delay between reconnection attempts (default: 5000ms)
- `maxReconnectAttempts`: Maximum reconnection attempts (default: 10)
- `capabilities`: Array of worker capabilities

### Master Client
- `remoteMasterAddress`: Address of remote master
- `reconnectDelay`: Delay between reconnection attempts

## Monitoring and Debugging

The system emits events for monitoring:

```typescript
orchestrator.on('workerConnected', (workerId) => {
  console.log(`Worker ${workerId} connected`);
});

orchestrator.on('routingTableUpdated', (routingTable) => {
  console.log('Routing table updated:', routingTable);
});

orchestrator.on('error', (error) => {
  console.error('System error:', error);
});
```

## Security Considerations

1. **Local-only by default** - Masters bind to localhost
2. **TLS support** - gRPC supports TLS for encrypted connections
3. **Authentication** - Can add metadata-based authentication
4. **Authorization** - Can implement per-worker permissions

## Future Enhancements

1. **TLS encryption** for cross-machine communication
2. **Authentication** with API keys or certificates
3. **Load balancing** between multiple workers
4. **Message persistence** for offline workers
5. **Metrics and monitoring** integration
6. **Protocol buffer code generation** for strict typing