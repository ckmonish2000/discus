import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { env, AppError } from "common";
import type { Context } from "hono";
import {
  signupValidator,
  loginValidator,
  type SignupDto,
  type LoginDto,
} from "./validators/auth.dto";
import {
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
import { authService } from "./auth.service";

const router = new Hono();

/**
 * Cookie handling stays in the controller: it is transport, not domain. The
 * service issues a session and hands back the tokens; only this layer knows
 * they travel as cookies.
 */
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

const clearSessionCookies = (c: Context) => {
  deleteCookie(c, ACCESS_COOKIE, { path: "/" });
  deleteCookie(c, REFRESH_COOKIE, { path: "/" });
};

/** POST /auth/signup */
router.post("/signup", signupValidator, async (c) => {
  const body: SignupDto = c.req.valid("json");
  const { user, session } = await authService.signup(body);

  setSessionCookies(c, session.accessToken, session.refreshToken);
  return c.json({ success: true, data: { user } }, 201);
});

/** POST /auth/login */
router.post("/login", loginValidator, async (c) => {
  const body: LoginDto = c.req.valid("json");
  const { user, session } = await authService.login(body);

  setSessionCookies(c, session.accessToken, session.refreshToken);
  return c.json({ success: true, data: { user } });
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

  clearSessionCookies(c);
  return c.json({ success: true });
});

/** POST /auth/logout-all — every device. */
router.post("/logout-all", requireAuth, async (c) => {
  await revokeAllSessions(getUserId(c));

  clearSessionCookies(c);
  return c.json({ success: true });
});

/** GET /auth/me */
router.get("/me", requireAuth, async (c) => {
  const user = await authService.me(getUserId(c));
  return c.json({ success: true, data: { user } });
});

export default router;
