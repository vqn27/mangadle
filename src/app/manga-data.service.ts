import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of, shareReplay } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Item, LeastPopularData, RecommendationsData, HistoryEntry, TraitsData } from './item.model';

@Injectable({
  providedIn: 'root',
})
export class MangaDataService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

private readonly SPREADSHEET_ID = '1Wrsei4H72bpPTVINrTfBsFCGNEFESDIBfz7VkDJcDgQ';
  private readonly SHEET_API_KEY = 'AIzaSyAoAs8FDaXIXftX8g9qSnbG8s8KFLFHAJI';
  private readonly DATA_RANGE = `'Mangadle Data'!A2:N`;
  private readonly FULL_LIST_URL = `https://sheets.googleapis.com/v4/spreadsheets/${this.SPREADSHEET_ID}/values/${this.DATA_RANGE}?key=${this.SHEET_API_KEY}`;

  // Google Apps Script URLs for game data (as they handle randomization)
  private readonly DAILY_RECCS_URL = 'https://script.google.com/macros/s/AKfycbyQrKZxxXP_6A_CG5zpY4uhPr7nlOu5ILZNBi9hN_rv8p2UL91eIpRM4vGI8rjUeWx5/exec?action=dailyReccs';
  private readonly DAILY_LEAST_POPULAR_URL = 'https://script.google.com/macros/s/AKfycbyQrKZxxXP_6A_CG5zpY4uhPr7nlOu5ILZNBi9hN_rv8p2UL91eIpRM4vGI8rjUeWx5/exec?action=dailyLeastPopular';
  private readonly DAILY_TRAITS_URL = 'https://script.google.com/macros/s/AKfycbyQrKZxxXP_6A_CG5zpY4uhPr7nlOu5ILZNBi9hN_rv8p2UL91eIpRM4vGI8rjUeWx5/exec?action=dailyCharacterTraits';
  private readonly CHARACTER_NAMES_URL = '/mangadle/character_names.csv';


  // Google Apps Script URLs for game data (as they handle randomization)
  

  private fullMangaList$: Observable<Item[]> | null = null;
  private gameHistory$: Observable<HistoryEntry[]> | null = null;
  private characterNames$: Observable<string[]> | null = null;

  /**
   * Fetches the full list of manga from the Google Sheet, with caching.
   * The result is shared and replayed for subsequent subscribers.
   */
  getFullMangaList(): Observable<Item[]> {
    const fullListCacheKey = 'mangadle-fullItemList';

    if (this.fullMangaList$) {
      return this.fullMangaList$;
    }

    if (isPlatformBrowser(this.platformId)) {
      const cachedData = localStorage.getItem(fullListCacheKey);
      if (cachedData) {
        const items = JSON.parse(cachedData) as Item[];
        this.fullMangaList$ = of(items);
        return this.fullMangaList$;
      }
    }

    this.fullMangaList$ = this.http.get<{ values: any[][] }>(this.FULL_LIST_URL).pipe(
      map(response => {
        const values = response.values || [];
        return values
          .filter(row => row && row[2]) // Filter out rows that don't have at least a Japanese title
          .map(row => ({
            jp_title: row[2],
            eng_title: row[3],
            score: parseFloat(row[4]),
            popularity: parseInt(row[5], 10)
          } as Item));
      }),
      tap(items => {
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem(fullListCacheKey, JSON.stringify(items));
        }
      }),
      shareReplay(1) // Cache the result and share among subscribers
    );

    return this.fullMangaList$;
  }

  /**
   * Fetches the data for the daily "Guess by Manga Panel" game.
   * If a date is provided, it fetches that specific historical game.
   */
  getMangaPanelGame(date?: string | null): Observable<any> {
    return this.http.get<{ values: any[][] }>(this.FULL_LIST_URL).pipe(
      map(response => {
        if (!response.values) {
          throw new Error('No data found in sheet.');
        }
        const gameRow = date
          ? response.values.find(row => row[0] === date) // Find historical game
          : response.values[response.values.length - 2]; // Get day before last for current game

        if (!gameRow) {
          throw new Error(`Game data for date ${date} not found.`);
        }

        return {
          date: gameRow[0],
          title: gameRow[2],
          chapter: gameRow[10],
          img1: gameRow[11],
          img2: gameRow[12],
          img3: gameRow[13],
        };
      })
    );
  }

  /**
   * Fetches the chronological list of all panel games.
   */
  getGameHistory(): Observable<HistoryEntry[]> {
    if (this.gameHistory$) {
      return this.gameHistory$;
    }

    this.gameHistory$ = this.http.get<{ values: any[][] }>(this.FULL_LIST_URL).pipe(
      map(response => {
        if (!response.values) {
          return [];
        }
        // Exclude the last row from the sheet, as it's reserved for the next day's game.
        const playableHistory = response.values.slice(0, -1);

        const historyEntries = playableHistory
          .filter(row => row && row[0]) // Ensure row and date exist
          .map((row: any[]): HistoryEntry => ({
            date: row[0],
            title: (row[3] && row[3] !== 'N/A') ? row[3] : row[2],
            jp_title: row[2],
            image: row[11],
            score: parseFloat(row[4]),
            popularity: parseInt(row[5], 10),
            gameMode: 'Manga Panel'
          }));

        // Sort data by date, with the oldest date first
        return historyEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }),
      shareReplay(1) // Cache the result
    );

    return this.gameHistory$;
  }

  /**
   * Fetches the data for the daily "Guess by Recommendations" game.
   */
  getRecommendationsGame(): Observable<RecommendationsData> {
    return this.http.get<RecommendationsData>(this.DAILY_RECCS_URL);
  }

  /**
   * Fetches the data for the daily "Guess by Least Popular" game.
   */
  getLeastPopularGame(): Observable<LeastPopularData> {
    return this.http.get<LeastPopularData>(this.DAILY_LEAST_POPULAR_URL);
  }

  /**
   * Fetches the data for the daily "Guess by Traits" game.
   */
  getTraitsGame(): Observable<TraitsData> {
    return this.http.get<TraitsData>(this.DAILY_TRAITS_URL);
  }

  /**
   * Fetches the list of character names from a local CSV file.
   */
  getCharacterNames(): Observable<string[]> {
    const characterNamesCacheKey = 'mangadle-characterNameList';

    if (this.characterNames$) {
      return this.characterNames$;
    }

    if (isPlatformBrowser(this.platformId)) {
      const cachedData = localStorage.getItem(characterNamesCacheKey);
      if (cachedData) {
        return of(JSON.parse(cachedData));
      }
    }

    this.characterNames$ = this.http.get(this.CHARACTER_NAMES_URL, { responseType: 'text' }).pipe(
      map(csvText => csvText.split('\n').map(name => name.trim()).filter(name => name)),
      tap(names => localStorage.setItem(characterNamesCacheKey, JSON.stringify(names))),
      shareReplay(1)
    );
    return this.characterNames$;
  }
}