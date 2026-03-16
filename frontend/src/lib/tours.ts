export interface TourStop {
  id: string;
  bookTitle: string;
  author: string;
  publishYear: number;
  coordinates: [number, number]; // [lng, lat]
  zoom: number;
  passage: string;
  editorial: string;
  themes: string[];
  coverUrl?: string;
}

export interface Tour {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  heroImage?: string;
  stops: TourStop[];
}

export const tours: Tour[] = [
  {
    slug: 'literary-mumbai',
    title: 'A Literary Tour of Mumbai',
    subtitle: 'Seven novels, one city, infinite Bombays',
    description:
      'From Rushdie\'s midnight to Chandra\'s underworld, Mumbai has been written and rewritten by every generation. This tour traces the city through its fiction — each stop a different Bombay, layered atop the last like the city itself.',
    stops: [
      {
        id: 'midnight-bombay',
        bookTitle: "Midnight's Children",
        author: 'Salman Rushdie',
        publishYear: 1981,
        coordinates: [72.8777, 19.076],
        zoom: 13,
        passage:
          'Who what am I? My answer: I am the sum total of everything that went before me, of all I have been seen done, of everything done-to-me. I am everyone everything whose being-in-the-world affected was affected by mine.',
        editorial:
          "Rushdie's Bombay is a city drunk on its own mythology. Saleem Sinai is born at midnight on August 15, 1947 — his story and India's independence fused at the moment of birth. The city here is not backdrop but co-author, its streets generating the magical realism that defines the novel.",
        themes: ['partition', 'identity', 'magical realism'],
      },
      {
        id: 'sacred-games-mumbai',
        bookTitle: 'Sacred Games',
        author: 'Vikram Chandra',
        publishYear: 2006,
        coordinates: [72.85, 19.0],
        zoom: 12.5,
        passage:
          'Mumbai ground you down and built you up in the same breath. The city was a god, a destroyer of worlds and a creator of fortunes, all wrapped in the stink of the sea and the sweetness of jasmine garlands.',
        editorial:
          "Chandra's Mumbai is the city at its most operatic — a 900-page epic that maps the underworld onto the actual streets. Inspector Sartaj Singh and gangster Ganesh Gaitonde orbit each other through a city where crime and prayer are separated by a single wall.",
        themes: ['crime', 'power', 'underworld'],
      },
      {
        id: 'fine-balance-bombay',
        bookTitle: 'A Fine Balance',
        author: 'Rohinton Mistry',
        publishYear: 1995,
        coordinates: [72.8347, 18.9642],
        zoom: 13,
        passage:
          'In the city by the sea, four lives intersected on the fragile thread of chance. The pavement dwellers, the tailors, the student — all balanced on the thin line between hope and despair.',
        editorial:
          "Mistry's Bombay is Emergency-era India compressed into a single flat. Four strangers from different castes and classes are thrown together — and the city becomes a crucible where the state's violence and the characters' dignity collide. This is the Mumbai that doesn't make it into tourism brochures.",
        themes: ['poverty', 'emergency', 'friendship'],
      },
      {
        id: 'shantaram-mumbai',
        bookTitle: 'Shantaram',
        author: 'Gregory David Roberts',
        publishYear: 2003,
        coordinates: [72.8258, 18.9647],
        zoom: 14,
        passage:
          'The first thing I noticed about Bombay was the smell of it — a complex, layered scent of frangipani, sweat, diesel, jasmine, sandalwood, and the salt sea.',
        editorial:
          "Roberts writes Mumbai from the outside in — an Australian fugitive who finds refuge in the slums. The city here is sensory overload rendered as prose. Whatever one thinks of the novel's veracity, its Bombay is vivid: a place where reinvention is not just possible but inevitable.",
        themes: ['survival', 'identity', 'slum life'],
      },
      {
        id: 'widows-malabar-mumbai',
        bookTitle: 'The Widows of Malabar Hill',
        author: 'Sujata Massey',
        publishYear: 2018,
        coordinates: [72.7946, 18.9548],
        zoom: 14.5,
        passage:
          "Perveen Mistry walked through the Gothic arches of the Bombay High Court, one of the city's few women lawyers, navigating a world where the law was written by men but justice required a woman's eye.",
        editorial:
          "Massey's 1920s Bombay is a city of Gothic architecture and social reform. Her protagonist — based on India's first woman lawyer — navigates the intersection of colonial law and Indian custom. This is the Bombay of the freedom movement's intellectual ferment.",
        themes: ['feminism', 'colonial law', 'Parsi culture'],
      },
      {
        id: 'bombay-stories-mumbai',
        bookTitle: 'Bombay Stories',
        author: 'Saadat Hasan Manto',
        publishYear: 1940,
        coordinates: [72.8296, 19.0176],
        zoom: 14,
        passage:
          "Bombay's film studios were dream factories where villagers became stars and stars became ghosts. In the by-lanes of Grant Road, every second person had a screenplay in their pocket and a broken heart.",
        editorial:
          "Manto's Bombay is the city of cinema and its shadows — the extras, the prostitutes, the dreamers who fuel the film industry but never appear on screen. Writing in the 1940s, his short stories capture a Bombay on the cusp of partition, its cosmopolitan veneer about to crack.",
        themes: ['cinema', 'partition', 'marginality'],
      },
      {
        id: 'behind-beautiful-mumbai',
        bookTitle: 'Behind the Beautiful Forevers',
        author: 'Katherine Boo',
        publishYear: 2012,
        coordinates: [72.8685, 19.0955],
        zoom: 14.5,
        passage:
          'Annawadi was a slum by the international airport — a place where the beautiful forevers of the advertising billboards looked down on lives that were anything but. The proximity of wealth made poverty sharper.',
        editorial:
          "Boo's non-fiction Mumbai is the city stripped of literary romance. Annawadi sits in the shadow of luxury hotels near the airport — the geographic compression of India's inequality into a single sightline. The book asks what fiction rarely does: what happens to people the city doesn't notice.",
        themes: ['inequality', 'aspiration', 'justice'],
      },
    ],
  },
];

export function getTourBySlug(slug: string): Tour | undefined {
  return tours.find((t) => t.slug === slug);
}
