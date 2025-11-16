import { AptosClient, AptosAccount } from 'aptos';
import { Context } from 'hono';
import { Address } from 'viem';

/**
 * Global context interface for Money Pot Verifier Service
 * This provides typesafe sharing of context variables across middlewares and handlers
 */
export interface IRunningContext {
  Bindings: {
    AUTH_DB: KVNamespace;
    rpID: string;
    rpName: string;
    APTOS_NODE_URL: string;
    MONEY_POT_ADDRESS: string;
    ORACLE_PRIVATE_KEY: string;
  };
  Variables: {
    aptosClient: AptosClient;
    oracleAccount: AptosAccount;
    // Wallet authentication fields
    wallet_user?: Address;
    wallet_payload?: any;
    wallet_signature?: string | `0x${string}` | Uint8Array;
  };
}

