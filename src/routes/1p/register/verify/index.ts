import { Hono } from "hono";
import { OnePUserDB, OnePUserConfig } from "@db/onePUserDB";
import { IRunningContext } from "@lib/context";
import { Address, isAddressEqual } from "viem";
import { useWalletAuth } from "@mw/useWalletAuth";
import { OnePEvm } from "@utils/onep";
import { CustodialWalletStore } from "@db/custodialWalletStore";

const router = new Hono<IRunningContext>();

// Apply wallet authentication middleware
router.use(useWalletAuth);

interface RegisterVerifyPayload {
  onePUser: string; // 1P username
  "1p": string; // password
  legend: Record<string, string>; // color-direction mapping
  iat: number;
  iss: Address;
  exp: number;
}

interface IRegisterVerifyResponse {
  success: boolean;
  onePUser?: string;
  custodialWallet?: {
    address: string;
  };
  existing_config?: {
    created_at: number;
    legend: Record<string, string>;
  } | null;
}

interface IRegisterVerifyErrorResponse {
  error: string;
  onePUser?: string;
  existing_config?: {
    created_at: number;
    legend: Record<string, string>;
  } | null;
}

/**
 * POST /1p/register/verify
 * Verify 1P registration using wallet authentication middleware
 */
router.post("/", async (c) => {
  try {
    // Get wallet user from middleware
    const walletUser = c.get('wallet_user');
    if (!walletUser) {
      const errorResponse: IRegisterVerifyErrorResponse = {
        error: "Wallet authentication required"
      };
      return c.json(errorResponse, 401);
    }

    // Get payload from middleware
    const payload = c.get('wallet_payload') as RegisterVerifyPayload;
    if (!payload) {
      const errorResponse: IRegisterVerifyErrorResponse = {
        error: "Invalid payload"
      };
      return c.json(errorResponse, 400);
    }

    // Validate payload structure
    const { onePUser, "1p": password, legend, iat, iss, exp } = payload;
    
    if (!onePUser || !password || !legend || !iat || !iss || !exp) {
      const errorResponse: IRegisterVerifyErrorResponse = {
        error: "Invalid payload structure"
      };
      return c.json(errorResponse, 400);
    }

    // Check if wallet_user matches the payload issuer (iss)
    if (walletUser.toLowerCase() !== iss.toLowerCase()) {
      console.error("Debug: Wallet user mismatch:", { 
        walletUser, 
        iss 
      });
      const errorResponse: IRegisterVerifyErrorResponse = {
        error: "Wallet signature does not match payload issuer"
      };
      return c.json(errorResponse, 401);
    }

    console.log("✅ Wallet signature verified for register/verify:", { 
      walletUser, 
      iss 
    });

    // Get OneP client from context
    const onepClient = c.get('onepClient');
    
    if (!onepClient) {
      console.error('OneP client not found in context');
      const errorResponse: IRegisterVerifyErrorResponse = {
        error: "OneP client not initialized"
      };
      return c.json(errorResponse, 500);
    }
    
    try {
      // Check if user is registered on OneP contract
      const userProfile = await onepClient.getUserProfile(onePUser);
      
      if (!userProfile) {
        const errorResponse: IRegisterVerifyErrorResponse = {
          error: "User not found on OneP contract"
        };
        return c.json(errorResponse, 400);
      }

     
      // Check if wallet_user matches the registered account
      // For MVP: If account is zero address, skip this check (account not attached yet)
      if (userProfile.account !== "0x0000000000000000000000000000000000000000" && 
          !isAddressEqual(walletUser, userProfile.account as Address)) {
        console.error("Debug: Wallet user is not the registered account:", { 
          walletUser, 
          registeredAccount: userProfile.account 
        });
        const errorResponse: IRegisterVerifyErrorResponse = {
          error: "Wallet user is not the registered account for this username"
        };
        return c.json(errorResponse, 401);
      }

      console.log("✅ Wallet user verified as registered account:", { 
        walletUser, 
        registeredAccount: userProfile.account,
        onePUser
      });

    } catch (error) {
      console.error('Error checking user registration:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorResponse: IRegisterVerifyErrorResponse = {
        error: `Failed to verify user on OneP contract: ${errorMessage}`
      };
      return c.json(errorResponse, 500);
    }

    // Check if user is already registered with 1P
    const isRegistered = await OnePUserDB.isRegistered(c.env.AUTH_DB, onePUser);
    if (isRegistered) {
      // Get existing config for debugging
      const existingConfig = await OnePUserDB.getConfig(c.env.AUTH_DB, onePUser);
      console.log(`User ${onePUser} already registered with config:`, existingConfig);
      
      const errorResponse: IRegisterVerifyErrorResponse = {
        error: "User already registered with 1P",
        onePUser: onePUser,
        existing_config: existingConfig ? {
          created_at: existingConfig.created_at,
          legend: existingConfig.legend
        } : null
      };
      
      return c.json(errorResponse, 400);
    }

    // Store 1P configuration
    const config: OnePUserConfig = {
      password,
      legend,
      onePUser,
      created_at: Date.now()
    };

    await OnePUserDB.setConfig(c.env.AUTH_DB, onePUser, config);

    // Create custodial wallet for the user
    console.log(`Creating custodial wallet for user: ${onePUser}`);
    const custodialWallet = await CustodialWalletStore.createWallet(c.env.AUTH_DB, onePUser);
    console.log(`✅ Custodial wallet created and stored for ${onePUser}: ${custodialWallet.evm.address}`);

    // Attach the custodial wallet account to the OneP user
    try {
      const onepClient = c.get('onepClient');
      if (onepClient) {
        console.log(`📝 Calling attachAccount(${onePUser}, ${custodialWallet.evm.address}) on OneP contract`);
        const attachSuccess = await onepClient.attachAccount(onePUser, custodialWallet.evm.address as Address);
        
        if (attachSuccess) {
          console.log(`✅ Successfully attached account ${custodialWallet.evm.address} to OneP user ${onePUser}`);
        } else {
          console.error(`❌ Failed to attach account ${custodialWallet.evm.address} to OneP user ${onePUser}`);
          // Don't fail registration if attachAccount fails - wallet is still created
        }
      }
    } catch (error) {
      console.error('Error calling attachAccount:', error);
      // Don't fail registration if attachAccount fails - wallet is still created
    }

    const successResponse: IRegisterVerifyResponse = {
      success: true,
      custodialWallet: {
        address: custodialWallet.evm.address
      }
    };

    return c.json(successResponse);
  } catch (error) {
    console.error("1P Registration verification error:", error);
    const errorResponse: IRegisterVerifyErrorResponse = {
      error: "Registration verification failed"
    };
    return c.json(errorResponse, 500);
  }
});

export default router;
