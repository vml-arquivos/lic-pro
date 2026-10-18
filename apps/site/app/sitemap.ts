import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.SITE_URL ?? 'http://localhost:3100';
  const paths = [
    '',
    '/para-quem-e',
    '/como-funciona',
    '/recursos',
    '/mentoria',
    '/planos',
    '/faq',
    '/sobre',
    '/contato',
    '/termos',
    '/privacidade',
  ];
  return paths.map((path) => ({
    url: `${base.replace(/\/$/, '')}${path}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: path === '' ? 1 : 0.7,
  }));
}
