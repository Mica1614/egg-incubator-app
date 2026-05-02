/**
 * instrumentation.js
 *
 * Next.js built-in server startup hook — runs once in Node.js when the server
 * boots (both `npm run dev` and `npm run start`). This is where we start the
 * background device monitor so it runs independently of any user session.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run in the Node.js runtime (not Edge runtime, not the client bundle).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDeviceMonitor } = await import("./lib/deviceMonitor.js");
    startDeviceMonitor();
  }
}
