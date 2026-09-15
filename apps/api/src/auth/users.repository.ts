import { db, users, type Executor } from "drizzle";
import { eq, sql } from "drizzle-orm";

/** Public projection — never includes passwordHash. */
const publicColumns = {
  id: users.id,
  email: users.email,
  createdAt: users.createdAt,
};

export const usersRepository = {
  /**
   * Email lookups go through lower() to match the functional unique index.
   * Callers pass an already-lowercased address (the auth schemas normalize on
   * parse), so this is belt-and-braces rather than the only defence.
   */
  async findByEmail(email: string, ex: Executor = db) {
    const [user] = await ex
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    return user;
  },

  async existsByEmail(email: string, ex: Executor = db) {
    const [user] = await ex
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    return Boolean(user);
  },

  async findPublicById(id: string, ex: Executor = db) {
    const [user] = await ex
      .select(publicColumns)
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user;
  },

  async create(
    values: { email: string; passwordHash: string },
    ex: Executor = db,
  ) {
    const [user] = await ex.insert(users).values(values).returning(publicColumns);
    return user;
  },
};
