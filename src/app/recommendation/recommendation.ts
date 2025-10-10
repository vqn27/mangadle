import { Component, signal, computed, inject, OnInit, effect, PLATFORM_ID, Renderer2 } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Item, Recommendations, baseRandomRec } from '../item.model';


@Component({
  selector: 'app-recommendation',
  standalone: true, // Modern Angular format
  imports: [
    CommonModule,   // Enables *ngIf, @for
    FormsModule     // Enables [(ngModel)]
  ],
  templateUrl: './recommendation.html',
  styleUrls: ['./recommendation.css']
})
export class Recommendation implements OnInit {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private sanitizer = inject(DomSanitizer);
  private renderer = inject(Renderer2);

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
  private fetchMangaData(): void {
    const fullListCacheKey = 'mangadle-fullItemList';
    let fullListObservable: Observable<Item[]>;

    if (isPlatformBrowser(this.platformId)) {
      const cachedFullList = localStorage.getItem(fullListCacheKey);
      if (cachedFullList) {
        console.log('Loading full manga list from cache for recommendations.');
        fullListObservable = of(JSON.parse(cachedFullList));
      } else {
        console.log('Fetching full manga list from network for recommendations.');
        const dataUrl = 'https://script.google.com/macros/s/AKfycbxgs6-WDBwD5JfLlUHIYfseS3MoQI6wqWBzS4aizs5N7kx7GhilrfB5sdmEpU9f_XD3/exec?action=data';
        fullListObservable = this.http.get<Item[]>(dataUrl).pipe(
          tap(data => localStorage.setItem(fullListCacheKey, JSON.stringify(data)))
        );
      }
    } else {
      const dataUrl = 'https://script.google.com/macros/s/AKfycbxgs6-WDBwD5JfLlUHIYfseS3MoQI6wqWBzS4aizs5N7kx7GhilrfB5sdmEpU9f_XD3/exec?action=data';
      fullListObservable = this.http.get<Item[]>(dataUrl);
    }

    const reccsUrl = 'https://script.google.com/macros/s/AKfycbxgs6-WDBwD5JfLlUHIYfseS3MoQI6wqWBzS4aizs5N7kx7GhilrfB5sdmEpU9f_XD3/exec?action=dailyReccs';

    forkJoin({
      fullList: fullListObservable,
      dailyReccs: this.http.get<any>(reccsUrl)
    }).subscribe({
      next: ({ fullList, dailyReccs }) => {
        // Create a dictionary mapping jp_title to eng_title from the full list
        this.titleMap = fullList.reduce((acc, item) => {
          if (item.jp_title && item.eng_title && item.eng_title !== 'N/A') {
            acc[item.jp_title] = item.eng_title;
          }
          return acc;
        }, {} as { [jp_title: string]: string });

        // Process the manga list to use a single, consistent title property.
        const processedList = fullList.map(item => ({
          ...item,
          title: (item.eng_title && item.eng_title !== 'N/A') ? item.eng_title : item.jp_title
        }));

        // Set the full item list, sorted alphabetically by the display title.
        this.fullItemList = processedList.sort((a, b) => a.title.localeCompare(b.title));

        // Find the base manga in the processed list to get its proper display title
        const baseMangaFromList = processedList.find(item => item.jp_title === dailyReccs.base_title || item.eng_title === dailyReccs.base_title);
        const displayTitle = baseMangaFromList ? baseMangaFromList.title : dailyReccs.base_title;

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
          } else if (gameState === 'lost') {
            this.isGameLost.set(true);
            this.guessResult.set('incorrect');
          }
        }

        let recommendationsToSet: Recommendations[] = [];

        // Check for cached recommendations for the current base title
        if (isPlatformBrowser(this.platformId)) {
          const cacheKey = `reccs-${dailyReccs.base_title}`;
          const cachedReccs = localStorage.getItem(cacheKey);
          if (cachedReccs) {
            recommendationsToSet = JSON.parse(cachedReccs);
            console.log(`Successfully loaded CACHED recommendations based on: ${this.randomManga()}`);
          }
        }

        // If no cached recommendations, create them from the fetched data
        if (recommendationsToSet.length === 0) {
          for (let i = 1; i <= 12; i++) { // Assuming up to 12 recommendations
            const jp_title = dailyReccs[`rec_title_${i}`];
            const imageUrl = dailyReccs[`rec_image_url_${i}`];
            const synopsis = dailyReccs[`rec_synopsis_${i}`];

            // Use the title map to find the English title, otherwise use the Japanese title
            const title = (jp_title && this.titleMap[jp_title]) ? this.titleMap[jp_title] : jp_title;
            
            if (title && imageUrl && synopsis) {
              recommendationsToSet.push({ title, imageUrl, synopsis }); 
            }
          }

          // Save the newly created recommendations to the cache
          if (isPlatformBrowser(this.platformId)) {
            const cacheKey = `reccs-${dailyReccs.base_title}`;
            localStorage.setItem(cacheKey, JSON.stringify(recommendationsToSet));
          }
          console.log(`Successfully fetched and cached new recommendations based on: ${this.randomManga()?.title}`);
        }

        // Set the recommendations and fetch their images
        this.recommendations.set(recommendationsToSet);
        this.fetchRecommendationImages();
      },
      error: (err) => {
        console.error('Failed to fetch data from Google Apps Script. This could be a CORS issue if the script is not configured for public JSON access.', err);
        this.isLoading.set(false);
      }
    }).add(() => this.isLoading.set(false));
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
      } else {
        this.guessResult.set('incorrect');
        this.isGameLost.set(true);
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
   * Fetches full manga details from the Jikan API by its ID.
   * @param id The Jikan manga ID.
   */
  private getMangaFullById(rec_id: number): void {
    const url = `https://api.jikan.moe/v4/manga/${rec_id}/full`;
    this.http.get<any>(url).subscribe({
      next: (response) => {
        const synopsis = response.data.synopsis;
        this.recommendations.update(recs => 
          recs.map(rec => rec.rec_id === rec_id ? { ...rec, synopsis } : rec)
        );
        console.log(`Successfully fetched synopsis for manga ID: ${rec_id}`);
      },
      error: (err) => {
        console.error(`Failed to fetch full details for manga ID: ${rec_id}`, err);
      }
    });
  }

  private fetchRecommendationImages(): void {
    interface ImageResponse {
      data: string; // Base64 encoded image data
      mimetype: string;
      url: string;
    }
    this.areImagesLoading.set(true);

    const imageObservables: Observable<ImageResponse>[] = this.recommendations().map(rec => {
      const imageUrl = rec.imageUrl;
      if (isPlatformBrowser(this.platformId)) {
        const cachedImage = localStorage.getItem(imageUrl);
        if (cachedImage) {
          return of(JSON.parse(cachedImage));
        }
      }
      const url = `https://script.google.com/macros/s/AKfycbxgs6-WDBwD5JfLlUHIYfseS3MoQI6wqWBzS4aizs5N7kx7GhilrfB5sdmEpU9f_XD3/exec?url=${encodeURIComponent(imageUrl)}`;
      return this.http.get<ImageResponse>(url);
    });

    forkJoin(imageObservables).subscribe({
      next: (responses) => {
        const updatedRecs = this.recommendations().map((rec, index) => {
          const res = responses[index];
          // Save to cache if it wasn't there before
          if (isPlatformBrowser(this.platformId)) {
            if (!localStorage.getItem(rec.imageUrl)) {
              localStorage.setItem(rec.imageUrl, JSON.stringify(res));
            }
          }
          const imageBlob = this.b64toBlob(res.data, res.mimetype);
          const objectUrl = URL.createObjectURL(imageBlob);
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