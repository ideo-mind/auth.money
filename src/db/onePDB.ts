import { Address, concat, keccak256 } from "viem"
import { CredentialStore } from "./credentialStore"

export interface OnePConfig {
  password: string
  legend: Record<string, string> // color-direction mapping
  pot_id: string
  created_at: number
}

export class OnePDB {
  static readonly PREFIX = "1P-"
  static readonly POT_PREFIX = "POT-"
  /**
   * Stores 1P configuration (password + legend) for a pot using CredentialStore
   */
  static async setConfig(kv: KVNamespace, potId: string, config: OnePConfig) {
    await CredentialStore.setCredential(kv, `1p-${potId}`, config)
  }

  static key(
    potId: string,
    OnePContractAddress: Address,
    chainId: number
  ): string {
    // const hash = keccak256(concat([potId, OnePContractAddress]))
    return `${OnePDB.PREFIX}-${chainId}-${potId}-${OnePContractAddress}`
  }

  /**
   * Retrieves 1P configuration for a pot using CredentialStore
   */
  static async getConfig(
    kv: KVNamespace,
    potId: string
  ): Promise<OnePConfig | null> {
    const config = await CredentialStore.getCredential(kv, `1p-${potId}`)
    return config ? (config as OnePConfig) : null
  }

  /**
   * Checks if a pot is already registered with 1P
   */
  static async isRegistered(kv: KVNamespace, potId: string): Promise<boolean> {
    const config = await this.getConfig(kv, potId)
    return config !== null
  }

  /**
   * Deletes 1P configuration for a pot using CredentialStore
   */
  static async deleteConfig(kv: KVNamespace, potId: string) {
    await CredentialStore.deleteCredential(kv, `1p-${potId}`)
  }
}
