import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  people: defineTable({
    name: v.string(),
    role: v.union(v.literal("parent"), v.literal("child")),
    avatar: v.optional(v.string()),
    // קוד סודי (נשמר כגיבוב בלבד). אם חסר - הילד/ה בוחר/ת קוד בכניסה הראשונה.
    pinHash: v.optional(v.string()),
    pinSalt: v.optional(v.string()),
    failedAttempts: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
  }),

  sessions: defineTable({
    personId: v.id("people"),
    tokenHash: v.string(),
    expiresAt: v.number(),
  })
    .index("by_token", ["tokenHash"])
    .index("by_person", ["personId"]),

  entries: defineTable({
    kind: v.union(v.literal("debt"), v.literal("payment")),
    from: v.id("people"),
    to: v.id("people"),
    amount: v.number(), // באגורות
    note: v.string(),
    date: v.string(), // YYYY-MM-DD
    createdBy: v.optional(v.id("people")),
    createdAt: v.optional(v.number()),
  })
    .index("by_from", ["from"])
    .index("by_to", ["to"]),
});
