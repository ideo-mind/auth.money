import { Chain } from "viem"
import { ChainConfig } from "@config/networks"
import { polkadotTestnet } from "../config/viem"

/**
 * Sanitizes a chain object for API responses by removing sensitive or implementation-specific fields
 *
 * @param chain - The chain object to sanitize
 * @returns A sanitized copy of the chain object without contracts field
 */
export function sanitizeChainForApi(chain: Chain): Chain {
  // Create a shallow copy of the chain object
  const sanitizedChain = { ...chain }

  if (sanitizedChain.rpcUrls?.public?.http?.length > 1) {
    sanitizedChain.rpcUrls.default.http = sanitizedChain.rpcUrls.public.http
  }

  // Remove contracts field which contains ABIs and implementation details
  delete sanitizedChain.contracts

  return sanitizedChain
}

/**
 * Sanitizes a ChainConfig object for API responses by removing sensitive or implementation-specific fields
 *
 * @param chainConfig - The ChainConfig object to sanitize
 * @returns A sanitized copy of the ChainConfig object without contracts field
 */
export function sanitizeChainConfigForApi(
  chainConfig: ChainConfig
): Omit<ChainConfig, "contracts"> {
  // Create a sanitized copy without the contracts field
  const { contracts, ...sanitizedChainConfig } = chainConfig

  return sanitizedChainConfig
}

/**
 * Sanitizes multiple chain objects for API responses
 *
 * @param chains - Record of chain objects mapped by chain ID
 * @returns A sanitized copy of the chains record
 */
export function sanitizeChainsForApi<T extends Chain>(
  chains: Record<number, T>
): Record<number, Omit<T, "contracts">> {
  const sanitizedChains: Record<number, Omit<T, "contracts">> = {}

  for (const [chainId, chain] of Object.entries(chains)) {
    const sanitizedChain = { ...chain }
    delete sanitizedChain.contracts

    if (sanitizedChain.rpcUrls.public.http.length > 1) {
      sanitizedChain.rpcUrls.default.http = sanitizedChain.rpcUrls.public.http
    }

    sanitizedChains[Number(chainId)] = sanitizedChain as Omit<T, "contracts">
  }

  return sanitizedChains
}

/**
 * Check if a chain is Polkadot (which doesn't support gas limits in transactions)
 * @param chain The chain to check
 * @returns true if the chain is Polkadot
 */
export function isPolkadotChain(chain: Chain | null | undefined): boolean {
  if (!chain) return false
  // Polkadot Hub Testnet has ID 420420422
  return chain.id === polkadotTestnet.id
}

/**
 * Get transaction parameters that exclude gas for Polkadot chains
 * @param chain The chain to check
 * @returns Transaction parameters object
 */
export function getTransactionParams(chain: Chain | null | undefined): { gas?: undefined } | {} {
  if (isPolkadotChain(chain)) {
    // Explicitly set gas to undefined for Polkadot to prevent viem from estimating it
    return { gas: undefined }
  }
  // For other chains, return empty object - viem will estimate gas automatically
  return {}
}
