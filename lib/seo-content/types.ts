export const SEO_CONTENT_PERMISSION = "products.seo.read";

/** Videos up to this length are short-form (Reels / Shorts / TikTok). */
export const SHORT_VIDEO_MAX_SECONDS = 60;

/** Units sold over this many days rank the product list. */
export const SALES_WINDOW_DAYS = 90;

export type SeoFamilyRow = {
  family: string;
  sampleTitle: string;
  sampleSku: string | null;
  imageUrl: string | null;
  vendor: string | null;
  category: string | null;
  /** At least one item is not draft/archived on Shopify. */
  live: boolean;
  skuCount: number;
  unitsSold: number;
  photos: number;
  shortVideos: number;
  longVideos: number;
  /** Uploaded before video length was recorded. */
  unknownLengthVideos: number;
  videoSeconds: number;
  audio: number;
  documents: number;
  voiceExplanations: number;
  lastUploadAt: string | null;
};

export type SeoUploadKind = "photo" | "video" | "audio" | "document" | "voice";

export type SeoUploadEvent = {
  at: string;
  person: string;
  kind: SeoUploadKind;
};

export type SeoContentDashboardData = {
  generatedAt: string;
  families: SeoFamilyRow[];
  uploads: SeoUploadEvent[];
};
