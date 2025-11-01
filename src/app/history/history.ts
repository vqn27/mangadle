import { Component, inject, OnInit, signal, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { HistoryEntry } from '../item.model';
import { MangaDataService } from '../manga-data.service';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './history.html',
  styleUrls: ['./history.css', '../shared-styles.css']
})
export class HistoryComponent implements OnInit {
  private router = inject(Router);
  private mangaDataService = inject(MangaDataService);
  private platformId = inject(PLATFORM_ID);

  // --- STATE ---
  history = signal<HistoryEntry[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);

  // --- PAGINATION STATE ---
  readonly itemsPerPage = 30;
  currentPage = signal(1);

  totalPages = computed(() => {
    return Math.ceil(this.history().length / this.itemsPerPage);
  });

  paginatedHistory = computed(() => {
    const historyData = this.history();
    const startIndex = (this.currentPage() - 1) * this.itemsPerPage;
    return historyData.slice(startIndex, startIndex + this.itemsPerPage);
  });

  ngOnInit(): void {
    this.mangaDataService.getGameHistory().subscribe({
      next: (data) => {
        this.history.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching history data:', err);
        this.error.set('Failed to load game history. The sheet might be private or the API key is invalid.');
        this.isLoading.set(false);
      }
    });
  }

  playHistoryGame(date: string): void {
    this.router.navigate(['/game', date]);
  }

  isGameGuessed(entry: HistoryEntry): boolean {
    if (isPlatformBrowser(this.platformId)) {
      // Check if the panel game was either won or lost.
      const key = `mangadle-gameState-${entry.jp_title}`;
      const gameState = localStorage.getItem(key);
      return gameState === 'won' || gameState === 'lost';
    }
    return false;
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(page => page + 1);
    }
  }

  previousPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update(page => page - 1);
    }
  }
}