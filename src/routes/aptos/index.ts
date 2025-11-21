import { Hono } from "hono";

import authenticateRouter from "./authenticate";
import registerRouter from "./register";
import { IRunningContext } from "@/src/lib/context";

const router = new Hono<IRunningContext>();

router.route("/authenticate", authenticateRouter);
router.route("/register", registerRouter);


export default router;
