// @vitest-environment node
// בדיקת עשן: לשונית המשפחה של ההורה והחלונות התחתונים שלה (דף אישי, חובות פתוחים, גרף, יעד חדש) מתרנדרים
// מנתוני הדמו בלי שגיאה, והלשונית עצמה קצרה: בלי גרף, בלי טופס פתוח ובלי יעדים בתוכה.
import { describe, it, expect, vi } from "vitest";
// ה-state של האפליקציה קורא localStorage כבר בטעינת המודול; בסביבת node צריך תחליף לפני כל ה-import-ים.
vi.hoisted(() => {
  const mem = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  };
  // window ו-document מינימליים: הקוד קורא אותם בטעינה, והרינדור בשרת לא מריץ אפקטים.
  const noop = () => {};
  (globalThis as any).window = { addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }) };
  (globalThis as any).document = { addEventListener: noop, removeEventListener: noop, documentElement: { style: { setProperty: noop }, dataset: {} }, body: { classList: { toggle: noop, add: noop, remove: noop } }, getElementById: () => null };
});
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import { AppCtx } from "../src-react/state/appContext.js";
import { SheetProvider } from "../src-react/components/shared/Sheet.jsx";
import { ConfirmProvider } from "../src-react/components/shared/Confirm.jsx";
import FamilyTab from "../src-react/components/family/FamilyTab.jsx";
import PersonSheet from "../src-react/components/family/PersonSheet.jsx";
import { OpenDebtsSheet } from "../src-react/components/family/OpenDebts.jsx";
import { StatsSheet } from "../src-react/components/family/Summary.jsx";
import { NewGoalSheet } from "../src-react/components/goals/Goals.jsx";
import { demoData, DEMO_TOKEN } from "../src-react/lib/demo.js";

const data: any = demoData();
const ctx: any = { data, fdata: null, token: DEMO_TOKEN, me: data.me.id, isParent: true, setTab() {}, openEntryFlow() {}, fx: undefined };
const render = (el: any) =>
  renderToStaticMarkup(h(ConfirmProvider, null, h(SheetProvider, null, h(AppCtx.Provider, { value: ctx }, el))));
const kid = data.people.find((p: any) => p.role !== "parent");

describe("לשונית המשפחה (הורה)", () => {
  const html = render(h(FamilyTab, { data, fdata: null, token: DEMO_TOKEN }));
  it("מציגה שורה לכל בן משפחה ולחצן לכל החובות הפתוחים", () => {
    expect((html.match(/class="fam-row (plus|minus|zero)"/g) ?? []).length).toBe(data.people.length);
    expect(html).toContain("fam-link");
  });
  it("קצרה: בלי גרף, בלי טופס ובלי יעדים בתוך הלשונית", () => {
    expect(html).not.toContain("sum-chart");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("goal-bar");
    expect(html).not.toContain("sec-jump");
  });
});

describe("החלונות התחתונים", () => {
  it("דף אישי של ילד/ה: יתרה, חובות, יעדים והישגים", () => {
    const html = render(h(PersonSheet, { personId: kid.id }));
    expect(html).toContain("person-bal");
    expect(html).toContain("ach-grid");
    expect(html).not.toContain("<form");
  });
  it("חובות פתוחים, גרף ויעד חדש מתרנדרים", () => {
    expect(render(h(OpenDebtsSheet))).toContain("debt");
    expect(render(h(StatsSheet))).toContain("sum-chart");
    expect(render(h(NewGoalSheet, { ownerId: kid.id }))).toContain('type="submit"');
  });
});
