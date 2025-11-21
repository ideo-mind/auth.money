import { Hono } from "hono"
import { CryptoUtils } from "@utils/crypto"
import { OnePUserDB } from "@db/onePUserDB"
import { ChallengeStore } from "@db/challengeStore"
import { IRunningContext } from "@/src/lib/context"
import { useWalletAuth } from "@mw/useWalletAuth"
import { Address, isAddressEqual } from "viem"
import { OnePEvm } from "@utils/onep"
import { CustodialWalletStore } from "@db/custodialWalletStore"
import { CustodialSigner, PayloadToSign } from "@utils/custodialSigner"
import { createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { creditcoinTestnet } from "@config/viem"

const router = new Hono<IRunningContext>()

// Apply wallet authentication middleware
router.use(useWalletAuth)

interface DtoAuthenticateVerify {
  solutions: string[]
  challenge_id: string
  payloadToSign?: PayloadToSign
  // Wallet auth fields (added by middleware)
  encrypted_payload?: string
  signature?: string
}

interface ChallengeData {
  challenges: Array<{
    grid: string
    colors: string[]
    expected: string
    colorGroups: Record<string, string[]>
  }>
  onePUser: string
}

interface IAuthenticateVerifyResponse {
  success: boolean
  message: string
  signed?: {
    type: string
    signature?: string // For message/typedData signing
    signedTransaction?: string // For transaction signing (raw signed tx)
    signer: string // Custodial wallet address
  }
}

interface IAuthenticateVerifyErrorResponse {
  error: string
}

/**
 * POST /1p/authenticate/verify
 * Verify 1P authentication solution
 */
router.post("/", async (c) => {
  try {
    // Get data from wallet auth middleware context instead of request body
    const walletPayload = c.get("wallet_payload")

    if (!walletPayload) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Wallet authentication required",
      }
      return c.json(errorResponse, 401)
    }

    const { solutions, challenge_id, payloadToSign } = walletPayload

    if (!solutions || !challenge_id) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Missing required fields",
      }
      return c.json(errorResponse, 400)
    }

    // Retrieve challenge using ChallengeStore
    const challengeExists = await ChallengeStore.getChallenge(
      c.env,
      challenge_id
    )
    if (!challengeExists) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Challenge not found or expired",
      }
      return c.json(errorResponse, 400)
    }

    // Get challenge data
    const challengeDataJSON = await c.env.AUTH_DB.get(
      `challenge-data-${challenge_id}`,
      {
        type: "json",
      }
    )

    if (!challengeDataJSON) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Challenge data not found",
      }
      return c.json(errorResponse, 400)
    }

    const challengeData = challengeDataJSON as ChallengeData

    // Verify wallet signature - ensure only the hunter who created the attempt can verify
    const walletUser = c.get("wallet_user")

    if (!walletUser) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Wallet authentication required",
      }
      return c.json(errorResponse, 401)
    }

    // Get OneP client from context to verify hunter identity
    const onepClient = c.get("onepClient")
    if (!onepClient) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "OneP client not initialized",
      }
      return c.json(errorResponse, 500)
    }

    // Get attempt from OneP contract to verify hunter identity
    const attempt = await onepClient.getAttempt(challenge_id)
    if (!attempt) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Attempt not found",
      }
      return c.json(errorResponse, 400)
    }

    // Verify that the wallet user matches the attempt's hot wallet
    if (!isAddressEqual(walletUser, attempt.hotWallet as Address)) {
      console.error("Debug: Wallet user mismatch:", {
        walletUser,
        attemptHotWallet: attempt.hotWallet,
      })
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "Wallet signature does not match attempt's hot wallet",
      }
      return c.json(errorResponse, 401)
    }

    console.log("✅ Wallet signature verified for authenticate/verify:", {
      walletUser,
      attemptHotWallet: attempt.hotWallet,
      onePUser: attempt.onePUser,
    })

    // Get 1P configuration using onePUser
    const config = await OnePUserDB.getConfig(
      c.env.AUTH_DB,
      challengeData.onePUser
    )
    if (!config) {
      const errorResponse: IAuthenticateVerifyErrorResponse = {
        error: "User configuration not found",
      }
      return c.json(errorResponse, 400)
    }

    // Verify solutions - check if solutions match the expected directions
    const DIRECTIONS = ["U", "D", "L", "R", "S"] // Single letter format
    let success = true

    const expected = challengeData.challenges.map((c) => c.expected)

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

    console.log("1P verification result:", {
      success,
      solutions,
      expected: challengeData.challenges.map((c) => c.expected),
    })

    // Update OneP contract using OneP client from context
    const blockchainUpdated = await onepClient.updateAttemptStatus(
      challenge_id,
      success ? 2 : 3
    )

    if (!blockchainUpdated) {
      console.error("Failed to update OneP contract")
      // Continue anyway for MVP
      return c.json(
        { success: false, message: "Failed to update OneP contract" },
        500
      )
    }

    // Clean up challenge
    await ChallengeStore.deleteChallenge(c.env, challenge_id)
    await c.env.AUTH_DB.delete(`challenge-data-${challenge_id}`)

    // Sign message with custodial wallet if authentication was successful
    let signedMessage = null
    if (success && payloadToSign) {
      try {
        // Get custodial wallet for the user
        const custodialWallet = await CustodialWalletStore.getWallet(
          c.env.AUTH_DB,
          challengeData.onePUser
        )

        if (custodialWallet) {
          // Get RPC URL from context (chain config)
          const chainConfig = c.get("chainConfig")
          const rpcUrl = chainConfig?.rpcUrl || "https://rpc.creditcoin.network"

          // Create custodial signer
          const signer = new CustodialSigner(
            custodialWallet.evm.privateKey as `0x${string}`,
            rpcUrl
          )

          // Execute signing operation
          const signingResult = await signer.sign(payloadToSign)

          signedMessage = signingResult

          console.log(
            `✅ Payload signed with custodial wallet: ${custodialWallet.evm.address}`,
            {
              type: payloadToSign.type,
              result: signingResult,
            }
          )
        } else {
          console.log(
            `⚠️ No custodial wallet found for user: ${challengeData.onePUser}`
          )
        }
      } catch (error) {
        console.error("Error signing payload with custodial wallet:", error)
        // Don't fail authentication if signing fails
      }
    } else if (success) {
      // Legacy behavior: sign a simple message if no payloadToSign provided
      try {
        const custodialWallet = await CustodialWalletStore.getWallet(
          c.env.AUTH_DB,
          challengeData.onePUser
        )

        if (custodialWallet) {
          const chainConfig = c.get("chainConfig")
          const rpcUrl = chainConfig?.rpcUrl || "https://rpc.creditcoin.network"

          const signer = new CustodialSigner(
            custodialWallet.evm.privateKey as `0x${string}`,
            rpcUrl
          )

          const message = `1P Authentication successful for ${challengeData.onePUser} at ${Date.now()}`
          const signingResult = await signer.sign({
            type: "message",
            data: { message },
          })

          signedMessage = signingResult

          console.log(
            `✅ Message signed with custodial wallet: ${custodialWallet.evm.address}`
          )
        }
      } catch (error) {
        console.error("Error signing legacy message:", error)
      }
    }

    const successResponse: IAuthenticateVerifyResponse = {
      success,
      message: success ? "Authentication successful!" : "Authentication failed",
      signed: signedMessage
        ? {
            type: signedMessage.type,
            signature: signedMessage.signature,
            signedTransaction: signedMessage.signedTransaction,
            signer: signedMessage.signer,
          }
        : undefined,
    }

    return c.json(successResponse)
  } catch (error) {
    console.error("1P Authentication verification error:", error)
    const errorResponse: IAuthenticateVerifyErrorResponse = {
      error: "Authentication verification failed",
    }
    return c.json(errorResponse, 500)
  }
})

export default router
