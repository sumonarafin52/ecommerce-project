// lib/usePermissions.js
"use client";

import { useEffect, useState, useCallback } from "react";

// Client-side permission hook — sidebar, page, button gate korar jonno
export default function usePermissions() {
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState(null); // admin hole: sob role er config
  const [catalog, setCatalog] = useState([]); // permission catalog (admin)
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch("/api/roles")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setPermissions(res.data.myPermissions || []);
          setRoles(res.data.roles || null);
          setCatalog(res.data.catalog || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ✅ MEMOIZED: permissions na bodla porjonto can er identity same thakbe
  // (infinite re-render / re-fetch loop bondho)
  const can = useCallback((perm) => permissions.includes(perm), [permissions]);

  return { permissions, roles, catalog, loading, can, refresh };
}