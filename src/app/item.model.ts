export interface Item {
    title: string;
    mal_id: number;
    jp_title?: string;
    eng_title?: string;
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