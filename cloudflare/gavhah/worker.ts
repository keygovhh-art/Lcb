/**
 * Cloudflare Worker host for the existing Gavhah Express route tree with a Cloudflare-only bootstrap and
 * the original Vite assets. This does not migrate or clone Neon data.
 *
 * GitHub Actions must compile this together with existing workspace
 * dependencies. Never point SignalWire or Yemot at this address until
 * all webhook, session, and authentication regression tests pass.
 */
import { httpServerHandler } from "cloudflare:node";
import app from "../../artifacts/api-server/src/app-cloudflare";

// Cloudflare Workers supplies a virtual HTTP server with nodejs_compat.
// Static files are served by Cloudflare Assets, never the Express filesystem.
app.listen(8787);
export default httpServerHandler({port:8787});
