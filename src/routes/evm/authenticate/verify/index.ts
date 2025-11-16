import { Hono } from "hono"
import { CryptoUtils } from "@utils/crypto"
import { OnePDB } from "@db/onePDB"
import { AttemptStore } from "@db/attemptStore"
import { IRunningContext } from "@/src/lib/context"
import { useWalletAuth } from "@mw/useWalletAuth"
import { Address, isAddressEqual } from "viem"
import { useEVMWallet } from "@mw/useEVMWallet"

const router = new Hono<IRunningContext>()

// Apply wallet authentication middleware

router.use(useWalletAuth)
router.use(useEVMWallet)

interface DtoAuthenticateVerify {
  solutions: string[]
  challenge_id: string
  // Wallet auth fields (added by middleware)
  encrypted_payload?: string
  signature?: string
}

interface IAuthenticateVerifyResponse {
  success: boolean
  message: string
}

interface IAuthenticateVerifyErrorResponse {
  error: string
}

/**
 * POST /evm/authenticate/verify
 * Verify 1P authentication solution (EVM version)
 */
router.post("/", async (c) => {
  try {
    // Get data from wallet auth middleware context instead of request body
    const walletPayload = c.get("wallet_payload")

    if (!walletPayload) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Wallet authentication required",
      }
      console.error("Wallet authentication required", errorResponse)
      return c.json(errorResponse, 401)
    }

    const { solutions, challenge_id } = walletPayload

    if (!solutions || !challenge_id) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Missing required fields",
      }
      console.error("Missing required fields", errorResponse)
      return c.json(errorResponse, 400)
    }

    // Get challenge data using AttemptStore with challenge_id
    const attemptStore = new AttemptStore(c.env.AUTH_DB)
    const attemptRecord =
      await attemptStore.getAttemptByChallengeId(challenge_id)

    if (!attemptRecord || !attemptRecord.challengeData) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: `Challenge not found or expired: ${challenge_id}`,
      }
      console.error("Challenge not found or expired", errorResponse)
      return c.json(errorResponse, 400)
    }

    const challengeData = attemptRecord.challengeData
    const attemptId = attemptRecord.attemptId
    const chainId = attemptRecord.chainId

    // Verify wallet signature (CVE fix) - ensure only the hunter who paid can verify
    const walletUser = c.get("wallet_user")

    if (!walletUser) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Wallet authentication required",
      }
      console.error("Wallet authentication required", errorResponse)
      return c.json(errorResponse, 401)
    }

    // Get EVM client from context to verify hunter identity
    const evmClient = c.get("evmClient")
    if (!evmClient) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "EVM client not initialized",
      }
      return c.json(errorResponse, 500)
    }

    // Get attempt from blockchain to verify hunter identity
    const attempt = await evmClient.getAttempt(attemptId)
    if (!attempt) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Attempt not found",
      }
      return c.json(errorResponse, 400)
    }

    // Get pot from blockchain to get the hunter address
    const pot = await evmClient.getPot(attempt.pot_id)
    if (!pot) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Pot not found",
      }
      return c.json(errorResponse, 400)
    }

    // Verify that the wallet user matches either the creator or the hunter (1FA address)
    const isCreator = isAddressEqual(walletUser, pot.creator as Address)
    const isHunter = isAddressEqual(walletUser, pot.one_fa_address as Address)

    if (!isCreator && !isHunter) {
      console.error("Debug: Wallet user mismatch:", {
        walletUser,
        potCreator: pot.creator,
        potOneFaAddress: pot.one_fa_address,
      })
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Wallet signature does not match pot's creator or 1FA address",
      }
      return c.json(errorResponse, 401)
    }

    console.log("✅ Wallet signature verified for authenticate/verify:", {
      walletUser,
      potCreator: pot.creator,
      potOneFaAddress: pot.one_fa_address,
      isCreator,
      isHunter,
    })

    // Get 1P configuration using collision-resistant key
    const moneypotContractAddress = c.get("moneypotContractAddress") as Address
    const collisionResistantKey = OnePDB.key(
      attemptRecord.potId,
      moneypotContractAddress,
      chainId
    )
    const config = await OnePDB.getConfig(c.env.AUTH_DB, collisionResistantKey)
    if (!config) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Pot configuration not found",
      }
      return c.json(errorResponse, 400)
    }

    // Verify solutions - check if solutions match the expected directions
    const DIRECTIONS = ["U", "D", "L", "R", "S"] // Single letter format
    let success = true

    const expected = challengeData.challenges.map(
      (challenge: { expected: string }) => challenge.expected
    )

    console.log({
      solutions,
      expected,
    })

    if (solutions.length !== challengeData.challenges.length) {
      success = false
      console.log(
        "Solution count mismatch:",
        solutions.length,
        "vs",
        challengeData.challenges.length
      )
    } else {
      for (let i = 0; i < solutions.length; i++) {
        const solution = solutions[i]
        const expected = challengeData.challenges[i].expected

        // Check if solution matches expected direction (case insensitive)
        if (
          !DIRECTIONS.includes(solution) ||
          solution.toUpperCase() !== expected.toUpperCase()
        ) {
          success = false
          console.log(
            `Challenge ${i + 1} failed: expected ${expected}, got ${solution}`
          )
          break
        }
      }
    }

    console.log("EVM verification result:", {
      success,
      solutions,
      expected: challengeData.challenges.map(
        (challenge: { expected: string }) => challenge.expected
      ),
    })

    // Update attempt completion using AttemptStore
    await attemptStore.updateAttemptCompletionByChallengeId(
      challenge_id,
      success
    )

    // Update blockchain using EVM client from context (already retrieved above)
    const blockchainUpdated = await evmClient.attemptCompleted(
      attemptId,
      success
    )

    if (!blockchainUpdated) {
      console.error("Failed to update blockchain")
      // Continue anyway for MVP
    }

    // Challenge data cleanup is handled by AttemptStore TTL (10 minutes)

    const successResponse: IAuthenticateVerifyResponse = {
      success,
      message: success ? "Authentication successful!" : "Authentication failed",
    }

    return c.json(successResponse)
  } catch (error) {
    console.error("EVM Authentication verification error:", error)
    const errorResponse: IAuthenticateVerifyErrorResponse = {
      error: "Authentication verification failed",
    }
    return c.json(errorResponse, 500)
  }
})

export default router
