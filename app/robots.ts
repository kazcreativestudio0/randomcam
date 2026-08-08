import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://randomcam.kaz-creative-studio0.workers.dev";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/", "/report/"] },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
