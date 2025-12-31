import { Metadata } from "next";
import Script from "next/script";

interface Props {
  params: { topic: string };
  children: React.ReactNode;
}

function toTitleCase(str: string): string {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export async function generateMetadata({ params }: { params: { topic: string } }): Promise<Metadata> {
  const topic = decodeURIComponent(params.topic).replace(/_/g, " ");
  const titleCaseTopic = toTitleCase(topic);

  const description = `Learn about ${titleCaseTopic} on Quartz. Explore concepts, simplify explanations, and dive deeper into any topic.`;
  const url = `https://tryquartz.wiki/page/${params.topic}`;

  return {
    title: `${titleCaseTopic} - Quartz`,
    description,
    openGraph: {
      title: `${titleCaseTopic} - Quartz`,
      description,
      url,
      siteName: "Quartz",
      type: "article",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: `${titleCaseTopic} - Quartz`,
      description,
    },
    alternates: {
      canonical: url,
    },
  };
}

export default function TopicLayout({ params, children }: Props) {
  const topic = decodeURIComponent(params.topic).replace(/_/g, " ");
  const titleCaseTopic = toTitleCase(topic);
  const description = `Learn about ${titleCaseTopic} on Quartz.`;
  const url = `https://tryquartz.wiki/page/${params.topic}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: titleCaseTopic,
    description: description,
    url: url,
    publisher: {
      "@type": "Organization",
      name: "Quartz",
      url: "https://tryquartz.wiki",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
  };

  return (
    <>
      <Script
        id="json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}

