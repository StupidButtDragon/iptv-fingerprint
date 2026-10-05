import { useEffect, useRef } from "react";
import { bannerHtml, type BannerSlotId } from "../lib/banners";

/**
 * Renders the HTML configured for a banner slot (see src/lib/banners.ts).
 *
 * - Returns nothing when the slot is empty, so no empty boxes show up.
 * - Inserts the owner-provided HTML as-is and then re-creates any <script>
 *   nodes, because scripts inserted via innerHTML do not execute on their
 *   own. Already-executed scripts are tagged so React StrictMode's second
 *   effect pass does not run them twice.
 */
export default function BannerSlot({
  id,
  label = true,
  className = "",
}: {
  id: BannerSlotId;
  /** Show the small "Advertisement" caption above the banner. */
  label?: boolean;
  className?: string;
}) {
  const html = bannerHtml(id);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    for (const pending of el.querySelectorAll<HTMLScriptElement>(
      "script:not([data-banner-ran])",
    )) {
      const fresh = document.createElement("script");
      for (const attr of Array.from(pending.attributes)) {
        fresh.setAttribute(attr.name, attr.value);
      }
      fresh.setAttribute("data-banner-ran", "1");
      fresh.textContent = pending.textContent;
      pending.replaceWith(fresh);
    }
  }, [html]);

  if (!html.trim()) return null;

  return (
    <aside
      aria-label="Advertisement"
      className={`border-y border-ink-800 bg-ink-900/30 ${className}`}
    >
      <div className="mx-auto max-w-6xl px-5 py-5">
        {label ? (
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-600">
            Advertisement
          </div>
        ) : null}
        <div
          ref={ref}
          className="overflow-hidden"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </aside>
  );
}
