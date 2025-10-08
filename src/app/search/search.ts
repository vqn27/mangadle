import { Component, signal, computed, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { forkJoin } from 'rxjs';
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

  // === UI State ===
  searchTerm = signal('');
  isDropdownOpen = signal(false);
  isEnlarged = signal(false);
  highestPanelRevealed = signal(1); // Start with panel 1 revealed
  isHintRevealed = signal(false);
  isLoading = signal(true);
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
  }

  ngOnInit() {
    // Use forkJoin to fetch both the full manga list and the daily manga info in parallel.
    // This ensures we have all the data we need before trying to process it.
    forkJoin({
      mangaList: this.http.get<Item[]>('https://script.google.com/macros/s/AKfycbxgs6-WDBwD5JfLlUHIYfseS3MoQI6wqWBzS4aizs5N7kx7GhilrfB5sdmEpU9f_XD3/exec?action=data'),
      dailyManga: this.http.get<any>('https://script.google.com/macros/s/AKfycbxgs6-WDBwD5JfLlUHIYfseS3MoQI6wqWBzS4aizs5N7kx7GhilrfB5sdmEpU9f_XD3/exec?action=daily')
    }).subscribe({
      next: ({ mangaList, dailyManga }) => {
        // 1. Set the full list, sorted alphabetically.
        this.fullItemList = mangaList.sort((a, b) => a.title.localeCompare(b.title));

        // 2. Find the full details for the daily manga from the main list.
        const dailyMangaDetails = this.fullItemList.find(item => item.title === dailyManga.title);
        this.randomDailyManga.set(dailyMangaDetails);
        this.randomDailyMangaChapter = dailyManga.chapter;

        console.log('Daily manga for today:', this.randomDailyManga());
        
        // 3. Fetch the images for the daily manga.
        this.fetchMangaImagesDaily([dailyManga.img1, dailyManga.img2, dailyManga.img3]);

        // 4. Turn off the loading indicator.
        
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

  private fetchMangaImagesDaily(imageUrls: string[]): void {    
    interface ImageResponse {
      data: string; // Base64 encoded image data
      mimetype: string;
      url: string;
    }

    // Create an array of HTTP requests, one for each image URL.
    const imageRequests = imageUrls.map(imageUrl => {
      const url = `https://script.google.com/macros/s/AKfycbxgs6-WDBwD5JfLlUHIYfseS3MoQI6wqWBzS4aizs5N7kx7GhilrfB5sdmEpU9f_XD3/exec?url=${encodeURIComponent(imageUrl)}`;
      // Expect a JSON response, not a direct blob.
      return this.http.get<ImageResponse>(url);
    });

    // Use forkJoin to execute all requests in parallel and wait for them all to complete.
    forkJoin(imageRequests).subscribe({
      next: (responses) => {
        // For each response, convert the Base64 data to a Blob, then to a safe URL.
        this.panelImages = responses.map(res => {
          const imageBlob = this.b64toBlob(res.data, res.mimetype);
          const objectUrl = URL.createObjectURL(imageBlob);
          return this.sanitizer.bypassSecurityTrustUrl(objectUrl);
        });

        this.currentPanelUrl.set(this.panelImages[0]); // Set the first image as current.
        console.log('Successfully fetched and processed all daily manga images.');
      },
      error: (err) => {
        console.error('Failed to fetch one or more daily manga images:', err);
      }
    }).add(() => {
      // Ensure loading is turned off in case of error as well.
      this.isLoading.set(false);
    })
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
