# Cloudflare Workers Secrets Setup Guide

## Overview

The Money Pot authentication system requires oracle private keys for each supported chain type. These should be set as **secrets** in Cloudflare Workers, not as regular environment variables.

## Required Secrets

You need to set these secrets in your Cloudflare Workers deployment:

### 1. Aptos Oracle Private Key

```bash
# For Aptos Testnet (chain ID: 2)
ORACLE_PRIVATE_KEY_APTOS=<your_aptos_oracle_private_key>
```

### 2. EVM Oracle Private Key

```bash
# For EVM chains like Creditcoin Testnet (chain ID: 102031)
ORACLE_PRIVATE_KEY_EVM=<your_evm_oracle_private_key>
```

## Setting Secrets via Wrangler CLI

### Method 1: Using `wrangler secret put`

```bash
# Set Aptos oracle key
wrangler secret put ORACLE_PRIVATE_KEY_APTOS

# Set EVM oracle key
wrangler secret put ORACLE_PRIVATE_KEY_EVM
```

When prompted, paste your private key (without quotes).

### Method 2: Using `wrangler secret put` with file

```bash
# Create a file with your private key
echo "your_private_key_here" > aptos_key.txt
echo "your_private_key_here" > evm_key.txt

# Set secrets from files
wrangler secret put ORACLE_PRIVATE_KEY_APTOS < aptos_key.txt
wrangler secret put ORACLE_PRIVATE_KEY_EVM < evm_key.txt

# Clean up
rm aptos_key.txt evm_key.txt
```

## Setting Secrets via Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages**
3. Select your Money Pot Worker
4. Go to **Settings** → **Variables**
5. Click **Add variable**
6. Set:
   - **Variable name**: `ORACLE_PRIVATE_KEY_APTOS`
   - **Type**: **Secret**
   - **Value**: Your Aptos oracle private key
7. Repeat for `ORACLE_PRIVATE_KEY_EVM`

## Oracle Key Format

### Aptos Oracle Key

- **Format**: Hex string (64 characters)
- **Example**: `0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`
- **Generation**: Use Aptos SDK or CLI tools

### EVM Oracle Key

- **Format**: Hex string (64 characters, no 0x prefix)
- **Example**: `1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`
- **Generation**: Use `eth-account` or similar EVM tools

## Verification

After setting secrets, verify they're accessible:

```bash
# Deploy and test
wrangler deploy

# Check logs for oracle initialization
wrangler tail
```

Look for logs like:

```
Chain middleware initialized: {
  chainId: 2,
  chainType: "aptos",
  chainName: "Aptos Testnet",
  contractAddress: "0xea89ef9798a210009339ea6105c2008d8e154f8b5ae1807911c86320ea03ff3f"
}
```

## Security Best Practices

1. **Never commit private keys to version control**
2. **Use different keys for different environments** (dev/staging/prod)
3. **Rotate keys regularly**
4. **Use least-privilege principle** - keys should only have necessary permissions
5. **Monitor key usage** through Cloudflare analytics

## Troubleshooting

### Common Issues

1. **"Oracle private key not configured"**
   - Check secret names match exactly: `ORACLE_PRIVATE_KEY_APTOS`, `ORACLE_PRIVATE_KEY_EVM`
   - Verify secrets are set as **Secret** type, not **Variable**

2. **"Failed to initialize oracle account"**
   - Check private key format (hex string)
   - Ensure key has sufficient permissions on the blockchain

3. **"Unsupported chain ID"**
   - Verify `MONEYPOT_CHAIN` header is set correctly
   - Check chain ID is supported in `src/config/networks.ts`

### Debug Commands

```bash
# List all secrets (names only)
wrangler secret list

# Check worker logs
wrangler tail --format=pretty

# Test specific endpoint
curl -H "MONEYPOT_CHAIN: 2" https://your-worker.your-subdomain.workers.dev/chains
```

## Environment Variables vs Secrets

| Type         | Use Case             | Visibility           | Example                |
| ------------ | -------------------- | -------------------- | ---------------------- |
| **Variable** | Non-sensitive config | Visible in dashboard | `CHAIN_ID`, `RPC_URL`  |
| **Secret**   | Sensitive data       | Hidden, encrypted    | `ORACLE_PRIVATE_KEY_*` |

**Note**: All chain configurations (RPC URLs, contract addresses) are hardcoded in `src/config/networks.ts` and don't need environment variables.

