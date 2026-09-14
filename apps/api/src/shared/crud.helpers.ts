import { AppError } from "common";
import type { Pagination } from "common";

/**
 * Response envelopes and the ownership guard.
 *
 * The request schemas that used to live here now sit in
 * packages/common/src/schemas, so the web app can validate against the same
 * definitions the API enforces.
 */

/**
 * Every resource lookup goes through here.
 *
 * A row belonging to another user must be indistinguishable from a row that
 * does not exist: returning 403 would confirm the id is real, letting an
 * attacker enumerate other users' invoice and document ids. Always 404.
 */
export const requireOwned = <T>(
  row: T | undefined,
  resource: string,
  operation: string,
): T => {
  if (!row) {
    throw new AppError(`${resource} not found`, 404, operation);
  }
  return row;
};

/** Consistent success envelope, matching the existing storage routes. */
export const ok = <T>(data: T) => ({ success: true as const, data });

export const okList = <T>(items: T[], total: number, pagination: Pagination) => ({
  success: true as const,
  data: {
    items,
    pagination: {
      total,
      limit: pagination.limit,
      offset: pagination.offset,
      hasMore: pagination.offset + items.length < total,
    },
  },
});
