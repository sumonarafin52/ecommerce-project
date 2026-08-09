export default function Footer() {
  // TODO: links (About, Contact, Privacy Policy), social icons, newsletter signup
  return (
    <footer className="border-t border-gray-200 py-8">
      <div className="mx-auto max-w-7xl px-4 text-sm text-primary-light">
        © {new Date().getFullYear()} MyShop. All rights reserved.
      </div>
    </footer>
  );
}
