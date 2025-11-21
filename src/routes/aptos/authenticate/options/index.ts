import { Hono } from "hono";
import { CryptoUtils } from "@utils/crypto";
import { OnePDB } from "@db/onePDB";
import { AptosClientWrapper } from "@utils/aptos";
import { ChallengeStore } from "@db/challengeStore";
import { IRunningContext } from "@lib/context";
import { useAptosWallet } from "@mw/aptosWallet";
import { AptosAccount } from "aptos";
import { COLOR_HEX_CODES, DIRECTION_MAPPINGS } from "@config/1p";

const router = new Hono<IRunningContext>();

// Apply Aptos wallet middleware (with throttling) to this route
router.use("*", useAptosWallet);

interface ChallengeData {
  challenges: Array<{ grid: string; expected: string; colorGroups: Record<string, string[]> }>;
  pot_id: string;
}

/**
 * POST /authenticate/options
 * Generate authentication challenges for 1FA attempt
 */
router.all("/", async (c) => {
  try {
    const body = await c.req.json();
    const { payload, public_key } = body;

    if (!payload || !public_key) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const { attempt_id } = payload;
    if (!attempt_id) {
      return c.json({ error: "Missing attempt_id" }, 400);
    }

    // Get attempt from blockchain
    const aptosClient = new AptosClientWrapper(c.env.APTOS_NODE_URL, c.env.ORACLE_PRIVATE_KEY, c.env.MONEY_POT_ADDRESS);
    const attempt = await aptosClient.getAttempt(attempt_id);
    
    if (!attempt) {
      return c.json({ error: "Attempt not found" }, 400);
    }

    if (attempt.is_completed) {
      return c.json({ error: "Attempt already completed" }, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    if (parseInt(attempt.expires_at) < now) {
      return c.json({ error: "Attempt expired" }, 400);
    }

    // Get pot from blockchain
    const pot = await aptosClient.getPot(attempt.pot_id);
    if (!pot) {
      return c.json({ error: "Pot not found" }, 400);
    }

    // Verify 1FA public key matches pot's 1FA address
    try {
      console.log("Debug: Verifying 1FA public key:", { 
        public_key, 
        pot_one_fa_address: pot.one_fa_address 
      });
      
      // Derive address from public key (ensure it has 0x prefix)
      const publicKeyWithPrefix = public_key.startsWith('0x') ? public_key : `0x${public_key}`;
      const derivedAccount = new AptosAccount(undefined, publicKeyWithPrefix);
      const derivedAddress = derivedAccount.address().toString();
      
      console.log("Debug: Derived address from public key:", derivedAddress);
      
      if (derivedAddress !== pot.one_fa_address) {
        console.error("Debug: Address mismatch:", { derivedAddress, potOneFaAddress: pot.one_fa_address });
        // return c.json({ error: "1FA public key does not match pot's 1FA address" }, 401); //FIXME: allow this for MVP
      }else{
      
      console.log("1FA verification successful:", { 
        derivedAddress, 
        potOneFaAddress: pot.one_fa_address 
      });
    }
    } catch (error) {
      console.error("Error verifying 1FA public key:", error);
      return c.json({ error: "Invalid 1FA public key format" }, 400);
    }

    // Get 1P configuration
    const config = await OnePDB.getConfig(c.env.AUTH_DB, attempt.pot_id);
    if (!config) {
      return c.json({ error: "Pot not registered with 1P" }, 400);
    }

    // Get difficulty from blockchain attempt data
    const difficulty = attempt.difficulty;

    // Generate challenges using real 1P protocol
    console.log("Debug: Using blockchain attempt data:", {
      attempt_id: attempt.id,
      difficulty: difficulty,
      expires_at: attempt.expires_at,
      is_completed: attempt.is_completed
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

    // Store challenge data using ChallengeStore
    const challengeData: ChallengeData = {
      challenges: challenges.map(challenge => ({
        grid: challenge.grid,
        expected: challenge.expected,
        colorGroups: challenge.colorGroups
      })),
      pot_id: attempt.pot_id
    };

    console.log("Debug: Stored challenge data:", challengeData);
    console.log("Expected challenges:", challenges.map(challenge => challenge.expected));
    
    await ChallengeStore.setChallenge(c.env, attempt_id);
    await c.env.AUTH_DB.put(`challenge-data-${attempt_id}`, JSON.stringify(challengeData), {
      expirationTtl: 10 * 60 // 10 minutes
    });

    return c.json({
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
    });
  } catch (error) {
    console.error("Authentication options error:", error);
    return c.json({ error: "Failed to generate authentication options" }, 500);
  }
});

export default router;
