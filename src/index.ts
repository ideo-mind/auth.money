import { Hono } from "hono"
import aptosRouter from "@routes/aptos"
import evmRouter from "@routes/evm"
import router from "@routes/chains"
import { cors } from "hono/cors"
import { IRunningContext } from "@/src/lib/context"

const app = new Hono<IRunningContext>()
app.use(
  cors({
    origin: (origin) => {
      return origin ?? ""
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposeHeaders: [
      "*",
      "Content-Length",
      "X-Requested-With",
      "X-Request-Id",
    ],
    maxAge: 86400,
    credentials: true,
  })
)

app.route("/aptos", aptosRouter)
app.route("/", aptosRouter)
app.route("/evm", evmRouter)
app.route("/chains", router)

app.get("/", (c) => {
  return c.json({
    service: "MoneyPot Authentication Service",
    version: "1.0.0",
    status: "active",
    endpoints: {
      "MoneyPot Authentication (Aptos)": "/aptos/authenticate",
      "MoneyPot Registration (Aptos)": "/aptos/register",
      "MoneyPot Authentication (EVM)": "/evm/authenticate",
      "MoneyPot Registration (EVM)": "/evm/register",
      "Supported Chains": "/chains",
    },
  })
})

// Health check
app.get("/health", (c) => {
  return c.json({
    service: "MoneyPot Authentication Service",
    status: "healthy",
    timestamp: new Date().toISOString(),
  })
})

export * from "@durables/index"

export default app
