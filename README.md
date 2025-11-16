# MoneyPot Authentication Service

A production-grade authentication service for MoneyPot, providing multi-chain wallet verification for treasure hunting games on Aptos and EVM-compatible blockchains, including **Polkadot Hub Testnet (Passet)**.

## 🎯 Hackathon Submissions

### Arkiv Network Main Track

**Project**: MoneyPot - Decentralized Challenge Session Storage with Arkiv Network

This submission demonstrates a production-ready integration of **Arkiv Network** for decentralized challenge session management in a multi-chain treasure hunting authentication service.

#### 📊 Architecture & Diagrams

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for detailed architecture diagrams, data flow, and system design using Mermaid diagrams.

#### 🎬 Demo Video

**Link**: [To be added - 2-3 minute demo video]

#### 🚀 Live Demo

- **Authentication Backend**: https://auth.money-pot.ideomind.org
- **Arkiv-Powered App**: https://money-pot.ideomind.org

#### 💡 How Arkiv is Used

**Challenge Session Storage**: MoneyPot uses Arkiv Network as a decentralized storage layer for challenge session management:

1. **Challenge Creation**: When a user starts a treasure hunt, challenge sessions are stored in Arkiv with:
   - Entity type: `challenge`
   - Attributes: `type`, `challengeId`
   - TTL: 10 minutes (automatic expiration)

2. **Challenge Verification**: When verifying solutions, we query Arkiv using the query builder:
   ```typescript
   publicClient.buildQuery()
     .where([
       eq("type", "challenge"),
       eq("challengeId", attempt_id),
     ])
     .fetch()
   ```

3. **Automatic Cleanup**: Challenges automatically expire via Arkiv's TTL mechanism, eliminating the need for manual session management.

**Benefits**:
- ✅ Decentralized storage (no dependency on Cloudflare KV)
- ✅ Automatic expiration via TTL
- ✅ On-chain transparency
- ✅ Cost-effective and resilient

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for detailed diagrams and implementation details.

#### 📚 How to Run

See [Setup Instructions](#setup-instructions) below for full deployment guide.

---

### Polkadot Builder Party Hackathon

**Project**: MoneyPot - Multi-Chain Treasure Hunting Authentication

**Hackathon**: Polkadot Builder Party Hackathon

### 🚀 Live Deployments

- **Authentication Backend**: https://auth.money-pot.ideomind.org
- **Arkiv-Powered App**: https://money-pot.ideomind.org
- **Polkadot Testnet EVM Hub App**: https://mp-evm.ideomind.org

### 📂 Repository Links

- **Authentication Backend** (This Repository): https://github.com/ideo-mind/moneypot.auth
- **Frontend (Aptos + Arkiv)**: https://github.com/ideo-mind/moneypot
- **Frontend (EVM / Polkadot Hub)**: https://github.com/ideo-mind/moneypot.evm

### 📹 Videos & Presentation

- **Pitch Video**: [Watch on YouTube](https://youtu.be/430EiladvGk)
- **Demo Videos**:
  - **EVM Demo (Polkadot Hub)**: [Watch on YouTube](https://youtu.be/5XN1MwFJ6Ks)
  - **Arkiv + Aptos Demo**: [Watch on YouTube](https://youtu.be/idCJSmm6QUs)
- **Pitch Deck**: [Link to be added]

### 👥 Team

- **Hiro** - Lead Developer ([hiro@ideomind.org](mailto:hiro@ideomind.org))
  - Architecture & Backend Development
  - Smart Contract Integration
  - Multi-Chain Support

---

## Overview

MoneyPot Authentication Service is a Cloudflare Workers-based API that enables secure wallet authentication and registration for treasure hunting games. It supports both Aptos and EVM-compatible chains (including Polkadot Hub Testnet), allowing users to authenticate and participate in treasure hunting competitions with encrypted password challenges.

## Features

- **Multi-Chain Support**: Aptos and EVM-compatible chains (Creditcoin, Sepolia, **Polkadot Hub**, Somnia)
- **Polkadot Hub Integration**: Deployed and tested on Polkadot Hub Testnet (Passet Hub)
- **Wallet Authentication**: Secure signature-based wallet verification
- **Encrypted Challenges**: RSA-encrypted password challenges for treasure hunting
- **Public API**: All endpoints use public RPC endpoints (no API keys required)
- **Cloudflare Workers**: Edge computing for low latency and global distribution
- **⭐ Arkiv Integration**: Decentralized challenge storage on Arkiv Network with automatic TTL expiration

## Architecture

- **Runtime**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare KV for persistent storage (pot configs, attempts)
- **Blockchain**: Aptos and EVM-compatible chains (including Polkadot Hub)
- **Storage**: **Arkiv Network** for challenge storage (decentralized, TTL-based) ⭐
- **Crypto**: RSA encryption/decryption, ECDSA signature verification

**📊 See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture diagrams and data flow.**

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

### EVM Endpoints (Including Polkadot Hub)

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

Returns all supported chains and their configurations, including Polkadot Hub.

**Response:**

```json
{
  "chains": [
    {
      "chainId": 420420422,
      "type": "evm",
      "name": "Polkadot Hub Testnet",
      "rpcUrl": "https://testnet-passet-hub-eth-rpc.polkadot.io",
      "explorerUrl": "https://blockscout-passet-hub.parity-testnet.parity.io",
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

#### GET `/`

Service information and available endpoints.

## Supported Chains

### Aptos

- **Testnet**: Aptos Testnet (Chain ID: 2)

### EVM-Compatible

- **Creditcoin Testnet** (Chain ID: 102031)
- **Sepolia** (Chain ID: 11155111)
- **Polkadot Hub Testnet** (Chain ID: 420420422) ✅ **Hackathon Focus**
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

## Setup Instructions

### Prerequisites

- Bun (recommended) or Node.js 18+
- Wrangler CLI
- Cloudflare account

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd moneypot.auth

# Install dependencies
bun install
```

### Development

```bash
# Start local development server
bun run dev
```

The service will be available at `http://localhost:8787`

### Testing the API

Test the health endpoint:

```bash
curl https://auth.money-pot.ideomind.org/health
```

Get supported chains:

```bash
curl https://auth.money-pot.ideomind.org/chains
```

### Build

```bash
bun run build
```

### Deployment

```bash
# Deploy to Cloudflare Workers
bun run deploy
```

## Configuration

All configuration is hardcoded in `src/config/`:

- **Networks**: `src/config/networks.ts`
- **Aptos**: `src/config/aptos.ts`
- **EVM**: `src/config/viem.ts`

All RPC endpoints are public (no API keys required).

### Arkiv Network Configuration

The service uses **Arkiv Network Mendoza Testnet** for decentralized challenge storage:

- **Chain ID**: `60138453056`
- **RPC**: `https://mendoza.hoodi.arkiv.network/rpc`
- **WebSocket**: `wss://mendoza.hoodi.arkiv.network/rpc/ws`
- **Explorer**: `https://explorer.mendoza.hoodi.arkiv.network`
- **SDK**: `@arkiv-network/sdk@^0.4.4`

**Environment Variables Required**:
- `ORACLE_PRIVATE_KEY_EVM`: Private key for Arkiv write operations (EVM format `0x...`)

**Configuration Location**: `src/config/viem.ts`

### Polkadot Hub Configuration

The service is configured for Polkadot Hub Testnet with:

- Chain ID: `420420422`
- RPC: `https://testnet-passet-hub-eth-rpc.polkadot.io`
- Explorer: `https://blockscout-passet-hub.parity-testnet.parity.io`
- Native Token: Passet (PAS)

## Testing Arkiv Integration

### Prerequisites

1. **Private Key Setup**: Ensure `ORACLE_PRIVATE_KEY_EVM` is set in your environment (for Cloudflare Workers secrets or `.dev.vars` for local development)

2. **Funded Wallet**: The private key must have ETH on Arkiv Mendoza Testnet for write operations

### Testing Challenge Storage

1. **Start a treasure hunt** via the frontend: https://money-pot.ideomind.org

2. **Monitor Arkiv Operations**: Check the Cloudflare Workers logs for:
   - `Creating Arkiv wallet client...`
   - `Storing challenge in Arkiv...`
   - `Challenge stored in Arkiv successfully`
   - `Querying challenge from Arkiv...`
   - `Challenge found in Arkiv`

3. **Query on Arkiv Explorer**: Visit https://explorer.mendoza.hoodi.arkiv.network to see challenge entities

4. **Verify Auto-Expiration**: Challenges automatically expire after 10 minutes (600 seconds TTL)

### Code Examples

**Challenge Creation**:
```typescript
// src/db/challengeStore.ts
await ChallengeStore.setChallenge(env, challengeId);
```

**Challenge Query**:
```typescript
// src/db/challengeStore.ts
const exists = await ChallengeStore.getChallenge(env, challengeId);
```

See `src/db/challengeStore.ts` for the full implementation.

## Testing on Polkadot Hub

### Getting Test Tokens

1. Visit the [Polkadot Faucet](https://faucet.polkadot.io/?parachain=1111)
2. Request Passet (PAS) tokens
3. Connect your wallet to the testnet

### Interacting with the API

1. **Check supported chains**:

   ```bash
   curl https://auth.money-pot.ideomind.org/chains | jq '.chains[] | select(.chainId == 420420422)'
   ```

2. **Register a pot** (via frontend at https://mp-evm.ideomind.org)

3. **Authenticate** (via frontend at https://mp-evm.ideomind.org)

## Security

- RSA encryption for sensitive data (2048-bit keys)
- ECDSA signature verification for wallet authentication
- Time-based challenge expiry via Arkiv TTL (10 minutes)
- One-time use challenges (automatically expired via Arkiv TTL)
- Blockchain integration for pot and attempt validation
- Decentralized challenge storage (no single point of failure)

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Language**: TypeScript
- **Blockchain SDKs**:
  - Viem (EVM chains)
  - Aptos SDK
  - **@arkiv-network/sdk@^0.4.4** (Arkiv Network integration) ⭐
- **Storage**:
  - Cloudflare KV (pot configs, attempts)
  - **Arkiv Network** (challenge sessions with TTL) ⭐
- **Crypto**: node-forge, crypto
- **Package Manager**: Bun

## Project Structure

```
src/
├── config/          # Chain configurations (Polkadot Hub included)
├── routes/          # API route handlers
│   ├── aptos/      # Aptos endpoints
│   ├── evm/        # EVM endpoints (Polkadot Hub)
│   └── chains/     # Chain info endpoint
├── mw/              # Middleware (wallet auth, throttling)
├── db/              # Database abstractions (KV stores)
├── utils/           # Utility functions
├── web3/            # Blockchain utilities
└── lib/             # Core libraries
```

## 🎬 Demo Videos

### EVM Demo (Polkadot Hub)

Watch our live demo showcasing MoneyPot authentication on Polkadot Hub Testnet (Passet Hub):

- **[Watch EVM Demo on YouTube](https://youtu.be/5XN1MwFJ6Ks)**
- Features: Wallet connection, pot registration, treasure hunting challenges
- Live app: https://mp-evm.ideomind.org

### Arkiv + Aptos Demo

See how MoneyPot integrates with Arkiv Network for decentralized challenge storage:

- **[Watch Arkiv + Aptos Demo on YouTube](https://youtu.be/idCJSmm6QUs)**
- Features: Decentralized storage, Aptos authentication, encrypted challenges
- Live app: https://money-pot.ideomind.org

## Milestone 2 Plan

See [MILESTONE-2-PLAN.md](./MILESTONE-2-PLAN.md) for detailed Milestone 2 roadmap.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Related Repositories

This authentication backend is part of the MoneyPot ecosystem:

- **[moneypot.auth](https://github.com/ideo-mind/moneypot.auth)** (This Repository) - Authentication service backend
- **[moneypot](https://github.com/ideo-mind/moneypot)** - Frontend for Aptos + Arkiv integration
- **[moneypot.evm](https://github.com/ideo-mind/moneypot.evm)** - Frontend for EVM chains (Polkadot Hub)

## Contact

- **Email**: [hiro@ideomind.org](mailto:hiro@ideomind.org)
- **Backend API**: https://auth.money-pot.ideomind.org
- **Demo Apps**:
  - https://money-pot.ideomind.org (Arkiv-powered)
  - https://mp-evm.ideomind.org (Polkadot Hub)

---

**Built for Polkadot Builder Party Hackathon** 🚀
