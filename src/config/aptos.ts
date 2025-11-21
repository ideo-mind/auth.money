// Aptos chain configuration

export interface AptosChainConfig {
  chainId: number
  name: string
  rpcUrl: string
  explorerUrl: string
  contracts: {
    moneypot?: {
      address: string
    }
  }
}

export const aptosTestnet: AptosChainConfig = {
  chainId: 2,
  name: "Aptos Testnet",
  rpcUrl: "https://fullnode.testnet.aptoslabs.com/v1",
  explorerUrl: "https://explorer.aptoslabs.com",
  contracts: {
    moneypot: {
      address:
        "0xea89ef9798a210009339ea6105c2008d8e154f8b5ae1807911c86320ea03ff3f",
    },
  },
}

// Aptos chain map
const APTOS_CHAIN_MAP = new Map<number, AptosChainConfig>([
  [aptosTestnet.chainId, aptosTestnet],
])

export function getAptosChain(chainId: number): AptosChainConfig | null {
  return APTOS_CHAIN_MAP.get(chainId) || null
}

export function getDefaultAptosChain(): AptosChainConfig {
  return aptosTestnet
}

export const APTOS_CHAINS = Array.from(APTOS_CHAIN_MAP.values())
