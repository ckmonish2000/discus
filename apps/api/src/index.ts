import { Hono } from "hono";
import { cors } from "hono/cors";
import routes from './routes'
import health from './health/route'

const app = new Hono();
app.use("*", cors());

app.route('/',routes)
app.route('/health',health)

export default {
    port: process.env.PORT || 8000,
    fetch: app.fetch
};

