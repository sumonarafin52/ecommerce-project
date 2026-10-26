// components/admin/ui/EmptyState.jsx
// Shared "nothing here yet" placeholder — use instead of a bare <p> so every
// empty table/list/page looks the same across the admin.
import Icon from "@/components/ui/Icon";

export default function EmptyState({ icon = "inbox", title = "Nothing here yet", description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-4">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 text-[#616161] flex items-center justify-center mb-4">
        <Icon name={icon} size={24} strokeWidth={1.4} />
      </div>
      <p className="text-sm font-bold admin-text-primary">{title}</p>
      {description && <p className="text-xs admin-text-muted mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
