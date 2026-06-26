import { createApp } from "./app.js";

const app = await createApp();

console.log(`Server listening on :${app.port}`);

process.on("SIGTERM", () => {
  void app.close().then(() => process.exit(0));
});

process.on("SIGINT", () => {
  void app.close().then(() => process.exit(0));
});
