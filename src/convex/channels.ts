// Paginated channel rows so the client can assemble a CSV export.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";

export const page = query({
  args: {
    scan_id: v.id("scans"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { scan_id, paginationOpts }) => {
    return await ctx.db
      .query("channels")
      .withIndex("by_scan_chunk", (q) => q.eq("scan_id", scan_id))
      .order("asc")
      .paginate(paginationOpts);
  },
});
