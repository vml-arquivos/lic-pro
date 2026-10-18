import type { MetadataRoute } from 'next';

const paths = [
  '',
  '/como-funciona',
  '/recursos',
  '/para-quem-e',
  '/mentoria',
  '/planos',
  '/faq',
  '/sobre',
  '/contato',
  '/termos',
  '/privacidade',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.SITE_URL ?? 'http://localhost:3100';
  const origin = base.replace(/\/$/, '');
  return paths.map((path) => ({
    url: `${origin}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.7,
  }));
}
