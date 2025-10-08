import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true, // The App component is also standalone
  imports: [CommonModule, RouterOutlet, RouterLink], 
  template: `
    <main>
      <a *ngIf="!(isRecommendationPage$ | async)" routerLink="/recommendation" class="top-right-button">Guess by Recommendations</a>
      <a *ngIf="isRecommendationPage$ | async" routerLink="/" class="top-right-button">Guess by Manga Panel</a>
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [`
    main { 
      position: relative; /* Needed for absolute positioning */
      padding: 40px 20px; 
      font-family: 'Inter', sans-serif;
      background-color: #f0f2f5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .top-right-button {
      position: absolute;
      top: 20px;
      right: 20px;
      padding: 10px 20px;
      background-color: #6d28d9; /* A nice purple */
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      transition: background-color 0.2s;
    }

    .top-right-button:hover {
      background-color: #5b21b6; /* Darker purple */
    }
  `]
})
export class App {
  private router = inject(Router);
  isRecommendationPage$ = this.router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    map(event => {
      let route = this.router.routerState.root;
      while (route.firstChild) {
        route = route.firstChild;
      }
      return route.snapshot.data['isRecommendationPage'] === true;
    })
  );
}
