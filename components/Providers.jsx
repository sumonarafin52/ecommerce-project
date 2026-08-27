// components/Providers.jsx
"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";

export default function Providers({ children }) {
  return (
    <SessionProvider>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "#FFFFFF",
            color: "#2B2318",
            border: "1px solid #E7DAB9",
            borderRadius: "10px",
            fontSize: "13.5px",
            fontWeight: 600,
            boxShadow: "0 4px 16px rgba(30,58,95,0.12)",
          },
          success: { iconTheme: { primary: "#2C5282", secondary: "#FFFFFF" } },
          error: { iconTheme: { primary: "#A13A3A", secondary: "#FFFFFF" } },
        }}
      />
    </SessionProvider>
  );
}