import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

/**
 * `convex dev` points the app at the loopback backend (http://127.0.0.1:3210).
 * That works inside the sandbox, but a browser on the public preview URL needs
 * the sandbox's tunnel instead. Freebuff tunnel hosts look like
 * `<port>-<sandbox host>`, so when the page is served from one and the Convex
 * URL is loopback, swap in the same sandbox host with the Convex port.
 */
function resolveConvexUrl(raw: string | undefined): string | undefined {
  if (!raw || typeof window === "undefined") return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]" ||
    url.hostname === "::1";
  if (!loopback) return raw;
  const page = window.location;
  if (page.hostname === "localhost" || page.hostname === "127.0.0.1") return raw;
  const tunnel = page.hostname.match(/^(\d+)-(.+)$/);
  if (tunnel && url.port && tunnel[1] !== url.port) {
    return `${page.protocol}//${url.port}-${tunnel[2]}`;
  }
  return raw;
}

const effectiveConvexUrl = resolveConvexUrl(convexUrl);

const root = createRoot(document.getElementById("root")!);

if (!effectiveConvexUrl) {
  root.render(
    <StrictMode>
      <div className="mx-auto max-w-lg px-6 py-24">
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-6">
          <h1 className="text-lg font-semibold text-ink-100">Convex is not configured</h1>
          <p className="mt-2 text-sm leading-6 text-ink-300">
            The app needs <code className="font-mono text-signal-400">VITE_CONVEX_URL</code>,
            which is written by <code className="font-mono">bun convex dev --once</code>. Run it
            from the project root, then reload.
          </p>
        </div>
      </div>
    </StrictMode>,
  );
} else {
  const client = new ConvexReactClient(effectiveConvexUrl);
  root.render(
    <StrictMode>
      <ConvexProvider client={client}>
        <HashRouter>
          <App />
        </HashRouter>
      </ConvexProvider>
    </StrictMode>,
  );
}
