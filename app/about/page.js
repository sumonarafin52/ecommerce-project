// app/about/page.js
import InfoPage from "@/components/InfoPage";
import { INFO_PAGES } from "@/lib/pageTemplates";

export const dynamic = "force-dynamic";
export const metadata = {
  title: INFO_PAGES.about.title,
  description: INFO_PAGES.about.description,
  alternates: { canonical: INFO_PAGES.about.path },
};

export default function Page() {
  return <InfoPage pageKey="about" />;
}
