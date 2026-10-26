// app/shipping-policy/page.js
import InfoPage from "@/components/InfoPage";
import { INFO_PAGES } from "@/lib/pageTemplates";

export const dynamic = "force-dynamic";
export const metadata = {
  title: INFO_PAGES.shipping.title,
  description: INFO_PAGES.shipping.description,
  alternates: { canonical: INFO_PAGES.shipping.path },
};

export default function Page() {
  return <InfoPage pageKey="shipping" />;
}
