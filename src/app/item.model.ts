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

export interface baseRandomRec {
  title: string;
  imageUrl: string;
  base_genres: string;
  base_themes: string;
}