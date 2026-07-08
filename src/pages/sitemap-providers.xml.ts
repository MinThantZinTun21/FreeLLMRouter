import type { APIRoute } from 'astro';
import { access } from '@/lib/runtime-access';
import { getDistinctProviders } from '@/services/openrouter';
import { siteConfig } from '@/lib/seo';

export const GET: APIRoute = async (context) => {
  const db = access(context).db('app');
  if (!db) throw new Error('Missing env: DATABASE_URL');
  const providers = await getDistinctProviders(db);

  const today = new Date().toISOString().split('T')[0];

  const urls = providers
    .map(
      (p) => `  <url>
    <loc>${siteConfig.url}/providers/${encodeURIComponent(p)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
