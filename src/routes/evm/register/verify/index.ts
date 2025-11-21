import { Hono } from "hono"
import { OnePDB, OnePConfig } from "@db/onePDB"
import { IRunningContext } from "@lib/context"
import { Address, isAddressEqual } from "viem"
import { useWalletAuth } from "@mw/useWalletAuth"
import { useEVMWallet } from "@mw/useEVMWallet"

const router = new Hono<IRunningContext>()

// Apply wallet authentication middleware
router.use(useWalletAuth)
router.use(useEVMWallet)

interface RegisterVerifyPayload {
  pot_id: string
  "1p": string // password
  legend: Record<string, string> // color-direction mapping
  iat: number
  iss: Address
  exp: number
}

interface IRegisterVerifyResponse {
  success: boolean
  pot_id?: string
  existing_config?: {
    created_at: number
    legend: Record<string, string>
  } | null
}

interface IRegisterVerifyErrorResponse {
  error: string
  pot_id?: string
  existing_config?: {
    created_at: number
    legend: Record<string, string>
  } | null
}

/**
 * POST /evm/register/verify
 * Verify pot registration using wallet authentication middleware
 */
router.post("/", async (c) => {
  try {
    // Get wallet user from middleware
    const walletUser = c.get("wallet_user")
    if (!walletUser) {
      const errorResponse: IRegisterVerifyErrorResponse = {
        error: "Wallet authentication required",
      }
      return c.json(errorResponse, 401)
    }

    // Get payload from middleware
    const payload = c.get("wallet_payload") as RegisterVerifyPayload
    if (!payload) {
      const errorResponse: IRegisterVerifyErrorResponse = {
        error: "Invalid payload",
      }
      return c.json(errorResponse, 400)
    }

    // Validate payload structure
    const { pot_id, "1p": password, legend, iat, iss, exp } = payload

    if (!pot_id || !password || !legend || !iat || !iss || !exp) {
      const errorResponse: IRegisterVerifyErrorResponse = {
        error: "Invalid payload structure",
      }
      return c.json(errorResponse, 400)
    }

    // Check if wallet_user matches the payload issuer (iss)
    if (walletUser.toLowerCase() !== iss.toLowerCase()) {
      console.error("Debug: Wallet user mismatch:", {
        walletUser,
        iss,
      })
      const errorResponse: IRegisterVerifyErrorResponse = {
        error: "Wallet signature does not match payload issuer",
      }
      return c.json(errorResponse, 401)
    }

    console.log("✅ Wallet signature verified for register/verify:", {
      walletUser,
      iss,
    })

    // Check if pot exists on blockchain using EVM client from context
    const evmClient = c.get("evmClient")

    if (!evmClient) {
      console.error("EVM client not found in context")
      const errorResponse: IRegisterVerifyErrorResponse = {
        error: "EVM client not initialized",
      }
      return c.json(errorResponse, 500)
    }

    try {
      const pot = await evmClient.getPot(pot_id)

      if (!pot || !pot.is_active) {
        const errorResponse: IRegisterVerifyErrorResponse = {
          error: "Pot not found or not active on blockchain",
        }
        return c.json(errorResponse, 400)
      }

      // Check if wallet_user matches the pot creator
      if (!isAddressEqual(walletUser, pot.creator as Address)) {
        console.error("Debug: Wallet user is not the pot creator:", {
          walletUser,
          potCreator: pot.creator,
        })
        const errorResponse: IRegisterVerifyErrorResponse = {
          error: "Wallet user is not the pot creator",
        }
        return c.json(errorResponse, 401)
      }

      console.log("✅ Wallet user verified as pot creator:", {
        walletUser,
        potCreator: pot.creator,
      })
    } catch (error) {
      console.error("Error checking pot existence:", error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      const errorResponse: IRegisterVerifyErrorResponse = {
        error: `Failed to verify pot on blockchain: ${errorMessage}`,
      }
      return c.json(errorResponse, 500)
    }

    // Check if pot is already registered using collision-resistant key
    const moneypotContractAddress = c.get("moneypotContractAddress") as Address
    const chainId = c.get("chainId") as number
    const collisionResistantKey = OnePDB.key(
      pot_id,
      moneypotContractAddress,
      chainId
    )
    const isRegistered = await OnePDB.isRegistered(
      c.env.AUTH_DB,
      collisionResistantKey
    )
    if (isRegistered) {
      // Get existing config for debugging
      const existingConfig = await OnePDB.getConfig(
        c.env.AUTH_DB,
        collisionResistantKey
      )
      console.log(
        `Pot ${pot_id} already registered with config:`,
        existingConfig
      )

      const errorResponse: IRegisterVerifyErrorResponse = {
        error: "Pot already registered",
        pot_id: pot_id,
      }

      return c.json(errorResponse, 400)
    }

    // Store 1P configuration
    const config: OnePConfig = {
      password,
      legend,
      pot_id,
      created_at: Date.now(),
    }

    await OnePDB.setConfig(c.env.AUTH_DB, collisionResistantKey, config)

    const successResponse: IRegisterVerifyResponse = {
      success: true,
    }

    return c.json(successResponse)
  } catch (error) {
    console.error("EVM Registration verification error:", error)
    const errorResponse: IRegisterVerifyErrorResponse = {
      error: "Registration verification failed",
    }
    return c.json(errorResponse, 500)
  }
})

export default router
