import { describe, expect, it } from "vitest";
import {
  firstSeatDrawingFromMaxHand,
  hasUnequalHandSizes,
  type CardInstance,
} from "@teijitaisha/shared";

describe("deal helpers", () => {
  it("hasUnequalHandSizes: 枚数差を検出する", () => {
    const hands: Record<string, CardInstance[]> = {
      a: [{ id: "1", type: "norma" }, { id: "2", type: "norma" }],
      b: [{ id: "3", type: "norma" }],
    };
    expect(hasUnequalHandSizes(["a", "b"], hands)).toBe(true);
    expect(
      hasUnequalHandSizes(["a", "b"], {
        a: [{ id: "1", type: "norma" }],
        b: [{ id: "2", type: "norma" }],
      }),
    ).toBe(false);
  });

  it("firstSeatDrawingFromMaxHand: 最多手札の左隣席が先攻", () => {
    const hands: Record<string, CardInstance[]> = {
      p0: [{ id: "1", type: "norma" }],
      p1: [
        { id: "2", type: "norma" },
        { id: "3", type: "norma" },
      ],
      p2: [{ id: "4", type: "norma" }],
    };
    const seat = firstSeatDrawingFromMaxHand(["p0", "p1", "p2"], hands, () => 0);
    expect(seat).toBe(2);
  });
});
