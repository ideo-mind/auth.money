import { AptosClient, AptosAccount } from "aptos"
import { Context } from "hono"
import { PublicClient, WalletClient, Address } from "viem"
import { LocalAccount } from "viem/accounts"
import { EVMBlockchainClient } from "@lib/blockchain"
import { ChainConfig } from "@config/networks"
import { OnePEvm } from "@utils/onep"

/**
 * Global context interface for Money Pot Verifier Service
 * This provides typesafe sharing of context variables across middlewares and handlers
 */
export interface IRunningContext {
  Bindings: Env
  Variables: {
    // Aptos clients (for /aptos routes)
    aptosClient: AptosClient
    aptosOracleAccount: AptosAccount
    aptosContractAddress: string

    // EVM clients (for /evm routes) - Enhanced with nonce management
    evmPublicClient: PublicClient
    evmWalletClient: WalletClient
    evmOracleAccount: LocalAccount
    evmContractAddress: string
    evmContractABI: any

    // EVM Chain middleware
    chainId: number
    chainType: "evm"
    chainConfig: ChainConfig
    evmClient: EVMBlockchainClient

    // Chain-specific contract addresses
    moneypotContractAddress: string
    moneypotTokenAddress?: string
    onepContractAddress?: string
    onepTokenAddress?: string

    // OneP Protocol client (for /1p routes)
    onepClient: OnePEvm
    onepVerifierAccount: LocalAccount

    // Nonce Management Support
    nonceManagementEnabled: boolean

    // Wallet Authentication (for EVM routes)
    wallet_user: Address
    wallet_payload?: any
    wallet_signature?: string | `0x${string}` | Uint8Array

    // Legacy (can be removed after migration)
    oracleAddress: string
    oracleAccount: AptosAccount
  }
}
