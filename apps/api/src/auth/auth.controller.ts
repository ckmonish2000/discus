import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { db, users } from "drizzle";
import { eq, sql } from "drizzle-orm";
import { env, AppError } from "common";
import {
  signupValidator,
  loginValidator,
  type SignupDto,
  type LoginDto,
} from "./validators/auth.dto";
import { hashPassword, verifyPassword } from "./services/crypto.service";
import {
  issueSession,
  rotateSession,
  revokeSession,
  revokeAllSessions,
} from "./services/session.service";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
} from "./services/jwt.service";
import { requireAuth, getUserId } from "./middleware/auth.middleware";
import type { Context } from "hono";

const router = new Hono();

const setSessionCookies = (
  c: Context,
  accessToken: string,
  refreshToken: string,
) => {
  setCookie(
    c,
    ACCESS_COOKIE,
    accessToken,
    cookieOptions(env.auth.ACCESS_TOKEN_TTL),
  );
  setCookie(
    c,
    REFRESH_COOKIE,
    refreshToken,
    cookieOptions(env.auth.REFRESH_TOKEN_TTL),
  );
};

/** POST /auth/signup */
router.post("/signup", signupValidator, async (c) => {
  const { email, password }: SignupDto = c.req.valid("json");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (existing) {
    throw new AppError("An account with that email already exists", 409, "signup");
  }

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: await hashPassword(password) })
    .returning({ id: users.id, email: users.email, createdAt: users.createdAt });

  if (!user) {
    throw new AppError("Failed to create account", 500, "signup");
  }

  const session = await issueSession(user.id);
  setSessionCookies(c, session.accessToken, session.refreshToken);

  return c.json({ success: true, data: { user } }, 201);
});

/** POST /auth/login */
router.post("/login", loginValidator, async (c) => {
  const { email, password }: LoginDto = c.req.valid("json");

  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  // Same error and roughly the same work whether the account exists or the
  // password is wrong — distinguishing them lets an attacker enumerate emails.
  const valid = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, "$argon2id$v=19$m=65536,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

  if (!user || !valid) {
    throw new AppError("Invalid email or password", 401, "login");
  }

  const session = await issueSession(user.id);
  setSessionCookies(c, session.accessToken, session.refreshToken);

  return c.json({
    success: true,
    data: { user: { id: user.id, email: user.email, createdAt: user.createdAt } },
  });
});

/** POST /auth/refresh */
router.post("/refresh", async (c) => {
  const presented = getCookie(c, REFRESH_COOKIE);
  if (!presented) {
    throw new AppError("Refresh token required", 401, "refresh");
  }

  const session = await rotateSession(presented);
  setSessionCookies(c, session.accessToken, session.refreshToken);

  return c.json({ success: true });
});

/** POST /auth/logout — this device only. */
router.post("/logout", async (c) => {
  const presented = getCookie(c, REFRESH_COOKIE);
  if (presented) await revokeSession(presented);

  deleteCookie(c, ACCESS_COOKIE, { path: "/" });
  deleteCookie(c, REFRESH_COOKIE, { path: "/" });

  return c.json({ success: true });
});

/** POST /auth/logout-all — every device. */
router.post("/logout-all", requireAuth, async (c) => {
  await revokeAllSessions(getUserId(c));

  deleteCookie(c, ACCESS_COOKIE, { path: "/" });
  deleteCookie(c, REFRESH_COOKIE, { path: "/" });

  return c.json({ success: true });
});

/** GET /auth/me */
router.get("/me", requireAuth, async (c) => {
  const [user] = await db
    .select({ id: users.id, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, getUserId(c)))
    .limit(1);

  if (!user) {
    throw new AppError("User not found", 404, "me");
  }

  return c.json({ success: true, data: { user } });
});

export default router;
