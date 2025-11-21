# EVM Nonce Management and Parallelization Integration

This document explains the integration of nonce management and parallelization support from the OpenAI project into the MoneyPot EVM system.

## Overview

The integration provides:

- **Nonce Management**: Automatic nonce handling via Durable Objects for parallel transaction support
- **Rate Limiting**: Per-chain rate limiting to prevent RPC overload
- **Multi-Key Support**: Support for multiple private keys using `PRIVATE_KEY_*` pattern
- **Parallelization**: Safe concurrent transaction execution
- **Caching**: Wallet client caching for performance

## Architecture

### Components

1. **WalletFactory** (`src/web3/walletFactory.ts`)
   - Singleton factory for creating wallet clients
   - Integrates with NonceManagerV1 Durable Object
   - Provides caching and configuration options

2. **MultiKeyManager** (`src/web3/multiKeyManager.ts`)
   - Manages multiple private keys
   - Supports `PRIVATE_KEY_*` pattern
   - Provides parallel wallet creation

3. **NonceManagerV1** (`durables/NonceManagerV1.ts`)
   - Durable Object for nonce management
   - Rate limiting per chain
   - Atomic nonce operations

4. **Updated Middleware** (`src/mw/useEVMWallet.ts`)
   - Uses WalletFactory instead of direct client creation
   - Provides nonce management by default

## Usage

### Basic Usage

```typescript
import { walletFactory } from "./src/web3/walletFactory"

// Create oracle wallet with nonce management
const walletResult = walletFactory.createOracleWallet(env, {
  enableNonceManagement: true,
  enableRateLimiting: true,
})

// Access clients
const { publicClient, walletClient, account } = walletResult
```

### Multiple Private Keys

Set environment variables:

```bash
# Default oracle key
ORACLE_PRIVATE_KEY_EVM=0x1234...

# Additional keys
PRIVATE_KEY_PAYMASTER=0x5678...
PRIVATE_KEY_USER_123=0x9abc...
PRIVATE_KEY_ADMIN=0xdef0...
```

Use in code:

```typescript
import { multiKeyManager } from "./src/web3/multiKeyManager"

// Get wallet for specific role
const paymasterWallet = multiKeyManager.getWalletForRole("PAYMASTER", env)

// Get wallet for specific address
const userWallet = multiKeyManager.getWalletForAddress("0x1234...", env)

// Create multiple wallets for parallel operations
const wallets = multiKeyManager.createParallelWallets(
  ["ORACLE", "PAYMASTER", "USER_123"],
  env
)
```

### Parallel Operations

```typescript
// Create multiple wallets
const wallets = multiKeyManager.createParallelWallets(
  ["ORACLE", "PAYMASTER"],
  env,
  { enableNonceManagement: true }
)

// Execute transactions in parallel
const promises = Array.from(wallets.entries()).map(async ([role, wallet]) => {
  return wallet.walletClient.writeContract({
    address: contractAddress,
    abi: contractABI,
    functionName: "someFunction",
    args: [role],
  })
})

const results = await Promise.all(promises)
```

## Configuration

### Environment Variables

```bash
# Required
ORACLE_PRIVATE_KEY_EVM=0x...  # Default oracle key

# Optional - Additional keys
PRIVATE_KEY_PAYMASTER=0x...    # Paymaster key
PRIVATE_KEY_USER_123=0x...     # User-specific key
PRIVATE_KEY_ADMIN=0x...        # Admin key

# Durable Object binding (already configured)
NONCE_V1_DO=...               # Set in wrangler.toml
```

### WalletFactory Configuration

```typescript
interface WalletFactoryConfig {
  chain?: Chain // Default: creditcoinTestnet
  enableNonceManagement?: boolean // Default: true
  enableRateLimiting?: boolean // Default: true
}
```

## Rate Limiting

The NonceManagerV1 provides per-chain rate limiting:

```typescript
const MAX_RPS: Record<number, number> = {
  [creditcoinTestnet.id]: 3, // 3 requests per second for Creditcoin Testnet
}
```

## Nonce Management

### How it Works

1. **Nonce Reservation**: When creating a transaction, the nonce manager reserves the next available nonce
2. **Atomic Operations**: All nonce operations are atomic via Durable Objects
3. **Expiration**: Nonces expire after 30 seconds to prevent stuck transactions
4. **Fallback**: Falls back to RPC nonce if Durable Object fails

### Benefits

- **Parallel Transactions**: Multiple transactions can be created simultaneously
- **No Nonce Conflicts**: Automatic nonce management prevents conflicts
- **Rate Limiting**: Prevents RPC overload
- **Reliability**: Fallback mechanisms ensure transactions don't fail

## Migration Guide

### From Old System

**Before:**

```typescript
const oracleAccount = privateKeyToAccount(oraclePrivateKey)
const walletClient = createWalletClient({
  account: oracleAccount,
  chain: creditcoinTestnet,
  transport: http(),
})
```

**After:**

```typescript
const walletResult = walletFactory.createOracleWallet(env, {
  enableNonceManagement: true,
})
const { walletClient } = walletResult
```

### Middleware Changes

The `useEVMWallet` middleware now automatically:

- Uses WalletFactory
- Enables nonce management
- Provides caching
- Sets additional context variables

## Testing

Run the integration tests:

```typescript
import { nonceManagementTests } from "./src/web3/testNonceIntegration"

// Run all tests
await nonceManagementTests.runAllTests()

// Run individual tests
await nonceManagementTests.testBasicWalletCreation()
await nonceManagementTests.testMultiKeyDiscovery()
await nonceManagementTests.testParallelWallets()
```

## Troubleshooting

### Common Issues

1. **Nonce Manager Not Found**
   - Ensure `NONCE_V1_DO` is configured in wrangler.toml
   - Check Durable Object binding

2. **Private Key Not Found**
   - Verify environment variable names
   - Check `PRIVATE_KEY_*` pattern

3. **Rate Limiting**
   - Adjust `MAX_RPS` in NonceManagerV1
   - Monitor rate limit logs

### Debugging

Enable debug logging:

```typescript
console.log("Cache stats:", walletFactory.getCacheStats())
console.log("Key stats:", multiKeyManager.getStats(env))
```

## Performance Considerations

- **Caching**: Wallet clients are cached per private key + chain
- **Rate Limiting**: Prevents RPC overload
- **Nonce Management**: Reduces transaction failures
- **Parallel Operations**: Enables concurrent transaction execution

## Security

- **Private Keys**: Stored securely in environment variables
- **Nonce Management**: Atomic operations prevent replay attacks
- **Rate Limiting**: Prevents abuse
- **Validation**: Private key format validation

## Future Enhancements

- [ ] Support for more chains
- [ ] Dynamic rate limiting
- [ ] Nonce prediction for gas optimization
- [ ] Transaction batching
- [ ] Advanced caching strategies
