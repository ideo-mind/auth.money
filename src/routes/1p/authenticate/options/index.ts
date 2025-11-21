import { Hono } from "hono";
import { CryptoUtils } from "@utils/crypto";
import { OnePUserDB } from "@db/onePUserDB";
import { ChallengeStore } from "@db/challengeStore";
import { IRunningContext } from "@lib/context";
import { COLOR_HEX_CODES, DIRECTION_MAPPINGS } from "@config/1p";
import { recoverAddress, detectSignatureType, verifyAptosSignature, getAptosAddressFromPublicKey } from "@utils/signature";
import { Address, Signature, recoverMessageAddress, isAddressEqual } from "viem";
import { OnePEvm } from "@utils/onep";

const router = new Hono<IRunningContext>();

interface AuthenticateOptionsPayload {
  attempt_id: string;
  signature?: Signature | `0x${string}` | Uint8Array;
}

interface DtoAuthenticateOptions {
  payload: AuthenticateOptionsPayload;
}

interface ChallengeData {
  challenges: Array<{ grid: string; expected: string; colorGroups: Record<string, string[]> }>;
  onePUser: string;
}

interface IAuthenticateOptionsResponse {
  challenge_id: string;
  challenges: Array<{
    grid: string;
    colorGroups: {
      red: string[];
      green: string[];
      blue: string[];
      yellow: string[];
    };
  }>;
  colors: Record<string, string>;
  directions: {
    up: string;
    down: string;
    left: string;
    right: string;
    skip: string;
  };
}

interface IAuthenticateOptionsErrorResponse {
  error: string;
}

/**
 * POST /1p/authenticate/options
 * Generate authentication challenges for 1P attempt
 */
router.post("/", async (c) => {
  try {
    const body = await c.req.json<DtoAuthenticateOptions>();
    const { payload } = body;

    if (!payload) {
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Missing required fields"
      };
      return c.json(errorResponse, 400);
    }

    const { attempt_id } = payload;
    if (!attempt_id) {
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Missing attempt_id"
      };
      return c.json(errorResponse, 400);
    }

    // Get OneP client from context
    const onepClient = c.get('onepClient');
    
    if (!onepClient) {
      console.error('OneP client not found in context');
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "OneP client not initialized"
      };
      return c.json(errorResponse, 500);
    }
    
    // Get attempt from OneP contract
    const attempt = await onepClient.getAttempt(attempt_id);
    
    if (!attempt) {
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Attempt not found"
      };
      return c.json(errorResponse, 400);
    }

    if (attempt.status === 2 || attempt.status === 3) { // Success or Failed
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Attempt already completed"
      };
      return c.json(errorResponse, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    if (attempt.expiresAt < now) {
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Attempt expired"
      };
      return c.json(errorResponse, 400);
    }

    // Verify hunter signature (EVM signature verification)
    console.log("Debug: Verifying hunter signature for OneP");
    
    if (!payload.signature) {
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Missing signature for hunter verification"
      };
      return c.json(errorResponse, 400);
    }

    // Recover address from signature
    let recoveredAddress: string;
    try {
      recoveredAddress = await recoverMessageAddress({
        message: attempt_id,
        signature: payload.signature as `0x${string}`,
      });
    } catch (e) {
      console.log("Signature recovery failed:", e);
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Hunter signature verification failed"
      };
      return c.json(errorResponse, 400);
    }
    
    console.log("Debug: Recovered hunter address:", recoveredAddress);
    console.log("Debug: Expected hunter address:", attempt.hotWallet);
    
    // Verify that the hunter who signed is the same as the one who created the attempt
    if (!isAddressEqual(recoveredAddress as Address, attempt.hotWallet as Address)) {
      console.error("Debug: Hunter address mismatch:", { 
        recoveredAddress, 
        attemptHotWallet: attempt.hotWallet 
      });
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "Hunter signature does not match attempt's hot wallet"
      };
      return c.json(errorResponse, 401);
    }
    
    console.log("✅ Hunter signature verified successfully:", { 
      recoveredAddress, 
      attemptHotWallet: attempt.hotWallet 
    });

    // Get 1P configuration using onePUser
    const config = await OnePUserDB.getConfig(c.env.AUTH_DB, attempt.onePUser);
    if (!config) {
      const errorResponse: IAuthenticateOptionsErrorResponse = {
        error: "User not registered with 1P"
      };
      return c.json(errorResponse, 400);
    }

    // Get difficulty from attempt data
    const difficulty = attempt.difficulty;

    // Generate challenges using real 1P protocol
    console.log("Debug: Using OneP attempt data:", {
      attempt_id: attempt.id,
      onePUser: attempt.onePUser,
      difficulty: difficulty,
      expires_at: attempt.expiresAt,
      status: attempt.status
    });
    
    console.log("Debug: Generating 1P challenges with:", {
      password: config.password,
      legend: config.legend,
      difficulty
    });
    
    const challenges = CryptoUtils.generateChallengeGrids(
      config.password,
      config.legend,
      difficulty
    );
    
    console.log("Debug: Generated 1P challenges:", challenges.length);

    // Update attempt status to InProgress
    const statusUpdated = await onepClient.updateAttemptStatus(attempt_id, 1);
    if (!statusUpdated) {
      console.error("Failed to update attempt status to InProgress");
      // Continue anyway for MVP
    }

    // Store challenge data using ChallengeStore
    const challengeData: ChallengeData = {
      challenges: challenges.map(challenge => ({
        grid: challenge.grid,
        expected: challenge.expected,
        colorGroups: challenge.colorGroups
      })),
      onePUser: attempt.onePUser
    };

    console.log("Debug: Stored challenge data:", challengeData);
    console.log("Expected challenges:", challenges.map(challenge => challenge.expected));
    
    await ChallengeStore.setChallenge(c.env, attempt_id);
    await c.env.AUTH_DB.put(`challenge-data-${attempt_id}`, JSON.stringify(challengeData), {
      expirationTtl: 10 * 60 // 10 minutes
    });

    const successResponse: IAuthenticateOptionsResponse = {
      challenge_id: attempt_id,
      challenges: challenges.map(challenge => ({
        grid: challenge.grid,
        colorGroups: {
          red: challenge.colorGroups.red.slice(0, 16), // Limit to 16 chars per color
          green: challenge.colorGroups.green.slice(0, 16),
          blue: challenge.colorGroups.blue.slice(0, 16),
          yellow: challenge.colorGroups.yellow.slice(0, 16)
        }
      })),
      colors: COLOR_HEX_CODES,
      directions: {
        up: DIRECTION_MAPPINGS.Up,
        down: DIRECTION_MAPPINGS.Down,
        left: DIRECTION_MAPPINGS.Left,
        right: DIRECTION_MAPPINGS.Right,
        skip: DIRECTION_MAPPINGS.Skip
      }
    };

    return c.json(successResponse);
  } catch (error) {
    console.error("1P Authentication options error:", error);
    const errorResponse: IAuthenticateOptionsErrorResponse = {
      error: "Failed to generate authentication options"
    };
    return c.json(errorResponse, 500);
  }
});

export default router;
