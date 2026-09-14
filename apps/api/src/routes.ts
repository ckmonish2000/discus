import { Hono } from "hono";
import storageRouter from "./storage/storage.controller";
import authRouter from "./auth/auth.controller";

const router = new Hono();

router.route("/storage", storageRouter);
router.route("/auth", authRouter);

export default router;
