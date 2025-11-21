import { Address, Hash } from "viem"

interface AttemptRecord {
  attemptId: string
  potId: string
  hunterAddress: Address
  chainId: number
  timestamp: number
  expiresAt: number
  difficulty: number
  isCompleted: boolean
  success?: boolean
  // NEW: Add challenge data
  challengeData?: {
    challenges: Array<{
      grid: string
      expected: string
      colorGroups: Record<string, string[]>
    }>
  }
}

// Store abstraction for attempt records in AUTH_DB (KV)
export class AttemptStore {
  private kv: KVNamespace
  static readonly PREFIX = "ATTEMPT-"

  constructor(kv: KVNamespace) {
    this.kv = kv
  }

  static key({
    attemptId,
    chainId,
    dApp,
  }: {
    attemptId: string
    chainId: number
    dApp: Address
  }): string {
    let _dapp = ""

    if (dApp.length > 7) {
      _dapp = "0x" + dApp.slice(0, 4) + "." + dApp.slice(-4)
    }
    return `${AttemptStore.PREFIX}${chainId}-${_dapp}-${attemptId}`
  }

  static challengeKey(challengeId: string): string {
    return `${AttemptStore.PREFIX}${challengeId}`
  }

  async getAttempt(
    attemptId: string,
    chainId: number,
    dApp: Address
  ): Promise<AttemptRecord | null> {
    try {
      const key = AttemptStore.key({ attemptId, chainId, dApp })
      const parsed = (await this.kv.get(key, {
        type: "json",
      })) as AttemptRecord | null
      return parsed
    } catch (error) {
      console.error(
        `Error parsing attempt record for ${attemptId} on chain ${chainId}:`,
        error
      )
      return null
    }
  }

  async getAttemptByChallengeId(
    challengeId: string
  ): Promise<AttemptRecord | null> {
    try {
      const key = AttemptStore.challengeKey(challengeId)
      const parsed = (await this.kv.get(key, {
        type: "json",
      })) as AttemptRecord | null
      return parsed
    } catch (error) {
      console.error(
        `Error parsing attempt record for challenge ${challengeId}:`,
        error
      )
      return null
    }
  }

  async setAttemptByChallengeId(
    challengeId: string,
    attempt: AttemptRecord
  ): Promise<void> {
    const key = AttemptStore.challengeKey(challengeId)
    await this.kv.put(key, JSON.stringify(attempt), {
      expirationTtl: 10 * 60, // 10 minutes TTL
    })
  }

  async updateAttemptCompletionByChallengeId(
    challengeId: string,
    success: boolean
  ): Promise<void> {
    const attempt = await this.getAttemptByChallengeId(challengeId)
    if (!attempt) return

    const updatedAttempt: AttemptRecord = {
      ...attempt,
      isCompleted: true,
      success,
      timestamp: Date.now(),
    }

    await this.setAttemptByChallengeId(challengeId, updatedAttempt)
  }

  async setAttempt(attempt: AttemptRecord, dApp: Address): Promise<void> {
    const key = AttemptStore.key({
      attemptId: attempt.attemptId,
      chainId: attempt.chainId,
      dApp,
    })
    await this.kv.put(key, JSON.stringify(attempt), {
      expirationTtl: 10 * 60, // 10 minutes TTL
    })
  }

  async updateAttemptCompletion(
    attemptId: string,
    chainId: number,
    dApp: Address,
    success: boolean
  ): Promise<void> {
    const attempt = await this.getAttempt(attemptId, chainId, dApp)
    if (!attempt) return

    const updatedAttempt: AttemptRecord = {
      ...attempt,
      isCompleted: true,
      success,
      timestamp: Date.now(),
    }

    await this.setAttempt(updatedAttempt, dApp)
  }

  async deleteAttempt(
    attemptId: string,
    chainId: number,
    dApp: Address
  ): Promise<void> {
    const key = AttemptStore.key({ attemptId, chainId, dApp })
    await this.kv.delete(key)
  }

  async getAttemptsByPot(
    potId: string,
    chainId: number
  ): Promise<AttemptRecord[]> {
    // This would require a more complex implementation with indexes
    // For now, we'll rely on the blockchain for this data
    return []
  }

  async getAttemptsByHunter(
    hunterAddress: Address,
    chainId: number
  ): Promise<AttemptRecord[]> {
    // This would require a more complex implementation with indexes
    // For now, we'll rely on the blockchain for this data
    return []
  }
}
