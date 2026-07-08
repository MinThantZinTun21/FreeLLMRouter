import type { APIRoute } from 'astro';
import { siteConfig } from '@/lib/seo';

const STATIC_PATHS = [
  '/',
  '/models',
  '/models/availability',
  '/providers',
  '/docs',
  '/pricing',
] as const;

export const GET: APIRoute = () => {
  const today = new Date().toISOString().split('T')[0];

  const urls = STATIC_PATHS.map(
    (path) =>
      `  <url>\n    <loc>${siteConfig.url}${path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${path === '/' ? '1.0' : '0.8'}</priority>\n  </url>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
