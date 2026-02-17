/**
 * Shared image URL resolution utility.
 *
 * Centralizes the duplicated logic for resolving product image URLs
 * from various item data shapes (OpenSearch hits, PHP responses, etc.)
 * into a canonical S3/CDN URL.
 */

/**
 * Resolve a product image URL from item data.
 *
 * Priority: image_full_url → image_fallback_url → image → images[0] → image_url
 *
 * If the resolved value is already a full URL, it is returned as-is.
 * If it is a relative path / filename, it is prefixed with `s3BaseUrl`.
 */
export function resolveImageUrl(
  item: Record<string, any>,
  s3BaseUrl: string,
): string | undefined {
  let imageUrl =
    item.image_full_url ||
    item.image_fallback_url ||
    item.image ||
    item.images?.[0] ||
    item.image_url;

  if (!imageUrl) return undefined;

  // Already a full URL — return as-is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  // Strip leading path prefixes to get the bare filename
  let filename = imageUrl;
  if (filename.startsWith('/product/')) {
    filename = filename.replace('/product/', '');
  } else if (filename.startsWith('product/')) {
    filename = filename.replace('product/', '');
  }

  return `${s3BaseUrl}/${filename}`;
}
