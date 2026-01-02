import { Hono } from "hono";
import storageRouter from "./storage/storage.controller";

const router = new Hono()

router.route('/storage', storageRouter)

export default router