import { Component, signal, computed, inject, OnInit, PLATFORM_ID, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Item, Character, TraitsData, HistoryEntry } from '../item.model';
import { forkJoin } from 'rxjs';
import { LoadingService } from '../loading.service';
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
  private platformId = inject(PLATFORM_ID);
  private mangaDataService = inject(MangaDataService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private loadingService = inject(LoadingService);

  // === UI State ===
  searchTerm = signal('');
  isDropdownOpen = signal(false);
  isHintRevealed = signal(false);
  isSourceHintRevealed = signal(false);
  isImageUnblurred = signal(false);
  isLoading = signal(true);
  isHistoricGame = signal(false);
  gameDateText = signal('');

  // === Game State ===
  guessResult = signal<'correct' | 'incorrect' | null>(null);
  isSubmitting = signal(false);
  isGameWon = signal(false);
  isGameLost = signal(false);
  private gameHistory: HistoryEntry[] = [];
  private currentDateIndex = -1;

  // === Data State ===
  characterNameList: string[] = []; // List of all character names for the dropdown

  selectedCharacter = signal<string | undefined>(undefined);

  // Game-specific data
  dailyData = signal<TraitsData | undefined>(undefined);

  // State for unblurring tags
  unblurredTags = signal<{ [key: number]: boolean }>({});

  /**
   * Computed signal to check if all trait tags have been revealed.
   */
  allTagsUnblurred = computed(() => {
    const data = this.dailyData();
    if (!data?.tags || data.tags.length <= 1) {
      return true; // If there are no tags to unblur.
    }
    // The first tag is always visible, so we check against `length - 1`.
    return Object.keys(this.unblurredTags()).length >= data.tags.length - 1;
  });

  /**
   * Computed signals to determine if navigation arrows should be disabled.
   */
  isFirstDay = computed(() => this.currentDateIndex === 0);
  isLastDay = computed(() => this.currentDateIndex >= this.gameHistory.length - 1);

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
        const key = this.getStorageKey(dailyData.characterName);
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
        const hintKey = this.getHintCacheKey(dailyData.characterName);
        localStorage.setItem(hintKey, JSON.stringify(hintsToCache));
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

  navigateToHistory(): void {
    this.router.navigate(['/history-traits']);
  }

  navigateToDay(offset: number): void {
    if (this.isLoading() || this.gameHistory.length === 0) return;

    const newIndex = this.currentDateIndex + offset;
    if (newIndex >= 0 && newIndex < this.gameHistory.length) {
      const newDate = this.gameHistory[newIndex].date;
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate(['/traits', newDate]);
      });
    }
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
          const lastGuessKey = this.getLastGuessCacheKey(this.dailyData()!.characterName);
          localStorage.setItem(lastGuessKey, this.searchTerm());
        }
      } else {
        this.guessResult.set('incorrect');
        this.isGameLost.set(true);
        // Cache the incorrect guess
        if (isPlatformBrowser(this.platformId)) {
          const lastGuessKey = this.getLastGuessCacheKey(this.dailyData()!.characterName);
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
  private getStorageKey(characterName: string): string {
    return `mangadle-traits-gameState-${characterName}`;
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
  private getHintCacheKey(characterName: string): string {
    return `mangadle-traits-hints-${characterName}`;
  }

  /**
   * Fetches data from the Google Apps Script URL.
   */
  private fetchMangaData(gameDate: string | null): void {
    this.loadingService.isGameLoading.set(true);
    forkJoin({
      characterNames: this.mangaDataService.getCharacterNames(),
      dailyData: this.mangaDataService.getTraitsGame(gameDate),
      history: this.mangaDataService.getTraitsHistory()
    }).subscribe({
      next: ({ characterNames, dailyData, history }) => {
        if (!dailyData) {
          this.isLoading.set(false);
          return; // Exit if there's no data to process
        }
        // 1. Set the character name list for the dropdown
        this.characterNameList = characterNames.sort((a, b) => a.localeCompare(b));

        // The daily game data from the Apps Script URL might have a different structure
        // than the historical data from the sheet. We normalize it here.
        const gameData = this.normalizeTraitsData(dailyData);
        this.dailyData.set(gameData);
        console.log('Fetched daily traits game data:', gameData);

        const today = new Date();
        const todayFormatted = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
        let displayDate: string;

        if (this.isHistoricGame()) {
          displayDate = gameDate!;
        } else {
          // Find today's game in the history list to get its formatted date string
          const todayInHistory = history.find(h => h.title === gameData.characterName);
          displayDate = todayInHistory ? todayInHistory.date : todayFormatted;
        }
        this.gameDateText.set(displayDate);

        // Ensure today's game is in the history list for navigation, even if the sheet hasn't updated.
        // This needs to run for both historic and current day views to allow navigating to today.
        let localHistory = [...history];
        const todayInHistory = history.find(h => h.date === todayFormatted);
        if (!todayInHistory) {
          localHistory.push({
            date: todayFormatted,
            title: gameData.characterName,
            jp_title: gameData.baseTitle, // The source manga
            // Add other required properties for HistoryEntry to be safe
            image: '', score: 0, popularity: 0, gameMode: 'Traits'
          } as HistoryEntry);
        }

        // Sort history and find current game index for navigation
        const sortedHistory = localHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());;
        this.gameHistory = sortedHistory;
        this.currentDateIndex = sortedHistory.findIndex(entry => entry.date === displayDate);

        // 3. Check for cached game state
        if (isPlatformBrowser(this.platformId)) {
          const key = this.getStorageKey(gameData.characterName);
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
            const lastGuessKey = this.getLastGuessCacheKey(gameData.characterName);
            const lastGuess = localStorage.getItem(lastGuessKey);
            if (lastGuess) this.searchTerm.set(lastGuess);
          }

          // Load cached unblurred tag states
          const hintKey = this.getHintCacheKey(gameData.characterName);
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
        this.loadingService.isGameLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch traits data from Google Apps Script.', err);
        this.isLoading.set(false);
        this.loadingService.isGameLoading.set(false);
      }
    });
  }

  /**
   * Normalizes the data structure for the traits game, as the daily endpoint
   * may return a different format (e.g., stringified arrays) than the historical data.
   */
  private normalizeTraitsData(data: any): TraitsData {
    const parseStringifiedTitle = (str: string): string => {
      if (!str || str.length <= 2) return str;

      // Use a regex to find everything between the first pair of double quotes.
      let match = str.match(/"(.*?)"/);
      if (match && match[1]) {
        return match[1];
      }

      // If no double quotes, fall back to finding everything between the first pair of single quotes.
      match = str.match(/'(.*?)'/);
      if (match && match[1]) {
        return match[1];
      }

      return str;
    };

    const parseStringifiedTags = (str: string): string[] => {
      if (!str) return [];
      const matches = str.match(/'([^']*)'/g);
      return matches ? matches.map(match => match.substring(1, match.length - 1)) : [];
    };

    // Historical data has pre-parsed tags (an array), daily data has a string.
    const tags = Array.isArray(data.tags) ? data.tags : parseStringifiedTags(data.tags);

    // Historical data uses `baseTitle`, daily uses `manga`. Both might be stringified.
    const baseTitleRaw = data.baseTitle || data.manga;
    const animeTitleRaw = data.animeTitle || data.anime;

    return {
      // Apply the title parsing to whichever title property exists.
      baseTitle: parseStringifiedTitle(baseTitleRaw),
      animeTitle: parseStringifiedTitle(animeTitleRaw),
      baseId: data.baseId || data.id,
      characterName: data.characterName || data['names_(proper)'],
      hairColor: data.hairColor || data.hair_color,
      gender: data.gender,
      picture: data.picture,
      tags: tags
    };
  }
}