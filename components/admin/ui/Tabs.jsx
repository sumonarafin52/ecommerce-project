// components/admin/ui/Tabs.jsx
// Shared tab strip. Controlled component: parent owns `active` state.
export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="admin-border border-b flex items-center gap-1 overflow-x-auto no-scrollbar mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`relative shrink-0 px-4 py-2.5 text-sm font-bold transition-colors whitespace-nowrap ${
            active === tab.key ? "text-accent" : "admin-text-secondary hover:text-accent"
          }`}
        >
          {tab.label}
          {active === tab.key && (
            <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-accent rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
