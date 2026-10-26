// app/return-policy/page.js
import InfoPage from "@/components/InfoPage";
import { INFO_PAGES } from "@/lib/pageTemplates";

export const dynamic = "force-dynamic";
export const metadata = {
  title: INFO_PAGES.returns.title,
  description: INFO_PAGES.returns.description,
  alternates: { canonical: INFO_PAGES.returns.path },
};

export default function Page() {
  return <InfoPage pageKey="returns" />;
}
