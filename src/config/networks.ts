import {
  CHAINS as EVM_CHAINS,
  getChain as getEVMChain,
  type Chain,
} from "./viem"
import {
  APTOS_CHAINS,
  getAptosChain,
  getDefaultAptosChain,
  type AptosChainConfig,
} from "./aptos"

export type ChainType = "aptos" | "evm"

// Unified chain config interface (for backward compatibility)
export interface ChainConfig {
  chainId: number
  type: ChainType
  name: string
  contractAddress: string
  rpcUrl: string
  explorerUrl: string
  contracts: {
    moneypot?: {
      address: string
      token?: {
        address: string
        symbol: string
        name: string
        decimals: number
      }
    }
    onep?: {
      address: string
      token?: {
        address: string
        symbol: string
        name: string
        decimals: number
      }
    }
  }
}

// Convert EVM chain to unified ChainConfig
function evmToChainConfig(evmChain: Chain): ChainConfig {
  return {
    chainId: evmChain.id,
    type: "evm",
    name: evmChain.name,
    contractAddress: (evmChain.custom as any)?.moneypot?.address || "",
    rpcUrl: evmChain.rpcUrls.default.http[0],
    explorerUrl: evmChain.blockExplorers?.default.url || "",
    contracts: {
      moneypot: (evmChain.custom as any)?.moneypot
        ? {
            address: (evmChain.custom as any).moneypot.address,
            token: (evmChain.custom as any).moneypot.token,
          }
        : undefined,
      onep: (evmChain.custom as any)?.onep
        ? {
            address: (evmChain.custom as any).onep.address,
            token: (evmChain.custom as any).onep.token,
          }
        : undefined,
    },
  }
}

// Convert Aptos chain to unified ChainConfig
function aptosToChainConfig(aptosChain: AptosChainConfig): ChainConfig {
  return {
    chainId: aptosChain.chainId,
    type: "aptos",
    name: aptosChain.name,
    contractAddress: aptosChain.contracts.moneypot?.address || "",
    rpcUrl: aptosChain.rpcUrl,
    explorerUrl: aptosChain.explorerUrl,
    contracts: {
      moneypot: aptosChain.contracts.moneypot,
    },
  }
}

export function getChainConfig(chainId: number): ChainConfig | null {
  // Try EVM first
  try {
    const evmChain = getEVMChain(chainId)
    return evmToChainConfig(evmChain)
  } catch {
    // Try Aptos
    const aptosChain = getAptosChain(chainId)
    if (aptosChain) {
      return aptosToChainConfig(aptosChain)
    }
  }
  return null
}

export function getChainType(chainId: number): ChainType | null {
  const config = getChainConfig(chainId)
  return config ? config.type : null
}

export function isChainSupported(chainId: number): boolean {
  return getChainConfig(chainId) !== null
}

export function getAllSupportedChains(): ChainConfig[] {
  const evmConfigs = EVM_CHAINS.map(evmToChainConfig)
  const aptosConfigs = APTOS_CHAINS.map(aptosToChainConfig)
  return [...evmConfigs, ...aptosConfigs]
}

export function getChainsByType(type: ChainType): ChainConfig[] {
  return getAllSupportedChains().filter((chain) => chain.type === type)
}

export const DEFAULT_CHAIN_ID = getDefaultAptosChain().chainId
export function getDefaultChain(): ChainConfig {
  return aptosToChainConfig(getDefaultAptosChain())
}

/**
 * Get MoneyPot contract address for a chain
 */
export function getMoneyPotContractAddress(chainId: number): string | null {
  const config = getChainConfig(chainId)
  return config?.contracts.moneypot?.address || null
}

/**
 * Get MoneyPot token address for a chain
 */
export function getMoneyPotTokenAddress(chainId: number): string | null {
  const config = getChainConfig(chainId)
  return config?.contracts.moneypot?.token?.address || null
}

/**
 * Get OneP contract address for a chain
 */
export function getOnePContractAddress(chainId: number): string | null {
  const config = getChainConfig(chainId)
  return config?.contracts.onep?.address || null
}

/**
 * Get OneP token address for a chain
 */
export function getOnePTokenAddress(chainId: number): string | null {
  const config = getChainConfig(chainId)
  return config?.contracts.onep?.token?.address || null
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return getAllSupportedChains().map((chain) => chain.chainId)
}
