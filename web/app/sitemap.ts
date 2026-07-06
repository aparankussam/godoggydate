import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    '/',
    '/dog-playdates',
    '/dog-socialization-tips',
    '/privacy',
    '/terms',
  ];

  return routes.map((route) => ({
    url: absoluteUrl(route),
    lastModified: new Date(),
    changeFrequency: route === '/' ? 'weekly' : 'monthly',
    priority: route === '/' ? 1 : 0.7,
  }));
}
