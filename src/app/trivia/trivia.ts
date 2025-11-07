import { Component, signal, OnInit, inject, PLATFORM_ID, computed, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TriviaQuestion, TriviaSession } from '../item.model';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-trivia',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './trivia.html',
  styleUrls: ['./trivia.css', '../shared-styles.css']
})
export class Trivia implements OnInit {
  // === UI State ===
  isLoading = signal(true);
  allQuestionsAnswered = computed(() => this.triviaQuestions().length > 0 && this.triviaQuestions().every(q => q.selectedAnswer));
  showScorePopup = signal(false);
  score = computed(() => this.triviaQuestions().filter(q => q.isCorrect).length);

  // === Game State ===
  guessResult = signal<'correct' | 'incorrect' | null>(null);
  isGameWon = signal(false);
  isGameLost = signal(false);

  // === API Data ===
  triviaResults = signal<any[]>([]);
  sessionToken = signal<string | null>(null);
  triviaQuestions = signal<TriviaQuestion[]>([]);

  // === Pagination State ===
  currentPageIndex = signal(0);
  readonly questionsPerPage = 4;
  paginatedTriviaQuestions = computed(() => {
    const startIndex = this.currentPageIndex() * this.questionsPerPage;
    const endIndex = startIndex + this.questionsPerPage;
    return this.triviaQuestions().slice(startIndex, endIndex);
  });
  isFirstPage = computed(() => this.currentPageIndex() === 0);
  isLastPage = computed(() => {
    const totalPages = Math.ceil(this.triviaQuestions().length / this.questionsPerPage);
    return this.currentPageIndex() >= totalPages - 1;
  });
  isCurrentPageAnswered = computed(() => {
    const currentPageQuestions = this.paginatedTriviaQuestions();
    if (currentPageQuestions.length === 0) {
        return true;
    }
    return currentPageQuestions.every(q => q.selectedAnswer);
  });
  // === Data State ===
  currentTriviaQuestion = signal<TriviaQuestion | undefined>(undefined);

  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

  constructor() {
    effect(() => {
      if (this.allQuestionsAnswered()) {
        this.showScorePopup.set(true);
      }
    });
  }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const storedSession = sessionStorage.getItem('triviaSession');
      if (storedSession) {
        const session: TriviaSession = JSON.parse(storedSession);
        // If all questions are answered, fetch a new set. Otherwise, load the session.
        if (session.questions.every(q => q.selectedAnswer)) {
          this.fetchTriviaQuestions();
        } else {
          this.triviaQuestions.set(session.questions);
          this.sessionToken.set(session.token);
          this.isLoading.set(false);
        }
      } else {
        this.fetchTriviaQuestions();
      }
    } else {
      this.fetchTriviaQuestions();
    }
  }

  async fetchSessionToken(): Promise<void> {
    if (this.sessionToken()) return;

    try {
      const response = await firstValueFrom(this.http.get<any>('https://opentdb.com/api_token.php?command=request'));
      if (response.response_code === 0 && response.token) {
        this.sessionToken.set(response.token);
        console.log('Session token created for mangadle:', response.token);
      } else {
        console.error('Failed to retrieve session token:', response.response_message);
      }
    } catch (error) {
      console.error('Error fetching session token:', error);
    }
  }

  async fetchTriviaQuestions(): Promise<void> {
    this.isLoading.set(true);
    this.currentPageIndex.set(0); // Reset to the first page
    sessionStorage.removeItem('triviaSession'); // Clear previous session before fetching new
    await this.fetchSessionToken();

    try {
      const response = await firstValueFrom(this.http.get<any>(`https://opentdb.com/api.php?amount=12&category=31&type=multiple&token=${this.sessionToken()}`));
      this.triviaResults.set(response.results);

      if (response.results.length > 0) {
        const questions: TriviaQuestion[] = response.results.map((result: any) => {
          const allAnswers = [
            this.decodeHtml(result.correct_answer),
            ...result.incorrect_answers.map((incorrect: string) => this.decodeHtml(incorrect)),
          ];

          return {
            question: this.decodeHtml(result.question),
            answer: this.decodeHtml(result.correct_answer),
            incorrectAnswers: result.incorrect_answers.map((incorrect: string) => this.decodeHtml(incorrect)),
            shuffledAnswers: allAnswers.sort(() => Math.random() - 0.5),
          };
        });
        this.triviaQuestions.set(questions);
        this.currentTriviaQuestion.set(questions[0]);
        if (isPlatformBrowser(this.platformId)) {
          const session: TriviaSession = { token: this.sessionToken(), questions: questions };
          sessionStorage.setItem('triviaSession', JSON.stringify(session));
        }
        console.log('Trivia questions loaded:', this.triviaQuestions());
      }
    } catch (error) {
      console.error('Failed to fetch trivia questions:', error);
      // You could set an error state here to show a message to the user
    } finally {
      this.isLoading.set(false);
    }
  }

  private decodeHtml(html: string): string {
    if (isPlatformBrowser(this.platformId)) {
      const txt = document.createElement("textarea");
      txt.innerHTML = html;
      return txt.value;
    }
    return html; // Return as-is on the server
  }

  checkAnswer(question: TriviaQuestion, selectedAnswer: string): void {
    // Prevent re-answering a question
    if (question.selectedAnswer) {
      return;
    }

    question.selectedAnswer = selectedAnswer;
    question.isCorrect = question.answer === selectedAnswer;

    // Trigger signal change detection by creating a new array reference
    this.triviaQuestions.update(questions => [...questions]);

    if (isPlatformBrowser(this.platformId)) {
      const session: TriviaSession = { token: this.sessionToken(), questions: this.triviaQuestions() };
      sessionStorage.setItem('triviaSession', JSON.stringify(session));

      // If all questions are now answered, clear the session for the next refresh
      if (this.allQuestionsAnswered()) {
        sessionStorage.removeItem('triviaSession');
      }
    }
  }

  closePopup(): void {
    this.guessResult.set(null);
  }

  nextPage(): void {
    if (!this.isLastPage()) {
      this.currentPageIndex.update(i => i + 1);
    }
  }

  previousPage(): void {
    if (!this.isFirstPage()) {
      this.currentPageIndex.update(i => i - 1);
    }
  }

  playAgain(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.location.reload();
    }
  }
}