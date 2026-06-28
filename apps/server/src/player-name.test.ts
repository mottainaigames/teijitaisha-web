import { describe, expect, it } from "vitest";
import {
  CPU_NAME_SUFFIX,
  formatCpuPlayerName,
  MAX_PLAYER_NAME_LENGTH,
  normalizePlayerColor,
  normalizePlayerDisplayStyle,
  normalizePlayerName,
  resolveLobbyPlayerName,
  stripCpuNameSuffix,
} from "@teijitaisha/shared";

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

describe("CPU player names", () => {
  it("CPU名には（CPU）が付く", () => {
    expect(formatCpuPlayerName("あああ")).toBe(`あああ${CPU_NAME_SUFFIX}`);
  });

  it("入力に（CPU）が含まれていても正規化する", () => {
    expect(formatCpuPlayerName("田中（CPU）")).toBe(`田中${CPU_NAME_SUFFIX}`);
  });

  it("resolveLobbyPlayerName は CPU と人間で処理を分ける", () => {
    expect(resolveLobbyPlayerName("山田", false)).toBe("山田");
    expect(resolveLobbyPlayerName("山田", true)).toBe(`山田${CPU_NAME_SUFFIX}`);
  });

  it("stripCpuNameSuffix で編集用のベース名を得られる", () => {
    expect(stripCpuNameSuffix(`CPU 1${CPU_NAME_SUFFIX}`)).toBe("CPU 1");
  });
});

describe("player display style", () => {
  it("normalizePlayerColor は有効な hex のみ受け付ける", () => {
    expect(normalizePlayerColor("#abc")).toBe("#abc");
    expect(normalizePlayerColor("red")).toBeNull();
  });

  it("normalizePlayerDisplayStyle は不正色を拒否する", () => {
    expect(normalizePlayerDisplayStyle({ nameplateBg: "nope" })).toBeNull();
    expect(
      normalizePlayerDisplayStyle({ nameplateBg: "#112233", nameColor: "#fff" }),
    ).toEqual({ nameplateBg: "#112233", nameColor: "#fff" });
  });
});
