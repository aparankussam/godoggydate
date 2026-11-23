import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    '/',
    '/dog-playdates',
    '/dog-socialization-tips',
    '/playdate-safety',
    '/quiz',
    '/excuse',
    '/barkle',
    '/dogtype',
    '/privacy',
    '/terms',
    '/delete-account',
    '/support',
    // Per-type pages are deliberately not listed: the other types are a
    // mystery you uncover by matching.
  ];

  return routes.map((route) => ({
    url: absoluteUrl(route),
    lastModified: new Date(),
    changeFrequency: route === '/' ? 'weekly' : 'monthly',
    priority: route === '/' ? 1 : 0.7,
  }));
}
