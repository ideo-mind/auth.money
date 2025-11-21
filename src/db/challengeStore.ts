import { getArkivClient, getArkivReadClient } from "@config/viem"
// @ts-ignore - Subpath exports may not be resolved by TypeScript but work at runtime
import { stringToPayload } from "@arkiv-network/sdk/utils"
// @ts-ignore - Subpath exports may not be resolved by TypeScript but work at runtime
import { eq } from "@arkiv-network/sdk/query"

export class ChallengeStore {
  static async setChallenge(env: Env, challenge: string) {
    const walletClient = await getArkivClient(env)

    try {
      console.log("Storing challenge in Arkiv...", {
        challengeId: challenge,
        expiresIn: 10 * 60,
        why: "challenge session creation",
      })
      
      const { entityKey, txHash } = await walletClient.createEntity({
        payload: stringToPayload("active"),
        contentType: "text/plain",
        attributes: [
          { key: "type", value: "challenge" },
          { key: "challengeId", value: challenge },
        ],
        expiresIn: 10 * 60, // 10-minute expiry
      })

      console.log("✅ Challenge stored in Arkiv successfully", {
        challengeId: challenge,
        entityKey,
        txHash,
        expiresIn: 10 * 60,
      })
    } catch (error) {
      console.error("Failed to store challenge in Arkiv:", {
        challengeId: challenge,
        error,
      })
      throw error
    }
  }

  static async getChallenge(
    env: Env,
    challenge: string
  ): Promise<boolean> {
    const publicClient = await getArkivReadClient()

    try {
      console.log("Querying challenge from Arkiv...", {
        challengeId: challenge,
        why: "challenge verification",
      })

      // Use query builder pattern from @arkiv-network/sdk v0.4.4
      const results = await publicClient
        .buildQuery()
        .where([
          eq("type", "challenge"),
          eq("challengeId", challenge),
        ])
        .fetch();

      if (results.entities.length === 0) {
        console.log("Challenge not found in Arkiv", {
          challengeId: challenge,
          resultsCount: 0,
        })
        return false
      }

      console.log("✅ Challenge found in Arkiv, extending TTL", {
        challengeId: challenge,
        resultsCount: results.entities.length,
        currentExpiresIn: 10 * 60,
        newExpiresIn: 60,
      })

      // Extend TTL to 60 seconds (min expire) by creating a new entity
      // Note: We recreate with shorter TTL to effectively extend the session
      const walletClient = await getArkivClient(env)
      const { entityKey, txHash } = await walletClient.createEntity({
        payload: stringToPayload("active"),
        contentType: "text/plain",
        attributes: [
          { key: "type", value: "challenge" },
          { key: "challengeId", value: challenge },
        ],
        expiresIn: 60, // Min expire 60 sec
      })

      console.log("✅ Challenge TTL extended in Arkiv", {
        challengeId: challenge,
        entityKey,
        txHash,
        newExpiresIn: 60,
      })

      return true
    } catch (error) {
      console.error("Failed to get challenge from Arkiv:", {
        challengeId: challenge,
        error,
      })
      return false
    }
  }

  static async deleteChallenge(env: Env, challenge: string) {
    // Note: Arkiv doesn't have a direct delete method
    // Challenges will expire automatically based on their TTL
    // This method is kept for API compatibility but is a no-op
    console.log("Challenge deletion requested (will expire automatically)", {
      challengeId: challenge,
      why: "challenge cleanup - Arkiv auto-expires on TTL",
      note: "Arkiv doesn't support explicit deletion",
    })
  }
}

export const challengeStore = new ChallengeStore()
