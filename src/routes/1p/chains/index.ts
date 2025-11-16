import { Hono } from "hono";
import { IRunningContext } from "@lib/context";
import { creditcoinTestnet } from "@config/viem";

const router = new Hono<IRunningContext>();

/**
 * GET /1p/chains
 * Returns supported chains for 1P Protocol
 */
router.get("/", async (c) => {
  try {
    const supportedChains = [
      {
        chainId: creditcoinTestnet.id,
        name: creditcoinTestnet.name,
        type: "evm",
        rpcUrl: creditcoinTestnet.rpcUrls.default.http[0],
        explorerUrl: creditcoinTestnet.blockExplorers?.default?.url || "",
        nativeCurrency: {
          name: creditcoinTestnet.nativeCurrency.name,
          symbol: creditcoinTestnet.nativeCurrency.symbol,
          decimals: creditcoinTestnet.nativeCurrency.decimals,
        },
        custom: {
          onep: {
            address: creditcoinTestnet.custom.onep.address,
            symbol: creditcoinTestnet.custom.onep.symbol,
            name: creditcoinTestnet.custom.onep.name,
            decimals: creditcoinTestnet.custom.onep.decimals,
          }
        },
        testnet: creditcoinTestnet.testnet,
      }
    ];

    return c.json({
      protocol: "1P Protocol",
      version: "1.0.0",
      supportedChains,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching 1P chains:", error);
    return c.json({ 
      error: "Failed to fetch supported chains",
      protocol: "1P Protocol"
    }, 500);
  }
});

export default router;

