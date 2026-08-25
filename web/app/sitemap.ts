import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/site';
import { DOGTYPE_CODES } from '../../shared/dogtype';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    '/',
    '/dog-playdates',
    '/dog-socialization-tips',
    '/playdate-safety',
    '/quiz',
    '/barkle',
    '/privacy',
    '/terms',
    // The 16 Dogtype identity pages and their compatibility pages are the
    // acquisition funnel and are intentionally indexable (unlike /d/[slug]).
    ...DOGTYPE_CODES.map((code) => `/dogtype/${code}`),
    ...DOGTYPE_CODES.map((code) => `/compat/${code}`),
  ];

  return routes.map((route) => ({
    url: absoluteUrl(route),
    lastModified: new Date(),
    changeFrequency: route === '/' ? 'weekly' : 'monthly',
    priority: route === '/' ? 1 : 0.7,
  }));
}
