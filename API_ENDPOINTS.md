# Money Pot Verifier Service API

This service provides the backend authentication endpoints for the Money Pot 1P protocol.

## Base URL

- Development: `http://localhost:8787`
- Production: `https://money-auth.your-domain.workers.dev`

## Endpoints

### Health Check

- **GET** `/health` - Service health status
- **GET** `/` - Service information and available endpoints

### Registration Flow

#### 1. Get Encryption Key

- **POST** `/register/options`
- **Description**: Generate RSA key pair for encrypting registration payload
- **Response**:
  ```json
  {
    "public_key": "-----BEGIN PUBLIC KEY-----\n...",
    "key_id": "abc123..."
  }
  ```

#### 2. Register Pot with 1P Configuration

- **POST** `/register/verify`
- **Description**: Register a pot with 1P authentication configuration
- **Request Body**:
  ```json
  {
    "encrypted_payload": "encrypted_json_string",
    "public_key": "-----BEGIN PUBLIC KEY-----\n...",
    "signature": "creator_wallet_signature"
  }
  ```
- **Encrypted Payload Structure**:
  ```json
  {
    "pot_id": "123",
    "1p": "A",
    "legend": { "A": "Up" },
    "iat": 1234567890,
    "iss": "creator_address",
    "exp": 1234567890
  }
  ```

### Authentication Flow

#### 1. Get Authentication Challenge

- **POST** `/authenticate/options`
- **Description**: Generate 1P authentication challenges for an attempt
- **Request Body**:
  ```json
  {
    "payload": {
      "attempt_id": "456"
    },
    "signature": "1fa_private_key_signature"
  }
  ```
- **Response**:
  ```json
  {
    "challenge_id": "456",
    "challenges": [
      {
        "grid": "ABCDEFGHI...",
        "colors": ["red", "green", "blue", ...]
      }
    ]
  }
  ```

#### 2. Verify Authentication Solution

- **POST** `/authenticate/verify`
- **Description**: Verify 1P authentication solution and update blockchain
- **Request Body**:
  ```json
  {
    "solutions": ["Up", "Down", "Left"],
    "challenge_id": "456"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Authentication successful!"
  }
  ```

## Environment Variables

The service requires the following environment variables:

- `APTOS_NODE_URL`: Aptos RPC node URL
- `MONEY_POT_ADDRESS`: Smart contract address
- `ORACLE_PRIVATE_KEY`: Oracle account private key for blockchain updates
- `AUTH_DB`: Cloudflare KV namespace for data storage

## MVP Implementation Notes

- **1P Protocol**: Currently implemented as fake/placeholder for MVP
- **Signature Verification**: Simplified for MVP (always returns true)
- **Challenge Generation**: Generates fake challenges for testing
- **Blockchain Integration**: Uses actual Aptos SDK calls

## Error Responses

All endpoints return appropriate HTTP status codes:

- `200`: Success
- `400`: Bad Request (missing fields, invalid data)
- `401`: Unauthorized (signature verification failed)
- `500`: Internal Server Error

Error response format:

```json
{
  "error": "Error message description"
}
```
