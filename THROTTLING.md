# Request Throttling Implementation

This document describes the integrated request throttling system implemented in the Money Auth service, based on the QuotaManager pattern from the OpenAI project.

## Overview

The throttling system is integrated directly into the `useAptosWallet` middleware, ensuring that only one request is processed at a time for routes that require Aptos blockchain operations. This prevents concurrent processing issues and maintains request order. Unlike the original QuotaManager which tracks call counts, this implementation focuses purely on concurrency control and is automatically applied whenever Aptos operations are needed.

## Architecture

### Components

1. **RequestThrottler Durable Object** (`src/durables/RequestThrottler.ts`)
   - Manages request queuing and serialization
   - Ensures only one request is processed at a time per route
   - Uses Cloudflare Durable Objects for state management

2. **Integrated AptosWallet Middleware** (`src/mw/aptosWallet.ts`)
   - Combines Aptos client initialization with request throttling
   - Automatically applies throttling to any route that needs blockchain operations
   - Handles request serialization and Aptos setup in one middleware

3. **Configuration** (`wrangler.toml`)
   - Defines the REQUEST_THROTTLER Durable Object binding
   - Configures the service for Cloudflare Workers

## How It Works

1. **Request Interception**: When a request arrives at a route that uses `useAptosWallet`, the middleware intercepts it
2. **Throttling Check**: The middleware first applies request throttling using the RequestThrottler Durable Object
3. **Route Identification**: The middleware identifies the route and creates a unique request ID
4. **Throttler Selection**: A Durable Object is selected based on the route path
5. **Queue Management**: If a request is already being processed, new requests are queued
6. **Serial Processing**: Requests are processed one at a time in the order they arrived
7. **Aptos Initialization**: Once throttling is approved, the middleware initializes Aptos client and oracle account
8. **Route Processing**: The request continues to the actual route handler with Aptos context available

## Key Features

- **Per-Route Throttling**: Each route has its own throttler instance
- **Request Queuing**: Multiple requests to the same route are queued and processed sequentially
- **No Request Dropping**: Requests are never dropped, only delayed
- **Elegant Waiting**: Requests wait gracefully without timeouts or errors
- **Request Tracking**: Each request has a unique ID for debugging and monitoring

## Usage

The throttling is automatically applied through the `useAptosWallet` middleware, which is selectively applied to routes that require Aptos blockchain operations:

### Main Application Configuration

```typescript
// src/index.ts
import { useAptosWallet } from "./mw/aptosWallet"

const app = new Hono<IRunningContext>()
app.use("*", cors())

// Apply Aptos wallet middleware (with throttling) only to routes that need blockchain operations
app.use("/authenticate/*", useAptosWallet)
app.use("/register/options", useAptosWallet)
app.use("/register/verify", useAptosWallet)
```

### Integrated Middleware

```typescript
// src/mw/aptosWallet.ts
export const useAptosWallet = async (
  c: Context<IRunningContext>,
  next: Next
) => {
  // First, apply request throttling for Aptos operations
  // ... throttling logic ...

  // Then initialize Aptos client and oracle account
  // ... Aptos initialization ...

  await next()
}
```

### Routes With Throttling (via useAptosWallet)

- `/authenticate/*` - All authentication routes
- `/register/options` - Registration options endpoint
- `/register/verify` - Registration verification endpoint

### Routes Without Throttling

- `/health` - Simple health check
- `/` - Service info endpoint
- `/debug` - Debug endpoint

## Testing

### Manual Testing

Use the provided test files to verify throttling behavior:

1. **HTTP Test File**: `test-throttling.http`
   - Contains multiple test requests
   - Can be run in VS Code with REST Client extension

2. **JavaScript Test Script**: `test-throttling.js`
   - Automated test script
   - Sends concurrent requests and measures response times
   - Run with: `node test-throttling.js`

### Expected Behavior

- **Throttled Routes** (`/authenticate/*`, `/register/options`, `/register/verify`):
  - Single requests should process normally
  - Multiple concurrent requests should be processed sequentially
  - Response times should increase for queued requests
  - No requests should be dropped or fail due to throttling

- **Non-Throttled Routes** (`/health`, `/`, `/debug`):
  - All requests should process normally without any throttling
  - No delays or queuing behavior
  - Fast response times

## Configuration

### Durable Object Settings

The throttler uses these default settings:

- **Processing Delay**: 100ms per request (configurable)
- **Queue Management**: FIFO (First In, First Out)
- **Error Handling**: Graceful error handling with detailed logging

### Customization

To modify throttling behavior:

1. **Processing Delay**: Change the `setTimeout` value in `RequestThrottler.processRequest()`
2. **Queue Behavior**: Modify the queue handling in `processNextRequest()`
3. **Error Handling**: Update error responses in the middleware

## Monitoring

The throttler provides status information:

```typescript
// Get throttler status
const status = await throttler.getStatus()
console.log(status)
// Output: { processing: boolean, queueLength: number, timestamp: number }
```

## Troubleshooting

### Common Issues

1. **Requests Timing Out**: Check if the processing delay is too long
2. **Memory Issues**: Monitor queue length and clear if necessary
3. **Durable Object Errors**: Verify the binding configuration in `wrangler.toml`

### Debug Commands

```typescript
// Clear the queue (admin only)
await throttler.clearQueue()

// Get current status
const status = await throttler.getStatus()
```

## Performance Considerations

- **Memory Usage**: Each route maintains its own queue in memory
- **Processing Overhead**: ~100ms delay per request (configurable)
- **Concurrency**: Only one request per route at a time
- **Scalability**: Each route scales independently

## Future Enhancements

Potential improvements to consider:

1. **Priority Queues**: Implement request priority handling
2. **Rate Limiting**: Add rate limiting on top of throttling
3. **Metrics**: Add detailed metrics and monitoring
4. **Configuration**: Make throttling behavior configurable per route
5. **Circuit Breaker**: Add circuit breaker pattern for error handling
