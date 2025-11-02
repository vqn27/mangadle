import { Component, signal, computed, inject, OnInit, PLATFORM_ID, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Item, Character, LeastPopularData } from '../item.model';
import { forkJoin } from 'rxjs';
import { MangaDataService } from '../manga-data.service';

@Component({
  selector: 'app-least-popular',
  standalone: true, // Modern Angular format
  imports: [
    CommonModule,   // Enables *ngIf, @for
    FormsModule     // Enables [(ngModel)]
  ],
  templateUrl: './least-popular.html',
  styleUrls: ['./least-popular.css', '../shared-styles.css']
})
export class LeastPopularComponent implements OnInit {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private mangaDataService = inject(MangaDataService);

  // === UI State ===
  searchTerm = signal('');
  isDropdownOpen = signal(false);
  isHintRevealed = signal(false);
  isLoading = signal(true);

  // === Game State ===
  guessResult = signal<'correct' | 'incorrect' | null>(null);
  isSubmitting = signal(false);
  isGameWon = signal(false);
  isGameLost = signal(false);

  // === Data State ===
  fullItemList: Item[] = []; // Start with an empty list

  selectedItem = signal<Item | undefined>(undefined);

  // Game-specific data
  dailyData = signal<LeastPopularData | undefined>(undefined);

  // State for unblurring character images
  unblurredStates = signal<{ [key: number]: boolean }>({});

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
    // Effect to save the game state to localStorage when the game is won or lost.
    effect(() => {
      const dailyData = this.dailyData();
      if (dailyData) {
        const key = this.getStorageKey(dailyData.baseTitle);
        if (isPlatformBrowser(this.platformId) && key) {
          if (this.isGameWon()) {
            localStorage.setItem(key, 'won');
          } else if (this.isGameLost()) {
            localStorage.setItem(key, 'lost');
          }
        }
      }
    });

    // Effect to save unblurred states to localStorage.
    effect(() => {
      const dailyData = this.dailyData();
      const states = this.unblurredStates(); // Read the signal to create a dependency
      // Check if unblurredStates is not empty before saving
      if (dailyData && Object.keys(states).length > 0 && isPlatformBrowser(this.platformId)) {
        const hintKey = this.getHintCacheKey(dailyData.baseTitle);
        localStorage.setItem(hintKey, JSON.stringify(states));
      }
    });
  }

  ngOnInit() {
    this.fetchMangaData();
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
   * Marks a specific character image as unblurred.
   */
  unblurImage(index: number): void {
    this.unblurredStates.update(states => ({ ...states, [index]: true }));
  }

  /**
   * Checks if the user's selected manga matches the daily manga.
   */
  checkGuess(): void {
    if (!this.selectedItem() || !this.dailyData() || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);

    try {
      if (this.selectedItem()?.title === this.dailyData()?.baseTitle) {
        this.guessResult.set('correct');
        this.isGameWon.set(true);
        // Cache the correct guess
        if (isPlatformBrowser(this.platformId)) {
          const lastGuessKey = this.getLastGuessCacheKey(this.dailyData()!.baseTitle);
          localStorage.setItem(lastGuessKey, this.searchTerm());
        }
      } else {
        this.guessResult.set('incorrect');
        this.isGameLost.set(true);
        // Cache the incorrect guess
        if (isPlatformBrowser(this.platformId)) {
          const lastGuessKey = this.getLastGuessCacheKey(this.dailyData()!.baseTitle);
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
    this.guessResult.set(null); // Just hide the popup
  }

  /**
   * Generates a unique key for localStorage based on the manga title.
   */
  private getStorageKey(title: string): string {
    return `mangadle-least-popular-gameState-${title}`;
  }

  /**
   * Generates a unique key for caching the last guess for a specific manga.
   */
  private getLastGuessCacheKey(title: string): string {
    return `mangadle-least-popular-lastGuess-${title}`;
  }

  /**
   * Generates a unique key for caching hints for a specific manga.
   */
  private getHintCacheKey(title: string): string {
    return `mangadle-least-popular-hints-${title}`;
  }

  /**
   * Fetches data from the Google Apps Script URL.
   */
  private fetchMangaData(): void {
    forkJoin({
      fullList: this.mangaDataService.getFullMangaList(),
      dailyData: this.mangaDataService.getLeastPopularGame()
    }).subscribe({
      next: ({ fullList, dailyData }) => {
        // 1. Process the manga list to use a single, consistent title property.
        const processedList = fullList.map(item => ({
          ...item,
          title: (item.eng_title && item.eng_title !== 'N/A') ? item.eng_title : item.jp_title
        }));
        const sortedData = processedList.sort((a, b) => a.title.localeCompare(b.title));
        this.fullItemList = sortedData;

        const baseTitle = (dailyData as any).base_title;
        const baseMangaFromList = processedList.find(item => item.jp_title === baseTitle || item.eng_title === baseTitle);
        const displayTitle = baseMangaFromList ? baseMangaFromList.title : dailyData.baseTitle;

        // 2. Process the daily character data
        const characters: Character[] = [];
        for (let i = 1; i <= 5; i++) { // Assuming up to 5 characters
          if ((dailyData as any)[`char_name_${i}`]) {
            characters.push({
              id: (dailyData as any)[`char_id_${i}`],
              name: (dailyData as any)[`char_name_${i}`],
              favorites: (dailyData as any)[`char_favorites_${i}`],
              imageUrl: (dailyData as any)[`char_image_url_${i}`]
            });
          }
        }

        this.dailyData.set({
          baseTitle: displayTitle,
          baseId: dailyData.baseId,
          characters: characters
        });

        // 3. Check for cached game state
        if (isPlatformBrowser(this.platformId)) {
          const key = this.getStorageKey(displayTitle);
          const gameState = localStorage.getItem(key);
          if (gameState === 'won') {
            this.isGameWon.set(true);
            this.guessResult.set('correct');
          } else if (gameState === 'lost') {
            this.isGameLost.set(true);
            this.guessResult.set('incorrect');
          }

          // Load last guess if game is over
          if (gameState) {
            const lastGuessKey = this.getLastGuessCacheKey(displayTitle);
            const lastGuess = localStorage.getItem(lastGuessKey);
            if (lastGuess) this.searchTerm.set(lastGuess);
          }

          // Load cached unblurred states
          const hintKey = this.getHintCacheKey(displayTitle);
          const cachedUnblurredStates = localStorage.getItem(hintKey);
          if (cachedUnblurredStates) {
            this.unblurredStates.set(JSON.parse(cachedUnblurredStates));
          }
        }

        console.log('Successfully fetched and processed data for least-popular game.');
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch least-popular data from Google Apps Script. This could be a CORS issue if the script is not configured for public JSON access.', err);
        this.isLoading.set(false);
      }
    });
  }
}