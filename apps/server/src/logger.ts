type LogLevel = "info" | "warn" | "error";

export function logEvent(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined> = {},
  level: LogLevel = "info",
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
