import { Component, signal, computed, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { HistoryEntry } from '../item.model';
import { forkJoin } from 'rxjs';
import { MangaDataService } from '../manga-data.service';

@Component({
  selector: 'app-history-least-popular',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './history-least-popular.html',
  styleUrls: ['./history-least-popular.css', '../shared-styles.css']
})
export class HistoryLeastPopularComponent implements OnInit {
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
    forkJoin({
      history: this.mangaDataService.getLeastPopularHistory(),
      today: this.mangaDataService.getLeastPopularGame(),
      fullList: this.mangaDataService.getFullMangaList()
    }).subscribe({
      next: ({ history, today, fullList }) => {
        const todayJpTitle = (today as any).base_title;

        // Resolve display titles for the fetched history from the spreadsheet
        const resolvedHistory = history.map(entry => {
            const mangaFromList = fullList.find(item => item.jp_title === entry.jp_title);
            return { ...entry, title: mangaFromList?.title || entry.jp_title };
        });

        // If today's game is not in the history sheet yet, create an entry for it.
        if (!resolvedHistory.some(entry => entry.jp_title === todayJpTitle)) {
            const todayFormattedDate = new Date().toLocaleDateString('en-US');
            const baseMangaFromList = fullList.find(item => item.jp_title === todayJpTitle);
            const todayEntry: HistoryEntry = {
                date: todayFormattedDate,
                title: baseMangaFromList?.title || todayJpTitle,
                jp_title: todayJpTitle,
                gameMode: 'Least Popular',
                image: '', // Not available for today's game yet
                score: 0,
                popularity: 0
            };
            resolvedHistory.push(todayEntry);
        }

        // Sort in chronological order to show the oldest games first (Day 1, Day 2, etc.).
        const sortedHistory = resolvedHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        this.history.set(sortedHistory);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching history data:', err);
        this.error.set('Failed to load game history.');
        this.isLoading.set(false);
      }
    });
  }

  playHistoryGame(date: string) {
    this.router.navigate(['/least-popular', date]);
  }

  isGameGuessed(entry: HistoryEntry): boolean {
    if (isPlatformBrowser(this.platformId)) {
      const key = `mangadle-least-popular-gameState-${entry.title}`;
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