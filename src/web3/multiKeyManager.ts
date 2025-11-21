import { getWallet } from './walletFactory';

/**
 * Multi-Key Wallet Manager
 * 
 * This utility provides support for managing multiple private keys
 * using the PRIVATE_KEY_* pattern from your OpenAI project.
 * 
 * Supports patterns like:
 * - PRIVATE_KEY_ORACLE
 * - PRIVATE_KEY_PAYMASTER_0x123...
 * - PRIVATE_KEY_USER_123
 * - etc.
 */

export interface MultiKeyConfig {
  defaultRole?: string;
  enableNonceManagement?: boolean;
  enableRateLimiting?: boolean;
}

export interface KeyInfo {
  role: string;
  address?: string;
  privateKey: string;
  isDefault: boolean;
}

/**
 * Multi-Key Wallet Manager Class
 */
export class MultiKeyWalletManager {
  private static instance: MultiKeyWalletManager;
  private keyCache = new Map<string, KeyInfo>();

  private constructor() {}

  public static getInstance(): MultiKeyWalletManager {
    if (!MultiKeyWalletManager.instance) {
      MultiKeyWalletManager.instance = new MultiKeyWalletManager();
    }
    return MultiKeyWalletManager.instance;
  }

  /**
   * Discover all available private keys from environment
   */
  public discoverKeys(env: Env): KeyInfo[] {
    const keys: KeyInfo[] = [];
    
    // Check for ORACLE_PRIVATE_KEY_EVM (legacy)
    if (env.ORACLE_PRIVATE_KEY_EVM) {
      keys.push({
        role: 'ORACLE',
        privateKey: env.ORACLE_PRIVATE_KEY_EVM,
        isDefault: true,
      });
    }

    // Discover PRIVATE_KEY_* patterns
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith('PRIVATE_KEY_') && typeof value === 'string') {
        const role = key.replace('PRIVATE_KEY_', '');
        const isDefault = role === 'ORACLE';
        
        keys.push({
          role,
          privateKey: value,
          isDefault,
        });
      }
    }

    return keys;
  }

  /**
   * Get wallet for a specific role
   */
  public getWalletForRole(
    role: string,
    env: Env,
    config: MultiKeyConfig = {}
  ) {
    const privateKey = (env as any)[`PRIVATE_KEY_${role.toUpperCase()}`] || env.ORACLE_PRIVATE_KEY_EVM;
    
    if (!privateKey) {
      throw new Error(`Private key not found for role: ${role}`);
    }

    return getWallet(privateKey, env);
  }

  /**
   * Get wallet for a specific address (using address as role)
   */
  public getWalletForAddress(
    address: string,
    env: Env,
    config: MultiKeyConfig = {}
  ) {
    // Use the address as the role key (remove 0x prefix)
    const role = address.replace('0x', '').toUpperCase();
    return this.getWalletForRole(role, env, config);
  }

  /**
   * Get all available wallets
   */
  public getAllWallets(
    env: Env,
    config: MultiKeyConfig = {}
  ): Map<string, any> {
    const wallets = new Map();
    const keys = this.discoverKeys(env);

    for (const keyInfo of keys) {
      try {
        const wallet = getWallet(keyInfo.privateKey, env);
        wallets.set(keyInfo.role, wallet);
      } catch (error) {
        console.warn(`Failed to create wallet for role ${keyInfo.role}:`, error);
      }
    }

    return wallets;
  }

  /**
   * Get default wallet (ORACLE role)
   */
  public getDefaultWallet(
    env: Env,
    config: MultiKeyConfig = {}
  ) {
    return this.getWalletForRole('ORACLE', env, config);
  }

  /**
   * Create multiple wallets for parallel operations
   */
  public createParallelWallets(
    roles: string[],
    env: Env,
    config: MultiKeyConfig = {}
  ): Map<string, any> {
    const wallets = new Map();
    
    for (const role of roles) {
      try {
        const wallet = this.getWalletForRole(role, env, config);
        wallets.set(role, wallet);
      } catch (error) {
        console.warn(`Failed to create wallet for role ${role}:`, error);
      }
    }
    
    return wallets;
  }

  /**
   * Get wallet statistics
   */
  public getStats(env: Env): {
    totalKeys: number;
    availableRoles: string[];
    defaultRole?: string;
  } {
    const keys = this.discoverKeys(env);
    const defaultKey = keys.find(k => k.isDefault);
    
    return {
      totalKeys: keys.length,
      availableRoles: keys.map(k => k.role),
      defaultRole: defaultKey?.role,
    };
  }

  /**
   * Validate all private keys
   */
  public validateKeys(env: Env): { valid: KeyInfo[]; invalid: { role: string; error: string }[] } {
    const keys = this.discoverKeys(env);
    const valid: KeyInfo[] = [];
    const invalid: { role: string; error: string }[] = [];

    for (const keyInfo of keys) {
      try {
        // Validate private key format
        if (!/^0x[a-fA-F0-9]{64}$/.test(keyInfo.privateKey)) {
          throw new Error(`Invalid private key format`);
        }
        
        // Try to create account to validate
        getWallet(keyInfo.privateKey, env);
        valid.push(keyInfo);
      } catch (error) {
        invalid.push({
          role: keyInfo.role,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { valid, invalid };
  }
}

// Export singleton instance
export const multiKeyManager = MultiKeyWalletManager.getInstance();

// Convenience functions
export function getWalletForRole(role: string, env: Env, config?: MultiKeyConfig) {
  return multiKeyManager.getWalletForRole(role, env, config);
}

export function getWalletForAddress(address: string, env: Env, config?: MultiKeyConfig) {
  return multiKeyManager.getWalletForAddress(address, env, config);
}

export function getAllWallets(env: Env, config?: MultiKeyConfig) {
  return multiKeyManager.getAllWallets(env, config);
}

export function getDefaultWallet(env: Env, config?: MultiKeyConfig) {
  return multiKeyManager.getDefaultWallet(env, config);
}

export function createParallelWallets(roles: string[], env: Env, config?: MultiKeyConfig) {
  return multiKeyManager.createParallelWallets(roles, env, config);
}