// components/admin/ui/PageHeader.jsx
// Shared page header for every admin page: breadcrumb + title + description +
// an optional action slot on the right (buttons). Use this instead of
// hand-rolling a header on each page so spacing/typography stay identical
// everywhere.
import Link from "next/link";

export function Breadcrumb({ items = [] }) {
  if (!items.length) return null;
  return (
    <nav className="flex items-center gap-1.5 text-xs admin-text-muted mb-2" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="opacity-50">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-accent transition-colors font-medium">
              {item.label}
            </Link>
          ) : (
            <span className="admin-text-secondary font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export default function PageHeader({ title, description, breadcrumb, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <Breadcrumb items={breadcrumb} />
        <h1 className="text-xl lg:text-2xl font-extrabold admin-text-primary">{title}</h1>
        {description && <p className="text-sm admin-text-muted mt-1 max-w-2xl">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}
