export interface Item {
    mal_id: number;
    jp_title: string;
    title: string; // This will be set to eng_title if available, otherwise jp_title
    eng_title: string;
    chapter?: number;
    score: number;
    popularity: number;
}

export interface Recommendations {
  title: string;
  imageUrl: string;
  rec_id?: number;
  synopsis?: string;
}

export interface HistoryEntry {
  date: string;
  title: string;
  jp_title: string;
  image: string;
  score: number;
  popularity: number;
  gameMode: string;
}

export interface RecommendationsData extends baseRandomRec {
  base_title: string;
  base_image_url: string;
}

export interface baseRandomRec {
  title: string;
  imageUrl: string;
  base_genres: string;
  base_themes: string;
}

export interface Character {
  id: number;
  name: string;
  favorites: number;
  imageUrl: string;
}

export interface LeastPopularData {
  baseTitle: string;
  baseId: number;
  characters: Character[];
}

export interface TraitsData {
  baseTitle: string;
  baseId: number;
  characterName: string;
  hairColor: string;
  gender: string;
  animeTitle: string;
  imageUrl: string;
  tags: string[];
}