// Port of iptv_fingerprint/collectors/xtream.py::_analyze_naming — detects the
// category naming conventions a provider uses (pipes, brackets, stars, emoji).
import type { Category, NamingPatterns } from "./types";

export function analyzeNaming(categories: Category[]): NamingPatterns {
  const patterns: NamingPatterns = {
    uses_pipes: false,
    uses_brackets: false,
    uses_emoji: false,
    uses_unicode_stars: false,
    separator_char: null,
    country_code_style: null,
    sample_names: [],
  };

  if (categories.length === 0) return patterns;

  const sample = categories.slice(0, 50);
  let pipeCount = 0;
  let bracketCount = 0;
  let emojiCount = 0;
  let starCount = 0;

  for (const cat of sample) {
    const name = cat.category_name ?? "";
    if (name.includes("|")) pipeCount++;
    if (name.includes("[")) bracketCount++;
    if (name.includes("✪") || name.includes("★") || name.includes("☆") || name.includes("✫"))
      starCount++;
    if ([...name].some((c) => c.codePointAt(0)! > 0x2600)) emojiCount++;
  }

  const total = sample.length;
  patterns.uses_pipes = pipeCount > total * 0.3;
  patterns.uses_brackets = bracketCount > total * 0.3;
  patterns.uses_unicode_stars = starCount > total * 0.3;
  patterns.uses_emoji = emojiCount > total * 0.3;
  patterns.sample_names = categories.slice(0, 20).map((c) => c.category_name);

  if (patterns.uses_pipes) {
    patterns.separator_char = "|";
    patterns.country_code_style = "pipe";
  } else if (patterns.uses_brackets) {
    patterns.separator_char = "[]";
    patterns.country_code_style = "bracket";
  }

  return patterns;
}
