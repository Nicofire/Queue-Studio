export function slugifyCategoryName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function toCategoryTitleFromSlug(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function readPlaceIdFromJsonContent(rawContent: string): number | null {
  const withoutBom = rawContent.replace(/^\uFEFF/, '');
  const parsed = JSON.parse(withoutBom) as { placeId?: unknown };

  if (typeof parsed.placeId === 'number' && Number.isFinite(parsed.placeId)) {
    return parsed.placeId;
  }

  return null;
}
