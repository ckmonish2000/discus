import { Hono } from "hono";
import { cors } from "hono/cors";
import routes from "./routes";
import health from "./health/route";
import { env, AppError, errorHandler } from "common";

const app = new Hono();

app.onError(errorHandler);

app.use("*", cors());

app.route("/", routes);
app.route("/health", health);

export default {
  port: env.api.PORT,
  fetch: app.fetch,
};
