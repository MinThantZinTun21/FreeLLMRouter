import type { APIRoute } from 'astro';
import { siteConfig } from '@/lib/seo';

const DOC_SECTION_SLUGS = [
  'get-started',
  'setup-openrouter',
  'get-api-key',
  'copy-file',
  'use-it',
  'further-configure-params',
  'parameter-configuration',
  'parameter-configuration-overview',
  'configure-params-live',
  'key-defaults',
  'request-overrides',
  'code-examples',
  'example-basic-fallback',
  'example-one-off',
  'example-chatbot',
  'example-tool-calling',
  'api-reference',
  'api-get-models',
  'api-get-models-full',
  'api-post-feedback',
  'query-params',
  'param-useCase',
  'param-sort',
  'param-topN',
  'param-maxErrorRate',
  'param-timeRange',
  'param-myReports',
] as const;

export const GET: APIRoute = () => {
  const today = new Date().toISOString().split('T')[0];

  const urls = DOC_SECTION_SLUGS.map(
    (section) =>
      `  <url>\n    <loc>${siteConfig.url}/docs/${encodeURIComponent(section)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
