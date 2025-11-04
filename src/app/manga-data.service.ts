import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of, shareReplay, forkJoin } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Item, LeastPopularData, RecommendationsData, HistoryEntry, TraitsData } from './item.model';
import { DbService } from './db.service';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class MangaDataService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

  private readonly SPREADSHEET_ID = '1Wrsei4H72bpPTVINrTfBsFCGNEFESDIBfz7VkDJcDgQ';
  private readonly SHEET_API_KEY = 'AIzaSyAoAs8FDaXIXftX8g9qSnbG8s8KFLFHAJI';

  private readonly REC_HISTORY_RANGE = `'Recommendations Data'!A2:AC`;
  private readonly REC_HISTORY_URL = `https://sheets.googleapis.com/v4/spreadsheets/${this.SPREADSHEET_ID}/values/${this.REC_HISTORY_RANGE}?key=${this.SHEET_API_KEY}`;
  private readonly LEAST_POPULAR_HISTORY_RANGE = `'Least Popular Characters Data'!A2:Z`;
  private readonly LEAST_POPULAR_HISTORY_URL = `https://sheets.googleapis.com/v4/spreadsheets/${this.SPREADSHEET_ID}/values/${this.LEAST_POPULAR_HISTORY_RANGE}?key=${this.SHEET_API_KEY}`;
  private readonly TRAITS_HISTORY_RANGE = `'Character Traits Data'!A2:I`;
  private readonly TRAITS_HISTORY_URL = `https://sheets.googleapis.com/v4/spreadsheets/${this.SPREADSHEET_ID}/values/${this.TRAITS_HISTORY_RANGE}?key=${this.SHEET_API_KEY}`;

  private readonly MANGA_DATA_URL = "https://script.google.com/macros/s/AKfycbyQrKZxxXP_6A_CG5zpY4uhPr7nlOu5ILZNBi9hN_rv8p2UL91eIpRM4vGI8rjUeWx5/exec?action=data"
  private readonly DAILY_MANGADLE_URL = "https://script.google.com/macros/s/AKfycbyQrKZxxXP_6A_CG5zpY4uhPr7nlOu5ILZNBi9hN_rv8p2UL91eIpRM4vGI8rjUeWx5/exec?action=daily"
  private readonly DAILY_RECCS_URL = 'https://script.google.com/macros/s/AKfycbyQrKZxxXP_6A_CG5zpY4uhPr7nlOu5ILZNBi9hN_rv8p2UL91eIpRM4vGI8rjUeWx5/exec?action=dailyReccs';
  private readonly DAILY_LEAST_POPULAR_URL = 'https://script.google.com/macros/s/AKfycbyQrKZxxXP_6A_CG5zpY4uhPr7nlOu5ILZNBi9hN_rv8p2UL91eIpRM4vGI8rjUeWx5/exec?action=dailyLeastPopular';
  private readonly DAILY_TRAITS_URL = 'https://script.google.com/macros/s/AKfycbyQrKZxxXP_6A_CG5zpY4uhPr7nlOu5ILZNBi9hN_rv8p2UL91eIpRM4vGI8rjUeWx5/exec?action=dailyCharacterTraits';
  private readonly CHARACTER_NAMES_URL = `${environment.baseHref}character_names.csv`;

  // Google Apps Script URLs for game data (as they handle randomization)
  // These are kept for historical game modes
  private readonly DATA_RANGE = `'Mangadle Data'!A2:N`;
  private readonly FULL_LIST_URL = `https://sheets.googleapis.com/v4/spreadsheets/${this.SPREADSHEET_ID}/values/${this.DATA_RANGE}?key=${this.SHEET_API_KEY}`;
  

  private fullMangaList$: Observable<Item[]> | null = null;
  private gameHistory$: Observable<HistoryEntry[]> | null = null;
  private recHistory$: Observable<HistoryEntry[]> | null = null;
  private fullRecHistoryData$: Observable<any[][]> | null = null; // New cache for raw rec history
  private fullLeastPopularHistoryData$: Observable<any[][]> | null = null; // New cache for raw least popular history
  private fullTraitsHistoryData$: Observable<any[][]> | null = null;
  private traitsHistory$: Observable<HistoryEntry[]> | null = null;
  private leastPopularHistory$: Observable<HistoryEntry[]> | null = null;
  private characterNames$: Observable<string[]> | null = null;

  /**
   * Fetches the full list of manga from the Google Sheet, with caching.
   * The result is shared and replayed for subsequent subscribers.
   */
  getFullMangaList(): Observable<Item[]> {
    if (this.fullMangaList$) {
      return this.fullMangaList$;
    }

    const fullListCacheKey = 'mangadle-fullItemList';

    // Create a single observable stream. This will be executed only once.
    this.fullMangaList$ = new Observable<Item[]>(subscriber => {
      // 1. Try to load from localStorage first.
      if (isPlatformBrowser(this.platformId)) {
        const cachedData = localStorage.getItem(fullListCacheKey);
        if (cachedData) {
          let items = JSON.parse(cachedData) as Item[];
          // Ensure cached items have the 'title' property for backward compatibility.
          items = items.map(item => {
            if (!item.title) {
              const eng_title = (item.eng_title && item.eng_title !== 'N/A') ? item.eng_title : null;
              item.title = eng_title || item.jp_title;
            }
            return item;
          });
          const sortedItems = items.sort((a, b) => a.title.localeCompare(b.title));
          subscriber.next(sortedItems);
          subscriber.complete();
          return; // Stop here if we have cached data.
        }
      }

      // 2. If no cache, fetch from the network.
      this.http.get<Item[]>(this.MANGA_DATA_URL).subscribe({
        next: response => {
          const items = response
            .filter(item => item && item.jp_title) // Filter out any malformed items
            .map(item => {
              const eng_title = (item.eng_title && item.eng_title !== 'N/A') ? item.eng_title : null;
              return {
                ...item,
                title: eng_title || item.jp_title, // Ensure the 'title' property is set
              } as Item;
            });

          const sortedItems = items.sort((a, b) => a.title.localeCompare(b.title));
          
          if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem(fullListCacheKey, JSON.stringify(sortedItems));
          }
          subscriber.next(sortedItems);
          subscriber.complete();
        },
        error: err => subscriber.error(err)
      });
    }).pipe(
      shareReplay(1) // IMPORTANT: Cache and share the single result with all subscribers.
    );
    return this.fullMangaList$;
  }

  /**
   * Fetches the data for the daily "Guess by Manga Panel" game.
   * If a date is provided, it fetches that specific historical game.
   */
  getMangaPanelGame(date?: string | null): Observable<any> {
    if (date) {
      // For historical games, fetch from the full list
      return this.http.get<{ values: any[][] }>(this.FULL_LIST_URL).pipe(
        map(response => {
          if (!response.values) throw new Error('No data found in sheet.');
          const gameRow = response.values.find(row => row[0] === date);
          if (!gameRow) throw new Error(`Game data for date ${date} not found.`);
          return { date: gameRow[0], title: gameRow[2], chapter: gameRow[10], img1: gameRow[11], img2: gameRow[12], img3: gameRow[13] };
        })
      );
    }
    // For the current day's game, fetch from the dedicated daily URL
    return this.http.get<any>(this.DAILY_MANGADLE_URL);
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
        const playableHistory = response.values.slice(0, -1);

        const historyEntries = playableHistory
          .filter(row => row && row[0] && row[0].toString().trim() !== '')
          .map((row: any[]): HistoryEntry => ({
            date: this.formatDateFromSheet(row[0]),
            title: (row[3] && row[3] !== 'N/A') ? row[3] : row[2],
            jp_title: row[2],
            image: row[11],
            score: parseFloat(row[4]),
            popularity: parseInt(row[5], 10),
            gameMode: 'Manga Panel'
          }));

        return historyEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }),
      shareReplay(1)
    );
    return this.gameHistory$;
  }

  /**
   * Fetches the chronological list of all recommendation games.
   */
  getRecommendationHistory(): Observable<HistoryEntry[]> {
    if (this.recHistory$) {
      return this.recHistory$;
    }

    // Use the new cached raw data stream
    this.recHistory$ = this.getFullRecHistoryData().pipe(
      map(fullHistoryData => {
        const playableHistory = fullHistoryData.slice(0, -1);
        return playableHistory
          .filter(row => row && row[0] && String(row[0]).trim() !== '' && row[1] && String(row[1]).trim() !== '') // Ensure date (row[0]) and title (row[1]) exist
          .map((row: any[]): HistoryEntry => ({
            date: this.formatDateFromSheet(row[0]),
            // The title will be the jp_title initially. The component will resolve the display title.
            title: row[1],
            jp_title: row[1],
            image: row[2],
            score: 0,
            popularity: 0,
            gameMode: 'Recommendation'
          }));
      }),
      shareReplay(1)
    );
    return this.recHistory$;
  }

  /**
   * Fetches the chronological list of all "Least Popular" games.
   */
  getLeastPopularHistory(): Observable<HistoryEntry[]> {
    if (this.leastPopularHistory$) {
      return this.leastPopularHistory$;
    }

    this.leastPopularHistory$ = this.getFullLeastPopularHistoryData().pipe(
      map(fullHistoryData => {
        if (!fullHistoryData) {
          return [];
        }
        const playableHistory = fullHistoryData.slice(0, -1);

        return playableHistory
          .filter(row => row && row[0] && String(row[0]).trim() !== '')
          .map((row: any[]): HistoryEntry => ({
            date: this.formatDateFromSheet(row[0]),
            title: row[1], // Assuming English title is in the second column
            jp_title: row[1], // Assuming the same for now
            image: row[2], // Assuming an image URL is in the third column
            score: 0,
            popularity: 0,
            gameMode: 'Least Popular'
          }));
      }),
      shareReplay(1)
    );
    return this.leastPopularHistory$;
  }

  /**
   * Fetches the chronological list of all "Character Traits" games.
   */
  getTraitsHistory(): Observable<HistoryEntry[]> {
    if (this.traitsHistory$) {
      return this.traitsHistory$;
    }

    this.traitsHistory$ = this.getFullTraitsHistoryData().pipe(
      map(fullHistoryData => {
        if (!fullHistoryData) {
          return [];
        }
        const playableHistory = fullHistoryData.slice(0, -1);

        return playableHistory
          .filter(row => row && row[0] && String(row[0]).trim() !== '')
          .map((row: any[]): HistoryEntry => ({
            date: this.formatDateFromSheet(row[0]),
            title: row[2], // Character Name (for localStorage key matching)
            jp_title: row[5], // Manga Title
            image: row[7], // Picture URL
            score: 0,
            popularity: 0,
            gameMode: 'Traits'
          }));
      }),
      shareReplay(1)
    );
    return this.traitsHistory$;
  }

  /**
   * Fetches the data for the daily "Guess by Recommendations" game.
   */
  getRecommendationsGame(date?: string | null): Observable<RecommendationsData> {
    // If a date is provided, it's a historical game.
    if (date) {
      // Use the new cached raw data stream
      return this.getFullRecHistoryData().pipe(
        map(fullHistoryData => {
          // The `date` from the URL is already formatted as MM/DD/YYYY. We must format the
          // date from each row in the sheet to the same format before comparing.
          const gameRow = fullHistoryData.find(row => this.formatDateFromSheet(row[0]) === date);
          if (!gameRow) throw new Error(`Recommendation game data for date ${date} not found.`);
          
          // Manually construct the RecommendationsData object from the sheet row.
          // The structure should match the daily data object.
          const reccsData: RecommendationsData = {
            date: this.formatDateFromSheet(gameRow[0]),
            base_title: gameRow[1],
            base_image_url: gameRow[3],
            base_genres: gameRow[4],
            base_themes: gameRow[7]
          } as any;

          // The recommendations start at column F (index 5)
          for (let i = 0; i < 5; i++) {
            (reccsData as any)[`rec_title_${i + 1}`] = gameRow[8 + i * 4];
            (reccsData as any)[`rec_image_url_${i + 1}`] = gameRow[10 + i * 4];
            (reccsData as any)[`rec_synopsis_${i + 1}`] = gameRow[11 + i * 4];
          }
          return reccsData;

        })
      );
    }
    // For the current day's game, fetch from the dedicated daily URL
    return this.http.get<RecommendationsData>(this.DAILY_RECCS_URL);
  }

  // New private method to create a single, cached source for the raw recommendation history data
  private getFullRecHistoryData(): Observable<any[][]> {
    if (this.fullRecHistoryData$) {
      return this.fullRecHistoryData$;
    }
    this.fullRecHistoryData$ = this.http.get<{ values: any[][] }>(this.REC_HISTORY_URL).pipe(
      map(response => response.values || []),
      shareReplay(1)
    );
    return this.fullRecHistoryData$;
  }

  /**
   * Fetches the data for the daily "Guess by Least Popular" game.
   */
  getLeastPopularGame(date?: string | null): Observable<LeastPopularData> {
    // If a date is provided, it's a historical game.
    if (date) {
      return this.getFullLeastPopularHistoryData().pipe(
        map(fullHistoryData => {
          const gameRow = fullHistoryData.find(row => this.formatDateFromSheet(row[0]) === date);
          if (!gameRow) throw new Error(`Least Popular game data for date ${date} not found.`);

          // Manually construct the LeastPopularData object from the sheet row.
          const leastPopularData: LeastPopularData = {
            baseTitle: gameRow[1],
            baseId: 0, // Assuming baseId is not in the history sheet
            characters: []
          };

          // Characters start at column D (index 3)
          for (let i = 0; i < 5; i++) {
            const name = gameRow[4 + i * 4];      // Column E
            const imageUrl = gameRow[6 + i * 4];  // Column G
            const favorites = gameRow[7 + i * 4]; // Column H
            if (name && favorites && imageUrl) {
              leastPopularData.characters.push({
                id: 0, // Assuming character ID is not in the history sheet
                name: name,
                favorites: parseInt(favorites, 10),
                imageUrl: imageUrl
              });
            }
          }
          return leastPopularData;
        })
      );
    }
    // For the current day's game, fetch from the dedicated daily URL
    return this.http.get<LeastPopularData>(this.DAILY_LEAST_POPULAR_URL).pipe(
      tap(data => console.log('Fetched daily least popular game:', data))
    );
  }

  /**
   * Fetches the data for the daily "Guess by Traits" game.
   */
  getTraitsGame(date?: string | null): Observable<TraitsData> {
    if (date) {
      return this.getFullTraitsHistoryData().pipe(
        map(fullHistoryData => {
          const gameRow = fullHistoryData.find(row => this.formatDateFromSheet(row[0]) === date);
          if (!gameRow) throw new Error(`Traits game data for date ${date} not found.`);

          const parsedTags = this.parseTagsArray(gameRow[5]); // Column E: Tags

          const traitsData: TraitsData = {
            baseTitle: gameRow[6], // Column G: Manga Title
            baseId: gameRow[1], // Character ID
            characterName: gameRow[2], // Column C: Character Name
            hairColor: gameRow[3], // Column D: Hair Color
            gender: gameRow[4], // Column E: Gender
            animeTitle: gameRow[6], // Column G: Anime Title
            picture: gameRow[8], // Column H: Picture URL
            tags: parsedTags
          };
          return traitsData;
        })
      );
    }
    return this.http.get<TraitsData>(this.DAILY_TRAITS_URL).pipe(
      tap(data => console.log('Fetched daily traits game:', data))
    );
  }



  // New private method to create a single, cached source for the raw least popular history data
  private getFullLeastPopularHistoryData(): Observable<any[][]> {
    if (this.fullLeastPopularHistoryData$) {
      return this.fullLeastPopularHistoryData$;
    }
    this.fullLeastPopularHistoryData$ = this.http.get<{ values: any[][] }>(this.LEAST_POPULAR_HISTORY_URL).pipe(
      map(response => response.values || []),
      shareReplay(1)
    );
    return this.fullLeastPopularHistoryData$;
  }

  private getFullTraitsHistoryData(): Observable<any[][]> {
    if (this.fullTraitsHistoryData$) {
      return this.fullTraitsHistoryData$;
    }
    this.fullTraitsHistoryData$ = this.http.get<{ values: any[][] }>(this.TRAITS_HISTORY_URL).pipe(
      map(response => response.values || []),
      shareReplay(1)
    );
    return this.fullTraitsHistoryData$;
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

  /**
   * Converts a date from a Google Sheet (which can be a string or a serial number)
   * into a 'MM/DD/YYYY' formatted string.
   */
  private formatDateFromSheet(sheetDate: any): string {
    // If it's a string that already contains slashes, we assume it's the correct format.
    if (typeof sheetDate === 'string' && sheetDate.includes('/')) {
      return sheetDate;
    }
    // Otherwise, attempt to treat it as a numeric serial date from the spreadsheet.
    const numericDate = Number(sheetDate);
    if (!isNaN(numericDate)) {
      const jsDate = new Date((numericDate - 25569) * 86400 * 1000);
      return `${jsDate.getUTCMonth() + 1}/${jsDate.getUTCDate()}/${jsDate.getUTCFullYear()}`;
    }
    return String(sheetDate); // Return as-is if it's an unexpected format
  }

  private parseTagsArray(str: string): string[] {
    if (!str || str.length <= 2) return [];
    // This regex finds all strings enclosed in single quotes.
    const matches = str.match(/'([^']*)'/g);
    if (!matches) return [];
    // For each match, remove the surrounding quotes to get the clean tag.
    return matches.map(match => match.substring(1, match.length - 1));
  }
}