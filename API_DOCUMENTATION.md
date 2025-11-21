# Money Pot Verifier Service API Documentation

## Overview

The Money Pot Verifier Service provides secure 1P (One-Letter Password) authentication for treasure hunting games on the Aptos blockchain. This service enables pot creators to register authentication challenges and treasure hunters to attempt solving them for USDC rewards.

## Base URL

- **Development**: `http://localhost:8787`
- **Production**: `https://your-domain.com`

## Authentication

The service uses a two-layer authentication system:

1. **RSA Encryption**: For secure pot registration
2. **1FA Signatures**: For hunter authentication attempts

## API Endpoints

### Health & Service Info

#### GET `/health`

Check service health status.

**Response:**

```json
{
  "service": "Money Pot Verifier",
  "status": "healthy",
  "timestamp": "2025-01-03T10:30:00.000Z"
}
```

#### GET `/`

Get service information and available endpoints.

**Response:**

```json
{
  "service": "Money Pot Verifier Service",
  "version": "1.0.0",
  "status": "active",
  "endpoints": {
    "1P Authentication": "/authenticate",
    "1P Registration": "/register"
  }
}
```

---

## Pot Creation Flow (Creator)

### 1. Generate RSA Key Pair

#### POST `/register/options`

Generate RSA key pair for encrypting pot registration data.

**Request:**

```http
POST /register/options
Content-Type: application/json
```

**Response:**

```json
{
  "public_key": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----",
  "key_id": "abc123def456"
}
```

**Key Details:**

- RSA 2048-bit key pair
- 5-minute expiry
- Used for encrypting sensitive pot data

### 2. Register Pot with 1P Configuration

#### POST `/register/verify`

Register a pot with encrypted 1P authentication configuration.

**Request:**

```http
POST /register/verify
Content-Type: application/json

{
  "encrypted_payload": "encrypted_hex_string",
  "public_key": "-----BEGIN PUBLIC KEY-----...",
  "signature": "aptos_signature"
}
```

**Encrypted Payload Structure:**

```json
{
  "pot_id": "pot_123456",
  "1p": "A",
  "legend": {
    "A": "Up",
    "B": "Down",
    "C": "Left",
    "D": "Right"
  },
  "iat": 1704268800,
  "iss": "0xcreator_address",
  "exp": 1704272400
}
```

**Response:**

```json
{
  "success": true
}
```

**Validation:**

- Verifies pot exists on blockchain
- Checks pot is not already registered
- Validates creator signature
- Stores 1P configuration securely

---

## Treasure Hunting Flow (Hunter)

### 1. Get Authentication Challenges

#### POST `/authenticate/options`

Generate authentication challenges for a hunter's attempt.

**Request:**

```http
POST /authenticate/options
Content-Type: application/json

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
      "grid": "ABCDEFGHIJKLMNOPQRSTUVWXY",
      "colors": ["red", "green", "blue", "yellow", "red", ...]
    },
    {
      "grid": "ZYXWVUTSRQPONMLKJIHGFEDC",
      "colors": ["blue", "yellow", "red", "green", "blue", ...]
    }
  ]
}
```

**Challenge Details:**

- 5x5 grid with random characters
- Password character hidden in each grid
- Color mapping based on pot's legend
- 5-minute expiry for security

### 2. Submit Solutions

#### POST `/authenticate/verify`

Verify hunter's solutions to the 1P challenges.

**Request:**

```http
POST /authenticate/verify
Content-Type: application/json

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

**Verification Process:**

1. Find password character in each grid
2. Check if submitted direction matches legend
3. All rounds must be correct for success
4. Update blockchain with result

---

## 1P Protocol Details

### Password Domains

The system supports various character domains for 1P passwords:

```javascript
const DOMAINS = {
  ascii: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
  emojis:
    "😀😂❤️👍🙏😍😭😅🎉🔥💯😎🤔🤦😴🤖👀✨✅🚀💎🌟⭐💫🎯🎨🎪🎸🎵🎶🏆🏅🎊🎈🎁🎀🌈🌸🌺🌻🌷🌹",
  hearts: "💖💝💘💗💓💕💞💜🧡💛💚💙🤍🖤🤎❣️💋",
  nature: "🌳🌲🌴🌿🍀🌾🌻🌺🌸🌷🌹🌼🌵🌱🍃🌿🦋🐝🐞🕷️",
  // ... and many more
}
```

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
3. Assign colors based on legend configuration
4. Repeat for each round (difficulty-based)

### Solution Verification

1. Find password character in each grid
2. Check if submitted direction matches legend
3. All rounds must be correct for success

---

## Error Handling

### Common Error Responses

#### 400 Bad Request

```json
{
  "error": "Missing required fields"
}
```

#### 401 Unauthorized

```json
{
  "error": "Signature verification failed"
}
```

#### 404 Not Found

```json
{
  "error": "Pot not found or not active"
}
```

#### 500 Internal Server Error

```json
{
  "error": "Internal server error",
  "message": "Detailed error message"
}
```

### Error Scenarios

1. **Invalid RSA Key**: Key expired or not found
2. **Decryption Failed**: Invalid encrypted payload
3. **Signature Mismatch**: Creator signature verification failed
4. **Pot Not Found**: Pot doesn't exist on blockchain
5. **Already Registered**: Pot already has 1P configuration
6. **Challenge Expired**: Challenge data expired (5 minutes)
7. **Invalid Solutions**: Wrong directions submitted

---

## Security Features

### Encryption

- **RSA 2048-bit**: All sensitive data encrypted
- **OAEP Padding**: Secure encryption padding
- **SHA-256**: Hash function for signatures

### Time-based Security

- **5-minute expiry**: Keys and challenges auto-expire
- **One-time use**: Challenges deleted after verification
- **Rate limiting**: Prevents abuse

### Blockchain Integration

- **Pot validation**: Verifies pot exists and is active
- **Attempt tracking**: Monitors hunter attempts
- **Result updates**: Updates blockchain with outcomes

---

## Rate Limits

- **Key Generation**: 10 requests per minute per IP
- **Registration**: 5 requests per minute per IP
- **Authentication**: 20 requests per minute per IP
- **Verification**: 10 requests per minute per IP

---

## Testing

Use the provided `rest.http` file for comprehensive API testing:

1. **Health Checks**: Verify service status
2. **Complete Flows**: Test full pot creation and hunting flows
3. **Error Handling**: Test invalid inputs and edge cases
4. **Performance**: Measure response times
5. **Mock Data**: Pre-configured test scenarios

### Running Tests

```bash
# Start the service
bun run dev

# Use VS Code REST Client extension
# Open rest.http and run individual requests
```

---

## Integration Examples

### JavaScript/TypeScript

```javascript
// Generate RSA key pair
const keyResponse = await fetch("/register/options", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
})
const { public_key, key_id } = await keyResponse.json()

// Encrypt payload
const payload = {
  pot_id: "pot_123",
  "1p": "A",
  legend: { A: "Up", B: "Down" },
  iat: Math.floor(Date.now() / 1000),
  iss: "0xcreator",
  exp: Math.floor(Date.now() / 1000) + 3600,
}

const encrypted = encryptWithRSA(JSON.stringify(payload), public_key)

// Register pot
const registerResponse = await fetch("/register/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    encrypted_payload: encrypted,
    public_key,
    signature: "aptos_signature",
  }),
})
```

### Python

```python
import requests
import json
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding

# Generate RSA key pair
response = requests.post('http://localhost:8787/register/options')
key_data = response.json()

# Encrypt payload
payload = {
    "pot_id": "pot_123",
    "1p": "A",
    "legend": {"A": "Up", "B": "Down"},
    "iat": int(time.time()),
    "iss": "0xcreator",
    "exp": int(time.time()) + 3600
}

# Register pot
register_data = {
    "encrypted_payload": encrypted_payload,
    "public_key": key_data["public_key"],
    "signature": "aptos_signature"
}

response = requests.post(
    'http://localhost:8787/register/verify',
    json=register_data
)
```

---

## Support

For questions or issues:

- **Documentation**: This file
- **API Tests**: `rest.http`
- **Source Code**: `src/` directory
- **Configuration**: `wrangler.toml`

---

## Changelog

### v1.0.0 (2025-01-03)

- Initial release
- 1P authentication protocol
- RSA encryption for pot registration
- Challenge generation and verification
- Blockchain integration
- Comprehensive error handling
