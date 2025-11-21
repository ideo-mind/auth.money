import { Hono } from "hono"
import aptosRouter from "@routes/aptos"
import evmRouter from "@routes/evm"
import onepRouter from "@routes/1p"
import router from "@routes/chains"
import { cors } from "hono/cors"
import { IRunningContext } from "@/src/lib/context"

const app = new Hono<IRunningContext>()
app.use(
  cors({
    // origin: "*", // Allow requests from any origin
    origin: (origin) => {
      // console.log("origin=" + origin)
      // origin = "http://localhost"
      return origin ?? ""
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposeHeaders: [
      "*",
      "Content-Length",
      "X-Requested-With",
      // Diagnostics
      "X-Request-Id",
    ],
    maxAge: 86400, // Cache CORS preflight requests for 1 day (in seconds)
    credentials: true, // Allow cookies to be sent
  })
)
// Route main routers
app.route("/aptos", aptosRouter)
app.route("/", aptosRouter) //FIXME: hopefull no conflict
app.route("/evm", evmRouter)
app.route("/1p", onepRouter)

app.route("/chains", router)

app.get("/", (c) => {
  return c.json({
    service: "Money Pot Verifier Service",
    version: "1.0.0",
    status: "active",
    endpoints: {
      "1P Authentication (Aptos)": "/authenticate",
      "1P Registration (Aptos)": "/register",
      "1P Authentication (EVM)": "/evm/authenticate",
      "1P Registration (EVM)": "/evm/register",
      "1P Protocol Authentication": "/1p/authenticate",
      "1P Protocol Registration": "/1p/register",
      "1P Protocol Airdrop": "/1p/airdrop",
      "1P Protocol Chains": "/1p/chains",
      "Supported Chains": "/chains",
    },
  })
})

// Health check for Money Pot service
app.get("/health", (c) => {
  return c.json({
    service: "Money Pot Verifier",
    status: "healthy",
    timestamp: new Date().toISOString(),
  })
})

// Debug endpoint to test JSON parsing
app.post("/debug", async (c) => {
  try {
    console.log("Debug endpoint called")
    const body = await c.req.json()
    console.log("Debug body received:", body)
    return c.json({ success: true, body })
  } catch (error) {
    console.error("Debug JSON parsing error:", error)
    return c.json({ error: "JSON parsing failed", details: String(error) }, 400)
  }
})

export * from "@durables/index"

export default app
