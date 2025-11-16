import {
  COLORS,
  DEFAULT_DIFFICULTY,
  DOMAIN_CHARS,
  GRID_SIZE,
} from "@config/1p";
import { RSAKeyPair } from "@db/pkeyStore";
import { AptosAccount, HexString } from "aptos";
import crypto from "crypto";
import { keccak256 } from "ethers";
import forge from "node-forge";

export class CryptoUtils {
  /**
   * Generate RSA key pair for encryption
   */
  static generateRSAKeyPair(): RSAKeyPair {
    const keypair = forge.pki.rsa.generateKeyPair(2048);
    const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);
    const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
    const keyId = forge.util.bytesToHex(forge.random.getBytesSync(16));
    const now = Date.now();

    return {
      publicKey: publicKeyPem,
      privateKey: privateKeyPem,
      keyId,
      created_at: now,
      expires_at: now + 5 * 60 * 1000, // 5 minutes
    };
  }

  /**
   * Encrypt data with RSA public key
   */
  static encryptWithRSA(data: string, publicKeyPem: string): string {
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const encrypted = publicKey.encrypt(data, "RSA-OAEP", {
      md: forge.md.sha256.create(),
      mgf1: {
        md: forge.md.sha256.create(),
      },
    });
    return forge.util.bytesToHex(encrypted);
  }

  /**
   * Decrypt data with RSA private key
   */
  static decryptWithRSA(encryptedHex: string, privateKeyPem: string): string {
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
    const encryptedBytes = forge.util.hexToBytes(encryptedHex);
    const decrypted = privateKey.decrypt(encryptedBytes, "RSA-OAEP", {
      md: forge.md.sha256.create(),
      mgf1: {
        md: forge.md.sha256.create(),
      },
    });
    return decrypted;
  }

  /**
   * Verify Aptos signature using Ed25519
   */
  static async verifyAptosSignature(
    message: string,
    signature: string,
    expectedAddress: string,
  ): Promise<boolean> {
    try {
      // Create hash digest of the message
      const hashDigest = Buffer.from(
        keccak256(Buffer.from(message, "utf8")).slice(2),
        "hex",
      );

      // Create AptosAccount from address to get public key
      const account = new AptosAccount(undefined, expectedAddress);
      const publicKey = account.pubKey();

      // Verify signature using AptosAccount method
      const isValid = account.verifySignature(
        HexString.fromUint8Array(hashDigest),
        signature,
      );

      return isValid;
    } catch (error) {
      console.error("Aptos signature verification error:", error);
      return false;
    }
  }

  /**
   * Generate challenge grids for 1P authentication
   * Implements the real 1P protocol challenge generation based on 1p.ts
   */
  static generateChallengeGrids(
    password: string,
    legend: Record<string, string>,
    difficulty: number = DEFAULT_DIFFICULTY,
  ): Array<{
    grid: string;
    expected: string;
    colorGroups: Record<string, string[]>;
  }> {
    const challenges = [];

    const CHARS = DOMAIN_CHARS;

    // Challenge grid size - reasonable for human scanning (8x8 = 64 chars max)

    for (let round = 0; round < difficulty; round++) {
      // Generate nonce for this round
      const nonce = this.generateNonce();
      const entropy = this.generateEntropyLayers(nonce, 1);

      // Create a subset of characters for this challenge
      const shuffledChars = [...CHARS].sort(() => Math.random() - 0.5);
      const challengeChars = shuffledChars.slice(0, GRID_SIZE - 1); // Leave space for password

      // Ensure password is included in the challenge
      if (!challengeChars.includes(password)) {
        challengeChars[Math.floor(Math.random() * challengeChars.length)] =
          password;
      }

      // Shuffle again to randomize password position
      const finalChars = challengeChars.sort(() => Math.random() - 0.5);

      // Create color mapping
      const colorMap: Record<string, string> = {};
      const colorGroups: Record<string, string[]> = {
        red: [],
        green: [],
        blue: [],
        yellow: [],
      };

      for (let i = 0; i < finalChars.length; i++) {
        const char = finalChars[i];
        const color = COLORS[i % 4];
        colorMap[char] = color;
        colorGroups[color].push(char);
      }

      // Find password character and determine expected direction
      const assignedColor = colorMap[password] || null;
      const expected = assignedColor ? legend[assignedColor] || "S" : "S";

      challenges.push({
        grid: finalChars.join(""),
        expected,
        colorGroups,
      });
    }

    return challenges;
  }

  /**
   * Generate nonce for entropy
   */
  private static generateNonce(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Generate entropy layers for challenge generation
   */
  private static generateEntropyLayers(seed: string, layers: number): number[] {
    const arr = [];
    let cur = seed;
    for (let i = 0; i < layers; i++) {
      const randomBytes = crypto.randomBytes(2).toString("hex");
      const h = keccak256(Buffer.from(cur, "utf8"));
      const val = parseInt(h.slice(2, 10), 16); // Remove '0x' prefix and take 8 chars
      arr.push(val);
      cur = h + randomBytes;
    }
    return arr;
  }

  /**
   * Get color for character based on legend
   */
  private static getColorForCharacter(
    char: string,
    legend: Record<string, string>,
  ): string {
    // Default colors if not in legend
    const defaultColors = COLORS;
    const colorIndex = char.charCodeAt(0) % defaultColors.length;
    return legend[char] || defaultColors[colorIndex];
  }

  /**
   * Verify 1P solution
   * Implements the real 1P protocol verification based on 1p.ts
   */
  static verify1PSolution(
    solutions: string[],
    password: string,
    legend: Record<string, string>,
    challenges: Array<{
      grid: string;
      expected: string;
      colorGroups: Record<string, string[]>;
    }>,
  ): boolean {
    // Check solutions length matches challenges length
    if (solutions.length !== challenges.length) {
      console.log(
        "Solution count mismatch:",
        solutions.length,
        "vs",
        challenges.length,
      );
      return false;
    }

    // Verify each solution
    for (let i = 0; i < challenges.length; i++) {
      const challenge = challenges[i];
      const solution = solutions[i];

      // Check if solution matches expected direction
      if (solution.toUpperCase() !== challenge.expected) {
        console.log(
          `Round ${i + 1} failed: expected ${challenge.expected}, got ${solution}`,
        );
        return false;
      }
    }

    console.log("All 1P solutions verified successfully");
    return true;
  }

  /**
   * Sign inputs with 1FA private key (Aptos ed25519)
   * This is used by the frontend to sign the solutions
   */
  static signInputs(inputs: string, privateKeyHex: string): string {
    try {
      const aggregatorStr = inputs;
      const hashDigest = Buffer.from(
        keccak256(Buffer.from(aggregatorStr, "utf8")).slice(2),
        "hex",
      );
      const account = new AptosAccount(
        Buffer.from(
          privateKeyHex.startsWith("0x")
            ? privateKeyHex.slice(2)
            : privateKeyHex,
          "hex",
        ),
      );
      const signature = account.signBuffer(hashDigest);
      return signature.toString();
    } catch (error) {
      console.error("Error signing inputs:", error);
      throw error;
    }
  }

  /**
   * Verify signature and match solution (for verifier)
   */
  static verifySolution(
    candidate: string,
    proof: string,
    expected: string,
    publicKey: string,
  ): boolean {
    try {
      const hashDigest = Buffer.from(
        keccak256(Buffer.from(candidate, "utf8")),
        "hex",
      );
      const publicKeyHex = publicKey.startsWith("0x")
        ? publicKey.slice(2)
        : publicKey;

      // Create AptosAccount with the public key
      const account = new AptosAccount(undefined, publicKeyHex);
      const isValidSig = account.verifySignature(
        HexString.fromUint8Array(hashDigest),
        proof,
      );
      const isCorrect = candidate.toUpperCase() === expected;
      return isValidSig && isCorrect;
    } catch (error) {
      console.error("Error verifying solution:", error);
      return false;
    }
  }
}
