import { ensureAdminMounted, app } from "../../server.js";

let ready;

/** Shared Express app with AdminJS mounted (once per process). */
export async function getApp() {
  if (!ready) {
    ready = ensureAdminMounted();
  }
  await ready;
  return app;
}
