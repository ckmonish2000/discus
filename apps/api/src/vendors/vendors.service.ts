import {
  AppError,
  type CreateVendorDto,
  type ListVendorsDto,
  type UpdateVendorDto,
} from "common";
import { requireOwned } from "../shared/crud.helpers";
import { vendorsRepository } from "./vendors.repository";

export const vendorsService = {
  list(userId: string, query: ListVendorsDto) {
    return vendorsRepository.list(userId, query);
  },

  async getById(id: string, userId: string) {
    return requireOwned(
      await vendorsRepository.findById(id, userId),
      "Vendor",
      "getVendor",
    );
  },

  /**
   * A conflict on the (user_id, lower(name), coalesce(tax_id,'')) index means
   * the vendor already exists for this user, which is a 409 rather than a
   * silent no-op — the client asked to create something that is already there.
   */
  async create(userId: string, body: CreateVendorDto) {
    const vendor = await vendorsRepository.create(userId, body);

    if (!vendor) {
      throw new AppError(
        "A vendor with that name and tax id already exists",
        409,
        "createVendor",
      );
    }

    return vendor;
  },

  async update(id: string, userId: string, body: UpdateVendorDto) {
    return requireOwned(
      await vendorsRepository.update(id, userId, body),
      "Vendor",
      "updateVendor",
    );
  },

  /** Invoices keep their history via ON DELETE SET NULL. */
  async remove(id: string, userId: string) {
    requireOwned(
      await vendorsRepository.remove(id, userId),
      "Vendor",
      "deleteVendor",
    );
  },
};
