# MoneyPot Authentication Service

A production-grade authentication service for MoneyPot, providing multi-chain wallet verification for treasure hunting games on Aptos and EVM-compatible blockchains.

## Overview

MoneyPot Authentication Service is a Cloudflare Workers-based API that enables secure wallet authentication and registration for treasure hunting games. It supports both Aptos and EVM-compatible chains, allowing users to authenticate and participate in treasure hunting competitions with encrypted password challenges.

## Features

- **Multi-Chain Support**: Aptos and EVM-compatible chains (Creditcoin, Sepolia, Polkadot Hub, Somnia)
- **Wallet Authentication**: Secure signature-based wallet verification
- **Encrypted Challenges**: RSA-encrypted password challenges for treasure hunting
- **Public API**: All endpoints use public RPC endpoints (no API keys required)
- **Cloudflare Workers**: Edge computing for low latency and global distribution
- **Arkiv Integration**: Decentralized challenge storage on Arkiv Network

## Architecture

- **Runtime**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare KV for persistent storage
- **Blockchain**: Aptos and EVM-compatible chains
- **Storage**: Arkiv Network for challenge storage (decentralized, TTL-based)
- **Crypto**: RSA encryption/decryption, ECDSA signature verification

## API Endpoints

### Aptos Endpoints

#### POST `/aptos/register/options`
Generates RSA key pair for encrypted pot registration.

**Response:**
```json
{
  "public_key": "-----BEGIN PUBLIC KEY-----...",
  "key_id": "abc123..."
}
```

#### POST `/aptos/register/verify`
Verifies pot registration with encrypted payload.

**Request:**
```json
{
  "encrypted_payload": "encrypted_hex_string",
  "public_key": "-----BEGIN PUBLIC KEY-----...",
  "signature": "aptos_signature"
}
```

#### POST `/aptos/authenticate/options`
Generates authentication challenges for treasure hunting attempt.

**Request:**
```json
{
  "payload": {
    "attempt_id": "attempt_123"
  },
  "signature": "aptos_signature"
}
```

**Response:**
```json
{
  "challenge_id": "attempt_123",
  "challenges": [
    {
      "grid": "abcde...",
      "colors": ["red", "green", "blue", ...]
    }
  ]
}
```

#### POST `/aptos/authenticate/verify`
Verifies authentication solution.

**Request:**
```json
{
  "solutions": ["Up", "Down", "Left"],
  "challenge_id": "attempt_123"
}
```

### EVM Endpoints

#### POST `/evm/register/options`
Generates RSA key pair for encrypted pot registration on EVM chains.

#### POST `/evm/register/verify`
Verifies pot registration with encrypted payload and wallet signature.

#### POST `/evm/authenticate/options`
Generates authentication challenges for EVM treasure hunting attempt.

#### POST `/evm/authenticate/verify`
Verifies authentication solution for EVM attempts.

#### POST `/evm/airdrop`
Request airdrop tokens for testing.

### General Endpoints

#### GET `/chains`
Returns all supported chains and their configurations.

**Response:**
```json
{
  "chains": [
    {
      "chainId": 2,
      "type": "aptos",
      "name": "Aptos Testnet",
      "rpcUrl": "https://fullnode.testnet.aptoslabs.com/v1",
      "explorerUrl": "https://explorer.aptoslabs.com",
      "contracts": {
        "moneypot": {
          "address": "0x..."
        }
      }
    }
  ]
}
```

#### GET `/health`
Health check endpoint.

## Supported Chains

### Aptos
- **Testnet**: Aptos Testnet (Chain ID: 2)

### EVM-Compatible
- **Creditcoin Testnet** (Chain ID: 102031)
- **Sepolia** (Chain ID: 11155111)
- **Polkadot Hub Testnet** (Chain ID: 420420422)
- **Somnia Shannon Testnet** (Chain ID: 50312)

## Authentication Flow

### Registration Flow

1. User creates a pot on the blockchain → receives `pot_id`
2. Generate RSA key pair → call `/register/options`
3. Encrypt password configuration → call `/register/verify`
4. Pot becomes available for treasure hunting

### Authentication Flow

1. User pays entry fee → receives `attempt_id`
2. Request challenges → call `/authenticate/options`
3. Solve password challenges (color-direction mapping)
4. Submit solutions → call `/authenticate/verify`
5. Receive payout on success

## Development

### Prerequisites

- Bun (recommended) or Node.js 18+
- Wrangler CLI
- Cloudflare account

### Installation

```bash
bun install
```

### Development

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Deployment

```bash
bun run deploy
```

## Configuration

All configuration is hardcoded in `src/config/`:
- **Networks**: `src/config/networks.ts`
- **Aptos**: `src/config/aptos.ts`
- **EVM**: `src/config/viem.ts`

All RPC endpoints are public (no API keys required).

## Security

- RSA encryption for sensitive data (2048-bit keys)
- ECDSA signature verification for wallet authentication
- Time-based challenge expiry (5 minutes)
- One-time use challenges (deleted after verification)
- Blockchain integration for pot and attempt validation

## License

See LICENSE file for details.
