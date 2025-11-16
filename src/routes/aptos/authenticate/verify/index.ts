import { Hono } from "hono"
import { CryptoUtils } from "@utils/crypto"
import { OnePDB } from "@db/onePDB"
import { AptosClientWrapper } from "@utils/aptos"
import { ChallengeStore } from "@db/challengeStore"
import { IRunningContext } from "@/src/lib/context"
import { useAptosWallet } from "@mw/aptosWallet"

const router = new Hono<IRunningContext>()

// Apply Aptos wallet middleware (with throttling) to this route
router.use("*", useAptosWallet)

interface ChallengeData {
  challenges: Array<{
    grid: string
    colors: string[]
    expected: string
    colorGroups: Record<string, string[]>
  }>
  pot_id: string
}

/**
 * POST /authenticate/verify
 * Verify 1P authentication solution
 */
router.post("/", async (c) => {
  try {
    const body = await c.req.json()
    const { solutions, challenge_id } = body

    if (!solutions || !challenge_id) {
      return c.json({ error: "Missing required fields" }, 400)
    }

    // Retrieve challenge using ChallengeStore
    const challengeExists = await ChallengeStore.getChallenge(
      c.env,
      challenge_id
    )
    if (!challengeExists) {
      return c.json({ error: "Challenge not found or expired" }, 400)
    }

    // Get challenge data
    const challengeDataJSON = await c.env.AUTH_DB.get(
      `challenge-data-${challenge_id}`,
      {
        type: "json",
      }
    )

    if (!challengeDataJSON) {
      return c.json({ error: "Challenge data not found" }, 400)
    }

    const challengeData = challengeDataJSON as ChallengeData

    // Get 1P configuration
    const config = await OnePDB.getConfig(c.env.AUTH_DB, challengeData.pot_id)
    if (!config) {
      return c.json({ error: "Pot configuration not found" }, 400)
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

    console.log("MVP verification result:", {
      success,
      solutions,
      expected: challengeData.challenges.map((c) => c.expected),
    })

    // Update blockchain
    const aptosClient = new AptosClientWrapper(
      c.env.APTOS_NODE_URL,
      c.env.ORACLE_PRIVATE_KEY,
      c.env.MONEY_POT_ADDRESS
    )
    const blockchainUpdated = await aptosClient.attemptCompleted(
      challenge_id,
      success
    )

    if (!blockchainUpdated) {
      console.error("Failed to update blockchain")
      // Continue anyway for MVP
    }

    // Clean up challenge
    await ChallengeStore.deleteChallenge(c.env, challenge_id)
    await c.env.AUTH_DB.delete(`challenge-data-${challenge_id}`)

    return c.json({
      success,
      message: success ? "Authentication successful!" : "Authentication failed",
    })
  } catch (error) {
    console.error("Authentication verification error:", error)
    return c.json({ error: "Authentication verification failed" }, 500)
  }
})

export default router
