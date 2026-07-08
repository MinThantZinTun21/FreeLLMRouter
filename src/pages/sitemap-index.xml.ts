import type { APIRoute } from 'astro';
import { siteConfig } from '@/lib/seo';

const SITEMAP_PATHS = [
  '/sitemap-static.xml',
  '/sitemap-docs.xml',
  '/sitemap-models.xml',
  '/sitemap-providers.xml',
] as const;

export const GET: APIRoute = () => {
  const today = new Date().toISOString().split('T')[0];

  const entries = SITEMAP_PATHS.map(
    (path) =>
      `  <sitemap>\n    <loc>${siteConfig.url}${path}</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
