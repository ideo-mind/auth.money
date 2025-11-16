# EVM Money Pot Demo

This is a Python demo integration script for testing the EVM Money Pot authentication system.

## Setup

1. **Install dependencies using uv:**

   ```bash
   uv sync
   ```

2. **Set up environment variables:**
   Create a `.env` file with the following variables:

   ```bash
   # Verifier Service URL
   MONEY_AUTH_URL=https://auth.money-pot.ideomind.org/

   # EVM Chain Configuration (chain ID only - RPC URL and contract address fetched dynamically)
   CHAIN_ID=102031

   # EVM Account Private Keys (replace with your own)
   EVM_CREATOR_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
   EVM_HUNTER_PRIVATE_KEY=0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890

   # Strategy for solving challenges (intelligent or random)
   STRATEGY=intelligent
   ```

3. **Generate EVM accounts (optional):**
   ```python
   from eth_account import Account
   creator = Account.create()
   hunter = Account.create()
   print(f"Creator: {creator.key.hex()}")
   print(f"Hunter: {hunter.key.hex()}")
   ```

## Usage

Run the EVM demo:

```bash
uv run evm.py
```

## Features

- **Dynamic Configuration**: Fetches RPC URL, contract address, and viem config from `/chains` endpoint
- **EVM Chain Support**: Works with any supported EVM chain (Creditcoin Testnet by default)
- **Multi-chain Headers**: Uses `MONEYPOT_CHAIN` header to specify chain
- **Signature Verification**: EVM signature recovery for 1FA verification
- **Complete Flow**: Pot creation, registration, hunting, and authentication
- **Strategy Support**: Intelligent or random challenge solving
- **Viem Config Integration**: Includes viem configuration for frontend integration

## API Endpoints Used

- `GET /chains` - Get supported chains info (includes RPC URLs, contract addresses, and viem config)
- `POST /evm/register/options` - Get encryption key
- `POST /evm/register/verify` - Register pot with 1P config
- `POST /evm/authenticate/options` - Get authentication challenges
- `POST /evm/authenticate/verify` - Verify authentication solution

### `/chains` Endpoint Response

The `/chains` endpoint returns comprehensive chain information:

```json
{
  "supportedChains": [
    {
      "chainId": 102031,
      "type": "evm",
      "name": "Creditcoin Testnet",
      "contractAddress": "0x44ed237C983c1CbB05d72885AE17ec9EC0B5A32C",
      "rpcUrl": "https://rpc.cc3-testnet.creditcoin.network",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com",
      "viemConfig": {
        "id": 102031,
        "name": "Creditcoin Testnet",
        "nativeCurrency": {
          "decimals": 18,
          "name": "Creditcoin",
          "symbol": "CTC"
        },
        "rpcUrls": {
          "default": { "http": ["https://rpc.cc3-testnet.creditcoin.network"] },
          "public": { "http": ["https://rpc.cc3-testnet.creditcoin.network"] }
        },
        "blockExplorers": {
          "default": {
            "name": "Creditcoin Testnet Explorer",
            "url": "https://creditcoin-testnet.blockscout.com"
          }
        },
        "testnet": true
      }
    }
  ],
  "defaultChainId": 2,
  "usage": {
    "header": "MONEYPOT_CHAIN",
    "description": "Optional header to specify chain ID. Defaults to Aptos Testnet (2) if not provided.",
    "examples": {
      "Aptos Testnet": "MONEYPOT_CHAIN: 2",
      "Creditcoin Testnet": "MONEYPOT_CHAIN: 102031"
    }
  }
}
```

## Differences from Aptos Version

1. **Dynamic Configuration**: Fetches RPC URL and contract address from `/chains` endpoint
2. **Web3 Integration**: Uses `web3.py` instead of Aptos SDK
3. **EVM Signatures**: Uses `eth-account` for signature creation/verification
4. **Contract Events**: Parses EVM contract events for pot/attempt IDs
5. **Chain Headers**: Uses `MONEYPOT_CHAIN` header for chain selection
6. **Gas Management**: Handles gas price and transaction confirmation
7. **Viem Config**: Includes viem configuration for frontend integration

## Troubleshooting

- Ensure you have testnet CTC tokens for gas fees
- Verify the `/chains` endpoint is accessible and returns your chain ID
- Check that the contract is deployed at the address returned by `/chains`
- Verify RPC endpoint returned by `/chains` is accessible
- Make sure private keys are valid hex strings with 0x prefix
- Ensure `CHAIN_ID` environment variable matches a supported chain
