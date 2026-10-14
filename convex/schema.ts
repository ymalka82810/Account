import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // משפחה = קופה אחת. כל האנשים והרשומות שייכים למשפחה.
  families: defineTable({
    name: v.string(),
    // קודי הצטרפות. הקוד קובע את התפקיד של מי שמצטרף/ת: הורה או ילד/ה.
    parentCode: v.string(),
    childCode: v.string(),
    createdAt: v.number(),
  })
    .index("by_parentCode", ["parentCode"])
    .index("by_childCode", ["childCode"]),

  people: defineTable({
    // חסר רק אצל נתונים מהגרסה של משפחה אחת. הם עוברים למשפחה בכניסה הראשונה של הורה.
    familyId: v.optional(v.id("families")),
    name: v.string(),
    role: v.union(v.literal("parent"), v.literal("child")),
    avatar: v.optional(v.string()),
    // קוד סודי (נשמר כגיבוב בלבד). אם חסר - הילד/ה בוחר/ת קוד בכניסה הראשונה.
    pinHash: v.optional(v.string()),
    pinSalt: v.optional(v.string()),
    failedAttempts: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
  }).index("by_family", ["familyId"]),

  sessions: defineTable({
    personId: v.id("people"),
    tokenHash: v.string(),
    expiresAt: v.number(),
  })
    .index("by_token", ["tokenHash"])
    .index("by_person", ["personId"]),

  entries: defineTable({
    familyId: v.optional(v.id("families")),
    kind: v.union(v.literal("debt"), v.literal("payment")),
    from: v.id("people"),
    to: v.id("people"),
    amount: v.number(), // באגורות
    note: v.string(),
    date: v.string(), // YYYY-MM-DD
    createdBy: v.optional(v.id("people")),
    createdAt: v.optional(v.number()),
  })
    .index("by_family", ["familyId"])
    .index("by_from", ["from"])
    .index("by_to", ["to"]),

  // מונים גסים להגבלת קצב (ניחוש קודי משפחה, יצירת משפחות).
  throttles: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),
});
