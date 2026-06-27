/** スライディングウィンドウ方式の簡易レート制限 */
export class SocketRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const recent = (this.buckets.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.maxRequests) {
      this.buckets.set(key, recent);
      return false;
    }
    recent.push(now);
    this.buckets.set(key, recent);
    return true;
  }

  /** @internal テスト用 */
  reset(key?: string): void {
    if (key) this.buckets.delete(key);
    else this.buckets.clear();
  }
}
