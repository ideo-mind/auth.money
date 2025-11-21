// MoneyPot contract ABI - inline definition to avoid import issues
import { abi } from "@abis/MoneyPot.json";

export const moneyPotABI = abi;


import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  defineChain,
  Chain,
  PublicClient,
  erc20Abi,
  parseUnits,
} from "viem";

// Export Chain type for use in other config files
export { type Chain } from "viem";

// Creditcoin EVM Testnet Configuration - Hardcoded values
export const creditcoinTestnet = defineChain({
  id: 102031,
  name: "Creditcoin Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Creditcoin",
    symbol: "CTC",
    airdrop: parseUnits("0.5", 18),
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.cc3-testnet.creditcoin.network"],
      webSocket: ["wss://rpc.cc3-testnet.creditcoin.network"],
    },
    public: {
      http: ["https://rpc.cc3-testnet.creditcoin.network"],
      webSocket: ["wss://rpc.cc3-testnet.creditcoin.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "Creditcoin Explorer",
      url: "https://creditcoin-testnet.blockscout.com",
    },
  },
  custom: {
    moneypot: {
      address: "0x171AB010407D5A2640c91fdCb7C9f5f4507a9ee5",
      abis: moneyPotABI,
      token: {
        address: "0x15EDeBfe6De62Fe4827C00d82e0230566600aF73",
        symbol: "UNREAL",
        name: "Unreal Token",
        decimals: 18,
        abis: erc20Abi,
        faucet: ["https://console.ideomind.org/"],
        airdrop: parseUnits("2000", 18),
      },
    },
  },
  testnet: true,
});

export const polkadotTestnet = defineChain({
  id: 420420422,
  name: "Polkadot Hub Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Passet",
    symbol: "PAS",
    faucet: [
      "https://faucet.polkadot.io/?parachain=1111",
    ],
    airdrop: parseUnits("1", 18),
  },
  rpcUrls: {
    default: {
      http: ["https://testnet-passet-hub-eth-rpc.polkadot.io"],
      webSocket: ["wss://testnet-passet-hub-eth-rpc.polkadot.io",],
    },
  },
  blockExplorers: {
    default: {
      name: "Polkadot EVM Explorer",
      url: "https://blockscout-passet-hub.parity-testnet.parity.io",
    },
  },
  custom: {
    moneypot: {
      address: "0xc1a3E49c21e540E7be2cdF4d378E4C7fD3619533",
      abis: moneyPotABI,
      token: {
        address: "0x324ccC1E14c56e3ceFA891597Aaa65bAa9Bad7E6",
        symbol: "UNREAL",
        name: "Unreal Token",
        decimals: 18,
        abis: erc20Abi,
        faucet: [],
        airdrop: parseUnits("1000", 18),
      },
    },
  },
  testnet: true,
});

export const sepolia = defineChain({
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [
        "https://ethereum-sepolia-rpc.publicnode.com",
        "https://eth-sepolia.public.blastapi.io",
        "https://0xrpc.io/sep",
      ],
      webSocket: [
        "wss://ethereum-sepolia-rpc.publicnode.com",
      ],
    },
    public: {
      http: [
        "https://ethereum-sepolia-rpc.publicnode.com",
        "https://eth-sepolia.public.blastapi.io",
        "https://0xrpc.io/sep",
        // ABOVE is the best that's what we are going with
        // "https://rpc.sepolia.org",
        // "https://ethereum-sepolia-rpc.publicnode.com",
        // "https://sepolia-bor-rpc.publicnode.com",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Sepolia Explorer",
      url: "https://eth-sepolia.blockscout.com",
    },
  },
  custom: {
    moneypot: {
      address: "0xAD6A944623f24CBdbAc60A77825Fe77312949E76",
      abis: moneyPotABI,
      token: {
        address: "0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9",
        symbol: "PYUSD",
        name: "PayPal USD",
        decimals: 6,
        abis: erc20Abi,
      },
    },
  },
  testnet: true,
});



// Contract addresses are now accessed through chain configuration
// Use getMoneyPotContractAddress(chainId) from @config/networks

// Somnia Shannon Testnet Configuration
export const somniaTestnet = defineChain({
  id: 50312,
  name: "Somnia Shanon Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Somnia Testnet Token",
    symbol: "STT",
  },
  rpcUrls: {
    default: {
      http: [
        "https://dream-rpc.somnia.network",
      ],
    },
    public: {
      http: ["https://dream-rpc.somnia.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "Somnia Shanon Explorer",
      url: "https://shannon-explorer.somnia.network/",
    },
  },
  custom: {
    moneypot: {
      address: "0xCFDc84668aAc069f5e885e5E4bded97E22a2fDe1",
      abis: moneyPotABI,
      token: {
        address: "0xd1fB2a15545032a8170370d7eC47C0FC69A00eed",
        symbol: "UNREAL",
        name: "Unreal Token",
        decimals: 18,
        abis: erc20Abi,
      },
    },
  },
  testnet: true,
});

// Arkiv Testnet "Mendoza" Configuration - Hardcoded values
// Reference: https://arkiv.network/getting-started/typescript
// Note: We define it here for consistency, but @arkiv-network/sdk/chains also exports mendoza
export const mendoza = defineChain({
  id: 60138453056,
  name: "Arkiv Testnet Mendoza",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://mendoza.hoodi.arkiv.network/rpc"],
      webSocket: ["wss://mendoza.hoodi.arkiv.network/rpc/ws"],
    },
    public: {
      http: ["https://mendoza.hoodi.arkiv.network/rpc"],
      webSocket: ["wss://mendoza.hoodi.arkiv.network/rpc/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arkiv Explorer",
      url: "https://explorer.mendoza.hoodi.arkiv.network",
    },
  },
  testnet: true,
});

// Keep arkivTestnet as alias for backward compatibility
export const arkivTestnet = mendoza;


// Chain configuration map
const CHAIN_MAP = new Map<number, Chain>([
  [creditcoinTestnet.id, creditcoinTestnet],
  [sepolia.id, sepolia],
  [somniaTestnet.id, somniaTestnet],
  [arkivTestnet.id, arkivTestnet],
  [mendoza.id, mendoza],
  [polkadotTestnet.id, polkadotTestnet],
]);

// console.log(CHAIN_MAP);
/**
 * Get a Chain definition by chainId.
 * @param chainId EVM chain id (e.g., 102031 Creditcoin, 11155111 Sepolia)
 * @returns Chain or throws error if not supported
 */
export function getChain(chainId: any): Chain {
  const chain = CHAIN_MAP.get(Number.parseInt(chainId));
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return chain;
}

/**
 * Get the default Chain used by the router (Creditcoin Testnet).
 */
export function getDefaultChain(): Chain {
  return creditcoinTestnet;
}

export const CHAINS = Array.from(CHAIN_MAP.values());

/**
 * Randomly select an RPC from the list for load balancing
 */
export function pickRpc(rpcs: readonly string[]) {
  return rpcs[Math.floor(Math.random() * rpcs.length)];
}

/**
 * Get or create a public client for the specified chain.
 * No caching - creates fresh client for RPC rotation.
 * @param chainId EVM chain id (optional, defaults to default chain)
 * @param readOnly Whether to use public RPCs for read operations
 * @returns PublicClient instance
 */
export function getPublicClient(
  chainId?: number,
  readOnly?: boolean,
): PublicClient {
  const targetChainId = chainId || getDefaultChain().id;

  // Get chain configuration
  const chain = getChain(targetChainId);

  // Select RPC endpoints
  let rpcs = chain.rpcUrls.default.http;
  if (readOnly && chain.rpcUrls.public?.http) {
    rpcs = chain.rpcUrls.public.http;
  }

  // Create new public client with random RPC
  return createPublicClient({
    chain,
    transport: http(pickRpc(rpcs)),
  });
}

/**
 * Get the default public client (Creditcoin Testnet)
 */
export function getDefaultPublicClient(): PublicClient {
  return getPublicClient(getDefaultChain().id);
}

// Legacy exports for backward compatibility (deprecated)
export const publicClient = createPublicClient({
  chain: creditcoinTestnet,
  transport: http(),
});

export const wsClient = createPublicClient({
  chain: creditcoinTestnet,
  transport: webSocket(),
});

/**
 * Helper function to create chain-specific wallet client
 * @param account Wallet account
 * @param chainId EVM chain id
 * @returns WalletClient instance
 */
export const createEVMWalletClient = (account: any, chainId: number) => {
  const chain = getChain(chainId);
  return createWalletClient({
    account,
    chain,
    transport: http(),
  });
};

// Helper function to format addresses
export const formatEVMAddress = (address: string) => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Helper function to convert wei to CTC
export const formatCTC = (wei: bigint) => {
  return Number(wei) / 10 ** 18;
};

// Helper function to convert CTC to wei
export const parseCTC = (ctc: number) => {
  return BigInt(Math.floor(ctc * 10 ** 18));
};

/**
 * Get or create an Arkiv wallet client for challenge storage.
 * Uses @arkiv-network/sdk v0.4.4 which extends viem clients with Arkiv methods.
 * Reference: https://arkiv.network/getting-started/typescript
 * @param env Environment variables containing ORACLE_PRIVATE_KEY_EVM
 * @returns Arkiv wallet client instance (viem WalletClient with Arkiv extensions)
 */
export async function getArkivClient(env: Env) {
  // Import everything from @arkiv-network/sdk to avoid viem version conflicts
  // Following the SDK pattern: https://arkiv.network/getting-started/typescript
  const { createWalletClient, http: arkivHttp } = await import("@arkiv-network/sdk");
  // @ts-ignore - Subpath exports may not be resolved by TypeScript but work at runtime
  const { privateKeyToAccount } = await import("@arkiv-network/sdk/accounts");
  
  if (!env.ORACLE_PRIVATE_KEY_EVM) {
    throw new Error("ORACLE_PRIVATE_KEY_EVM is required for Arkiv write operations");
  }

  const rpcUrl = mendoza.rpcUrls.default.http[0];

  console.log("Creating Arkiv wallet client...", {
    chainId: mendoza.id,
    rpcUrl,
    hasFetch: typeof globalThis.fetch !== "undefined",
  });

  try {
    // Use SDK's http transport and account creation to avoid type conflicts with bundled viem
    const account = privateKeyToAccount(env.ORACLE_PRIVATE_KEY_EVM as `0x${string}`);
    
    // Cast to any to avoid TypeScript conflicts between SDK's bundled viem and our viem
    const walletClient = createWalletClient({
      chain: mendoza as any,
      transport: arkivHttp(rpcUrl, { fetchFn: globalThis.fetch }) as any,
      account: account as any,
    } as any);

    console.log("✅ Arkiv wallet client created successfully", {
      chainId: mendoza.id,
      address: account.address,
    });

    return walletClient;
  } catch (error: any) {
    console.error("Failed to create Arkiv wallet client:", {
      error: error.message,
      stack: error.stack,
      chainId: mendoza.id,
      rpcUrl,
      hasFetch: typeof globalThis.fetch !== "undefined",
    });
    throw error;
  }
}

/**
 * Get or create an Arkiv public client for challenge queries.
 * Uses @arkiv-network/sdk v0.4.4 which extends viem clients with Arkiv methods.
 * @returns Arkiv public client instance (viem PublicClient with Arkiv extensions)
 */
export async function getArkivReadClient() {
  // Import everything from @arkiv-network/sdk to avoid viem version conflicts
  const { createPublicClient, http: arkivHttp } = await import("@arkiv-network/sdk");

  const rpcUrl = mendoza.rpcUrls.default.http[0];

  console.log("Creating Arkiv public client...", {
    chainId: mendoza.id,
    rpcUrl,
    hasFetch: typeof globalThis.fetch !== "undefined",
  });

  try {
    // Cast to any to avoid TypeScript conflicts between SDK's bundled viem and our viem
    const publicClient = createPublicClient({
      chain: mendoza as any,
      transport: arkivHttp(rpcUrl, { fetchFn: globalThis.fetch }) as any,
    } as any);

    console.log("✅ Arkiv public client created successfully", {
      chainId: mendoza.id,
    });

    return publicClient;
  } catch (error: any) {
    console.error("Failed to create Arkiv public client:", {
      error: error.message,
      stack: error.stack,
      chainId: mendoza.id,
      rpcUrl,
      hasFetch: typeof globalThis.fetch !== "undefined",
    });
    throw error;
  }
}


