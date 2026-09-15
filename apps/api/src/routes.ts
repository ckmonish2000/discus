import { Hono } from "hono";
import storageRouter from "./storage/storage.controller";
import authRouter from "./auth/auth.controller";
import documentsRouter from "./documents/documents.controller";
import invoicesRouter from "./invoices/invoices.controller";
import vendorsRouter from "./vendors/vendors.controller";
import preferencesRouter from "./preferences/preferences.controller";
import formatsRouter from "./formats/formats.controller";
import apiKeysRouter from "./api-keys/api-keys.controller";

const router = new Hono();

router.route("/storage", storageRouter);
router.route("/auth", authRouter);
router.route("/documents", documentsRouter);
router.route("/invoices", invoicesRouter);
router.route("/vendors", vendorsRouter);
router.route("/preferences", preferencesRouter);
router.route("/formats", formatsRouter);
router.route("/api-keys", apiKeysRouter);

export default router;
