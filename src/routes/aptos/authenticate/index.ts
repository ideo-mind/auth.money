import { Hono } from "hono";
import { IRunningContext } from "@lib/context";
import authenticateOptionsRouter from "./options";
import authenticateVerifyRouter from "./verify";

const router = new Hono<IRunningContext>();

// Mount individual authenticate routes
router.route("/options", authenticateOptionsRouter);
router.route("/verify", authenticateVerifyRouter);

export default router;
