import { Hono } from "hono";
import { cors } from "hono/cors";
import routes from "./routes";
import health from "./health/route";
import { env, AppError, errorHandler } from "common";

const app = new Hono();

app.onError(errorHandler);

/**
 * Credentialed CORS. The session travels in httpOnly cookies, and a browser
 * will not send or store those unless the response names the calling origin
 * exactly and allows credentials — `Access-Control-Allow-Origin: *` is
 * specified to be incompatible with credentials, so the wildcard default
 * silently broke every authenticated cross-origin call.
 *
 * Origins come from CORS_ORIGINS (comma-separated). A request from an
 * unlisted origin gets no CORS headers and is blocked by the browser.
 */
const allowedOrigins = env.api.CORS_ORIGINS.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  "*",
  cors({
    origin: (origin) =>
      // No Origin header at all (curl, server-to-server) is not a CORS request.
      !origin || allowedOrigins.includes(origin) ? origin : null,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.route("/", routes);
app.route("/health", health);

export default {
  port: env.api.PORT,
  fetch: app.fetch,
};
