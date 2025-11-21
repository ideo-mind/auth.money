export interface RSAKeyPair {
  publicKey: string
  privateKey: string
  keyId: string
  created_at: number
  expires_at: number
}

export class PKeyStore {
  /**
   * Stores RSA key pair with 5-minute expiry
   */
  static async setKeyPair(kv: KVNamespace, keyId: string, keyPair: RSAKeyPair) {
    await kv.put(`pkey-${keyId}`, JSON.stringify(keyPair), {
      expirationTtl: 5 * 60, // 5 minutes
    })
  }

  /**
   * Retrieves RSA key pair by keyId
   */
  static async getKeyPair(
    kv: KVNamespace,
    keyId: string
  ): Promise<RSAKeyPair | null> {
    const keyPairJSON = await kv.get(`pkey-${keyId}`, {
      type: "json",
    })
    return keyPairJSON ? (keyPairJSON as RSAKeyPair) : null
  }

  /**
   * Retrieves key pair by public key (for verification)
   */
  static async getKeyPairByPublicKey(
    kv: KVNamespace,
    publicKey: string
  ): Promise<RSAKeyPair | null> {
    // This is a simplified approach - in production you might want to index by public key
    // For now, we'll iterate through stored keys (not ideal for large scale)
    const keys = await kv.list({ prefix: "pkey-" })

    for (const key of keys.keys) {
      const keyPair = (await kv.get(key.name, { type: "json" })) as RSAKeyPair
      if (keyPair && keyPair.publicKey === publicKey) {
        return keyPair
      }
    }

    return null
  }

  /**
   * Deletes RSA key pair
   */
  static async deleteKeyPair(kv: KVNamespace, keyId: string) {
    await kv.delete(`pkey-${keyId}`)
  }

  /**
   * Checks if key pair exists and is not expired
   */
  static async isKeyPairValid(
    kv: KVNamespace,
    keyId: string
  ): Promise<boolean> {
    const keyPair = await this.getKeyPair(kv, keyId)
    if (!keyPair) return false

    const now = Date.now()
    return now < keyPair.expires_at
  }
}
