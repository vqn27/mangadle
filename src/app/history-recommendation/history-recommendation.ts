import { Component, signal, computed, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { HistoryEntry } from '../item.model';
import { forkJoin } from 'rxjs';
import { MangaDataService } from '../manga-data.service';

@Component({
  selector: 'app-history-recommendation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './history-recommendation.html',
  styleUrls: ['./history-recommendation.css', '../shared-styles.css']
})
export class HistoryRecommendationComponent implements OnInit {
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
      history: this.mangaDataService.getRecommendationHistory(),
      today: this.mangaDataService.getRecommendationsGame(),
      fullList: this.mangaDataService.getFullMangaList()
    }).subscribe({
      next: ({ history, today, fullList }) => {
        // The daily endpoint returns YYYY-MM-DD, but the history sheet uses MM/DD/YYYY.
        // Convert today's date to match the history format.
        if (!today.date) return; // Guard against missing date
        const [year, month, day] = today.date.split('-');
        const formattedDate = `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}`;
        const baseMangaFromList = fullList.find(item => item.jp_title === today.base_title);
        const todayEntry: HistoryEntry = { // Now we can be sure the title is correct
          date: formattedDate,
          title: baseMangaFromList?.title || today.base_title,
          jp_title: today.base_title,
          image: today.base_image_url,
          score: 0,
          popularity: 0,
          gameMode: 'Recommendation'
        };

        // Resolve display titles for the fetched history
        const resolvedHistory = history.map(entry => {
          const mangaFromList = fullList.find(item => item.jp_title === entry.jp_title);
          return { ...entry, title: mangaFromList?.title || entry.jp_title };
        });

        if (!resolvedHistory.some(entry => entry.date === todayEntry.date)) {
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
    this.router.navigate(['/recommendation', date]);
  }

  isGameGuessed(entry: HistoryEntry): boolean {
    if (isPlatformBrowser(this.platformId)) {
      // Use the correct storage key for the recommendation game
      const key = `mangadle-reccs-gameState-${entry.title}`;
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