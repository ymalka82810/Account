import { beforeEach, describe, expect, it, vi } from "vitest";

// תור השליחה במכשיר (src-react/lib/outbox.js): הבדיקות רצות ב-Node עם לקוח Convex מזויף.
const store = vi.hoisted(() => {
  const m = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
  };
  (globalThis as any).window = (globalThis as any).window ?? globalThis;
  return m;
});

const fake = vi.hoisted(() => ({
  connected: false,
  mutation: null as any,
  listeners: new Set<(cs: { isWebSocketConnected: boolean }) => void>(),
}));
vi.mock("../src-react/lib/client.js", () => ({
  client: {
    connectionState: () => ({ isWebSocketConnected: fake.connected }),
    subscribeToConnectionState: (fn: any) => { fake.listeners.add(fn); return () => fake.listeners.delete(fn); },
    mutation: (...a: any[]) => fake.mutation(...a),
  },
}));
vi.mock("../src-react/lib/helpers.js", () => ({ toast: vi.fn(), errMsg: (e: any) => String(e?.data ?? e) }));

import { state } from "../src-react/state/state.js";
import { enqueueEntry, flush, pendingCount, isOffline } from "../src-react/lib/outbox.js";

const args = { kind: "debt", from: "p1", to: "p2", amount: 500, note: "", date: "2026-01-15" };

beforeEach(() => {
  store.clear();
  fake.connected = false;
  fake.mutation = vi.fn(async () => "id");
  state.token = "tok-A";
});

describe("תור שליחה במכשיר", () => {
  it("בלי חיבור: הרישום נשמר, לא נשלח, וזוהה כבלי חיבור", () => {
    expect(isOffline()).toBe(true);
    expect(enqueueEntry(args)).toBe(true);
    expect(pendingCount()).toBe(1);
    expect(fake.mutation).not.toHaveBeenCalled();
  });

  it("כשהחיבור חוזר: נשלח עם clientId וה-token, והתור מתרוקן", async () => {
    enqueueEntry(args);
    fake.connected = true;
    await flush();
    expect(fake.mutation).toHaveBeenCalledTimes(1);
    const sent = fake.mutation.mock.calls[0][1];
    expect(sent).toMatchObject({ ...args, token: "tok-A" });
    expect(sent.clientId).toMatch(/^[0-9a-f]{24}$/);
    expect(pendingCount()).toBe(0);
  });

  it("התור שורד סגירה של האפליקציה (נקרא שוב מ-localStorage) ונשלח לפי הסדר", async () => {
    enqueueEntry({ ...args, amount: 100 });
    enqueueEntry({ ...args, amount: 200 });
    fake.connected = true;
    await flush();
    expect(fake.mutation.mock.calls.map((c: any[]) => c[1].amount)).toEqual([100, 200]);
  });

  it("שרת שדוחה את הרישום: מוסר מהתור ולא נתקע, והבא אחריו עדיין נשלח", async () => {
    enqueueEntry({ ...args, amount: 100 });
    enqueueEntry({ ...args, amount: 200 });
    fake.connected = true;
    fake.mutation = vi.fn(async (_n: string, a: any) => { if (a.amount === 100) throw { data: "סכום לא תקין" }; return "id"; });
    await flush();
    expect(fake.mutation).toHaveBeenCalledTimes(2);
    expect(pendingCount()).toBe(0);
  });

  it("רישום של משתמש אחר (טוקן שהתחלף) נזרק ולא נשלח", async () => {
    enqueueEntry(args);
    state.token = "tok-B";
    fake.connected = true;
    await flush();
    expect(fake.mutation).not.toHaveBeenCalled();
    expect(pendingCount()).toBe(0);
  });

  it("בלי חיבור flush לא שולח כלום", async () => {
    enqueueEntry(args);
    await flush();
    expect(fake.mutation).not.toHaveBeenCalled();
    expect(pendingCount()).toBe(1);
  });

  it("התור מוגבל ל-50 רישומים", () => {
    for (let i = 0; i < 50; i++) expect(enqueueEntry(args)).toBe(true);
    expect(enqueueEntry(args)).toBe(false);
  });
});
