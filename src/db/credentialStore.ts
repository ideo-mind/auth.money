import { createHash } from "crypto"

export class CredentialStore {
  /**
   * Hashes the credential ID using SHA256.
   */
  private static hashCredentialID(credentialID: string): string {
    return createHash("sha256").update(credentialID).digest("hex")
  }

  /**
   * Stores a credential in Cloudflare KV.
   */
  static async setCredential(
    kv: KVNamespace,
    credentialID: string,
    credentialData: object
  ) {
    const hashedID = this.hashCredentialID(credentialID)
    await kv.put(`credential-${hashedID}`, JSON.stringify(credentialData))
  }

  /**
   * Retrieves a credential from Cloudflare KV.
   * Returns the credential object if found, otherwise `null`.
   */
  static async getCredential(
    kv: KVNamespace,
    credentialID: string
  ): Promise<any | null> {
    const hashedID = this.hashCredentialID(credentialID)
    const credentialJSON = await kv.get(`credential-${hashedID}`, {
      type: "json",
    })
    return credentialJSON ? credentialJSON : null
  }

  /**
   * Deletes a credential from Cloudflare KV.
   */
  static async deleteCredential(kv: KVNamespace, credentialID: string) {
    const hashedID = this.hashCredentialID(credentialID)
    await kv.delete(`credential-${hashedID}`)
  }
}
