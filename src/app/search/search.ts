import { Component, signal, computed, inject, OnInit, effect, PLATFORM_ID, Renderer2 } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, Observable } from 'rxjs';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Item, RecommendationsData, HistoryEntry } from '../item.model';
import { MangaDataService } from '../manga-data.service';
import { DbService } from '../db.service';
@Component({
  selector: 'app-search',
  standalone: true, // Modern Angular format
  imports: [
    CommonModule,   // Enables *ngIf, @for
    FormsModule,    // Enables [(ngModel)]
    
  ],
  templateUrl: './search.html',
  styleUrls: ['./search.css', '../shared-styles.css']
})
export class Search implements OnInit {
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  private platformId = inject(PLATFORM_ID);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private renderer = inject(Renderer2);
  private dbService = inject(DbService);
  private mangaDataService = inject(MangaDataService);

  // === UI State ===
  searchTerm = signal('');
  isDropdownOpen = signal(false);
  isEnlarged = signal(false);
  highestPanelRevealed = signal(1); // Start with panel 1 revealed
  isHintRevealed = signal(false);
  isLoading = signal(true);
  areImagesLoading = signal(true);
  guessResult = signal<'correct' | 'incorrect' | null>(null);
  isSubmitting = signal(false);
  isGameWon = signal(false);
  isGameLost = signal(false);
  isHistoricGame = signal(false);
  gameDateText = signal('');

  // === Image Panel State ===
  panelImages: SafeUrl[] = [];
  currentPanelUrl = signal<SafeUrl | ''>('');
  
  // === Data State ===
  fullItemList: Item[] = []; // Start with an empty list

  private gameHistory: HistoryEntry[] = [];
  private currentDateIndex = -1;
  selectedItem = signal<Item | undefined>(undefined);

  // Random Daily Manga
  randomDailyManga = signal<Item | undefined>(undefined);
  randomDailyMangaChapter = 0;

  /**
   * Computed signals to determine if navigation arrows should be disabled.
   */
  isFirstDay = computed(() => this.currentDateIndex <= 0);
  isLastDay = computed(() => {
    // The "last" playable day is the one before the final entry in our history list.
    // The final entry is reserved for the *next* day's game.
    // Since getGameHistory() already removes the "next day" entry, the last item is the current day.
    return this.currentDateIndex >= this.gameHistory.length - 1;
  });

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
    effect(() => {
      // By reading searchTerm(), we create a dependency.
      // This effect will now re-run whenever the search term changes.
      this.searchTerm();
    });

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
      const randomManga = this.randomDailyManga();
      if (randomManga) {
        const key = this.getStorageKey(randomManga.jp_title);
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
      const randomManga = this.randomDailyManga();
      if (randomManga && isPlatformBrowser(this.platformId)) {
        const hintKey = this.getHintCacheKey(randomManga.jp_title);
        const hintsToCache = {
          highestPanel: this.highestPanelRevealed(),
          isHintRevealed: this.isHintRevealed()
        };
        // Only save if at least one hint has been used to avoid empty cache items.
        if (hintsToCache.highestPanel > 1 || hintsToCache.isHintRevealed) {
          localStorage.setItem(hintKey, JSON.stringify(hintsToCache));
        }
      }
    });

  }

  ngOnInit() {
    // Check if we are playing a historical game from the URL parameter
    const gameDate = this.route.snapshot.paramMap.get('date');
    if (gameDate) {
      this.isHistoricGame.set(true);
    }

    forkJoin({
      mangaList: this.mangaDataService.getFullMangaList(),
      gameData: this.mangaDataService.getMangaPanelGame(gameDate),
      history: this.mangaDataService.getGameHistory()
    }).subscribe({
      next: ({ mangaList, gameData, history }) => {
        // 1. Set the full item list. The service now provides it pre-processed and sorted.
        this.fullItemList = mangaList;

        // 2. Find the full details for the daily manga from the main list.
        const dailyMangaDetails = this.fullItemList.find(item => item.jp_title === gameData.title);
        if (!dailyMangaDetails) {
          this.isLoading.set(false);
          return; // Stop processing if the daily manga can't be found
        }

        this.randomDailyManga.set(dailyMangaDetails);

        // The daily endpoint returns YYYY-MM-DD, but the history sheet uses MM/DD/YYYY.
        // Convert today's date to match the history format if it's not a historic game.
        let displayDate = gameData.date;
        if (!this.isHistoricGame()) {
          const [year, month, day] = gameData.date.split('-');
          displayDate = `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}`;
        }
        this.gameDateText.set(displayDate);

        // If we are on the current day's game, we need to ensure it's part of the history
        // list for correct pagination.
        let localHistory = [...history]; // Create a mutable copy to avoid modifying the cached service data.
        if (!this.isHistoricGame() && !localHistory.some(entry => entry.date === displayDate)) {
          localHistory.push({
            date: displayDate,
            title: dailyMangaDetails.title,
            jp_title: dailyMangaDetails.jp_title
          } as HistoryEntry);
        }
        // Ensure the history is sorted chronologically before finding the index.
        this.gameHistory = localHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        this.currentDateIndex = this.gameHistory.findIndex(entry => entry.date === displayDate);
        this.randomDailyMangaChapter = gameData.chapter;

        // Check if the game for today has already been won.
        if (isPlatformBrowser(this.platformId)) {
          const key = this.getStorageKey(gameData.title);
          const gameState = localStorage.getItem(key);
          if (gameState === 'won') {
            this.isGameWon.set(true);
            this.guessResult.set('correct');
            const lastGuessKey = this.getLastGuessCacheKey(gameData.title);
            const lastGuess = localStorage.getItem(lastGuessKey);
            if (lastGuess) {
              this.searchTerm.set(lastGuess);
            }
          } else if (gameState === 'lost') {
            this.isGameLost.set(true);
            this.guessResult.set('incorrect');
            const lastGuessKey = this.getLastGuessCacheKey(gameData.title);
            const lastGuess = localStorage.getItem(lastGuessKey);
            if (lastGuess) {
              this.searchTerm.set(lastGuess);
            }
          }

          // Load cached hints
          const hintKey = this.getHintCacheKey(dailyMangaDetails.jp_title);
          const cachedHints = localStorage.getItem(hintKey);
          if (cachedHints) {
            const hints = JSON.parse(cachedHints);
            if (hints.highestPanel) {
              this.highestPanelRevealed.set(hints.highestPanel);
            }
            if (hints.isHintRevealed) {
              this.isHintRevealed.set(hints.isHintRevealed);
            }
          }
        }
        
        // 3. Fetch the images for the daily manga.
        this.fetchMangaImagesDaily([gameData.img1, gameData.img2, gameData.img3]);
        // Turn off main loading indicator after initial data is fetched.
        // The image loader will have its own indicator.
        this.isLoading.set(false);
        console.log('Successfully fetched and processed all initial data.');
      },
      error: (err) => {
        console.error('Failed to fetch initial data:', err);
        this.isLoading.set(false);
      }
    });
  }

  /**
   * Navigates to the game history page.
   */
  navigateToHistory(): void {
    this.router.navigate(['/history']);
  }

  navigateToDay(offset: number): void {
    if (this.isLoading() || this.gameHistory.length === 0) return;

    const newIndex = this.currentDateIndex + offset;
    if (newIndex >= 0 && newIndex < this.gameHistory.length) {
      const newDate = this.gameHistory[newIndex].date;
      // Using navigateByUrl to force a full component reload for the new game date.
      // This is simpler than trying to manually reset all component state.
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate(['/game', newDate]);
      });
    }
  }

  /**
   * Selects an item, updates the input field, and closes the dropdown.
   * @param item The Item object to select.
   */
  selectItem(item: Item): void {
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

  toggleEnlarged(event: MouseEvent) {
    // Prevent click from bubbling up to the backdrop if it's already enlarged
    if (this.isEnlarged()) {
      event.stopPropagation();
    }
    this.isEnlarged.set(!this.isEnlarged());
  }

  /**
   * Changes the main manga panel image.
   * @param panelNumber The 1-based index of the panel to display.
   */
  showPanel(panelNumber: number): void {
    // Set the current panel URL based on the (0-based) index
    this.currentPanelUrl.set(this.panelImages[panelNumber - 1]);
    if (panelNumber > this.highestPanelRevealed()) {
      this.highestPanelRevealed.set(panelNumber);
    }
  }

  /**
   * Reveals the hint text.
   */
  showHint(): void {
    this.isHintRevealed.set(true);
  }

  /**
   * Clears the search term.
   */
  clearSearch(): void {
    this.searchTerm.set('');
  }

  /**
   * Checks if the user's selected manga matches the daily manga.
   */
  checkGuess(): void {
    if (!this.selectedItem() || !this.randomDailyManga() || this.isSubmitting()) {
      // Don't guess if nothing is selected, the game isn't ready, or a guess is in progress.
      return;
    }

    this.isSubmitting.set(true);

    try {
      if (this.selectedItem()?.title === this.randomDailyManga()?.title) {
        this.guessResult.set('correct');
        this.isGameWon.set(true);
        this.isGameLost.set(false);
        // Cache the correct guess
        if (isPlatformBrowser(this.platformId)) {
          const lastGuessKey = this.getLastGuessCacheKey(this.randomDailyManga()!.jp_title);
          localStorage.setItem(lastGuessKey, this.searchTerm());
        }
      } else {
        this.guessResult.set('incorrect');
        this.isGameLost.set(true);
        // Cache the incorrect guess
        if (isPlatformBrowser(this.platformId)) {
          const lastGuessKey = this.getLastGuessCacheKey(this.randomDailyManga()!.jp_title);
          localStorage.setItem(lastGuessKey, this.searchTerm());
        }
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  closePopup(): void {
    // If the game is won, we don't reset the state.
    // The popup will just close, but the inputs remain disabled if the game is over.
    this.guessResult.set(null); // Hide the popup
  }

  /**
   * Generates a unique key for localStorage based on the manga title.
   * @param title The title of the daily manga.
   */
  private getStorageKey(title: string): string {
    return `mangadle-gameState-${title}`;
  }

  /**
   * Generates a unique key for caching the last guess for a specific manga.
   */
  private getLastGuessCacheKey(title: string): string {
    return `mangadle-lastGuess-${title}`;
  }

  /**
   * Generates a unique key for caching hints for a specific manga.
   */
  private getHintCacheKey(title: string): string {
    return `mangadle-search-hints-${title}`;
  }

  private fetchMangaImagesDaily(imageUrls: string[]): void {    
    interface ImageResponse {
      data: string; // Base64 encoded image data
      mimetype: string;
      url: string;
      blob?: Blob; // Add optional blob property
    }
    this.areImagesLoading.set(true);
    
    const imageObservables: Observable<ImageResponse>[] = imageUrls.map(imageUrl => {
      // This observable will first try to get the image from IndexedDB,
      // and if it's not there, it will fetch it from the network.
      return new Observable(subscriber => {
        this.dbService.getImage(imageUrl).then(cachedBlob => {
          if (cachedBlob) {
            // If we have a cached blob, we're done.
            subscriber.next({ data: '', mimetype: cachedBlob.type, url: imageUrl, blob: cachedBlob });
            subscriber.complete();
          } else {
            // If not in cache, fetch from the network proxy.
            const networkUrl = `https://script.google.com/macros/s/AKfycbyQrKZxxXP_6A_CG5zpY4uhPr7nlOu5ILZNBi9hN_rv8p2UL91eIpRM4vGI8rjUeWx5/exec?url=${encodeURIComponent(imageUrl)}`;
            this.http.get<ImageResponse>(networkUrl).subscribe({
              next: res => {
                const imageBlob = this.b64toBlob(res.data, res.mimetype);
                // Store the new blob in IndexedDB for next time.
                this.dbService.setImage(imageUrl, imageBlob);
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
        this.panelImages = responses.map(res => {
          // Create a temporary URL for the blob to display in the <img> tag.
          const objectUrl = URL.createObjectURL(res.blob!);
          return this.sanitizer.bypassSecurityTrustUrl(objectUrl);
        });

        this.currentPanelUrl.set(this.panelImages[0]); // Set the first image as current.
        console.log('Successfully loaded all daily manga images (from cache or network).');
      },
      error: (err) => {
        console.error('Failed to fetch one or more daily manga images from IndexedDB or network:', err);
      },
    }).add(() => {
      // Turn off image-specific loading indicator.
      this.areImagesLoading.set(false);
    });
  }

  private clearOldCache(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    console.warn('Clearing old Mangadle cache to free up space.');
    Object.keys(localStorage).forEach(key => {
      // Clear game state, but not the dark mode preference or the full item list
      if (key.startsWith('mangadle-gameState-') || key.startsWith('mangadle-lastGuess-') || key.startsWith('mangadle-search-hints-')) {
        localStorage.removeItem(key);
      }
    });
  }

  /**
   * Converts a Base64 string to a Blob object.
   */
  private b64toBlob(b64Data: string, contentType = '', sliceSize = 512): Blob {
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
