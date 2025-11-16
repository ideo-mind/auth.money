import { CredentialStore } from "./credentialStore";

export interface OnePUserConfig {
  password: string;
  legend: Record<string, string>; // color-direction mapping
  onePUser: string; // 1P username
  created_at: number;
}

export class OnePUserDB {
  /**
   * Stores 1P configuration (password + legend) for a username using CredentialStore
   */
  static async setConfig(
    kv: KVNamespace,
    onePUser: string,
    config: OnePUserConfig
  ) {
    await CredentialStore.setCredential(kv, `1p-user-${onePUser}`, config);
  }

  /**
   * Retrieves 1P configuration for a username using CredentialStore
   */
  static async getConfig(
    kv: KVNamespace,
    onePUser: string
  ): Promise<OnePUserConfig | null> {
    const config = await CredentialStore.getCredential(kv, `1p-user-${onePUser}`);
    return config ? config as OnePUserConfig : null;
  }

  /**
   * Checks if a username is already registered with 1P
   */
  static async isRegistered(
    kv: KVNamespace,
    onePUser: string
  ): Promise<boolean> {
    const config = await this.getConfig(kv, onePUser);
    return config !== null;
  }

  /**
   * Deletes 1P configuration for a username using CredentialStore
   */
  static async deleteConfig(kv: KVNamespace, onePUser: string) {
    await CredentialStore.deleteCredential(kv, `1p-user-${onePUser}`);
  }
}
