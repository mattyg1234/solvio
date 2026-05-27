import { ogImageAlt, ogImageContentType, ogImageSize, renderSolvioOgImage } from "@/lib/solvio-og-image";

export const alt = ogImageAlt;
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function TwitterImage() {
  return renderSolvioOgImage();
}
