import { Component, signal, computed, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Item } from '../item.model';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

@Component({
  selector: 'app-least-popular',
  standalone: true, // Modern Angular format
  imports: [
    CommonModule,   // Enables *ngIf, @for
    FormsModule     // Enables [(ngModel)]
  ],
  templateUrl: './least-popular.html',
  styleUrls: ['./least-popular.css']
})
export class LeastPopularComponent implements OnInit {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

  // === UI State ===
  searchTerm = signal('');
  isDropdownOpen = signal(false);
  isHintRevealed = signal(false);
  isLoading = signal(true);

  // === Data State ===
  fullItemList: Item[] = []; // Start with an empty list

  selectedItem = signal<Item | undefined>(undefined);

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
   * Fetches data from the Google Apps Script URL.
   */
  private fetchMangaData(): void {
    const fullListCacheKey = 'mangadle-fullItemList';
    let dataObservable: Observable<Item[]>;

    if (isPlatformBrowser(this.platformId)) {
      const cachedData = localStorage.getItem(fullListCacheKey);
      if (cachedData) {
        console.log('Loading full manga list from cache for least-popular.');
        dataObservable = of(JSON.parse(cachedData));
      } else {
        console.log('Fetching full manga list from network for least-popular.');
        const url = 'https://script.google.com/macros/s/AKfycbxgs6-WDBwD5JfLlUHIYfseS3MoQI6wqWBzS4aizs5N7kx7GhilrfB5sdmEpU9f_XD3/exec?action=data';
        dataObservable = this.http.get<Item[]>(url).pipe(
          tap(data => localStorage.setItem(fullListCacheKey, JSON.stringify(data)))
        );
      }
    } else {
      const url = 'https://script.google.com/macros/s/AKfycbxgs6-WDBwD5JfLlUHIYfseS3MoQI6wqWBzS4aizs5N7kx7GhilrfB5sdmEpU9f_XD3/exec?action=data';
      dataObservable = this.http.get<Item[]>(url);
    }

    dataObservable.subscribe({
      next: (data) => {
        // Process the list to create a consistent display title.
        const processedData = data.map(item => ({
          ...item,
          title: (item.eng_title && item.eng_title !== 'N/A') ? item.eng_title : item.jp_title
        }));
        const sortedData = processedData.sort((a, b) => a.title.localeCompare(b.title));
        this.fullItemList = sortedData;
        console.log('Successfully fetched and sorted data for least-popular characters.');
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch least-popular data from Google Apps Script. This could be a CORS issue if the script is not configured for public JSON access.', err);
        this.isLoading.set(false);
      }
    });
  }
}