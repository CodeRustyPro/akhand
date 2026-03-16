const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';
const WIKIPEDIA_API = 'https://en.wikipedia.org/api/rest_v1/page/summary';

export interface GoogleBookInfo {
  rating?: number;
  ratingsCount?: number;
  previewLink?: string;
  description?: string;
  pageCount?: number;
  thumbnail?: string;
}

export interface WikipediaSummary {
  extract: string;
  thumbnail?: string;
  url: string;
}

const gbCache = new Map<string, GoogleBookInfo | null>();
const wikiCache = new Map<string, WikipediaSummary | null>();

export async function fetchGoogleBookInfo(
  title: string,
  author: string
): Promise<GoogleBookInfo | null> {
  const key = `${title}::${author}`;
  if (gbCache.has(key)) return gbCache.get(key) ?? null;

  try {
    const authorFirst = author.split(',')[0].trim();
    const q = `intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(authorFirst)}`;
    const res = await fetch(`${GOOGLE_BOOKS_API}?q=${q}&maxResults=1`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`${res.status}`);

    const data = await res.json();
    const item = data.items?.[0]?.volumeInfo;
    if (!item) {
      gbCache.set(key, null);
      return null;
    }

    const info: GoogleBookInfo = {
      rating: item.averageRating,
      ratingsCount: item.ratingsCount,
      previewLink: item.previewLink,
      description: item.description,
      pageCount: item.pageCount,
      thumbnail: item.imageLinks?.thumbnail?.replace('http://', 'https://'),
    };
    gbCache.set(key, info);
    return info;
  } catch {
    gbCache.set(key, null);
    return null;
  }
}

export async function fetchWikipediaSummary(
  placeName: string
): Promise<WikipediaSummary | null> {
  if (wikiCache.has(placeName)) return wikiCache.get(placeName) ?? null;

  try {
    const encoded = encodeURIComponent(placeName.replace(/ /g, '_'));
    const res = await fetch(`${WIKIPEDIA_API}/${encoded}`, {
      signal: AbortSignal.timeout(3000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`${res.status}`);

    const data = await res.json();
    if (data.type === 'disambiguation' || !data.extract) {
      wikiCache.set(placeName, null);
      return null;
    }

    const summary: WikipediaSummary = {
      extract: data.extract,
      thumbnail: data.thumbnail?.source,
      url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encoded}`,
    };
    wikiCache.set(placeName, summary);
    return summary;
  } catch {
    wikiCache.set(placeName, null);
    return null;
  }
}
