import {
  formatUnits,
  parseUnits,
  Address,
  Hash,
  PublicClient,
  WalletClient,
} from "viem"

import { abi } from "@abis/MoneyPot.json"
import { getTransactionParams } from "./chainUtils"

// MoneyPot contract ABI - inline definition to avoid import issues
export const MONEY_POT_ABI = abi

export interface PotData {
  id: string
  creator: string
  total_usdc: string
  entry_fee: string
  created_at: string
  expires_at: string
  is_active: boolean
  attempts_count: string
  one_fa_address: string
}

export interface AttemptData {
  id: string
  pot_id: string
  solver: string
  created_at: string
  expires_at: string
  is_completed: boolean
  difficulty: number
}

export class MoneyPotEvm {
  private publicClient: PublicClient
  private walletClient: WalletClient | null = null
  private contractAddress: Address

  constructor(
    publicClient: PublicClient,
    walletClient?: WalletClient,
    contractAddress?: Address
  ) {
    this.publicClient = publicClient
    this.walletClient = walletClient || null

    // Use provided contract address or fallback to default
    if (!contractAddress) {
      throw new Error("Contract address is required for MoneyPotEvm")
    }

    this.contractAddress = contractAddress
  }

  /**
   * Get pot data from blockchain using view function
   */
  async getPot(potId: string): Promise<PotData | null> {
    try {
      const result = (await this.publicClient.readContract({
        address: this.contractAddress,
        abi: MONEY_POT_ABI,
        functionName: "getPot",
        args: [BigInt(potId)],
      })) as any

      if (result) {
        return {
          id: result.id.toString(),
          creator: result.creator,
          total_usdc: result.totalAmount.toString(),
          entry_fee: result.fee.toString(),
          created_at: result.createdAt.toString(),
          expires_at: result.expiresAt.toString(),
          is_active: result.isActive,
          attempts_count: result.attemptsCount.toString(),
          one_fa_address: result.oneFaAddress,
        }
      }
      return null
    } catch (error) {
      console.error("Error fetching pot:", error)
      return null
    }
  }

  /**
   * Get attempt data from blockchain using view function
   */
  async getAttempt(attemptId: string): Promise<AttemptData | null> {
    try {
      const result = (await this.publicClient.readContract({
        address: this.contractAddress,
        abi: MONEY_POT_ABI,
        functionName: "getAttempt",
        args: [BigInt(attemptId)],
      })) as any

      if (result) {
        return {
          id: result.id.toString(),
          pot_id: result.potId.toString(),
          solver: result.hunter,
          created_at: "0", // Not available in contract
          expires_at: result.expiresAt.toString(),
          is_completed: result.isCompleted,
          difficulty: Number(result.difficulty),
        }
      }
      return null
    } catch (error) {
      console.error("Error fetching attempt:", error)
      return null
    }
  }

  /**
   * Update attempt completion status on blockchain
   */
  async attemptCompleted(
    attemptId: string,
    success: boolean
  ): Promise<boolean> {
    try {
      if (!this.walletClient) {
        throw new Error("Wallet client not initialized")
      }

      // Get transaction parameters - exclude gas for Polkadot chains
      const txParams = getTransactionParams(this.walletClient.chain)

      const hash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: MONEY_POT_ABI,
        functionName: "attemptCompleted",
        args: [BigInt(attemptId), success],
        account: this.walletClient.account || null,
        chain: this.walletClient.chain,
        ...txParams,
      })

      // Log transaction details with reason
      console.log({
        tx: hash,
        why: `Marking attempt ${attemptId} as ${success ? "successful" : "failed"} on blockchain`,
        attemptId,
        success,
        function: "attemptCompleted",
        oracleAddress: this.walletClient.account?.address,
      })

      // Wait for transaction confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      })

      console.log("Transaction receipt:", receipt)

      if (receipt.status === "success") {
        // Attempt marked successfully
        return true
      } else {
        console.error(`Transaction failed for attempt ${attemptId}`)
        return false
      }
    } catch (error) {
      console.error("Error updating attempt completion:", error)
      return false
    }
  }

  /**
   * Verify if a pot exists and is active
   */
  async isPotActive(potId: string): Promise<boolean> {
    const pot = await this.getPot(potId)
    return pot ? pot.is_active : false
  }

  /**
   * Verify if an attempt is valid and not expired
   */
  async isAttemptValid(attemptId: string): Promise<boolean> {
    const attempt = await this.getAttempt(attemptId)
    if (!attempt) return false

    const now = Math.floor(Date.now() / 1000)
    return attempt.is_completed === false && parseInt(attempt.expires_at) > now
  }

  /**
   * Get active pots from blockchain
   */
  async getActivePots(): Promise<string[]> {
    try {
      const result = (await this.publicClient.readContract({
        address: this.contractAddress,
        abi: MONEY_POT_ABI,
        functionName: "getActivePots",
        args: [],
      })) as bigint[]

      return result.map((id) => id.toString())
    } catch (error) {
      console.error("Error fetching active pots:", error)
      return []
    }
  }

  /**
   * Get all pots from blockchain
   */
  async getPots(): Promise<string[]> {
    try {
      const result = (await this.publicClient.readContract({
        address: this.contractAddress,
        abi: MONEY_POT_ABI,
        functionName: "getPots",
        args: [],
      })) as bigint[]

      return result.map((id) => id.toString())
    } catch (error) {
      console.error("Error fetching pots:", error)
      return []
    }
  }

  /**
   * Get the trusted oracle address
   */
  async getTrustedOracle(): Promise<string | null> {
    try {
      const result = (await this.publicClient.readContract({
        address: this.contractAddress,
        abi: MONEY_POT_ABI,
        functionName: "trustedOracle",
        args: [],
      })) as Address

      return result
    } catch (error) {
      console.error("Error fetching trusted oracle:", error)
      return null
    }
  }
}
