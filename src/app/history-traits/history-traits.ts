import { Component, signal, computed, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { HistoryEntry } from '../item.model';
import { MangaDataService } from '../manga-data.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-history-traits',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './history-traits.html',
  styleUrls: ['./history-traits.css', '../shared-styles.css']
})
export class HistoryTraitsComponent implements OnInit {
  private router = inject(Router);
  private mangaDataService = inject(MangaDataService);
  private platformId = inject(PLATFORM_ID);

  history = signal<HistoryEntry[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);

  itemsPerPage = 30;
  currentPage = signal(1);

  totalPages = computed(() => Math.ceil(this.history().length / this.itemsPerPage));

  paginatedHistory = computed(() => {
    const historyData = this.history();
    const startIndex = (this.currentPage() - 1) * this.itemsPerPage;
    return historyData.slice(startIndex, startIndex + this.itemsPerPage);
  });

  ngOnInit() {
    this.isLoading.set(true);
    forkJoin({
      history: this.mangaDataService.getTraitsHistory(),
      today: this.mangaDataService.getTraitsGame()
    }).subscribe({
      next: ({ history, today }) => {
        // The 'title' for a traits game is the character's name.
        // The daily endpoint returns this as `characterName` or `names_(proper)`.
        const todayCharacterName = (today as any).characterName || (today as any)['names_(proper)'];

        // If today's game is not in the history sheet yet, create an entry for it.
        if (!history.some(entry => entry.title === todayCharacterName)) {
            const todayFormattedDate = new Date().toLocaleDateString('en-US');
            const todayEntry: HistoryEntry = {
                date: todayFormattedDate,
                title: todayCharacterName,
                jp_title: (today as any).baseTitle || (today as any).manga, // The source manga
                gameMode: 'Traits',
                image: (today as any).picture,
                score: 0,
                popularity: 0
            };
            history.push(todayEntry);
        }

        const sortedHistory = history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        this.history.set(sortedHistory);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch traits history:', err);
        this.error.set('Failed to load game history.');
        this.isLoading.set(false);
      }
    });
  }

  playHistoryGame(date: string) {
    this.router.navigate(['/traits', date]);
  }

  isGameGuessed(entry: HistoryEntry): boolean {
    if (isPlatformBrowser(this.platformId)) {
      // The key needs to match the one used in the traits component
      const key = `mangadle-traits-gameState-${entry.title}`;
      const gameState = localStorage.getItem(key);
      return gameState === 'won' || gameState === 'lost';
    }
    return false;
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(page => page + 1);
    }
  }

  previousPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(page => page - 1);
    }
  }
}