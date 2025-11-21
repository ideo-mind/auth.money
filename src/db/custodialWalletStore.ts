import { CredentialStore } from "./credentialStore"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { Address } from "viem"

export interface CustodialWallet {
  evm: {
    privateKey: string
    address: string
  }
}

export interface CustodialWalletConfig {
  wallet: CustodialWallet
  onePUser: string
  created_at: number
}

export class CustodialWalletStore {
  private static readonly KEY_PREFIX = "custodial-wallet-"

  /**
   * Generate a new custodial wallet
   */
  static generateWallet(): CustodialWallet {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)

    return {
      evm: {
        privateKey,
        address: account.address,
      },
    }
  }

  /**
   * Store a custodial wallet for a 1P user
   */
  static async setWallet(
    kv: KVNamespace,
    onePUser: string,
    wallet: CustodialWallet
  ): Promise<void> {
    const config: CustodialWalletConfig = {
      wallet,
      onePUser,
      created_at: Date.now(),
    }

    const key = `${this.KEY_PREFIX}${onePUser}`
    await kv.put(key, JSON.stringify(config))
  }

  /**
   * Create and store a new custodial wallet for a 1P user
   */
  static async createWallet(
    kv: KVNamespace,
    onePUser: string
  ): Promise<CustodialWallet> {
    const wallet = this.generateWallet()
    await this.setWallet(kv, onePUser, wallet)
    return wallet
  }

  /**
   * Get custodial wallet for a 1P user
   */
  static async getWallet(
    kv: KVNamespace,
    onePUser: string
  ): Promise<CustodialWallet | null> {
    const key = `${this.KEY_PREFIX}${onePUser}`
    const config = (await kv.get(key, {
      type: "json",
    })) as CustodialWalletConfig | null

    if (!config) {
      return null
    }

    try {
      return config.wallet
    } catch (error) {
      console.error("Error parsing custodial wallet config:", error)
      return null
    }
  }

  /**
   * Check if a 1P user has a custodial wallet
   */
  static async hasWallet(kv: KVNamespace, onePUser: string): Promise<boolean> {
    const wallet = await this.getWallet(kv, onePUser)
    return wallet !== null
  }

  /**
   * Delete custodial wallet for a 1P user
   */
  static async deleteWallet(kv: KVNamespace, onePUser: string): Promise<void> {
    const key = `${this.KEY_PREFIX}${onePUser}`
    await kv.delete(key)
  }

  /**
   * Get all custodial wallets (for debugging/admin purposes)
   */
  static async getAllWallets(
    kv: KVNamespace
  ): Promise<CustodialWalletConfig[]> {
    const list = await kv.list({ prefix: this.KEY_PREFIX })
    const wallets: CustodialWalletConfig[] = []

    for (const key of list.keys) {
      const config = (await kv.get(key.name, {
        type: "json",
      })) as CustodialWalletConfig | null
      if (config) {
        try {
          wallets.push(config)
        } catch (error) {
          console.error("Error parsing custodial wallet config:", error)
        }
      }
    }

    return wallets
  }
}
