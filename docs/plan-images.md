# Hyperion Image Request And Cache Plan

## Summary

- Use same-origin image URLs with an ephemeral disk cache on Heroku/local disk.
- Optimize rendered post body images plus SPA chrome images by lazy-loading, de-duping repeat requests, and caching image bytes in `tmp/cache/images`.
- Cached images are retained for **at most 7 days**. Older entries must not be served and should be deleted opportunistically.
- This is a no-new-infra v1. The cache is best-effort and disappears on Heroku dyno restart/redeploy.

## Implementation

- Add `GET /api/v1/images/proxy?url=<absolute-url>&size=<optional-size>`.
- Allow only authenticated users through the existing API controller auth path.
- Allow only `http` and `https` source URLs.
- Reject localhost, private, loopback, link-local, multicast, and otherwise reserved IP targets after DNS resolution.
- Allow only JPEG, PNG, GIF, and WebP responses.
- Reject SVG, unknown content types, oversized responses, and slow upstreams.
- Store cached bytes and metadata under `tmp/cache/images`.
- Treat any cache entry older than 7 days as expired.
- Delete expired files opportunistically during proxy requests and through a cleanup task.
- Use atomic writes to avoid partial cache entries.
- Update frontend image URL generation so non-`data:` images use the same-origin proxy.
- Update rendered post body images to use proxied URLs plus `loading="lazy"`, `decoding="async"`, and `referrerpolicy="no-referrer"`.
- Keep viewport-based list thumbnail lazy loading.

## Tests

- Cache miss fetches and stores image bytes.
- Cache hit serves from disk without a second upstream request.
- Cache entries older than 7 days are expired and not served.
- Cleanup removes expired cache files and metadata.
- Unsafe URL, private IP, SVG, bad content type, oversized image, and timeout cases are rejected.
- `imageProxy` returns same-origin proxy URLs and preserves `data:` URLs.
- Rendered post body images are proxied and lazy-loaded.
- List thumbnails still wait for viewport intersection before assigning `src`.

## Assumptions

- No new external infrastructure.
- Disk cache is ephemeral and best-effort.
- Cached images must be retained for no longer than 7 days.
- Persistent CDN/object-storage caching remains the recommended v2 once new infra is acceptable.
