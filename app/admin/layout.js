// app/admin/layout.js
import AdminLayout from "@/components/admin/AdminLayout";

export const metadata = {
  title: "Admin Panel — Sumon Mart",
};

export default function AdminRootLayout({ children }) {
  return <AdminLayout>{children}</AdminLayout>;
}