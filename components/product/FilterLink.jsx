// components/product/FilterLink.jsx
"use client";

import { useRouter } from "next/navigation";

/**
 * Renders exactly like a Link visually, but navigates via router.push +
 * router.refresh() instead of relying on <Link>'s default client-side
 * transition. Plain Link navigation between two filter URLs (e.g.
 * toggling "In stock only" off) can get served from Next's client router
 * cache, which made the checkbox/chip look "stuck" until a manual page
 * reload or hitting "Clear filters". router.refresh() forces the server
 * component to re-render with the current URL's real data every time.
 */
export default function FilterLink({ href, className, children, ...rest }) {
  const router = useRouter();

  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        router.push(href);
        router.refresh();
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
