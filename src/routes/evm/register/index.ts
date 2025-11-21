import { Hono } from "hono";
import { IRunningContext } from "@lib/context";
import registerOptionsRouter from "./options";
import registerVerifyRouter from "./verify";

const router = new Hono<IRunningContext>();

// Mount sub-routes
router.route("/options", registerOptionsRouter);
router.route("/verify", registerVerifyRouter);

export default router;
