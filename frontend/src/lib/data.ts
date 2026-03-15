import { LiteraryPlace, AuthorConnection } from './types';

export const literaryPlaces: LiteraryPlace[] = [
  // ── South Asian Literature ──────────────────────────────────────
  {
    id: 'midnight-bombay',
    bookTitle: "Midnight's Children",
    author: 'Salman Rushdie',
    publishYear: 1981,
    placeName: 'Bombay (Mumbai)',
    coordinates: [72.8777, 19.076],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1947–1977',
    passage:
      'Who what am I? My answer: I am the sum total of everything that went before me, of all I have been seen done, of everything done-to-me. I am everyone everything whose being-in-the-world affected was affected by mine.',
    sentiment: {
      polarity: 0.3,
      dominantEmotions: ['wonder', 'chaos', 'belonging'],
      themes: ['partition', 'identity', 'nationhood', 'magical_realism'],
    },
    language: 'English',
    genres: ['magical realism', 'postcolonial'],
    region: 'South Asia',
    wikidataBookId: 'Q210erta',
    wikidataPlaceId: 'Q1156',
  },
  {
    id: 'midnight-delhi',
    bookTitle: "Midnight's Children",
    author: 'Salman Rushdie',
    publishYear: 1981,
    placeName: 'Delhi',
    coordinates: [77.209, 28.6139],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1947–1977',
    passage:
      'In the old city, the weights of memories seemed to press down upon every brick, every narrow lane choked with the ghosts of empire and the cries of street vendors.',
    sentiment: {
      polarity: -0.1,
      dominantEmotions: ['nostalgia', 'weight', 'grandeur'],
      themes: ['colonial_legacy', 'old_city', 'memory'],
    },
    language: 'English',
    genres: ['magical realism', 'postcolonial'],
    region: 'South Asia',
    wikidataPlaceId: 'Q987',
  },
  {
    id: 'midnight-karachi',
    bookTitle: "Midnight's Children",
    author: 'Salman Rushdie',
    publishYear: 1981,
    placeName: 'Karachi',
    coordinates: [67.0011, 24.8607],
    placeType: 'real',
    settingType: 'secondary',
    narrativeEra: '1947–1977',
    passage:
      'Karachi was a city of desert heat and ocean air, where history had been rewritten and old names erased from the maps of belonging.',
    sentiment: {
      polarity: -0.3,
      dominantEmotions: ['displacement', 'alienation'],
      themes: ['partition', 'migration', 'loss'],
    },
    language: 'English',
    genres: ['magical realism', 'postcolonial'],
    region: 'South Asia',
    wikidataPlaceId: 'Q8660',
  },
  {
    id: 'malgudi-mysore',
    bookTitle: 'The Guide',
    author: 'R.K. Narayan',
    publishYear: 1958,
    placeName: 'Malgudi (Mysore)',
    coordinates: [76.6394, 12.2958],
    placeType: 'fictional_based_on_real',
    realAnchor: 'Mysore, Karnataka',
    settingType: 'primary',
    narrativeEra: '1940s–1950s',
    passage:
      'The Mempi Hills loomed blue and enchanting beyond the river. Malgudi was a town where everyone knew everyone and yet the deepest mysteries of the human heart played out unobserved.',
    sentiment: {
      polarity: 0.5,
      dominantEmotions: ['warmth', 'gentle_irony', 'contentment'],
      themes: ['small_town_life', 'human_nature', 'simplicity'],
    },
    language: 'English',
    genres: ['literary fiction', 'social realism'],
    region: 'South Asia',
    wikidataPlaceId: 'Q228405',
  },
  {
    id: 'god-small-things',
    bookTitle: 'The God of Small Things',
    author: 'Arundhati Roy',
    publishYear: 1997,
    placeName: 'Ayemenem (Kottayam)',
    coordinates: [76.5222, 9.5916],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1960s–1990s',
    passage:
      'May in Ayemenem is a hot, brooding month. The days are long and humid. The river shrinks and black crows gorge on bright mangoes in still, dustgreen trees.',
    sentiment: {
      polarity: -0.2,
      dominantEmotions: ['yearning', 'grief', 'sensuality'],
      themes: ['caste', 'forbidden_love', 'monsoon', 'childhood'],
    },
    language: 'English',
    genres: ['literary fiction', 'postcolonial'],
    region: 'South Asia',
    wikidataPlaceId: 'Q2031857',
  },
  {
    id: 'suitable-boy-lucknow',
    bookTitle: 'A Suitable Boy',
    author: 'Vikram Seth',
    publishYear: 1993,
    placeName: 'Brahmpur (Lucknow)',
    coordinates: [80.9462, 26.8467],
    placeType: 'fictional_based_on_real',
    realAnchor: 'Lucknow / Varanasi composite',
    settingType: 'primary',
    narrativeEra: '1951–1952',
    passage:
      'The city by the Ganga was a place where the old aristocracy still clung to its crumbling mansions, where poetry readings lasted till dawn, and where the new republic was being imagined in every drawing room.',
    sentiment: {
      polarity: 0.4,
      dominantEmotions: ['tenderness', 'cultural_richness', 'hope'],
      themes: ['post_independence', 'family', 'tradition_vs_modernity'],
    },
    language: 'English',
    genres: ['literary fiction', 'social realism'],
    region: 'South Asia',
  },
  {
    id: 'fine-balance-bombay',
    bookTitle: 'A Fine Balance',
    author: 'Rohinton Mistry',
    publishYear: 1995,
    placeName: 'Bombay (Mumbai)',
    coordinates: [72.8347, 18.9642],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1975–1984',
    passage:
      'In the city by the sea, four lives intersected on the fragile thread of chance. The pavement dwellers, the tailors, the student — all balanced on the thin line between hope and despair.',
    sentiment: {
      polarity: -0.5,
      dominantEmotions: ['despair', 'resilience', 'tenderness'],
      themes: ['poverty', 'emergency', 'caste', 'friendship'],
    },
    language: 'English',
    genres: ['literary fiction', 'social realism'],
    region: 'South Asia',
    wikidataPlaceId: 'Q1156',
  },
  {
    id: 'shadow-lines-calcutta',
    bookTitle: 'The Shadow Lines',
    author: 'Amitav Ghosh',
    publishYear: 1988,
    placeName: 'Calcutta (Kolkata)',
    coordinates: [88.3639, 22.5726],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1960s–1980s',
    passage:
      'I could not see Calcutta without seeing Dhaka, could not see one without the shadow of the other — mirror cities divided by a line drawn on a map that had cut through homes and hearts.',
    sentiment: {
      polarity: -0.2,
      dominantEmotions: ['nostalgia', 'loss', 'longing'],
      themes: ['partition', 'memory', 'borders', 'family'],
    },
    language: 'English',
    genres: ['literary fiction', 'postcolonial'],
    region: 'South Asia',
    wikidataPlaceId: 'Q1348',
  },
  {
    id: 'shadow-lines-dhaka',
    bookTitle: 'The Shadow Lines',
    author: 'Amitav Ghosh',
    publishYear: 1988,
    placeName: 'Dhaka',
    coordinates: [90.4125, 23.8103],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1960s–1980s',
    passage:
      'Dhaka existed in my grandmother\'s stories as a city of wide rivers and mango orchards, a place more vivid in memory than any place I had actually seen.',
    sentiment: {
      polarity: 0.1,
      dominantEmotions: ['nostalgia', 'tenderness', 'loss'],
      themes: ['homeland', 'partition', 'memory'],
    },
    language: 'English',
    genres: ['literary fiction', 'postcolonial'],
    region: 'South Asia',
    wikidataPlaceId: 'Q1354',
  },
  {
    id: 'reluctant-lahore',
    bookTitle: 'The Reluctant Fundamentalist',
    author: 'Mohsin Hamid',
    publishYear: 2007,
    placeName: 'Lahore',
    coordinates: [74.3587, 31.5204],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '2000s',
    passage:
      'Lahore is a city of stories. Sit with me in this café in Old Anarkali and I will tell you how America seduced me, how I became a New Yorker, and how I returned to this city that has always known who I am.',
    sentiment: {
      polarity: 0.3,
      dominantEmotions: ['pride', 'ambivalence', 'belonging'],
      themes: ['identity', 'east_vs_west', 'homecoming', 'post_9/11'],
    },
    language: 'English',
    genres: ['literary fiction', 'political'],
    region: 'South Asia',
    wikidataPlaceId: 'Q11739',
  },
  {
    id: 'reluctant-newyork',
    bookTitle: 'The Reluctant Fundamentalist',
    author: 'Mohsin Hamid',
    publishYear: 2007,
    placeName: 'New York City',
    coordinates: [-74.006, 40.7128],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '2000s',
    passage:
      'New York was the city of my ambition, gleaming with the promise of meritocracy. But after the towers fell, I saw how quickly the gleam could turn to suspicion, how the outsider could be made to feel his outsiderness.',
    sentiment: {
      polarity: -0.3,
      dominantEmotions: ['disillusionment', 'alienation', 'ambition'],
      themes: ['post_9/11', 'identity', 'capitalism', 'belonging'],
    },
    language: 'English',
    genres: ['literary fiction', 'political'],
    region: 'North America',
    wikidataPlaceId: 'Q60',
  },
  {
    id: 'white-tiger-delhi',
    bookTitle: 'The White Tiger',
    author: 'Aravind Adiga',
    publishYear: 2008,
    placeName: 'Delhi',
    coordinates: [77.1025, 28.7041],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '2000s',
    passage:
      'Delhi is two cities — the dark city of servants who live in the gaps between the great houses, and the bright city of their masters. I have lived in both.',
    sentiment: {
      polarity: -0.4,
      dominantEmotions: ['rage', 'dark_humor', 'determination'],
      themes: ['class', 'corruption', 'ambition', 'inequality'],
    },
    language: 'English',
    genres: ['literary fiction', 'satire'],
    region: 'South Asia',
    wikidataPlaceId: 'Q987',
  },
  {
    id: 'white-tiger-bangalore',
    bookTitle: 'The White Tiger',
    author: 'Aravind Adiga',
    publishYear: 2008,
    placeName: 'Bangalore',
    coordinates: [77.5946, 12.9716],
    placeType: 'real',
    settingType: 'secondary',
    narrativeEra: '2000s',
    passage:
      'Bangalore was the future — all glass towers and call centres and the hum of air conditioning. Here a man could remake himself, shed his village skin and become someone new.',
    sentiment: {
      polarity: 0.4,
      dominantEmotions: ['ambition', 'freedom', 'reinvention'],
      themes: ['modernity', 'technology', 'class_mobility'],
    },
    language: 'English',
    genres: ['literary fiction', 'satire'],
    region: 'South Asia',
    wikidataPlaceId: 'Q1355',
  },
  {
    id: 'inheritance-kalimpong',
    bookTitle: 'The Inheritance of Loss',
    author: 'Kiran Desai',
    publishYear: 2006,
    placeName: 'Kalimpong',
    coordinates: [88.4696, 27.066],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1980s',
    passage:
      'Kalimpong sat in the mist between India and its borders, a forgotten hill station where colonial grandeur had crumbled into a damp and gentle decay, and where revolution stirred in the tea gardens.',
    sentiment: {
      polarity: -0.3,
      dominantEmotions: ['melancholy', 'decay', 'beauty'],
      themes: ['colonialism', 'gorkhaland', 'globalization', 'isolation'],
    },
    language: 'English',
    genres: ['literary fiction', 'postcolonial'],
    region: 'South Asia',
    wikidataPlaceId: 'Q590019',
  },
  {
    id: 'namesake-calcutta',
    bookTitle: 'The Namesake',
    author: 'Jhumpa Lahiri',
    publishYear: 2003,
    placeName: 'Calcutta (Kolkata)',
    coordinates: [88.3469, 22.5626],
    placeType: 'real',
    settingType: 'secondary',
    narrativeEra: '1960s–2000s',
    passage:
      'Calcutta was the city of Ashima\'s girlhood — the taste of fuchka on Gariahat Road, the yellow Ambassador taxis, the Durga Puja pandals glowing in the autumn dark. In America she carried it like a second heartbeat.',
    sentiment: {
      polarity: 0.4,
      dominantEmotions: ['nostalgia', 'warmth', 'longing'],
      themes: ['diaspora', 'identity', 'home', 'food'],
    },
    language: 'English',
    genres: ['literary fiction', 'diaspora'],
    region: 'South Asia',
    wikidataPlaceId: 'Q1348',
  },
  {
    id: 'namesake-boston',
    bookTitle: 'The Namesake',
    author: 'Jhumpa Lahiri',
    publishYear: 2003,
    placeName: 'Boston / Cambridge',
    coordinates: [-71.1097, 42.3736],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1960s–2000s',
    passage:
      'In Cambridge, Ashoke and Ashima built a life from scratch — the alien cold of Massachusetts winters, the puzzling rituals of American neighbors, the slow accretion of a new home from borrowed customs.',
    sentiment: {
      polarity: 0.1,
      dominantEmotions: ['alienation', 'perseverance', 'quiet_joy'],
      themes: ['immigration', 'assimilation', 'between_worlds'],
    },
    language: 'English',
    genres: ['literary fiction', 'diaspora'],
    region: 'North America',
    wikidataPlaceId: 'Q49111',
  },
  {
    id: 'home-world-bengal',
    bookTitle: 'The Home and the World',
    author: 'Rabindranath Tagore',
    publishYear: 1916,
    placeName: 'Bengal (Rural Estate)',
    coordinates: [88.15, 23.25],
    placeType: 'fictional_based_on_real',
    realAnchor: 'Rural Bengal, near Santiniketan',
    settingType: 'primary',
    narrativeEra: '1900s–1910s',
    passage:
      'The world beyond the zenana was vast and terrifying and beautiful. Bimala stood at the threshold between the home and the world, between devotion and desire, between tradition and the intoxicating call of the nation.',
    sentiment: {
      polarity: 0.0,
      dominantEmotions: ['conflict', 'awakening', 'devotion'],
      themes: ['nationalism', 'swadeshi', 'gender', 'tradition_vs_modernity'],
    },
    language: 'Bengali',
    genres: ['literary fiction', 'political'],
    region: 'South Asia',
    wikidataPlaceId: 'Q1906',
  },
  {
    id: 'toba-tek-singh',
    bookTitle: 'Toba Tek Singh',
    author: 'Saadat Hasan Manto',
    publishYear: 1955,
    placeName: 'Toba Tek Singh (Punjab)',
    coordinates: [72.4826, 30.9709],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1947',
    passage:
      'Where was Toba Tek Singh? In India or in Pakistan? In neither, said Bishan Singh, standing in the no-man\'s-land between the two new nations, refusing to cross to either side, and there he fell.',
    sentiment: {
      polarity: -0.7,
      dominantEmotions: ['absurdity', 'anguish', 'defiance'],
      themes: ['partition', 'madness', 'borders', 'identity'],
    },
    language: 'Urdu',
    genres: ['short story', 'political', 'absurdist'],
    region: 'South Asia',
  },
  {
    id: 'burnt-shadows-delhi',
    bookTitle: 'Burnt Shadows',
    author: 'Kamila Shamsie',
    publishYear: 2009,
    placeName: 'Delhi',
    coordinates: [77.23, 28.66],
    placeType: 'real',
    settingType: 'secondary',
    narrativeEra: '1947',
    passage:
      'Delhi in 1947 was a city tearing itself apart. The streets that had been shared for centuries became borders, and neighbors became strangers overnight.',
    sentiment: {
      polarity: -0.6,
      dominantEmotions: ['fear', 'loss', 'violence'],
      themes: ['partition', 'displacement', 'communal_violence'],
    },
    language: 'English',
    genres: ['literary fiction', 'historical'],
    region: 'South Asia',
    wikidataPlaceId: 'Q987',
  },
  {
    id: 'burnt-shadows-karachi',
    bookTitle: 'Burnt Shadows',
    author: 'Kamila Shamsie',
    publishYear: 2009,
    placeName: 'Karachi',
    coordinates: [67.08, 24.93],
    placeType: 'real',
    settingType: 'secondary',
    narrativeEra: '1980s–2000s',
    passage:
      'Karachi was a city of contradictions — of sea breezes and gunfire, of generosity and menace, where empires had come and gone and left their shadows burnt into the streets.',
    sentiment: {
      polarity: -0.3,
      dominantEmotions: ['tension', 'resilience', 'complexity'],
      themes: ['war_on_terror', 'geopolitics', 'survival'],
    },
    language: 'English',
    genres: ['literary fiction', 'historical'],
    region: 'South Asia',
    wikidataPlaceId: 'Q8660',
  },
  {
    id: 'quilt-lucknow',
    bookTitle: 'The Quilt',
    author: 'Ismat Chughtai',
    publishYear: 1942,
    placeName: 'Lucknow',
    coordinates: [80.9, 26.85],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1940s',
    passage:
      'Behind the ornate doors of Lucknow\'s nawabi households, beneath the heavy razais, lay stories that polite society refused to name — stories of loneliness, desire, and the secret geographies of women\'s lives.',
    sentiment: {
      polarity: -0.1,
      dominantEmotions: ['desire', 'confinement', 'intimacy'],
      themes: ['gender', 'sexuality', 'nawabi_culture', 'patriarchy'],
    },
    language: 'Urdu',
    genres: ['short story', 'feminist'],
    region: 'South Asia',
  },

  // ── European Literature ─────────────────────────────────────────
  {
    id: 'ulysses-dublin',
    bookTitle: 'Ulysses',
    author: 'James Joyce',
    publishYear: 1922,
    placeName: 'Dublin',
    coordinates: [-6.2603, 53.3498],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1904',
    passage:
      'He crossed to the bright side, avoiding the loose cellarflap of number seventyfive. The sun was nearing the steeple of George\'s church. Be a warm day I fancy. Specially in these black clothes feel more the sun.',
    sentiment: {
      polarity: 0.3,
      dominantEmotions: ['mundane_beauty', 'warmth', 'observation'],
      themes: ['everyday_life', 'city_as_character', 'wandering'],
    },
    language: 'English',
    genres: ['modernist', 'literary fiction'],
    region: 'Europe',
    wikidataPlaceId: 'Q1761',
  },
  {
    id: 'crime-petersburg',
    bookTitle: 'Crime and Punishment',
    author: 'Fyodor Dostoevsky',
    publishYear: 1866,
    placeName: 'St. Petersburg',
    coordinates: [30.3351, 59.9343],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1860s',
    passage:
      'The heat in the street was terrible: the closeness, the crowds, the plaster, scaffolding, bricks and dust, and that special Petersburg stench — all worked painfully upon the young man\'s already overwrought nerves.',
    sentiment: {
      polarity: -0.7,
      dominantEmotions: ['oppression', 'fever', 'dread'],
      themes: ['poverty', 'guilt', 'urban_suffering', 'morality'],
    },
    language: 'Russian',
    genres: ['literary fiction', 'psychological'],
    region: 'Europe',
    wikidataPlaceId: 'Q656',
  },
  {
    id: 'les-mis-paris',
    bookTitle: 'Les Misérables',
    author: 'Victor Hugo',
    publishYear: 1862,
    placeName: 'Paris',
    coordinates: [2.3522, 48.8566],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1815–1832',
    passage:
      'Paris has a child and the forest has a bird. The bird is called the sparrow; the child is called the gamin. The gamin of Paris is a creature who lives in the immensity of the city like a fish in the sea.',
    sentiment: {
      polarity: 0.1,
      dominantEmotions: ['defiance', 'compassion', 'grandeur'],
      themes: ['revolution', 'poverty', 'justice', 'redemption'],
    },
    language: 'French',
    genres: ['literary fiction', 'historical'],
    region: 'Europe',
    wikidataPlaceId: 'Q90',
  },
  {
    id: 'trial-prague',
    bookTitle: 'The Trial',
    author: 'Franz Kafka',
    publishYear: 1925,
    placeName: 'Prague',
    coordinates: [14.4378, 50.0755],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1910s',
    passage:
      'The corridors of the court building wound through attic rooms where laundry hung from the rafters. Justice existed in the crevices of an incomprehensible architecture.',
    sentiment: {
      polarity: -0.6,
      dominantEmotions: ['anxiety', 'absurdity', 'claustrophobia'],
      themes: ['bureaucracy', 'alienation', 'guilt', 'modernity'],
    },
    language: 'German',
    genres: ['modernist', 'absurdist'],
    region: 'Europe',
    wikidataPlaceId: 'Q1085',
  },
  {
    id: 'master-moscow',
    bookTitle: 'The Master and Margarita',
    author: 'Mikhail Bulgakov',
    publishYear: 1967,
    placeName: 'Moscow',
    coordinates: [37.6173, 55.7558],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1930s',
    passage:
      'At the hour of the hot spring sunset, two citizens appeared at the Patriarch\'s Ponds. The Devil had come to Moscow, and the city — accustomed to bureaucratic absurdity — barely noticed the difference.',
    sentiment: {
      polarity: 0.2,
      dominantEmotions: ['satire', 'wonder', 'menace'],
      themes: ['censorship', 'good_vs_evil', 'art', 'soviet_life'],
    },
    language: 'Russian',
    genres: ['magical realism', 'satire'],
    region: 'Europe',
    wikidataPlaceId: 'Q649',
  },
  {
    id: 'tale-two-london',
    bookTitle: 'A Tale of Two Cities',
    author: 'Charles Dickens',
    publishYear: 1859,
    placeName: 'London',
    coordinates: [-0.1276, 51.5074],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1775–1793',
    passage:
      'It was the best of times, it was the worst of times. London\'s fog-drenched streets held the respectable and the desperate in uneasy proximity, separated by wealth but bound by the coming storm across the Channel.',
    sentiment: {
      polarity: -0.1,
      dominantEmotions: ['foreboding', 'contrast', 'tension'],
      themes: ['revolution', 'class', 'sacrifice', 'resurrection'],
    },
    language: 'English',
    genres: ['historical fiction', 'literary fiction'],
    region: 'Europe',
    wikidataPlaceId: 'Q84',
  },
  {
    id: 'istanbul-pamuk',
    bookTitle: 'Istanbul: Memories and the City',
    author: 'Orhan Pamuk',
    publishYear: 2003,
    placeName: 'Istanbul',
    coordinates: [28.9784, 41.0082],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1950s–1970s',
    passage:
      'The hüzün of Istanbul — a melancholy that seeps from the crumbling Ottoman mansions along the Bosphorus, from the black-and-white photographs, from the fog that blurs the minarets at dusk.',
    sentiment: {
      polarity: -0.2,
      dominantEmotions: ['melancholy', 'beauty', 'hüzün'],
      themes: ['decay', 'empire', 'identity', 'memory'],
    },
    language: 'Turkish',
    genres: ['memoir', 'literary fiction'],
    region: 'Europe',
    wikidataPlaceId: 'Q406',
  },

  // ── Latin American Literature ───────────────────────────────────
  {
    id: 'hundred-years-macondo',
    bookTitle: 'One Hundred Years of Solitude',
    author: 'Gabriel García Márquez',
    publishYear: 1967,
    placeName: 'Macondo (Aracataca)',
    coordinates: [-74.1904, 10.5926],
    placeType: 'fictional_based_on_real',
    realAnchor: 'Aracataca, Colombia',
    settingType: 'primary',
    narrativeEra: '19th–20th century',
    passage:
      'Macondo was a village of twenty adobe houses, built on the bank of a river of clear water that ran along a bed of polished stones, which were white and enormous, like prehistoric eggs.',
    sentiment: {
      polarity: 0.3,
      dominantEmotions: ['wonder', 'solitude', 'cyclical_time'],
      themes: ['magical_realism', 'solitude', 'history_repeating', 'fate'],
    },
    language: 'Spanish',
    genres: ['magical realism', 'literary fiction'],
    region: 'Latin America',
    wikidataPlaceId: 'Q375018',
  },
  {
    id: 'ficciones-buenosaires',
    bookTitle: 'Ficciones',
    author: 'Jorge Luis Borges',
    publishYear: 1944,
    placeName: 'Buenos Aires',
    coordinates: [-58.3816, -34.6037],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1940s',
    passage:
      'I saw the earth in the Aleph and in the earth the Aleph once more and the earth in the Aleph — Buenos Aires was a city of infinite libraries, each book containing another, each street leading to a labyrinth.',
    sentiment: {
      polarity: 0.2,
      dominantEmotions: ['wonder', 'vertigo', 'intellectual_joy'],
      themes: ['infinity', 'labyrinths', 'time', 'mirrors'],
    },
    language: 'Spanish',
    genres: ['short story', 'magical realism', 'philosophical'],
    region: 'Latin America',
    wikidataPlaceId: 'Q1486',
  },

  // ── African Literature ──────────────────────────────────────────
  {
    id: 'americanah-lagos',
    bookTitle: 'Americanah',
    author: 'Chimamanda Ngozi Adichie',
    publishYear: 2013,
    placeName: 'Lagos',
    coordinates: [3.3792, 6.5244],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1990s–2010s',
    passage:
      'Lagos was a city that assaulted you with its life — the go-slow traffic, the hawkers selling plantain chips through car windows, the generators humming their defiant song against the darkness of power cuts.',
    sentiment: {
      polarity: 0.3,
      dominantEmotions: ['vitality', 'chaos', 'belonging'],
      themes: ['homecoming', 'identity', 'race', 'class'],
    },
    language: 'English',
    genres: ['literary fiction', 'postcolonial'],
    region: 'Africa',
    wikidataPlaceId: 'Q8673',
  },
  {
    id: 'things-fall-apart',
    bookTitle: 'Things Fall Apart',
    author: 'Chinua Achebe',
    publishYear: 1958,
    placeName: 'Umuofia (Igboland)',
    coordinates: [7.0, 6.2],
    placeType: 'fictional_based_on_real',
    realAnchor: 'Ogidi, Anambra State, Nigeria',
    settingType: 'primary',
    narrativeEra: '1890s',
    passage:
      'Umuofia was feared by all its neighbours. It was powerful in war and in magic, and its priests and medicine men were feared in all the surrounding country.',
    sentiment: {
      polarity: -0.3,
      dominantEmotions: ['pride', 'loss', 'inevitability'],
      themes: ['colonialism', 'tradition', 'masculinity', 'change'],
    },
    language: 'English',
    genres: ['literary fiction', 'postcolonial'],
    region: 'Africa',
    wikidataPlaceId: 'Q1033',
  },
  {
    id: 'palace-walk-cairo',
    bookTitle: 'Palace Walk',
    author: 'Naguib Mahfouz',
    publishYear: 1956,
    placeName: 'Cairo',
    coordinates: [31.2357, 30.0444],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1917–1919',
    passage:
      'Between al-Nahhasin and Palace Walk, the world of the family was enclosed — the latticed mashrabiya windows filtering the light, the father\'s tyranny softened by the call to prayer, the mother who had not left the house in decades.',
    sentiment: {
      polarity: 0.0,
      dominantEmotions: ['confinement', 'devotion', 'tension'],
      themes: ['patriarchy', 'nationalism', 'family', 'tradition'],
    },
    language: 'Arabic',
    genres: ['literary fiction', 'social realism'],
    region: 'Middle East',
    wikidataPlaceId: 'Q85',
  },
  {
    id: 'stranger-algiers',
    bookTitle: 'The Stranger',
    author: 'Albert Camus',
    publishYear: 1942,
    placeName: 'Algiers',
    coordinates: [3.0588, 36.7538],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1940s',
    passage:
      'The sun was the same as it had been the day I buried Maman. The glare off the white buildings of Algiers, the heat pressing down like a hand — it was the sun that pulled the trigger.',
    sentiment: {
      polarity: -0.5,
      dominantEmotions: ['indifference', 'heat', 'absurdity'],
      themes: ['absurdism', 'colonialism', 'alienation', 'sun'],
    },
    language: 'French',
    genres: ['literary fiction', 'philosophical', 'absurdist'],
    region: 'Africa',
    wikidataPlaceId: 'Q3561',
  },

  // ── East Asian Literature ───────────────────────────────────────
  {
    id: 'norwegian-wood-tokyo',
    bookTitle: 'Norwegian Wood',
    author: 'Haruki Murakami',
    publishYear: 1987,
    placeName: 'Tokyo',
    coordinates: [139.6917, 35.6895],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1960s–1970s',
    passage:
      'Tokyo in the late sixties was a city of student protests and jazz bars, of loneliness wrapped in neon. I walked its streets missing Naoko, and the city walked alongside me, indifferent and beautiful.',
    sentiment: {
      polarity: -0.2,
      dominantEmotions: ['loneliness', 'nostalgia', 'quiet_beauty'],
      themes: ['loss', 'youth', 'memory', 'urban_solitude'],
    },
    language: 'Japanese',
    genres: ['literary fiction', 'romance'],
    region: 'East Asia',
    wikidataPlaceId: 'Q1490',
  },

  // ── More South Asian ────────────────────────────────────────────
  {
    id: 'train-pakistan-amritsar',
    bookTitle: 'Train to Pakistan',
    author: 'Khushwant Singh',
    publishYear: 1956,
    placeName: 'Mano Majra (near Amritsar)',
    coordinates: [74.8723, 31.6340],
    placeType: 'fictional_based_on_real',
    realAnchor: 'Village near Amritsar, Punjab',
    settingType: 'primary',
    narrativeEra: '1947',
    passage:
      'The train came through Mano Majra at night, a ghost train carrying the dead. After that night, the village — where Sikhs and Muslims had shared the same well for generations — was never the same.',
    sentiment: {
      polarity: -0.8,
      dominantEmotions: ['horror', 'grief', 'betrayal'],
      themes: ['partition', 'communal_violence', 'love', 'sacrifice'],
    },
    language: 'English',
    genres: ['historical fiction', 'political'],
    region: 'South Asia',
  },
  {
    id: 'hungry-tide-sundarbans',
    bookTitle: 'The Hungry Tide',
    author: 'Amitav Ghosh',
    publishYear: 2004,
    placeName: 'Sundarbans',
    coordinates: [88.93, 21.95],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '2000s',
    passage:
      'The tide country was a place of liquid borders where land and water changed places twice a day. The mangroves breathed with the rhythm of the moon, and tigers swam between islands like shadows.',
    sentiment: {
      polarity: 0.1,
      dominantEmotions: ['awe', 'danger', 'fluidity'],
      themes: ['ecology', 'displacement', 'human_nature', 'tides'],
    },
    language: 'English',
    genres: ['literary fiction', 'ecological'],
    region: 'South Asia',
    wikidataPlaceId: 'Q129603',
  },
  {
    id: 'sacred-games-mumbai',
    bookTitle: 'Sacred Games',
    author: 'Vikram Chandra',
    publishYear: 2006,
    placeName: 'Mumbai',
    coordinates: [72.85, 19.0],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '1980s–2000s',
    passage:
      'Mumbai ground you down and built you up in the same breath. The city was a god, a destroyer of worlds and a creator of fortunes, all wrapped in the stink of the sea and the sweetness of jasmine garlands.',
    sentiment: {
      polarity: 0.0,
      dominantEmotions: ['intensity', 'corruption', 'vitality'],
      themes: ['crime', 'power', 'underworld', 'urban_life'],
    },
    language: 'English',
    genres: ['literary fiction', 'crime', 'epic'],
    region: 'South Asia',
    wikidataPlaceId: 'Q1156',
  },

  // ── Open City ───────────────────────────────────────────────────
  {
    id: 'open-city-nyc',
    bookTitle: 'Open City',
    author: 'Teju Cole',
    publishYear: 2011,
    placeName: 'New York City',
    coordinates: [-73.9857, 40.7484],
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '2000s',
    passage:
      'I walked Manhattan as a way of thinking, letting the streets become sentences. Each neighborhood was a paragraph in a story the city was telling about displacement and belonging and the ghosts of old New Amsterdam.',
    sentiment: {
      polarity: 0.1,
      dominantEmotions: ['contemplation', 'solitude', 'observation'],
      themes: ['flanerie', 'race', 'history', 'migration'],
    },
    language: 'English',
    genres: ['literary fiction', 'modernist'],
    region: 'North America',
    wikidataPlaceId: 'Q60',
  },
  {
    id: 'open-city-brussels',
    bookTitle: 'Open City',
    author: 'Teju Cole',
    publishYear: 2011,
    placeName: 'Brussels',
    coordinates: [4.3517, 50.8503],
    placeType: 'real',
    settingType: 'secondary',
    narrativeEra: '2000s',
    passage:
      'Brussels surprised me with its African quarter — a pocket of Kinshasa transplanted to Europe, where the colonial past was not past at all but lived on in the faces and languages of the streets.',
    sentiment: {
      polarity: -0.2,
      dominantEmotions: ['unease', 'recognition', 'complexity'],
      themes: ['colonialism', 'diaspora', 'european_identity'],
    },
    language: 'English',
    genres: ['literary fiction', 'modernist'],
    region: 'Europe',
    wikidataPlaceId: 'Q239',
  },
];

// ── Derived Data ──────────────────────────────────────────────────

export function getUniqueAuthors(): string[] {
  return [...new Set(literaryPlaces.map((p) => p.author))];
}

export function getUniqueRegions(): string[] {
  return [...new Set(literaryPlaces.map((p) => p.region))].sort();
}

export function getUniqueGenres(): string[] {
  const genres = new Set<string>();
  literaryPlaces.forEach((p) => p.genres.forEach((g) => genres.add(g)));
  return [...genres].sort();
}

export function getUniqueLanguages(): string[] {
  return [...new Set(literaryPlaces.map((p) => p.language))].sort();
}

export function getEraRanges(): string[] {
  return [
    'Pre-1900',
    '1900–1950',
    '1950–1980',
    '1980–2000',
    '2000–present',
  ];
}

export function filterByEra(places: LiteraryPlace[], era: string): LiteraryPlace[] {
  const year = (p: LiteraryPlace) => p.publishYear;
  switch (era) {
    case 'Pre-1900': return places.filter((p) => year(p) < 1900);
    case '1900–1950': return places.filter((p) => year(p) >= 1900 && year(p) < 1950);
    case '1950–1980': return places.filter((p) => year(p) >= 1950 && year(p) < 1980);
    case '1980–2000': return places.filter((p) => year(p) >= 1980 && year(p) < 2000);
    case '2000–present': return places.filter((p) => year(p) >= 2000);
    default: return places;
  }
}

export function generateAuthorConnections(): AuthorConnection[] {
  const authorPlaces = new Map<string, LiteraryPlace[]>();
  literaryPlaces.forEach((p) => {
    const list = authorPlaces.get(p.author) || [];
    list.push(p);
    authorPlaces.set(p.author, list);
  });

  const connections: AuthorConnection[] = [];
  authorPlaces.forEach((places, author) => {
    const unique = places.filter(
      (p, i, arr) =>
        arr.findIndex(
          (q) =>
            q.coordinates[0] === p.coordinates[0] &&
            q.coordinates[1] === p.coordinates[1]
        ) === i
    );
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        connections.push({
          source: unique[i].coordinates,
          target: unique[j].coordinates,
          sourceCity: unique[i].placeName,
          targetCity: unique[j].placeName,
          author,
          bookCount: places.length,
        });
      }
    }
  });
  return connections;
}

export function sentimentColor(polarity: number): [number, number, number] {
  if (polarity > 0.2) return [74, 222, 128];   // green
  if (polarity < -0.2) return [248, 113, 113];  // red
  return [196, 154, 108];                        // amber/neutral
}

export const STATS = {
  books: new Set(literaryPlaces.map((p) => p.bookTitle)).size,
  cities: new Set(literaryPlaces.map((p) => p.placeName)).size,
  authors: new Set(literaryPlaces.map((p) => p.author)).size,
  languages: new Set(literaryPlaces.map((p) => p.language)).size,
};
