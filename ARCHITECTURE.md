# MoneyPot Authentication Service - Architecture

## 🎯 Arkiv Network Integration

MoneyPot Authentication Service uses **Arkiv Network** as a decentralized storage layer for challenge session management, replacing traditional centralized key-value storage with an Ethereum-based data layer that provides automatic TTL (Time-To-Live) expiration.

## Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        UI[Web Frontend]
        WALLET[User Wallet<br/>Aptos/EVM]
    end

    subgraph "Cloudflare Workers"
        AUTH[Authentication Service<br/>Hono Framework]

        subgraph "Route Handlers"
            REG_OPT[Register Options]
            REG_VER[Register Verify]
            AUTH_OPT[Authenticate Options]
            AUTH_VER[Authenticate Verify]
        end

        subgraph "Storage Layer"
            KV[Cloudflare KV<br/>Pot Config & Attempts]
            ARKIV[Arkiv Network<br/>Challenge Sessions]
        end
    end

    subgraph "Blockchain Layer"
        APTOS[Aptos Blockchain]
        EVM[EVM Chains<br/>Creditcoin, Polkadot, etc.]
        ARKIV_CHAIN[Arkiv Mendoza Testnet<br/>Chain ID: 60138453056]
    end

    UI -->|HTTP/HTTPS| AUTH
    WALLET -->|Signatures| AUTH

    AUTH --> REG_OPT
    AUTH --> REG_VER
    AUTH --> AUTH_OPT
    AUTH --> AUTH_VER

    REG_OPT --> KV
    REG_VER --> APTOS
    REG_VER --> EVM
    REG_VER --> KV

    AUTH_OPT --> APTOS
    AUTH_OPT --> EVM
    AUTH_OPT --> ARKIV
    AUTH_OPT --> KV

    AUTH_VER --> ARKIV
    AUTH_VER --> KV
    AUTH_VER --> APTOS
    AUTH_VER --> EVM

    ARKIV -->|Create/Query Entities| ARKIV_CHAIN

    style ARKIV fill:#4a9eff,stroke:#1a5fb3,stroke-width:3px
    style ARKIV_CHAIN fill:#4a9eff,stroke:#1a5fb3,stroke-width:3px
```

## Challenge Session Flow with Arkiv

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant AuthService
    participant Arkiv as Arkiv Network
    participant Blockchain as Aptos/EVM

    User->>Frontend: Start Treasure Hunt
    Frontend->>Blockchain: Pay Entry Fee (Get attempt_id)

    Frontend->>AuthService: POST /authenticate/options<br/>{attempt_id, signature}

    AuthService->>Blockchain: Verify attempt & pot
    Blockchain-->>AuthService: ✅ Valid attempt

    AuthService->>AuthService: Generate Challenges<br/>(Password-based grid)

    Note over AuthService,Arkiv: Store Challenge Session in Arkiv
    AuthService->>Arkiv: createEntity({<br/>  type: "challenge",<br/>  challengeId: attempt_id,<br/>  expiresIn: 600<br/>})
    Arkiv-->>AuthService: entityKey, txHash

    AuthService-->>Frontend: {<br/>  challenge_id: attempt_id,<br/>  challenges: [...]<br/>}

    Frontend->>User: Display Challenges
    User->>Frontend: Solve Challenges

    Frontend->>AuthService: POST /authenticate/verify<br/>{solutions, challenge_id}

    Note over AuthService,Arkiv: Verify Challenge Session
    AuthService->>Arkiv: queryEntities(<br/>  type="challenge" AND<br/>  challengeId=attempt_id<br/>)
    Arkiv-->>AuthService: ✅ Challenge found

    AuthService->>AuthService: Verify Solutions

    alt Solutions Correct
        AuthService->>Blockchain: Complete Attempt
        Blockchain-->>AuthService: ✅ Payout
        AuthService-->>Frontend: {success: true}
        Note over Arkiv: Challenge auto-expires<br/>(TTL-based)
    else Solutions Incorrect
        AuthService-->>Frontend: {error: "Invalid solution"}
        Note over Arkiv: Challenge remains<br/>(can retry until TTL)
    end
```

## Arkiv Integration Details

### Why Arkiv?

MoneyPot replaced **Cloudflare KV** with **Arkiv Network** for challenge session storage because:

1. **Decentralized**: No dependency on Cloudflare's centralized storage
2. **Automatic Expiration**: Built-in TTL eliminates need for manual cleanup
3. **Cost-Effective**: Ethereum-based storage with predictable costs
4. **Transparent**: All challenge sessions are queryable on-chain
5. **Resilient**: Distributed storage reduces single point of failure

### Arkiv Implementation

#### Storage Pattern

```typescript
// Creating a challenge session in Arkiv
const { entityKey, txHash } = await walletClient.createEntity({
  payload: stringToPayload("active"),
  contentType: "text/plain",
  attributes: [
    { key: "type", value: "challenge" },
    { key: "challengeId", value: attempt_id },
  ],
  expiresIn: 10 * 60, // 10-minute expiry
})
```

#### Query Pattern

```typescript
// Querying challenge sessions
const results = await publicClient
  .buildQuery()
  .where([eq("type", "challenge"), eq("challengeId", attempt_id)])
  .fetch()
```

### Data Flow Diagram

```mermaid
graph LR
    subgraph "Challenge Lifecycle"
        CREATE[1. Create Challenge<br/>POST /authenticate/options]
        STORE[2. Store in Arkiv<br/>createEntity]
        QUERY[3. Verify Challenge<br/>POST /authenticate/verify]
        EXPIRE[4. Auto-Expire<br/>TTL: 10 minutes]
    end

    subgraph "Arkiv Entity Structure"
        ENTITY[Entity]
        ATTRS[Attributes:<br/>- type: challenge<br/>- challengeId: xxx]
        PAYLOAD[Payload:<br/>"active"]
        TTL[TTL:<br/>600 seconds]
    end

    CREATE --> STORE
    STORE --> ENTITY
    ENTITY --> ATTRS
    ENTITY --> PAYLOAD
    ENTITY --> TTL

    QUERY --> ENTITY
    TTL --> EXPIRE

    style ENTITY fill:#4a9eff,stroke:#1a5fb3
    style STORE fill:#90ee90,stroke:#228b22
    style QUERY fill:#ffd700,stroke:#daa520
    style EXPIRE fill:#ff6347,stroke:#cd5c5c
```

## System Components

### Storage Layer Architecture

```mermaid
graph TB
    subgraph "Cloudflare KV"
        KV_POTS[Pot Configurations]
        KV_ATTEMPTS[Attempt Records]
        KV_CHALLENGES[Challenge Data]
    end

    subgraph "Arkiv Network"
        ARKIV_SESSIONS[Challenge Sessions<br/>TTL: 10 minutes]
    end

    subgraph "Blockchain"
        BLOCKCHAIN_POTS[Pot Registry]
        BLOCKCHAIN_ATTEMPTS[Attempt Tracking]
    end

    AUTH_SERVICE[Authentication Service] --> KV_POTS
    AUTH_SERVICE --> KV_ATTEMPTS
    AUTH_SERVICE --> KV_CHALLENGES
    AUTH_SERVICE --> ARKIV_SESSIONS
    AUTH_SERVICE --> BLOCKCHAIN_POTS
    AUTH_SERVICE --> BLOCKCHAIN_ATTEMPTS

    style ARKIV_SESSIONS fill:#4a9eff,stroke:#1a5fb3,stroke-width:3px
```

### Multi-Chain Support

```mermaid
graph LR
    subgraph "Supported Chains"
        APTOS[Aptos Testnet<br/>Chain ID: 2]
        CREDITCOIN[Creditcoin Testnet<br/>Chain ID: 102031]
        POLKADOT[Polkadot Hub<br/>Chain ID: 420420422]
        SEPOLIA[Sepolia<br/>Chain ID: 11155111]
        SOMNIA[Somnia Shannon<br/>Chain ID: 50312]
    end

    subgraph "Arkiv Network"
        ARKIV[Arkiv Mendoza Testnet<br/>Chain ID: 60138453056]
    end

    AUTH[Auth Service] --> APTOS
    AUTH --> CREDITCOIN
    AUTH --> POLKADOT
    AUTH --> SEPOLIA
    AUTH --> SOMNIA
    AUTH --> ARKIV

    style ARKIV fill:#4a9eff,stroke:#1a5fb3,stroke-width:3px
```

## Code Architecture

### Challenge Store Implementation

The `ChallengeStore` class (`src/db/challengeStore.ts`) is the primary interface to Arkiv:

```mermaid
classDiagram
    class ChallengeStore {
        +setChallenge(env, challengeId)
        +getChallenge(env, challengeId)
        +deleteChallenge(env, challengeId)
    }

    class ArkivClient {
        +createEntity(params)
        +buildQuery()
    }

    class ArkivPublicClient {
        +buildQuery()
        +getEntity(entityKey)
    }

    ChallengeStore --> ArkivClient : uses for writes
    ChallengeStore --> ArkivPublicClient : uses for reads

    note for ChallengeStore "Handles challenge session<br/>storage in Arkiv Network<br/>with 10-minute TTL"
```

### Request Flow

```mermaid
graph TD
    REQ[HTTP Request] --> MIDDLEWARE[Middleware Layer]

    subgraph "Middleware"
        WALLET[Wallet Auth]
        CHAIN[Chain Config]
        THROTTLE[Rate Limiting]
    end

    MIDDLEWARE --> ROUTER[Route Handler]

    subgraph "Route Handlers"
        AUTH_OPT[Authenticate Options]
        AUTH_VER[Authenticate Verify]
    end

    ROUTER --> AUTH_OPT
    ROUTER --> AUTH_VER

    AUTH_OPT --> CHALLENGE_STORE[ChallengeStore]
    AUTH_VER --> CHALLENGE_STORE

    CHALLENGE_STORE --> ARKIV[Arkiv Network]

    style CHALLENGE_STORE fill:#4a9eff,stroke:#1a5fb3
    style ARKIV fill:#4a9eff,stroke:#1a5fb3
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Edge Network"
        CF_WORKER[Cloudflare Worker<br/>Global Distribution]
    end

    subgraph "Storage"
        ARKIV[Arkiv Network<br/>Mendoza Testnet]
        KV[Cloudflare KV<br/>Regional]
    end

    subgraph "Blockchain Networks"
        APTOS_NET[Aptos Testnet]
        EVM_NETS[EVM Networks]
    end

    USER[User] -->|HTTPS| CF_WORKER
    CF_WORKER --> ARKIV
    CF_WORKER --> KV
    CF_WORKER --> APTOS_NET
    CF_WORKER --> EVM_NETS

    style ARKIV fill:#4a9eff,stroke:#1a5fb3,stroke-width:3px
    style CF_WORKER fill:#f96,stroke:#c85,stroke-width:2px
```

## Benefits of Arkiv Integration

1. **Decentralization**: Challenge sessions stored on Ethereum-based Arkiv Network
2. **Automatic Cleanup**: TTL-based expiration eliminates manual session management
3. **Transparency**: All challenge sessions queryable on-chain
4. **Cost Efficiency**: Predictable storage costs with automatic expiration
5. **Resilience**: Distributed storage reduces dependency on centralized services

## Technical Implementation

### Arkiv SDK Usage

```typescript
// Client creation
const walletClient = createWalletClient({
  chain: mendoza,
  transport: http(rpcUrl, { fetchFn: globalThis.fetch }),
  account: privateKeyToAccount(privateKey),
})

// Public client for queries
const publicClient = createPublicClient({
  chain: mendoza,
  transport: http(rpcUrl, { fetchFn: globalThis.fetch }),
})
```

### Challenge Storage

- **Entity Type**: `challenge`
- **Attributes**:
  - `type`: "challenge"
  - `challengeId`: unique attempt identifier
- **Payload**: "active" (status indicator)
- **TTL**: 600 seconds (10 minutes)

### Query Pattern

Using Arkiv's query builder for efficient challenge lookup:

```typescript
const results = await publicClient
  .buildQuery()
  .where([eq("type", "challenge"), eq("challengeId", challengeId)])
  .fetch()
```

## Metrics & Monitoring

All Arkiv operations are logged with structured logging:

- Challenge creation events
- Challenge query events
- TTL extension events
- Error events with full context

## Future Enhancements

Potential improvements to the Arkiv integration:

1. **Batch Operations**: Use `mutateEntities` for bulk challenge creation
2. **Event Watching**: Subscribe to Arkiv events for real-time updates
3. **Analytics**: Track challenge session metrics on-chain
4. **Multi-Chain Arkiv**: Support multiple Arkiv networks
