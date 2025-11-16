import { Address, Hash, PublicClient, WalletClient } from 'viem';
import { abi } from '@abis/OneP.json';
import { getTransactionParams } from './chainUtils';

// OneP contract ABI - inline definition to avoid import issues
export const ONEP_ABI = abi;

export interface UserProfile {
  name: string;
  img: string;
  account: string;
}

export interface UserState {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
}

export interface AttemptData {
  id: string;
  onePUser: string;
  hotWallet: string;
  difficulty: number;
  status: number; // 0=Pending, 1=InProgress, 2=Success, 3=Failed
  createdAt: number;
  expiresAt: number;
}

export class OnePEvm {
  private publicClient: PublicClient;
  private walletClient: WalletClient | null = null;
  private contractAddress: Address;

  constructor(publicClient: PublicClient, walletClient?: WalletClient, contractAddress?: Address) {
    this.publicClient = publicClient;
    this.walletClient = walletClient || null;
    
    // Use provided contract address or fallback to default
    if (!contractAddress) {
      throw new Error('Contract address is required for OnePEvm');
    }
    
    this.contractAddress = contractAddress;
  }

  /**
   * Get user profile from blockchain using view function
   */
  async getUserProfile(onePUser: string): Promise<UserProfile | null> {
    try {
      const result = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: ONEP_ABI,
        functionName: 'getUserProfile',
        args: [onePUser],
      }) as any;
      
      if (result) {
        return {
          name: result.name,
          img: result.img,
          account: result.account
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }

  /**
   * Get user state from blockchain using view function
   */
  async getUserState(onePUser: string): Promise<UserState | null> {
    try {
      const result = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: ONEP_ABI,
        functionName: 'getUserState',
        args: [onePUser],
      }) as any;
      
      if (result) {
        return {
          totalAttempts: Number(result.totalAttempts),
          successfulAttempts: Number(result.successfulAttempts),
          failedAttempts: Number(result.failedAttempts)
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching user state:', error);
      return null;
    }
  }

  /**
   * Get attempt data from blockchain using view function
   */
  async getAttempt(attemptId: string): Promise<AttemptData | null> {
    try {
      const result = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: ONEP_ABI,
        functionName: 'getAttempt',
        args: [BigInt(attemptId)],
      }) as any;
      
      if (result) {
        return {
          id: result.id.toString(),
          onePUser: result.onePUser,
          hotWallet: result.hotWallet,
          difficulty: Number(result.difficulty),
          status: Number(result.status),
          createdAt: Number(result.createdAt),
          expiresAt: Number(result.expiresAt)
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching attempt:', error);
      return null;
    }
  }

  /**
   * Attach account to OneP user
   */
  async attachAccount(onePUser: string, account: Address): Promise<boolean> {
    try {
      if (!this.walletClient) {
        throw new Error('Wallet client not initialized');
      }

      // Get transaction parameters - exclude gas for Polkadot chains
      const txParams = getTransactionParams(this.walletClient.chain)

      const hash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: ONEP_ABI,
        functionName: 'attachAccount',
        args: [onePUser, account],
        account: this.walletClient.account || null,
        chain: this.walletClient.chain,
        ...txParams,
      });

      console.log({
        tx: hash,
        why: `Attaching account ${account} to OneP user ${onePUser}`,
        onePUser,
        account
      });

      return true;
    } catch (error) {
      console.error('Error attaching account:', error);
      return false;
    }
  }

  /**
   * Update attempt status on blockchain
   */
  async updateAttemptStatus(attemptId: string, status: number): Promise<boolean> {
    try {
      if (!this.walletClient) {
        throw new Error('Wallet client not initialized');
      }

      // Get transaction parameters - exclude gas for Polkadot chains
      const txParams = getTransactionParams(this.walletClient.chain)

      const hash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: ONEP_ABI,
        functionName: 'updateAttemptStatus',
        args: [BigInt(attemptId), status],
        account: this.walletClient.account || null,
        chain: this.walletClient.chain,
        ...txParams,
      });

      // Log transaction details with reason
      console.log({
        tx: hash,
        why: `Updating attempt ${attemptId} status to ${status} on blockchain`,
        attemptId,
        status,
        function: 'updateAttemptStatus',
        verifierAddress: this.walletClient.account?.address
      });
      
      // Wait for transaction confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === 'success') {
        // Attempt status updated successfully
        return true;
      } else {
        console.error(`Transaction failed for attempt ${attemptId}`);
        return false;
      }
    } catch (error) {
      console.error('Error updating attempt status:', error);
      return false;
    }
  }

  /**
   * Check if a user exists and is registered
   */
  async isUserRegistered(onePUser: string): Promise<boolean> {
    const profile = await this.getUserProfile(onePUser);
    return profile !== null;
  }

  /**
   * Check if an attempt is valid and not expired
   */
  async isAttemptValid(attemptId: string): Promise<boolean> {
    const attempt = await this.getAttempt(attemptId);
    if (!attempt) return false;
    
    const now = Math.floor(Date.now() / 1000);
    return attempt.status === 0 && attempt.expiresAt > now; // Status 0 = Pending
  }

  /**
   * Get all attempt IDs for a user
   */
  async getAllAttemptIds(): Promise<string[]> {
    try {
      const result = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: ONEP_ABI,
        functionName: 'getAllAttemptIds',
        args: [],
      }) as bigint[];
      
      return result.map(id => id.toString());
    } catch (error) {
      console.error('Error fetching all attempt IDs:', error);
      return [];
    }
  }

  /**
   * Get the verifier address
   */
  async getVerifier(): Promise<string | null> {
    try {
      const result = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: ONEP_ABI,
        functionName: 'verifier',
        args: [],
      }) as Address;
      
      return result;
    } catch (error) {
      console.error('Error fetching verifier:', error);
      return null;
    }
  }
}
