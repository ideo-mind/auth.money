import { AptosClientWrapper, PotData, AttemptData } from '@utils/aptos';
import { MoneyPotEvm } from '@utils/evm';
import { getChainConfig, getChainType, ChainConfig, ChainType } from '@config/networks';
import { PublicClient, WalletClient, Address } from 'viem';

/**
 * Unified blockchain client interface
 */
export interface IBlockchainClient {
  readonly chainType: 'aptos' | 'evm';
  readonly chainId: number;
  readonly chainConfig: ChainConfig;
  
  getPot(potId: string): Promise<PotData | null>;
  getAttempt(attemptId: string): Promise<AttemptData | null>;
  attemptCompleted(attemptId: string, success: boolean): Promise<boolean>;
  isPotActive(potId: string): Promise<boolean>;
  isAttemptValid(attemptId: string): Promise<boolean>;
}

/**
 * Base blockchain client class with common functionality
 */
export abstract class BaseBlockchainClient implements IBlockchainClient {
  public readonly chainType: 'aptos' | 'evm';
  public readonly chainId: number;
  public readonly chainConfig: ChainConfig;

  constructor(chainConfig: ChainConfig, oracleKey: string) {
    this.chainConfig = chainConfig;
    this.chainId = chainConfig.chainId;
    this.chainType = chainConfig.type as 'aptos' | 'evm';
    this.initializeClient(oracleKey);
  }

  protected abstract initializeClient(oracleKey: string): void;
  
  // Abstract methods that must be implemented by subclasses
  abstract getPot(potId: string): Promise<PotData | null>;
  abstract getAttempt(attemptId: string): Promise<AttemptData | null>;
  abstract attemptCompleted(attemptId: string, success: boolean): Promise<boolean>;
  abstract isPotActive(potId: string): Promise<boolean>;
  abstract isAttemptValid(attemptId: string): Promise<boolean>;
}

/**
 * Aptos blockchain client class
 */
export class AptosBlockchainClient extends BaseBlockchainClient implements IBlockchainClient {
  private client!: AptosClientWrapper;

  protected initializeClient(oracleKey: string): void {
    this.client = new AptosClientWrapper(
      this.chainConfig.rpcUrl,
      oracleKey,
      this.chainConfig.contractAddress
    );
  }

  async getPot(potId: string): Promise<PotData | null> {
    return this.client.getPot(potId);
  }

  async getAttempt(attemptId: string): Promise<AttemptData | null> {
    return this.client.getAttempt(attemptId);
  }

  async attemptCompleted(attemptId: string, success: boolean): Promise<boolean> {
    return this.client.attemptCompleted(attemptId, success);
  }

  async isPotActive(potId: string): Promise<boolean> {
    return this.client.isPotActive(potId);
  }

  async isAttemptValid(attemptId: string): Promise<boolean> {
    return this.client.isAttemptValid(attemptId);
  }
}

/**
 * EVM blockchain client class
 */
export class EVMBlockchainClient implements IBlockchainClient {
  public readonly chainType: 'evm';
  public readonly chainId: number;
  public readonly chainConfig: ChainConfig;
  private client!: MoneyPotEvm;

  constructor(chainConfig: ChainConfig, publicClient: PublicClient, walletClient: WalletClient, contractAddress: Address) {
    this.chainConfig = chainConfig;
    this.chainId = chainConfig.chainId;
    this.chainType = 'evm';
    this.initializeClient(publicClient, walletClient, contractAddress);
  }

  private initializeClient(publicClient: PublicClient, walletClient: WalletClient, contractAddress: Address): void {
      this.client = new MoneyPotEvm(publicClient, walletClient, contractAddress);
    
  }



  async getPot(potId: string): Promise<PotData | null> {

    return this.client.getPot(potId);
  }

  async getAttempt(attemptId: string): Promise<AttemptData | null> {

    return this.client.getAttempt(attemptId);
  }

  async attemptCompleted(attemptId: string, success: boolean): Promise<boolean> {

    return this.client.attemptCompleted(attemptId, success);
  }

  async isPotActive(potId: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('EVM client not initialized');
    }
    
    return this.client.isPotActive(potId);
  }

  async isAttemptValid(attemptId: string): Promise<boolean> {

    return this.client.isAttemptValid(attemptId);
  }
}

/**
 * Blockchain client factory class
 */
export class BlockchainClientFactory {
  /**
   * Create appropriate blockchain client based on chain ID
   */
  static create(chainId: number, oracleKey: string): IBlockchainClient {
    const chainConfig = getChainConfig(chainId);
    if (!chainConfig) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    const chainType = getChainType(chainId);
    if (!chainType) {
      throw new Error(`Could not determine chain type for chain ID: ${chainId}`);
    }

    switch (chainType) {
      case 'aptos':
        return new AptosBlockchainClient(chainConfig, oracleKey);
      
      case 'evm':
        throw new Error('EVM clients must be created with context clients. Use createEVMWithContext instead.');
      
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  /**
   * Create EVM blockchain client with context clients
   */
  static createEVMWithContext(
    chainConfig: ChainConfig,
    publicClient: PublicClient,
    walletClient: WalletClient,
    contractAddress: Address
  ): EVMBlockchainClient {
    if (chainConfig.type !== 'evm') {
      throw new Error(`Chain ${chainConfig.chainId} is not an EVM chain`);
    }
    
    return new EVMBlockchainClient(chainConfig, publicClient, walletClient, contractAddress);
  }

  /**
   * Create blockchain client with chain config validation
   */
  static createWithConfig(
    chainConfig: ChainConfig, 
    oracleKey: string
  ): IBlockchainClient {
    return this.create(chainConfig.chainId, oracleKey);
  }

  /**
   * Type guard to check if a client is Aptos client
   */
  static isAptosClient(client: IBlockchainClient): client is AptosBlockchainClient {
    return client instanceof AptosBlockchainClient;
  }

  /**
   * Type guard to check if a client is EVM client
   */
  static isEVMClient(client: IBlockchainClient): client is EVMBlockchainClient {
    return client instanceof EVMBlockchainClient;
  }
}

// Legacy function exports for backward compatibility
export const createBlockchainClient = BlockchainClientFactory.create;
export const createBlockchainClientWithConfig = BlockchainClientFactory.createWithConfig;
export const isAptosClient = BlockchainClientFactory.isAptosClient;
export const isEVMClient = BlockchainClientFactory.isEVMClient;
