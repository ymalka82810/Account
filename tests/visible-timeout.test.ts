import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// טיימר שסופר רק זמן שהדף גלוי (src-react/lib/visibleTimeout.js): בחזרה מהרקע הספירה מתחילה מאפס.
const doc = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const d = {
    visibilityState: "visible",
    addEventListener: (_: string, fn: () => void) => { listeners.add(fn); },
    removeEventListener: (_: string, fn: () => void) => { listeners.delete(fn); },
    emit: () => listeners.forEach((fn) => fn()),
    listeners,
  };
  (globalThis as any).document = d;
  return d;
});

import { visibleTimeout } from "../src-react/lib/visibleTimeout.js";

describe("visibleTimeout", () => {
  beforeEach(() => { vi.useFakeTimers(); doc.visibilityState = "visible"; doc.listeners.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it("פועל אחרי הזמן שנקבע כשהדף גלוי", () => {
    const fn = vi.fn();
    visibleTimeout(fn, 4000);
    vi.advanceTimersByTime(3500);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(doc.listeners.size).toBe(0);
  });

  it("זמן שהדף הוסתר לא נספר, ובחזרה סופרים מחדש מאפס", () => {
    const fn = vi.fn();
    visibleTimeout(fn, 4000);
    vi.advanceTimersByTime(3000);
    doc.visibilityState = "hidden";
    doc.emit();
    vi.advanceTimersByTime(60000);
    expect(fn).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    doc.emit();
    vi.advanceTimersByTime(3500);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("הקפאה של הדף (פער ארוך בין פעימות) לא נספרת כזמן גלוי", () => {
    const fn = vi.fn();
    visibleTimeout(fn, 4000);
    vi.advanceTimersByTime(1000);
    // הדף הוקפא 30 שניות: השעון זז, הפעימות לא רצו, ואז רצה פעימה אחת בחזרה
    vi.setSystemTime(Date.now() + 30000);
    vi.advanceTimersByTime(250);
    expect(fn).not.toHaveBeenCalled();
  });

  it("ביטול עוצר את הטיימר", () => {
    const fn = vi.fn();
    const stop = visibleTimeout(fn, 1000);
    stop();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    expect(doc.listeners.size).toBe(0);
  });
});
