import { Hono } from "hono";
import optionsRouter from "./options";
import verifyRouter from "./verify";
import { IRunningContext } from "@lib/context";

const router = new Hono<IRunningContext>();

router.route("/options", optionsRouter);
router.route("/verify", verifyRouter);

export default router;