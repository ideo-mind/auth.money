import { Hono } from "hono"
import { OnePDB, OnePConfig } from "@db/onePDB"
import { AptosClientWrapper } from "@utils/aptos"
import { IRunningContext } from "../../../../lib/context"
import { useAptosWallet } from "@mw/aptosWallet"

const router = new Hono<IRunningContext>()

// Apply Aptos wallet middleware (with throttling) to this route
router.use("*", useAptosWallet)

/**
 * POST /register/verify
 * Verify pot registration with plain payload
 */
router.post("/", async (c) => {
  try {
    console.log("Register verify endpoint called")
    console.log("Request method:", c.req.method)
    console.log("Content-Type:", c.req.header("content-type"))

    let body: any
    try {
      body = await c.req.json()
      console.log(
        "Request body received:",
        typeof body,
        Object.keys(body || {})
      )
    } catch (error) {
      console.error("JSON parsing error:", error)
      return c.json({ error: "Invalid JSON in request body" }, 400)
    }

    const { payload, signature } = body

    if (!payload || !signature) {
      return c.json({ error: "Missing required fields" }, 400)
    }

    // Validate payload
    const { pot_id, "1p": password, legend, iat, iss, exp } = payload

    if (!pot_id || !password || !legend || !iat || !iss || !exp) {
      return c.json({ error: "Invalid payload structure" }, 400)
    }

    // Verify signature (creator's wallet) - disabled for MVP
    // const isValidSignature = await CryptoUtils.verifyAptosSignature(
    //   JSON.stringify(payload),
    //   signature,
    //   payload.iss
    // );

    // if (!isValidSignature) {
    //   return c.json({ error: "Signature verification failed" }, 401);
    // }

    console.log("Signature verification skipped for MVP")

    // Check if pot exists on blockchain
    const aptosClient = new AptosClientWrapper(
      c.env.APTOS_NODE_URL,
      c.env.ORACLE_PRIVATE_KEY,
      c.env.MONEY_POT_ADDRESS
    )
    const potExists = await aptosClient.isPotActive(pot_id)

    if (!potExists) {
      return c.json({ error: "Pot not found or not active" }, 400)
    }

    // Check if pot is already registered
    const isRegistered = await OnePDB.isRegistered(c.env.AUTH_DB, pot_id)
    if (isRegistered) {
      return c.json({ error: "Pot already registered" }, 400)
    }

    // Store 1P configuration
    const config: OnePConfig = {
      password,
      legend,
      pot_id,
      created_at: Date.now(),
    }

    await OnePDB.setConfig(c.env.AUTH_DB, pot_id, config)

    return c.json({ success: true })
  } catch (error) {
    console.error("Registration verification error:", error)
    return c.json({ error: "Registration verification failed" }, 500)
  }
})

export default router
