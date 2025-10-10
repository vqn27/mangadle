import { Component, signal, computed, inject, OnInit, effect, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, Observable } from 'rxjs';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Item } from '../item.model';

@Component({
  selector: 'app-search',
  standalone: true, // Modern Angular format
  imports: [
    CommonModule,   // Enables *ngIf, @for
    FormsModule     // Enables [(ngModel)]
  ],
  templateUrl: './search.html',
  styleUrls: ['./search.css']
})
export class Search implements OnInit {
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  private platformId = inject(PLATFORM_ID);

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
  guessIncorrect = signal(false);

  // === Image Panel State ===
  panelImages: SafeUrl[] = [];
  currentPanelUrl = signal<SafeUrl | ''>('');
  
  // === Data State ===
  fullItemList: Item[] = []; // Start with an empty list

  selectedItem = signal<Item | undefined>(undefined);

  // Random Daily Manga
  randomDailyManga = signal<Item | undefined>(undefined);
  randomDailyMangaChapter = 0;

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
      // When the user types, reset the incorrect guess state.
      this.guessIncorrect.set(false);
    });

    // Effect to save the game state to localStorage when the game is won.
    effect(() => {
      if (this.isGameWon() && this.randomDailyManga()) {
        const key = this.getStorageKey(this.randomDailyManga()!.title);
        if (isPlatformBrowser(this.platformId) && key) {
          localStorage.setItem(key, 'won');
        }
      }
    });

  }

  ngOnInit() {
    // Use forkJoin to fetch both the full manga list and the daily manga info in parallel.
    // This ensures we have all the data we need before trying to process it.
    forkJoin({
      mangaList: this.http.get<Item[]>('https://script.google.com/macros/s/AKfycbxgs6-WDBwD5JfLlUHIYfseS3MoQI6wqWBzS4aizs5N7kx7GhilrfB5sdmEpU9f_XD3/exec?action=data'),
      dailyManga: this.http.get<any>('https://script.google.com/macros/s/AKfycbxgs6-WDBwD5JfLlUHIYfseS3MoQI6wqWBzS4aizs5N7kx7GhilrfB5sdmEpU9f_XD3/exec?action=daily')
    }).subscribe({
      next: ({ mangaList, dailyManga }) => {
        
        // 1. Process the manga list to use a single, consistent title property.
        const processedList = mangaList.map(item => {
          const displayTitle = (item.eng_title && item.eng_title !== 'N/A') ? item.eng_title : item.title;
          return { ...item, title: displayTitle };
        });

        // 2. Set the full item list, sorted alphabetically by the display title.
        this.fullItemList = processedList.sort((a, b) => a.title.localeCompare(b.title));

        // 3. Find the full details for the daily manga from the main list.
        const titleToFind = (dailyManga.eng_title && dailyManga.eng_title !== "N/A") ? dailyManga.eng_title : dailyManga.title;
        const dailyMangaDetails = this.fullItemList.find(item => item.title === titleToFind);
        this.randomDailyManga.set(dailyMangaDetails);
        this.randomDailyMangaChapter = dailyManga.chapter;

        // Check if the game for today has already been won.
        if (isPlatformBrowser(this.platformId)) {
          const key = this.getStorageKey(dailyManga.title);
          const gameState = localStorage.getItem(key);
          if (gameState === 'won') {
            this.isGameWon.set(true);
            this.guessResult.set('correct'); // Show the success popup immediately
          } else if (gameState === 'lost') {
            this.guessIncorrect.set(true);
            this.guessResult.set('incorrect'); // Show the incorrect popup immediately
          }
        }

        console.log('Daily manga for today:', this.randomDailyManga());
        
        // 4. Fetch the images for the daily manga.
        this.fetchMangaImagesDaily([dailyManga.img1, dailyManga.img2, dailyManga.img3]);
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
        this.guessIncorrect.set(false);
      } else {
        this.guessResult.set('incorrect');
        this.guessIncorrect.set(true);
        // Set the 'lost' state in localStorage directly on an incorrect guess.
        const key = this.getStorageKey(this.randomDailyManga()!.title);
        if (isPlatformBrowser(this.platformId) && key) {
          localStorage.setItem(key, 'lost');
        }
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  closePopup(): void {
    // If the game is won, we don't reset the state.
    // The popup will just close, but the inputs remain disabled.
    if (this.isGameWon()) {
      this.guessResult.set(null); // Just hide the popup
      return;
    }
    // If the guess was incorrect, reset for the next attempt.
    this.resetForNextGuess();
  }

  private resetForNextGuess(): void {
    this.guessResult.set(null); // Hide the popup
  }

  /**
   * Generates a unique key for localStorage based on the manga title.
   * @param title The title of the daily manga.
   */
  private getStorageKey(title: string): string {
    return `mangadle-gameState-${title}`;
  }

  private fetchMangaImagesDaily(imageUrls: string[]): void {    
    interface ImageResponse {
      data: string; // Base64 encoded image data
      mimetype: string;
      url: string;
    }
    this.areImagesLoading.set(true);
    
    const imageObservables: Observable<ImageResponse>[] = imageUrls.map(imageUrl => {
      if (isPlatformBrowser(this.platformId)) {
        const cachedImage = localStorage.getItem(imageUrl);
        if (cachedImage) {
          // If image is in cache, return it as an observable
          return of(JSON.parse(cachedImage));
        }
      }

      // If not in cache or not in browser, fetch it
      const url = `https://script.google.com/macros/s/AKfycbxgs6-WDBwD5JfLlUHIYfseS3MoQI6wqWBzS4aizs5N7kx7GhilrfB5sdmEpU9f_XD3/exec?url=${encodeURIComponent(imageUrl)}`;
      return this.http.get<ImageResponse>(url);
    });

    forkJoin(imageObservables).subscribe({
      next: (responses) => {
        this.panelImages = responses.map((res, index) => {
          // Save to cache if it wasn't there before
          if (isPlatformBrowser(this.platformId)) {
            const originalUrl = imageUrls[index];
            if (!localStorage.getItem(originalUrl)) {
              try {
                localStorage.setItem(originalUrl, JSON.stringify(res));
              } catch (e) {
                console.error('Failed to cache image. Storage may be full.', e);
                // Clear old game data if storage is full
                if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                  this.clearOldCache();
                  // We don't retry caching in this same cycle to avoid loops
                }
              }
            }
          }

          // Convert Base64 to a safe URL
          const imageBlob = this.b64toBlob(res.data, res.mimetype);
          const objectUrl = URL.createObjectURL(imageBlob);
          return this.sanitizer.bypassSecurityTrustUrl(objectUrl);
        });

        this.currentPanelUrl.set(this.panelImages[0]); // Set the first image as current.
        console.log('Successfully loaded all daily manga images (from cache or network).');
      },
      error: (err) => {
        console.error('Failed to fetch one or more daily manga images:', err);
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
      // Clear game state and image caches, but not the dark mode preference
      if (key.startsWith('mangadle-gameState-') || key.startsWith('http')) {
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
