import { Hono } from "hono"

import authenticateRouter from "./authenticate"
import registerRouter from "./register"
import airdropRouter from "./airdrop"
import chainsRouter from "./chains"
import { IRunningContext } from "@lib/context"
import { useEVMWallet } from "@mw/useEVMWallet"
import { useWalletAuth } from "@mw/useWalletAuth"
import { useEVMThrottling } from "@mw/useEVMThrottling"

const router = new Hono<IRunningContext>()

// router.use("*", useEVMThrottling); //FIXME: disabled for faster development
router.use("*", useWalletAuth)
router.use("*", useEVMWallet)
router.route("/authenticate", authenticateRouter)
router.route("/register", registerRouter)
router.route("/airdrop", airdropRouter)
router.route("/chains", chainsRouter)

export default router
