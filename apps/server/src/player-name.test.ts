import { describe, expect, it } from "vitest";
import { MAX_PLAYER_NAME_LENGTH, normalizePlayerName } from "@teijitaisha/shared";

describe("normalizePlayerName", () => {
  it("空文字はデフォルト名になる", () => {
    expect(normalizePlayerName("")).toBe("社員");
    expect(normalizePlayerName("   ")).toBe("社員");
  });

  it("改行と連続空白を正規化する", () => {
    expect(normalizePlayerName("田中\n太郎")).toBe("田中 太郎");
    expect(normalizePlayerName("  山田   花子  ")).toBe("山田 花子");
  });

  it("最大文字数で切り詰める", () => {
    const long = "あ".repeat(MAX_PLAYER_NAME_LENGTH + 5);
    expect(normalizePlayerName(long)).toHaveLength(MAX_PLAYER_NAME_LENGTH);
  });
});
