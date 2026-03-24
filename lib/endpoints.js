function parseEnvList(value, fallback = []) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
  } catch {}
  return raw
    .split(/[,\n]/g)
    .map((s) => String(s).trim())
    .filter(Boolean);
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return "";
}

const endpoints = {
  openai: {
    model: firstNonEmpty(process.env.OPENAI_MODEL, "gpt-4o-mini"),
  },

  search: {
    searxngInstances: parseEnvList(process.env.SEARXNG_INSTANCES, [
      "https://searxng.world",
      "https://searx.fmac.xyz",
      "https://searx.tiekoetter.com",
    ]),
  },

  youtube: {
    // Public Invidious instances for audio URL fallback. Accessibility varies by server IP.
    // These are tried only after all yt-dlp player clients fail.
    // Override or extend via INVIDIOUS_INSTANCES env var (comma-separated).
    invidiousInstances: parseEnvList(process.env.INVIDIOUS_INSTANCES, [
      "https://invidious.protokolla.fi",
      "https://inv.tux.pizza",
      "https://invidious.io.lol",
      "https://invidious.jing.rocks",
      "https://iv.ggtyler.dev",
      "https://invidious.fdn.fr",
    ]),
  },

  download: {
    // co.wuk.sh is dead; cobalt.tools now requires JWT auth.
    // Kept as env override only — yt-dlp handles downloads directly.
    cobaltApiJson: firstNonEmpty(process.env.COBALT_API_JSON, ""),
    fxTwitterApiBase: firstNonEmpty(process.env.FXTWITTER_API_BASE, "https://api.fxtwitter.com"),
    vxTwitterApiBase: firstNonEmpty(process.env.VXTWITTER_API_BASE, "https://api.vxtwitter.com"),
  },

  images: {
    // loremflickr.com — topic-based random images, no key needed
    // URL format: https://loremflickr.com/1080/1080/cats,nature
    unsplashRandom: firstNonEmpty(process.env.UNSPLASH_RANDOM_URL, "https://loremflickr.com"),
    randomFallbackBase: firstNonEmpty(process.env.IMAGE_RANDOM_FALLBACK_BASE, "https://loremflickr.com"),
    upload0x0: firstNonEmpty(process.env.IMAGE_UPLOAD_0X0_ENDPOINT, "https://0x0.st"),
  },

  weather: {
    wttrBase: firstNonEmpty(process.env.WTTR_BASE, "https://wttr.in"),
  },

  ip: {
    ipWhoisBase: firstNonEmpty(process.env.IPWHOIS_BASE, "https://ipwhois.app/json"),
    ipify: firstNonEmpty(process.env.IPIFY_URL, "https://api.ipify.org?format=json"),
  },

  dns: {
    googleResolveBase: firstNonEmpty(process.env.DNS_GOOGLE_RESOLVE_BASE, "https://dns.google/resolve"),
  },

  tts: {
    // Official Google Cloud TTS endpoint (requires GOOGLE_TTS_API_KEY)
    googleCloudEndpoint: firstNonEmpty(
      process.env.GOOGLE_TTS_ENDPOINT,
      "https://texttospeech.googleapis.com/v1/text:synthesize"
    ),
    // Legacy unauthenticated fallback (unofficial; kept for compatibility)
    googleTranslateTtsBase: firstNonEmpty(
      process.env.GOOGLE_TRANSLATE_TTS_BASE,
      "https://translate.google.com/translate_tts"
    ),
  },
};

module.exports = { endpoints, parseEnvList, firstNonEmpty };
