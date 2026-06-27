import { describe, expect, it, vi } from "vitest";
import { SocketRateLimiter } from "./rate-limit.js";

describe("SocketRateLimiter", () => {
  it("ウィンドウ内の上限を超えると拒否する", () => {
    vi.useFakeTimers();
    const limiter = new SocketRateLimiter(3, 60_000);

    expect(limiter.allow("socket-1")).toBe(true);
    expect(limiter.allow("socket-1")).toBe(true);
    expect(limiter.allow("socket-1")).toBe(true);
    expect(limiter.allow("socket-1")).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(limiter.allow("socket-1")).toBe(true);

    vi.useRealTimers();
  });

  it("キーごとに独立してカウントする", () => {
    const limiter = new SocketRateLimiter(1, 60_000);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.allow("b")).toBe(true);
  });
});
