import { Hono } from "hono"
import { CryptoUtils } from "@utils/crypto"
import { OnePDB } from "@db/onePDB"
import { AttemptStore } from "@db/attemptStore"
import { IRunningContext } from "@lib/context"
import { COLOR_HEX_CODES, DIRECTION_MAPPINGS } from "@config/1p"
import {
  recoverAddress,
  detectSignatureType,
  verifyAptosSignature,
  getAptosAddressFromPublicKey,
} from "@utils/signature"
import { Address, Signature, recoverMessageAddress, isAddressEqual } from "viem"
import { useWalletAuth } from "@mw/useWalletAuth"
import { useEVMWallet } from "@mw/useEVMWallet"

const router = new Hono<IRunningContext>()

router.use(useWalletAuth)
router.use(useEVMWallet)

interface AuthenticateOptionsPayload {
  attempt_id: string
  signature?: Signature | `0x${string}` | Uint8Array
}

interface DtoAuthenticateOptions {
  payload: AuthenticateOptionsPayload
}

interface IAuthenticateOptionsResponse {
  challenge_id: string
  challenges: Array<{
    grid: string
    colorGroups: {
      red: string[]
      green: string[]
      blue: string[]
      yellow: string[]
    }
  }>
  colors: Record<string, string>
  directions: {
    up: string
    down: string
    left: string
    right: string
    skip: string
  }
}

interface IAuthenticateOptionsErrorResponse {
  error: string
}

/**
 * POST /evm/authenticate/options
 * Generate authentication challenges for 1FA attempt (EVM version)
 */
router.post("/", async (c) => {
  try {
    console.log("Debug: authenticate_options route called")

    // Get wallet payload from context (set by wallet auth middleware)
    const walletPayload = c.get("wallet_payload")
    console.log("Debug: wallet payload from context:", walletPayload)

    if (!walletPayload) {
      console.log("Debug: Missing wallet payload from context")
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Missing wallet authentication",
      }
      return c.json(errorResponse, 400)
    }

    const { attempt_id } = walletPayload
    console.log("Debug: attempt_id:", attempt_id)
    if (!attempt_id) {
      console.log("Debug: Missing attempt_id in wallet payload")
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Missing attempt_id",
      }
      return c.json(errorResponse, 400)
    }

    const chainId = c.get("chainId")

    // Check if attempt already has challenges generated (optional check)
    // We could add this back if needed, but for now we'll generate fresh challenges each time

    // Get EVM client from context
    const evmClient = c.get("evmClient")

    console.log(
      "Debug: EVM client from context:",
      evmClient ? "found" : "not found"
    )
    console.log("Debug: Context available keys:", Object.keys(c.get || {}))
    console.log("Debug: Request path:", c.req.path)
    console.log("Debug: Request method:", c.req.method)

    if (!evmClient) {
      console.error("EVM client not found in context")
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "EVM client not initialized",
      }
      return c.json(errorResponse, 500)
    }

    // Get attempt from blockchain
    const attempt = await evmClient.getAttempt(attempt_id)

    if (!attempt) {
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Attempt not found",
      }
      return c.json(errorResponse, 400)
    }

    if (attempt.is_completed) {
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Attempt already completed",
      }
      return c.json(errorResponse, 400)
    }

    const now = Math.floor(Date.now() / 1000)
    if (parseInt(attempt.expires_at) < now) {
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Attempt expired",
      }
      return c.json(errorResponse, 400)
    }

    // Get pot from blockchain
    const pot = await evmClient.getPot(attempt.pot_id)
    if (!pot) {
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Pot not found",
      }
      return c.json(errorResponse, 400)
    }

    // Get wallet user from context (set by wallet auth middleware)
    const walletUser = c.get("wallet_user")
    console.log("Debug: Wallet user from context:", walletUser)
    console.log("Debug: Expected hunter address:", pot.one_fa_address)

    // TODO: skip One FA
    // // Verify that the hunter who signed is the same as the one who paid for the attempt
    // if (!isAddressEqual(walletUser as Address, pot.one_fa_address as Address)) {
    //   console.error("Debug: Hunter address mismatch:", {
    //     walletUser,
    //     potOneFaAddress: pot.one_fa_address,
    //   })
    //   const errorResponse: IAuthenticateOptionsErrorResponse = {
    //     error: "Hunter signature does not match pot's 1FA address",
    //   }
    //   return c.json(errorResponse, 401)
    // }
    // console.log("✅ Hunter signature verified successfully:", {
    //   walletUser,
    //   potOneFaAddress: pot.one_fa_address,
    // })

    // Get 1P configuration using collision-resistant key
    const moneypotContractAddress = c.get("moneypotContractAddress") as Address
    const collisionResistantKey = OnePDB.key(
      attempt.pot_id,
      moneypotContractAddress,
      chainId
    )
    const config = await OnePDB.getConfig(c.env.AUTH_DB, collisionResistantKey)
    if (!config) {
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Pot not registered with 1P",
      }
      return c.json(errorResponse, 400)
    }

    // Get difficulty from blockchain attempt data
    const difficulty = attempt.difficulty

    // Generate challenges using real 1P protocol
    console.log("Debug: Using blockchain attempt data:", {
      attempt_id: attempt.id,
      difficulty: difficulty,
      expires_at: attempt.expires_at,
      is_completed: attempt.is_completed,
    })

    console.log("Debug: Generating 1P challenges with:", {
      password: config.password,
      legend: config.legend,
      difficulty,
    })

    const challenges = CryptoUtils.generateChallengeGrids(
      config.password,
      config.legend,
      difficulty
    )

    console.log("Debug: Generated 1P challenges:", challenges.length)

    // Generate a unique challenge_id
    const challenge_id = `challenge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    console.log("Debug: Generated challenge_id:", challenge_id)

    // Store attempt record with challenge data using challenge_id as the key
    const attemptRecord = {
      attemptId: attempt_id,
      potId: attempt.pot_id,
      hunterAddress: walletUser as Address,
      chainId: chainId,
      timestamp: Date.now(),
      expiresAt: parseInt(attempt.expires_at),
      difficulty: attempt.difficulty,
      isCompleted: false,
      challengeData: {
        challenges: challenges.map((challenge) => ({
          grid: challenge.grid,
          expected: challenge.expected,
          colorGroups: challenge.colorGroups,
        })),
      },
    }

    // Use AttemptStore with challenge_id as the key
    const attemptStore = new AttemptStore(c.env.AUTH_DB)
    await attemptStore.setAttemptByChallengeId(challenge_id, attemptRecord)

    const successResponse: IAuthenticateOptionsResponse = {
      challenge_id: challenge_id, // Return the generated challenge_id
      challenges: challenges.map((challenge) => ({
        grid: challenge.grid,
        colorGroups: {
          red: challenge.colorGroups.red.slice(0, 16), // Limit to 16 chars per color
          green: challenge.colorGroups.green.slice(0, 16),
          blue: challenge.colorGroups.blue.slice(0, 16),
          yellow: challenge.colorGroups.yellow.slice(0, 16),
        },
      })),
      colors: COLOR_HEX_CODES,
      directions: {
        up: DIRECTION_MAPPINGS.Up,
        down: DIRECTION_MAPPINGS.Down,
        left: DIRECTION_MAPPINGS.Left,
        right: DIRECTION_MAPPINGS.Right,
        skip: DIRECTION_MAPPINGS.Skip,
      },
    }

    return c.json(successResponse)
  } catch (error: unknown) {
    console.error("EVM Authentication options error:", error)
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      })
    }
    const errorResponse: IAuthenticateOptionsErrorResponse = {
      error: "Failed to generate authentication options",
    }
    return c.json(errorResponse, 500)
  }
})

export default router
