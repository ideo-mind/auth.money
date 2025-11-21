import { useAptosWallet } from "@mw/aptosWallet"
import { COLOR_HEX_CODES, DIRECTION_MAPPINGS, DOMAIN } from "@config/1p"
import { Hono } from "hono"
import { IRunningContext } from "../../../../lib/context"

const router = new Hono<IRunningContext>()

// Apply Aptos wallet middleware (with throttling) to this route
router.use("*", useAptosWallet)

/**
 * POST /register/options
 * Get registration options (simplified without RSA)
 */
router.all("/", async (c) => {
  try {
    console.debug("Getting Aptos pot registration options...")

    return c.json({
      domain: DOMAIN,
      colors: COLOR_HEX_CODES,
      directions: {
        up: DIRECTION_MAPPINGS.Up,
        down: DIRECTION_MAPPINGS.Down,
        left: DIRECTION_MAPPINGS.Left,
        right: DIRECTION_MAPPINGS.Right,
        skip: DIRECTION_MAPPINGS.Skip,
      },
    })
  } catch (error) {
    console.error("Error getting registration options:", error)
    return c.json({ error: "Failed to get registration options" }, 500)
  }
})

export default router
