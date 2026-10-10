import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { logInfo } from "./lib/log";

const port = Number(process.env.PORT) || 3000;
const app = createApp();

serve({ fetch: app.fetch, port }, (info) => {
  logInfo("listening", { port: info.port });
});
