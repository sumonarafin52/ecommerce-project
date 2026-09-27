// components/ui/SmartImage.jsx
"use client";

import Image from "next/image";
import { useState } from "react";

// Hosts next.config.js allows next/image to optimize. Anything else (e.g. a
// product CSV-imported with an image URL from an arbitrary host) falls back
// to a plain <img> — next/image throws a runtime error on non-allowlisted
// hosts, which would otherwise take down the whole page for one bad row.
const OPTIMIZABLE_HOSTS = ["res.cloudinary.com"];

function canOptimize(src) {
  if (typeof src !== "string" || !src) return false;
  if (src.startsWith("/")) return true; // local/public asset
  try {
    return OPTIMIZABLE_HOSTS.includes(new URL(src).hostname);
  } catch {
    return false; // blob:, data:, or a malformed URL
  }
}

/**
 * Drop-in replacement for <img> that gets Next's image optimization
 * (automatic WebP/AVIF, correct-size variants, lazy loading, blur-free
 * layout stability) wherever it's safely possible.
 *
 * Expects a positioned (relative) parent, since it renders with `fill`.
 * `sizes` should describe the rendered width at each breakpoint so the
 * browser downloads an appropriately-sized file instead of the original.
 */
export default function SmartImage({
  src,
  alt = "",
  className = "",
  sizes = "100vw",
  priority = false,
  quality = 78,
  ...rest
}) {
  const [failed, setFailed] = useState(false);

  if (!src) return null;

  if (canOptimize(src) && !failed) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        quality={quality}
        priority={priority}
        className={className}
        // if the optimizer itself fails (deleted asset, transform error),
        // drop to the raw URL rather than showing a broken tile
        onError={() => setFailed(true)}
        {...rest}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={`absolute inset-0 w-full h-full ${className}`}
      {...rest}
    />
  );
}
