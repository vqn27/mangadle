import { Component, signal, computed, inject, OnInit, OnDestroy, effect, PLATFORM_ID, Renderer2 } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, Observable, Subject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { Item, Recommendations, baseRandomRec, RecommendationsData, HistoryEntry } from '../item.model';
import { MangaDataService } from '../manga-data.service';
import { DbService } from '../db.service';


@Component({
  selector: 'app-recommendation',
  standalone: true, // Modern Angular format
  imports: [
    CommonModule,   // Enables *ngIf, @for
    FormsModule     // Enables [(ngModel)]
  ],
  templateUrl: './recommendation.html',
  styleUrls: ['./recommendation.css', '../shared-styles.css']
})
export class Recommendation implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private sanitizer = inject(DomSanitizer);
  private mangaDataService = inject(MangaDataService);
  private renderer = inject(Renderer2);
  private dbService = inject(DbService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  // Subject to automatically unsubscribe from observables on component destruction
  private destroy$ = new Subject<void>();

  // === UI State ===
  searchTerm = signal('');
  isDropdownOpen = signal(false);
  isLoading = signal(true);
  areImagesLoading = signal(true);
  isBlurredHintVisible = signal(false);
  isGenreHintVisible = signal(false);

  // === Game State ===
  guessResult = signal<'correct' | 'incorrect' | null>(null);
  isSubmitting = signal(false);
  isGameWon = signal(false);
  isGameLost = signal(false);
  isHistoricGame = signal(false);
  gameDateText = signal('');

  private gameHistory: HistoryEntry[] = [];
  private currentDateIndex = -1;

  // === Data State ===
  fullItemList: Item[] = []; // Start with an empty list

  // Dictionary to map Japanese titles to English titles
  titleMap: { [jp_title: string]: string } = {};

  selectedItem = signal<Item | undefined>(undefined);

  // The recommendations to display
  recommendations = signal<Recommendations[]>([]);

  // The manga that the recommendations are based on
  randomManga = signal<baseRandomRec | undefined>(undefined);

  /**
   * Computed signals to determine if navigation arrows should be disabled.
   */
  isFirstDay = computed(() => this.currentDateIndex === 0);
  isLastDay = computed(() => {
    // The "last" playable day is the one before the final entry in our history list.
    // The final entry is reserved for the *next* day's game.
    // Since getRecommendationHistory() already removes the "next day" entry, the last item is the current day.
    return this.currentDateIndex >= this.gameHistory.length - 1;
  });

  isHistoric(): boolean {
    return this.isHistoricGame();
  }

  /**
   * Computed signal to filter the list in real-time based on the searchTerm.
   */
  filteredItemList = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    
    // If no term, show all items (for browsing)
    if (!term) {
      return this.fullItemList;
    }
    
    // Filter by name
    return this.fullItemList.filter(item => 
      item.title.toLowerCase().includes(term)
    );
  });

  constructor() {
    // Effect to add/remove a class to the body when the dropdown opens/closes.
    // This is used to prevent page scrolling.
    effect(() => {
      if (isPlatformBrowser(this.platformId)) {
        const action = this.isDropdownOpen() ? 'addClass' : 'removeClass';
        this.renderer[action](document.body, 'dropdown-open');
      }
    });

    // Effect to save the game state to localStorage when the game is won or lost.
    effect(() => {
      const randomManga = this.randomManga();
      if (randomManga) {
        const key = this.getStorageKey(randomManga.title);
        if (isPlatformBrowser(this.platformId) && key) {
          if (this.isGameWon()) {
            localStorage.setItem(key, 'won');
          } else if (this.isGameLost()) {
            localStorage.setItem(key, 'lost');
          }
        }
      }
    });

    // Effect to save hint state to localStorage.
    effect(() => {
      const randomManga = this.randomManga();
      if (randomManga && isPlatformBrowser(this.platformId)) {
        const hintKey = this.getHintCacheKey(randomManga.title);
        const hintsToCache = {
          genreHint: this.isGenreHintVisible(),
          blurredHint: this.isBlurredHintVisible()
        };
        // Only save if at least one hint has been used.
        if (hintsToCache.genreHint || hintsToCache.blurredHint) {
          localStorage.setItem(hintKey, JSON.stringify(hintsToCache));
        }
      }
    });
  }

  ngOnInit() {
    const gameDate = this.route.snapshot.paramMap.get('date');
    if (gameDate) {
      this.isHistoricGame.set(true);
    }
    this.fetchMangaData(gameDate);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  navigateToDay(offset: number): void {
    if (this.isLoading() || this.gameHistory.length === 0) return;

    const newIndex = this.currentDateIndex + offset;
    if (newIndex >= 0 && newIndex < this.gameHistory.length) {
      const newDate = this.gameHistory[newIndex].date;
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate(['/recommendation', newDate]);
      });
    }
  }

  /**
   * Navigates to the game history page.
   */
  navigateToHistory(): void {
    this.router.navigate(['/history-recommendation']);
  }

  /**
   * Selects an item, updates the input field, and closes the dropdown.
   * @param item The Item object to select.
   */
  selectItem(item: Item): void { 
    if (this.isGameWon() || this.isGameLost()) {
      return;
    }
    this.selectedItem.set(item);
    this.searchTerm.set(item.title); // Set the input value to the selected name
    this.isDropdownOpen.set(false); // Close the dropdown
  }

  /**
   * Opens the dropdown when the input is focused.
   */
  onInputFocus(): void {
    this.isDropdownOpen.set(true);
  }

  /**
   * Closes the dropdown after a short delay (crucial for click events to register).
   */
  onInputBlur(): void {
    setTimeout(() => {
      this.isDropdownOpen.set(false);
    }, 200);
  }

  /**
   * Shows the blurred image hint.
   */
  showBlurredHint(): void {
    this.isBlurredHintVisible.set(true); 
  }

  /**
   * Shows the genre and theme hint.
   */
  showGenreHint(): void {
    this.isGenreHintVisible.set(true);
  }

  /**
   * Clears the search term.
   */
  clearSearch(): void {
    this.searchTerm.set('');
  }

  /**
   * Fetches data from the Google Apps Script URL.
   */
  private fetchMangaData(gameDate: string | null): void {
    forkJoin({
      fullList: this.mangaDataService.getFullMangaList(),
      dailyReccs: this.mangaDataService.getRecommendationsGame(gameDate),
      history: this.mangaDataService.getRecommendationHistory()
    }).subscribe({
      next: ({ fullList, dailyReccs, history }) => {
        // Create a dictionary mapping jp_title to eng_title from the full list
        this.titleMap = fullList.reduce((acc, item) => {
          if (item.jp_title && item.eng_title && item.eng_title !== 'N/A' && item.eng_title) {
            acc[item.jp_title] = item.eng_title;
          }
          return acc;
        }, {} as { [jp_title: string]: string });

        // Set the full item list, sorted alphabetically by the display title.
        this.fullItemList = fullList.sort((a, b) => a.title.localeCompare(b.title));

        // Find the base manga in the processed list to get its proper display title
        const baseMangaFromList = this.fullItemList.find(item => item.jp_title === dailyReccs.base_title || item.eng_title === dailyReccs.base_title);
        const displayTitle = baseMangaFromList ? baseMangaFromList.title : dailyReccs.base_title;

        // Determine if the game is TRULY the current day's game, or a historical one.
        // This is the key to fixing the navigation logic.
        const today = new Date();
        const todayFormatted = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

        let displayDate: string;
        if (this.isHistoricGame()) {
          displayDate = gameDate!; // Use the date from the URL directly for historic games
        } else {
          // For the current game, format the date from YYYY-MM-DD to MM/DD/YYYY
          const [year, month, day] = dailyReccs.date.split('-');
          displayDate = `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}`;

          // If the formatted date is not today's date, it must be a historical game
          // that was navigated to without a date in the URL.
          if (displayDate !== todayFormatted) this.isHistoricGame.set(true);
        }
        this.gameDateText.set(displayDate);

        // Resolve display titles for the fetched history
        let localHistory = history.map(entry => {
          const mangaFromList = this.fullItemList.find(item => item.jp_title === entry.jp_title);
          return {
            ...entry,
            title: mangaFromList?.title || entry.jp_title
          };
        });
        
        // If we are on the current day's game, ensure it's part of the history list for correct navigation.
        if (!this.isHistoricGame() && !localHistory.some(entry => entry.date === displayDate)) {
          localHistory.push({
            date: displayDate,
            title: displayTitle,
            jp_title: dailyReccs.base_title,
            gameMode: 'Recommendation'
          } as HistoryEntry); // The type assertion is needed because we don't have all properties
        }

        // 1. Sort the history chronologically.
        const sortedHistory = localHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        // 2. Find the index of the current game within the *now complete and sorted* list.
        this.currentDateIndex = sortedHistory.findIndex(entry => entry.date === displayDate);
        // 3. Assign the final, sorted list to the class property.
        this.gameHistory = sortedHistory;


        // 1. Assign the base_title to the randomManga signal
        this.randomManga.set({
          title: displayTitle,
          imageUrl: dailyReccs.base_image_url,
          base_genres: dailyReccs.base_genres,
          base_themes: dailyReccs.base_themes
        });
        

        // Check if the game for today has already been won/lost.
        if (isPlatformBrowser(this.platformId)) {
          const key = this.getStorageKey(displayTitle);
          const gameState = localStorage.getItem(key);
          if (gameState === 'won') {
            this.isGameWon.set(true);
            this.guessResult.set('correct');
            const lastGuessKey = this.getLastGuessCacheKey(displayTitle);
            const lastGuess = localStorage.getItem(lastGuessKey);
            if (lastGuess) {
              this.searchTerm.set(lastGuess);
            }
          } else if (gameState === 'lost') {
            this.isGameLost.set(true);
            this.guessResult.set('incorrect');
            const lastGuessKey = this.getLastGuessCacheKey(displayTitle);
            const lastGuess = localStorage.getItem(lastGuessKey);
            if (lastGuess) {
              this.searchTerm.set(lastGuess);
            }
          }

          // Load cached hints
          const hintKey = this.getHintCacheKey(displayTitle);
          const cachedHints = localStorage.getItem(hintKey);
          if (cachedHints) {
            const hints = JSON.parse(cachedHints);
            if (hints.genreHint) {
              this.isGenreHintVisible.set(hints.genreHint);
            }
            if (hints.blurredHint) {
              this.isBlurredHintVisible.set(hints.blurredHint);
            }
          }
        }

        // The `dailyReccs` object now contains the full data for both daily and historical games.
        this.processAndSetRecommendations(dailyReccs);
      },
      error: (err) => {
        console.error('Failed to fetch data from Google Apps Script. This could be a CORS issue if the script is not configured for public JSON access.', err);
        this.isLoading.set(false);
      }
    }).add(() => this.isLoading.set(false));
  }

  private processAndSetRecommendations(reccsData: RecommendationsData): void {
    let recommendationsToSet: Recommendations[] = [];
    const baseTitle = reccsData.base_title;

    // Check for cached recommendations for the current base title
    if (isPlatformBrowser(this.platformId)) {
      const cacheKey = `reccs-${baseTitle}`;
      const cachedReccs = localStorage.getItem(cacheKey);
      if (cachedReccs) {
        recommendationsToSet = JSON.parse(cachedReccs);
        console.log(`Successfully loaded CACHED recommendations for: ${baseTitle}`);
      }
    }

    // If no cached recommendations, create them from the fetched data
    if (recommendationsToSet.length === 0) {
      for (let i = 1; i <= 12; i++) { // Assuming up to 12 recommendations
        const jp_title = (reccsData as any)[`rec_title_${i}`];
        const imageUrl = (reccsData as any)[`rec_image_url_${i}`];
        const synopsis = (reccsData as any)[`rec_synopsis_${i}`];

        // Use the title map to find the English title, otherwise use the Japanese title
        const title = (jp_title && this.titleMap[jp_title]) ? this.titleMap[jp_title] : jp_title;
        
        if (title && imageUrl && synopsis) {
          recommendationsToSet.push({ title, imageUrl, synopsis }); 
        }
      }

      // Save the newly created recommendations to the cache
      if (isPlatformBrowser(this.platformId)) {
        const cacheKey = `reccs-${baseTitle}`;
        localStorage.setItem(cacheKey, JSON.stringify(recommendationsToSet));
      }
      console.log(`Successfully fetched and cached new recommendations for: ${baseTitle}`);
    }

    // Set the recommendations and fetch their images
    this.recommendations.set(recommendationsToSet);
    this.fetchRecommendationImages();
  }

  /**
   * Checks if the user's selected manga matches the daily manga.
   */
  checkGuess(): void {
    if (!this.selectedItem() || !this.randomManga() || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);

    try {
      if (this.selectedItem()?.title === this.randomManga()?.title) {
        this.guessResult.set('correct');
        this.isGameWon.set(true);
        // Cache the correct guess
        if (isPlatformBrowser(this.platformId)) {
          const lastGuessKey = this.getLastGuessCacheKey(this.randomManga()!.title);
          localStorage.setItem(lastGuessKey, this.searchTerm());
        }
      } else {
        this.guessResult.set('incorrect');
        this.isGameLost.set(true);
        // Cache the incorrect guess
        if (isPlatformBrowser(this.platformId)) {
          const lastGuessKey = this.getLastGuessCacheKey(this.randomManga()!.title);
          localStorage.setItem(lastGuessKey, this.searchTerm());
        }
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Closes the result popup.
   */
  closePopup(): void {
    // If the game is won or lost, we don't reset the state.
    // The popup will just close, but the inputs remain disabled.
    this.guessResult.set(null); // Just hide the popup
  }

  /**
   * Generates a unique key for localStorage based on the manga title.
   * @param title The title of the daily manga.
   */
  private getStorageKey(title: string): string {
    return `mangadle-reccs-gameState-${title}`;
  }

  /**
   * Generates a unique key for caching the last guess for a specific manga.
   */
  private getLastGuessCacheKey(title: string): string {
    return `mangadle-reccs-lastGuess-${title}`;
  }

  /**
   * Generates a unique key for caching hints for a specific manga.
   */
  private getHintCacheKey(title: string): string {
    return `mangadle-reccs-hints-${title}`;
  }

  private fetchRecommendationImages(): void {
    interface ImageResponse {
      data: string; // Base64 encoded image data
      mimetype: string;
      url: string;
      blob?: Blob;
    }
    this.areImagesLoading.set(true);

    const imageObservables: Observable<ImageResponse>[] = this.recommendations().map(rec => {
      // This observable will first try to get the image from IndexedDB,
      // and if it's not there, it will fetch it from the network.
      return new Observable(subscriber => {
        this.dbService.getImage(rec.imageUrl).then(cachedBlob => {
          if (cachedBlob) {
            // If we have a cached blob, we're done.
            subscriber.next({ data: '', mimetype: cachedBlob.type, url: rec.imageUrl, blob: cachedBlob });
            subscriber.complete();
          } else {
            // If not in cache, fetch from the network proxy.
            const networkUrl = `https://script.google.com/macros/s/AKfycbyQrKZxxXP_6A_CG5zpY4uhPr7nlOu5ILZNBi9hN_rv8p2UL91eIpRM4vGI8rjUeWx5/exec?url=${encodeURIComponent(rec.imageUrl)}`;
            this.http.get<ImageResponse>(networkUrl).subscribe({
              next: res => {
                const imageBlob = this.b64toBlob(res.data, res.mimetype);
                // Store the new blob in IndexedDB for next time.
                this.dbService.setImage(rec.imageUrl, imageBlob);
                subscriber.next({ ...res, blob: imageBlob });
                subscriber.complete();
              },
              error: err => subscriber.error(err)
            });
          }
        });
      });
    });

    forkJoin(imageObservables).subscribe({
      next: (responses) => {
        const updatedRecs = this.recommendations().map((rec, index) => {
          const res = responses[index];
          // Create a temporary URL for the blob to display in the <img> tag.
          const objectUrl = URL.createObjectURL(res.blob!);
          return { ...rec, imageUrl: this.sanitizer.bypassSecurityTrustUrl(objectUrl) as string };
        });
        this.recommendations.set(updatedRecs as Recommendations[]);
        console.log('Successfully loaded all recommendation images (from cache or network).');
      },
      error: (err) => {
        console.error('Failed to fetch one or more recommendation images:', err);
      },
    }).add(() => {
      this.areImagesLoading.set(false);
    });
  }

  /**
   * Converts a Base64 string to a Blob object.
   */
  private b64toBlob(b64Data: string, contentType = '', sliceSize = 512): Blob {
    if (!b64Data) {
      return new Blob();
    }
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
 
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
 
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
 
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
 
    return new Blob(byteArrays, { type: contentType });
  }
}