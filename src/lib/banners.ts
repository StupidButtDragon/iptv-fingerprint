/**
 * Advertising banner slots.
 *
 * Paste an advertiser's HTML snippet (iframe, <img>, styled <div>, or one
 * that ships its own <script>) between the backticks of the slot where it
 * should appear. Slots with empty HTML are hidden completely, so the site
 * looks unchanged until you add something.
 *
 * Tips:
 * - Template literals allow multi-line HTML. If the ad code itself contains
 *   a backtick or a dollar-brace, escape them as \` and \${.
 * - Scripts in the snippet are executed (the BannerSlot component re-creates
 *   them after insertion), so ad-network loader codes work as-is.
 *
 * Slots:
 *   landing-top     — between the hero and "How it works" on the landing page
 *   landing-bottom  — above the footer on the landing page
 *   app-footer      — bottom of every page under /app
 *
 * To add a slot: extend BannerSlotId, add a key here, and render
 * `<BannerSlot id="…" />` where it should appear.
 */
export type BannerSlotId = "landing-top" | "landing-bottom" | "app-footer";

export const banners: Record<BannerSlotId, string> = {
  "landing-top": ``,
  "landing-bottom": ``,
  "app-footer": ``,
};

export function bannerHtml(id: BannerSlotId): string {
  return banners[id] ?? "";
}
