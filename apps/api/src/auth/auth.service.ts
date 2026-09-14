import { AppError, type SignupDto, type LoginDto } from "common";
import { hashPassword, verifyPassword } from "./services/crypto.service";
import { issueSession } from "./services/session.service";
import { usersRepository } from "./users.repository";

/**
 * A valid Argon2 hash of a value no password will match. Verifying against it
 * when the account does not exist keeps the work — and so the response time —
 * roughly equal on both paths.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

export const authService = {
  async signup(body: SignupDto) {
    if (await usersRepository.existsByEmail(body.email)) {
      throw new AppError(
        "An account with that email already exists",
        409,
        "signup",
      );
    }

    const user = await usersRepository.create({
      email: body.email,
      passwordHash: await hashPassword(body.password),
    });

    if (!user) {
      throw new AppError("Failed to create account", 500, "signup");
    }

    return { user, session: await issueSession(user.id) };
  },

  /**
   * Same error and roughly the same work whether the account exists or the
   * password is wrong — distinguishing them lets an attacker enumerate emails.
   */
  async login(body: LoginDto) {
    const user = await usersRepository.findByEmail(body.email);

    const valid = user
      ? await verifyPassword(body.password, user.passwordHash)
      : await verifyPassword(body.password, DUMMY_HASH);

    if (!user || !valid) {
      throw new AppError("Invalid email or password", 401, "login");
    }

    return {
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
      session: await issueSession(user.id),
    };
  },

  async me(userId: string) {
    const user = await usersRepository.findPublicById(userId);

    if (!user) {
      throw new AppError("User not found", 404, "me");
    }

    return user;
  },
};
