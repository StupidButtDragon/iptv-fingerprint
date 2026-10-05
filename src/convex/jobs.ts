// Jobs give long-running actions a live, reactive progress log — the web
// equivalent of watching CLI output stream into a terminal.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

const MAX_LOG = 60000;

export const create = mutation({
  args: {
    kind: v.union(
      v.literal("collect"),
      v.literal("investigate"),
      v.literal("enrich"),
    ),
  },
  handler: async (ctx, { kind }) => {
    return await ctx.db.insert("jobs", {
      kind,
      status: "running",
      step: "Starting…",
      log: "",
      created_at: Date.now(),
    });
  },
});

export const append = internalMutation({
  args: {
    id: v.id("jobs"),
    line: v.optional(v.string()),
    step: v.optional(v.string()),
  },
  handler: async (ctx, { id, line, step }) => {
    const job = await ctx.db.get(id);
    if (!job) return;
    let log = job.log;
    if (line) log += line + "\n";
    if (log.length > MAX_LOG) log = log.slice(log.length - MAX_LOG);
    await ctx.db.patch(id, step !== undefined ? { log, step } : { log });
  },
});

export const finish = internalMutation({
  args: {
    id: v.id("jobs"),
    status: v.union(v.literal("done"), v.literal("error")),
    result_scan: v.optional(v.string()),
    error: v.optional(v.string()),
    step: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, result_scan, error, step }) => {
    const job = await ctx.db.get(id);
    if (!job) return;
    await ctx.db.patch(id, {
      status,
      ...(result_scan !== undefined ? { result_scan } : {}),
      ...(error !== undefined ? { error } : {}),
      ...(step !== undefined ? { step } : {}),
    });
  },
});

export const get = query({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});
