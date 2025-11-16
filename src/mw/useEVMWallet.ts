import { Context, Next } from "hono"
import { IRunningContext } from "@lib/context"
import { getChain, getPublicClient } from "@config/viem"
import { abi } from "@abis/MoneyPot.json"
import { getPrimaryWallet } from "../web3/walletFactory"
import {
  getChainConfig,
  isChainSupported,
  ChainConfig,
  getMoneyPotContractAddress,
} from "@config/networks"
import { BlockchainClientFactory } from "@lib/blockchain"

/**
 * EVM Wallet Middleware with Chain Detection and Nonce Management
 *
 * This middleware:
 * - Uses the simplified wallet functions with nonce management
 * - Supports multiple private keys via PRIVATE_KEY_* pattern
 * - Provides rate limiting and nonce management via Durable Objects
 * - Uses EVM_ORACLE_ACCOUNT and PRIVATE_KEY_${address} pattern
 * - Integrates chain detection logic from useEVMChain middleware
 * - Reads chain_id from wallet payload (set by useWalletAuth)
 */
export const useEVMWallet = async (c: Context<IRunningContext>, next: Next) => {
  try {
 

    // Get chain_id from context (set by useWalletAuth middleware)
    const chainId = c.get("chainId")
    if (!chainId) {
      return c.json(
        {
          error:
            "Chain ID not found in context. Ensure useWalletAuth middleware is applied before useEVMWallet.",
        },
        500
      )
    }

    // Validate chain ID is supported and is EVM
    if (!isChainSupported(chainId)) {
      return c.json(
        {
          error: `Unsupported chain ID: ${chainId}. Supported EVM chains: 102031 (Creditcoin Testnet)`,
        },
        400
      )
    }

    // Get chain configuration
    const chainConfig = getChainConfig(chainId)
    if (!chainConfig) {
      return c.json({ error: "Failed to get chain configuration" }, 500)
    }

    // Ensure it's an EVM chain
    if (chainConfig.type !== "evm") {
      return c.json(
        {
          error: `Chain ${chainId} is not an EVM chain. Use /aptos routes for Aptos chains.`,
        },
        400
      )
    }

    // Create chain-specific public client
    const publicClient = getPublicClient(chainId)
    c.set("evmPublicClient", publicClient)

    


    // Create wallet with nonce management support using new pattern
    const walletClient = getPrimaryWallet(c.env, getChain(chainId))

    // Store basic EVM clients in context
    c.set("evmWalletClient", walletClient)
    c.set("evmOracleAccount", walletClient.account! as any)
    c.set("nonceManagementEnabled", true)

    // Use MoneyPot contract for EVM routes
    const moneypotAddress = getMoneyPotContractAddress(chainId)
    if (!moneypotAddress) {
      return c.json(
        {
          error: `MoneyPot contract not deployed on chain ${chainId}`,
        },
        400
      )
    }
    const contractAddress = moneypotAddress as `0x${string}`
    const contractABI = abi

    // Create EVM blockchain client using context clients
    const evmClient = BlockchainClientFactory.createEVMWithContext(
      chainConfig,
      publicClient,
      walletClient,
      contractAddress
    )
    c.set("evmClient", evmClient)

    // Store chain information in context
    c.set("chainType", "evm")
    c.set("chainConfig", chainConfig)
    c.set("evmContractAddress", contractAddress)
    c.set("evmContractABI", contractABI)

    // Store chain-specific contract addresses
    c.set("moneypotContractAddress", getMoneyPotContractAddress(chainId) || "")
    c.set(
      "moneypotTokenAddress",
      chainConfig.contracts.moneypot?.token?.address
    )

    // EVM wallet middleware initialized

    await next()
  } catch (error) {
    console.error("EVM wallet middleware error:", error)

    return c.json({ error: "Failed to initialize EVM wallet" }, 500)
  }
}
