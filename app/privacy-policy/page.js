// app/privacy-policy/page.js
import InfoPage from "@/components/InfoPage";
import { INFO_PAGES } from "@/lib/pageTemplates";

export const dynamic = "force-dynamic";
export const metadata = {
  title: INFO_PAGES.privacy.title,
  description: INFO_PAGES.privacy.description,
  alternates: { canonical: INFO_PAGES.privacy.path },
};

export default function Page() {
  return <InfoPage pageKey="privacy" />;
}
