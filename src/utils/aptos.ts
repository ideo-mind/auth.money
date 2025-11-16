import { AptosClient, AptosAccount, HexString } from 'aptos';

export interface PotData {
  id: string;
  creator: string;
  total_usdc: string;
  entry_fee: string;
  created_at: string;
  expires_at: string;
  is_active: boolean;
  attempts_count: string;
  one_fa_address: string;
}

export interface AttemptData {
  id: string;
  pot_id: string;
  solver: string;
  created_at: string;
  expires_at: string;
  is_completed: boolean;
  difficulty: number;
}

export class AptosClientWrapper {
  private client: AptosClient;
  private oracleAccount: AptosAccount | null = null;
  private moduleAddress: string;

  constructor(nodeUrl: string, oraclePrivateKey?: string, moduleAddress?: string) {
    this.client = new AptosClient(nodeUrl);
    this.moduleAddress = moduleAddress || '0xea89ef9798a210009339ea6105c2008d8e154f8b5ae1807911c86320ea03ff3f';
    
    if (oraclePrivateKey) {
      try {
        this.oracleAccount = new AptosAccount(HexString.ensure(oraclePrivateKey).toUint8Array());
      } catch (error) {
        console.error('Failed to initialize oracle account:', error);
      }
    }
  }

  /**
   * Get pot data from blockchain using view function
   */
  async getPot(potId: string): Promise<PotData | null> {
    try {
      const moduleQN = `${this.moduleAddress}::money_pot_manager`;
      const response = await this.client.view({
        function: `${moduleQN}::get_pot`,
        arguments: [potId],
        type_arguments: []
      });
      
      if (response && response.length > 0) {
        const potData = response[0] as any;
        return {
          id: potData.id || potId,
          creator: potData.creator || '',
          total_usdc: potData.total_usdc || '0',
          entry_fee: potData.entry_fee || '0',
          created_at: potData.created_at || '0',
          expires_at: potData.expires_at || '0',
          is_active: potData.is_active || false,
          attempts_count: potData.attempts_count || '0',
          one_fa_address: potData.one_fa_address || ''
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching pot:', error);
      return null;
    }
  }

  /**
   * Get attempt data from blockchain using view function
   */
  async getAttempt(attemptId: string): Promise<AttemptData | null> {
    try {
      const moduleQN = `${this.moduleAddress}::money_pot_manager`;
      const response = await this.client.view({
        function: `${moduleQN}::get_attempt`,
        arguments: [attemptId],
        type_arguments: []
      });
      
      if (response && response.length > 0) {
        const attemptData = response[0] as any;
        return {
          id: attemptData.id || attemptId,
          pot_id: attemptData.pot_id || '',
          solver: attemptData.solver || '',
          created_at: attemptData.created_at || '0',
          expires_at: attemptData.expires_at || '0',
          is_completed: attemptData.is_completed || false,
          difficulty: attemptData.difficulty || 3
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching attempt:', error);
      return null;
    }
  }

  /**
   * Update attempt completion status on blockchain
   */
  async attemptCompleted(attemptId: string, success: boolean): Promise<boolean> {
    try {
      // Oracle account is guaranteed to be initialized by middleware
      const moduleQN = `${this.moduleAddress}::money_pot_manager`;
      const payload = {
        type: "entry_function_payload",
        function: `${moduleQN}::attempt_completed`,
        arguments: [attemptId, success],
        type_arguments: [],
      };

      const transaction = await this.client.generateTransaction(
        this.oracleAccount!.address(),
        payload
      );

      const signedTxn = await this.client.signTransaction(this.oracleAccount!, transaction);
      const txnResult = await this.client.submitTransaction(signedTxn);
      
      // Log transaction details with reason
      console.log({
        tx: txnResult.hash,
        why: `Marking attempt ${attemptId} as ${success ? 'successful' : 'failed'} on blockchain`,
        attemptId,
        success,
        function: `${moduleQN}::attempt_completed`,
        oracleAddress: this.oracleAccount!.address().toString()
      });
      
      await this.client.waitForTransaction(txnResult.hash);

      // Attempt marked successfully
      return true;
    } catch (error) {
      console.error('Error updating attempt completion:', error);
      return false;
    }
  }

  /**
   * Verify if a pot exists and is active
   */
  async isPotActive(potId: string): Promise<boolean> {
    const pot = await this.getPot(potId);
    return pot ? pot.is_active : false;
  }

  /**
   * Verify if an attempt is valid and not expired
   */
  async isAttemptValid(attemptId: string): Promise<boolean> {
    const attempt = await this.getAttempt(attemptId);
    if (!attempt) return false;
    
    const now = Math.floor(Date.now() / 1000);
    return attempt.is_completed === false && parseInt(attempt.expires_at) > now;
  }
}
