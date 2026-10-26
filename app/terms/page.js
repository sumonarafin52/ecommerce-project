// app/terms/page.js
import InfoPage from "@/components/InfoPage";
import { INFO_PAGES } from "@/lib/pageTemplates";

export const dynamic = "force-dynamic";
export const metadata = {
  title: INFO_PAGES.terms.title,
  description: INFO_PAGES.terms.description,
  alternates: { canonical: INFO_PAGES.terms.path },
};

export default function Page() {
  return <InfoPage pageKey="terms" />;
}
