import { Component, signal, computed, inject, OnInit, PLATFORM_ID, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Item, Character, TraitsData } from '../item.model';
import { forkJoin } from 'rxjs';
import { MangaDataService } from '../manga-data.service';

@Component({
  selector: 'app-traits',
  standalone: true,
  imports: [
    CommonModule,   // Enables *ngIf, @for
    FormsModule     // Enables [(ngModel)]
  ],
  templateUrl: './traits.html',
  styleUrls: ['./traits.css', '../shared-styles.css']
})
export class TraitsComponent implements OnInit {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private mangaDataService = inject(MangaDataService);

  // === UI State ===
  searchTerm = signal('');
  isDropdownOpen = signal(false);
  isHintRevealed = signal(false);
  isSourceHintRevealed = signal(false);
  isImageUnblurred = signal(false);
  isLoading = signal(true);

  // === Game State ===
  guessResult = signal<'correct' | 'incorrect' | null>(null);
  isSubmitting = signal(false);
  isGameWon = signal(false);
  isGameLost = signal(false);

  // === Data State ===
  characterNameList: string[] = []; // List of all character names for the dropdown

  selectedCharacter = signal<string | undefined>(undefined);

  // Game-specific data
  dailyData = signal<TraitsData | undefined>(undefined);

  // State for unblurring tags
  unblurredTags = signal<{ [key: number]: boolean }>({});

  /**
   * Computed signal to filter the list in real-time based on the searchTerm.
   */
  filteredItemList = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    
    // If no term, show all items (for browsing)
    if (!term) {
      return this.characterNameList;
    }
    
    // Filter by name
    return this.characterNameList.filter(name => 
      name.toLowerCase().includes(term)
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

    // Effect to save unblurred tags to localStorage.
    effect(() => {
      const dailyData = this.dailyData();
      // Read signals to create a dependency
      const tags = this.unblurredTags();
      const imageUnblurred = this.isImageUnblurred();
      const sourceRevealed = this.isSourceHintRevealed();

      const hintsToCache = {
        unblurredTags: tags,
        isImageUnblurred: imageUnblurred,
        isSourceHintRevealed: sourceRevealed,
      };

      if (dailyData && (Object.keys(tags).length > 0 || imageUnblurred || sourceRevealed) && isPlatformBrowser(this.platformId)) {
        const hintKey = this.getHintCacheKey(dailyData.baseTitle);
        localStorage.setItem(hintKey, JSON.stringify(hintsToCache));
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
  selectCharacter(name: string): void {
    this.selectedCharacter.set(name);
    this.searchTerm.set(name); // Set the input value to the selected name
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
   * Reveals the source title hint.
   */
  showSourceHint(): void {
    this.isSourceHintRevealed.set(true);
  }

  /**
   * Unblurs the character image when clicked.
   */
  unblurImage(): void {
    this.isImageUnblurred.set(true);
  }

  /**
   * Marks a specific tag as unblurred.
   */
  unblurTag(index: number): void {
    this.unblurredTags.update(states => ({ ...states, [index]: true }));
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
    if (!this.selectedCharacter() || !this.dailyData() || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);

    try {
      if (this.selectedCharacter() === this.dailyData()?.characterName) {
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
    return `mangadle-traits-gameState-${title}`;
  }

  /**
   * Generates a unique key for caching the last guess for a specific manga.
   */
  private getLastGuessCacheKey(title: string): string {
    return `mangadle-traits-lastGuess-${title}`;
  }

  /**
   * Generates a unique key for caching hints for a specific manga.
   */
  private getHintCacheKey(title: string): string {
    return `mangadle-traits-hints-${title}`;
  }

  /**
   * Fetches data from the Google Apps Script URL.
   */
  private fetchMangaData(): void {
    forkJoin({
      characterNames: this.mangaDataService.getCharacterNames(),
      dailyData: this.mangaDataService.getTraitsGame()
    }).subscribe({
      next: ({ characterNames, dailyData }) => {
        // 1. Set the character name list for the dropdown
        this.characterNameList = characterNames;

        // 2. Parse the incoming daily data and map it to the TraitsData interface
        const rawData = dailyData as any;
        
        // The manga title is in a stringified array, e.g., "['Joukamachi no Dandelion']"
        // We remove the surrounding [' and '] to get the full title, which may contain commas.
        // To handle this safely, we convert it to a real array and take the first element.
        const parseStringifiedArray = (str: string): string[] => { // This will be used for manga, anime, and tags
          if (!str || str.length <= 2) return [];
          
          // Use a regex to find everything between the first pair of double quotes.
          let match = str.match(/"(.*?)"/);
          if (match && match[1]) {
            return [match[1]];
          }
          
          // If no double quotes, fall back to finding everything between the first pair of single quotes.
          match = str.match(/'(.*?)'/);
          return match && match[1] ? [match[1]] : [];
        };
        const mangaTitles = parseStringifiedArray(rawData.manga);
        const animeTitles = parseStringifiedArray(rawData.anime);

        // Safely get the first title, or an empty string if the array is empty.
        const mangaTitleRaw = mangaTitles[0] || ''; // Use the first title found
        const animeTitleRaw = animeTitles[0] || '';

        const displayTitle = mangaTitleRaw;

        // The traits are in a stringified array, e.g., "['Tag1', 'Tag2']"
        const parseTagsArray = (str: string): string[] => {
          if (!str || str.length <= 2) return [];
          // This regex finds all strings enclosed in single quotes.
          const matches = str.match(/'([^']*)'/g);
          if (!matches) return [];
          // For each match, remove the surrounding quotes to get the clean tag.
          return matches.map(match => match.substring(1, match.length - 1));
        };
        const parsedTags = parseTagsArray(rawData.tags);

        this.dailyData.set({
          baseTitle: displayTitle,
          baseId: rawData.id, // Character ID from the data
          characterName: rawData['names_(proper)'],
          hairColor: rawData.hair_color,
          gender: rawData.gender,
          picture: rawData.picture,
          animeTitle: animeTitleRaw,
          tags: parsedTags
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

          // Load cached unblurred tag states
          const hintKey = this.getHintCacheKey(displayTitle);
          const cachedUnblurredStates = localStorage.getItem(hintKey);
          if (cachedUnblurredStates) { 
            const hints = JSON.parse(cachedUnblurredStates);
            if (hints.unblurredTags) {
              this.unblurredTags.set(hints.unblurredTags);
            }
            if (hints.isImageUnblurred) {
              this.isImageUnblurred.set(hints.isImageUnblurred);
            }
            if (hints.isSourceHintRevealed) {
              this.isSourceHintRevealed.set(hints.isSourceHintRevealed);
            }
          }
        }

        console.log('Successfully fetched and processed data for traits game.');
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch traits data from Google Apps Script.', err);
        this.isLoading.set(false);
      }
    });
  }
}