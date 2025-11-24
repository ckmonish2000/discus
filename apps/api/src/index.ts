import { Hono } from "hono";
import { cors } from "hono/cors";
import routes from './routes'


const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => {
    c.status(200)
    return c.json({ message: "ok" })
});

app.route('/',routes)

export default {
    port: process.env.PORT || 8000,
    fetch: app.fetch
};

