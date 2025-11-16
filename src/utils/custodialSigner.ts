import { 
  createWalletClient, 
  http, 
  parseEther, 
  encodeFunctionData,
  type Address,
  type Hex,
  type PrivateKeyAccount,
  type WalletClient,
  type PublicClient,
  createPublicClient
} from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';
import { privateKeyToAccount } from 'viem/accounts';
import { creditcoinTestnet } from '@config/viem';

// Load OneP contract ABI
import OnePABI from '@abis/OneP.json';

export interface PayloadToSign {
  type: 'message' | 'typedData' | 'transaction';
  data: any;
}

export interface MessagePayload {
  message: string;
}

export interface TypedDataPayload {
  domain: any;
  types: any;
  primaryType: string;
  message: any;
}

export interface TransactionPayload {
  transaction: {
    to: Address;
    value?: string;
    data?: Hex;
    gas?: string;
    gasPrice?: string;
    nonce?: number;
  };
}

export interface SigningResult {
  type: string;
  signature?: Hex;
  signedTransaction?: Hex;  // Raw signed transaction for broadcasting
  signer: Address;
}

export class CustodialSigner {
  private walletClient: WalletClient;
  private publicClient: PublicClient;
  private account: PrivateKeyAccount;

  constructor(privateKey: Hex, rpcUrl: string) {
    this.account = privateKeyToAccount(privateKey);
    this.walletClient = createWalletClient({
      account: this.account,
      chain: creditcoinTestnet,
      transport: http(rpcUrl)
    });
    this.publicClient = createPublicClient({
      chain: creditcoinTestnet,
      transport: http(rpcUrl)
    });
  }

  /**
   * Sign an arbitrary message (personal_sign, eth_sign)
   */
  async signMessage(payload: MessagePayload): Promise<SigningResult> {
    try {
      const signature = await this.walletClient.signMessage({
        account: this.account,
        message: payload.message
      });

      return {
        type: 'message',
        signature,
        signer: this.account.address
      };
    } catch (error) {
      console.error('Error signing message:', error);
      throw new Error(`Failed to sign message: ${error}`);
    }
  }


  /**
   * Sign a transaction and return signed transaction data (eth_signTransaction)
   */
  async signTransaction(payload: TransactionPayload): Promise<SigningResult> {
    try {
      const { to, value, data, gas, gasPrice, nonce } = payload.transaction;

      // Get current gas price and nonce if not provided
      const currentGasPrice = gasPrice ? BigInt(gasPrice) : await this.publicClient.getGasPrice();
      const currentNonce = nonce !== undefined ? nonce : await this.publicClient.getTransactionCount({
        address: this.account.address,
        blockTag: 'pending'
      });

      // Build transaction
      const transaction = {
        to: to as Address,
        value: value ? BigInt(value) : 0n,
        data: data || '0x',
        gas: gas ? BigInt(gas) : undefined,
        gasPrice: currentGasPrice,
        nonce: currentNonce,
        chainId: creditcoinTestnet.id
      };

      // Sign transaction
      const signedTransaction = await this.walletClient.signTransaction({
        account: this.account,
        chain: creditcoinTestnet,
        ...transaction
      });

      return {
        type: 'transaction',
        signedTransaction,
        signer: this.account.address
      };
    } catch (error) {
      console.error('Error signing transaction:', error);
      throw new Error(`Failed to sign transaction: ${error}`);
    }
  }


  /**
   * Sign EIP-712 typed data (eth_signTypedData_v4)
   */
  async signTypedData(payload: TypedDataPayload): Promise<SigningResult> {
    try {
      const signature = await this.walletClient.signTypedData({
        account: this.account,
        domain: payload.domain,
        types: payload.types,
        primaryType: payload.primaryType,
        message: payload.message
      });

      return {
        type: 'typedData',
        signature,
        signer: this.account.address
      };
    } catch (error) {
      console.error('Error signing typed data:', error);
      throw new Error(`Failed to sign typed data: ${error}`);
    }
  }

  /**
   * Main signing dispatcher - routes to appropriate signing method
   */
  async sign(payload: PayloadToSign): Promise<SigningResult> {
    switch (payload.type) {
      case 'message':
        return this.signMessage(payload.data);
      case 'typedData':
        return this.signTypedData(payload.data);
      case 'transaction':
        return this.signTransaction(payload.data);
      default:
        throw new Error(`Unsupported payload type: ${payload.type}`);
    }
  }
}
