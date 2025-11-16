import { Hono } from "hono"
import { getAllSupportedChains } from "@config/networks"
import { IRunningContext } from "@/src/lib/context"
import { sanitizeChainConfigForApi } from "@utils/chainUtils"

const router = new Hono<IRunningContext>()

// Chains info endpoint
router.get("/", (c) => {
  const supportedChains = getAllSupportedChains()
  return c.json({
    supportedChains: supportedChains.map((chain) => {
      return sanitizeChainConfigForApi(chain)
    }),
    defaultChainId: 2, // Aptos Testnet
    usage: {
      header: "CHAIN",
      description:
        "Optional header to specify chain ID. Defaults to Aptos Testnet (2) if not provided.",
      examples: {
        "Aptos Testnet": "CHAIN: 2",
        "Creditcoin Testnet": "CHAIN: 102031",
      },
    },
  })
})

export default router
