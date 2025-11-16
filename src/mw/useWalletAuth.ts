import { MiddlewareHandler } from "hono"
import { Address, isAddressEqual, recoverMessageAddress } from "viem"
import { IRunningContext } from "@lib/context"
import { CHAINS, creditcoinTestnet } from "../config/viem"

interface WalletAuthPayload {
  encrypted_payload: string
  signature: string | `0x${string}` | Uint8Array
}

interface WalletAuthContext {
  wallet_user: Address
  payload: any
}

/**
 * Wallet Authentication Middleware for EVM routes
 *
 * Verifies wallet signatures for EVM-specific endpoints.
 * Expects payload structure: { encrypted_payload, signature }
 *
 * 1. Extracts encrypted_payload, signature from request body
 * 2. Decrypts/parses the payload (plain text for MVP)
 * 3. Verifies signature using recoverMessageAddress
 * 4. Attaches wallet_user (recovered address) to context
 */
export const useWalletAuth: MiddlewareHandler<IRunningContext> = async (
  c,
  next
) => {
  try {
    // Only apply to POST requests with JSON body
    if (c.req.method !== "POST") {
      console.log("🔐 Wallet auth middleware: Not a POST request, skipping")
      return next()
    }

    const contentType = c.req.header("content-type")
    if (!contentType?.includes("application/json")) {
      return next()
    }

    // Parse request body
    let body: WalletAuthPayload
    try {
      body = await c.req.json<WalletAuthPayload>()
    } catch (error) {
      console.error("JSON parsing error:", error)
      return c.json({ error: "Invalid JSON in request body" }, 400)
    }

    const { encrypted_payload, signature } = body

    // Check if this looks like a wallet auth request
    if (!encrypted_payload || !signature) {
      console.log(
        "🔐 Wallet auth middleware: Not a wallet auth request, skipping"
      )
      return next() // Not a wallet auth request, continue
    }

    console.log("🔐 Wallet auth middleware: Processing wallet authentication")

    // Parse payload (plain text for MVP)
    let payload: any
    let plainText: string
    try {
      plainText = Buffer.from(encrypted_payload, "hex").toString("utf-8")
      payload = JSON.parse(plainText)
      console.log("Using plain text payload for MVP")
    } catch (plainError) {
      console.error("Payload parsing failed:", plainError)
      return c.json({ error: "Payload parsing failed" }, 400)
    }
    console.log({ body })

    // Verify signature
    let recoveredAddress: string
    try {
      // For authenticate/verify, the signature is for the challenge_id directly
      // For authenticate/options, the signature is for the attempt_id directly
      // For register/verify, the signature is for the original JSON string (not re-serialized!)
      const messageToVerify =
        payload.challenge_id || payload.attempt_id || plainText

      console.log("🔍 Debug signature verification:", {
        messageToVerify,
        signature:
          typeof signature === "string"
            ? signature.substring(0, 20) + "..."
            : "binary_signature",
        payloadKeys: Object.keys(payload),
        payloadIss: payload.iss,
      })

      recoveredAddress = await recoverMessageAddress({
        message: messageToVerify,
        signature: signature as `0x${string}`,
      })
    } catch (e) {
      console.log("Signature recovery failed:", e)
      return c.json({ error: "Wallet signature verification failed" }, 400)
    }

    console.log("✅ Wallet signature verified:", {
      recoveredAddress,
      payloadKeys: Object.keys(payload),
    })

    // Extract chain_id from payload and set in context
    const chainId = payload.chain_id || CHAINS[0].id // Default to Creditcoin Testnet
    c.set("chainId", chainId)

    // Attach wallet authentication info to context
    c.set("wallet_user", recoveredAddress as Address)
    c.set("wallet_payload", payload)
    c.set("wallet_signature", signature)

    return next()
  } catch (error) {
    console.error("Wallet auth middleware error:", error)
    return c.json({ error: "Wallet authentication failed" }, 500)
  }
}
