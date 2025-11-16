# Money Pot Verifier Service

A Cloudflare Workers-based verifier service for the Money Pot 1P (One-Letter Password) authentication protocol on Aptos blockchain.

## Overview

The Money Pot Verifier Service implements the 1P authentication system as described in the PRD documents. It provides secure, brain-based authentication for treasure hunting games where users compete to solve authentication challenges for USDC rewards.

## Architecture

- **Runtime**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare KV (AUTH_DB for all storage)
- **Blockchain**: Aptos (for pot and attempt data)
- **Crypto**: RSA encryption/decryption with node-forge
- **Storage**: Reuses existing CredentialStore and ChallengeStore patterns

## API Endpoints

### Registration Endpoints

#### POST `/register/options`

Generates RSA key pair for encrypted pot registration.

**Response:**

```json
{
  "public_key": "-----BEGIN PUBLIC KEY-----...",
  "key_id": "abc123..."
}
```

#### POST `/register/verify`

Verifies pot registration with encrypted 1P payload.

**Request:**

```json
{
  "encrypted_payload": "encrypted_hex_string",
  "public_key": "-----BEGIN PUBLIC KEY-----...",
  "signature": "aptos_signature"
}
```

**Response:**

```json
{
  "success": true
}
```

### Authentication Endpoints

#### POST `/authenticate/options`

Generates authentication challenges for 1FA attempt.

**Request:**

```json
{
  "payload": {
    "attempt_id": "attempt_123"
  },
  "signature": "1fa_signature"
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

#### POST `/authenticate/verify`

Verifies 1P authentication solution.

**Request:**

```json
{
  "solutions": ["Up", "Down", "Left"],
  "challenge_id": "attempt_123"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Authentication successful!"
}
```

## 1P Protocol Details

### Password Domains

The system supports various character domains for 1P passwords:

- **ASCII**: Letters and digits
- **Symbols**: Special characters
- **Emojis**: Various emoji categories
- **International**: Japanese, Korean, Chinese, Arabic, Cyrillic

### Color-Direction Mapping

Users configure a legend mapping colors to directions:

- `red` → `Up`
- `green` → `Down`
- `blue` → `Left`
- `yellow` → `Right`
- `Skip` (no color) → Skip round

### Challenge Generation

1. Generate random 5x5 grid with random characters
2. Place password character at random position
3. Assign colors based on legend
4. Repeat for each round (difficulty-based)

### Solution Verification

1. Find password character in each grid
2. Check if submitted direction matches legend
3. All rounds must be correct for success

## Configuration

### Environment Variables

```toml
[vars]
rpID = "money-pot.fi"
rpName = "MoneyPot"
APTOS_NODE_URL = "https://fullnode.testnet.aptoslabs.com/v1"
ORACLE_PRIVATE_KEY = "your_oracle_private_key"
ORACLE_PRIVATE_KEY_EVM = "your_evm_oracle_private_key"  # Used for Arkiv challenge storage
```

### Storage

#### Arkiv Decentralized Storage

Challenge sessions for authentication now use **Arkiv** decentralized TTL storage, replacing Cloudflare KV for challenge management. Data is stored for exactly 10 minutes (configurable) and queried by challenge ID. Arkiv uses the same `ORACLE_PRIVATE_KEY_EVM` as other EVM operations.

**Configuration:**
- Arkiv configuration is hardcoded in `@config/viem.ts` (Arkiv testnet)
- Chain ID: `60138453025`
- RPC: `https://kaolin.hoodi.arkiv.network/rpc`
- WebSocket: `wss://kaolin.hoodi.arkiv.network/rpc/ws`

**Features:**
- Automatic TTL-based expiration (10 minutes default)
- Decentralized storage on Arkiv testnet
- Query-based retrieval using annotations
- No manual cleanup required (expires automatically)

#### KV Namespaces

- `AUTH_DB`: Legacy WebAuthn credentials and other persistent data
- `ONE_P_DB`: 1P configurations (password + legend)

## Security Features

1. **RSA Encryption**: All sensitive data encrypted with 2048-bit RSA
2. **Time-based Expiry**: Keys and challenges expire after 5 minutes
3. **Signature Verification**: Aptos wallet signatures for authentication
4. **One-time Use**: Challenges deleted after verification
5. **Blockchain Integration**: Pot and attempt validation

## Development

### Prerequisites

- Bun (recommended) or Node.js 18+
- Wrangler CLI
- Aptos testnet access

### Quick Start

```bash
# Install dependencies
bun install

# Start development server
bun run dev
```

### Environment Setup

1. Set up your environment variables in `wrangler.toml`:

```toml
[vars]
APTOS_NODE_URL = "https://fullnode.testnet.aptoslabs.com/v1"
MONEY_POT_ADDRESS = "0xea89ef9798a210009339ea6105c2008d8e154f8b5ae1807911c86320ea03ff3f"
ORACLE_PRIVATE_KEY = "your_oracle_private_key_here"
```

2. Generate oracle account:

```bash
aptos account generate --output-file oracle-key.txt
```

### Testing

#### Manual Testing

1. Start the service: `bun run dev`
2. Open http://localhost:8787/health
3. Test endpoints using curl or your frontend

#### Integration with Simulation Script

The service integrates with your existing `simul.py` script for end-to-end testing.

### Deployment

```bash
bun run deploy
```

## Game Theory Economics

The Money Pot protocol prevents cheating through game theory:

- **Honest Creators**: Earn 50% of entry fees from attracting hunters
- **Cheating Creators**: Lose potential earnings by reducing hunter attraction
- **Hunters**: Compete for 40% of pot value on successful authentication
- **Platform**: Takes remaining fees for service provision

## Integration with Smart Contracts

The verifier service integrates with Aptos Move contracts:

- `money_pot_manager.move`: Pot creation and management
- `usdc_handler.move`: USDC deposit/withdrawal
- `fee_distributor.move`: Entry fee and payout distribution
- `pot_registry.move`: Active pots tracking

## API Flow

### Pot Creator Flow

1. Create pot on blockchain → get `pot_id`
2. Generate 1FA key pair → get `one_fa_address`
3. Configure 1P password and legend
4. Call `/register/options` → get RSA public key
5. Encrypt payload and call `/register/verify`
6. Pot becomes available for hunting

### Treasure Hunter Flow

1. Browse active pots
2. Enter 1FA private key
3. Pay entry fee → get `attempt_id`
4. Call `/authenticate/options` → get challenges
5. Solve 1P challenges
6. Submit solutions to `/authenticate/verify`
7. Receive payout on success

## Monitoring

- Health check: `GET /health`
- Service status: `GET /`
- Observability enabled in Cloudflare Workers

## Future Enhancements

1. **ZK Circuits**: Migrate to on-chain zero-knowledge proofs
2. **Advanced Analytics**: Success rates and performance metrics
3. **Multi-language Support**: Additional character domains
4. **Mobile Optimization**: Enhanced mobile experience
5. **Audit Integration**: Smart contract security audits
