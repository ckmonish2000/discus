import {Hono} from 'hono'

const router = new Hono()

router.get("/", (c) => {
    c.status(200)
    return c.json({ message: "ok" })
});

export default router