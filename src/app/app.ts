import { Component, HostBinding, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true, // The App component is also standalone
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive], 
  template: `
    <div class="app-container">
      <nav class="sidebar">
        <div class="sidebar-header">
          <img src="logo.png" alt="Mangadle Logo" class="sidebar-logo" width="32" height="32">
          <h2 class="sidebar-title">Mangadle</h2>
        </div>
        <a routerLink="/" 
           class="sidebar-link" 
           [class.active]="isMangaPanelRouteActive()">
          <span class="sidebar-link-icon">🖼️</span>
          <span class="sidebar-link-text">Guess by Manga Panel</span>
        </a>
        <a routerLink="/recommendation" 
           class="sidebar-link" 
           [class.active]="isRecommendationRouteActive()">
          <span class="sidebar-link-icon">👍</span>
          <span class="sidebar-link-text">Guess by Recommendations</span>
        </a>
        <a routerLink="/least-popular" class="sidebar-link" routerLinkActive="active">
          <span class="sidebar-link-icon">📉</span>
          <span class="sidebar-link-text">Guess by Least Popular Characters</span>
        </a>
        <a routerLink="/traits" class="sidebar-link" routerLinkActive="active">
          <span class="sidebar-link-icon">🧠</span>
          <span class="sidebar-link-text">Guess by Character Traits</span>
        </a>
      </nav>
      <main>
        <button class="dark-mode-button" (click)="toggleDarkMode()">
          {{ isDarkMode() ? 'Light Mode ☀️' : 'Dark Mode 🌙' }}
        </button>
        <router-outlet></router-outlet>
        <!-- Debug button to clear cache -->

        
      </main>
    </div>
  `,
  styles: [`
    :host {
      font-family: 'Inter', sans-serif;
      
      /* Light Theme (Default) */
      --bg-color: #f0f2f5;
      --sidebar-bg: #1f2937;
      --sidebar-text: #d1d5db;
      --sidebar-title-text: #fff;
      --sidebar-border: #4b5563;
      --sidebar-link-hover-bg: #374151;
      --sidebar-link-active-bg: #6d28d9;
      --theme-toggle-bg: transparent;
      --theme-toggle-border: #1f2937;
      --theme-toggle-text: #1f2937;
      --theme-toggle-hover-bg: #1f2937;
      --theme-toggle-hover-text: #fff;
    }

    :host(.dark) {
      /* Dark Theme */
      --bg-color: #18181b; /* zinc-900 */
      --sidebar-bg: #121212; /* A very dark gray */
      --sidebar-text: #a1a1aa; /* zinc-400 */
      --sidebar-title-text: #fff;
      --sidebar-border: #3f3f46; /* zinc-700 */
      --sidebar-link-hover-bg: #27272a; /* zinc-800 */
      --sidebar-link-active-bg: #6d28d9;
      --theme-toggle-bg: transparent;
      --theme-toggle-border: #52525b; /* zinc-600 */
      --theme-toggle-text: #d4d4d8; /* zinc-300 */
      --theme-toggle-hover-bg: #27272a; /* zinc-800 */
      --theme-toggle-hover-text: #fafafa; /* zinc-50 */
    }

    .app-container {
      display: flex;
      min-height: 100vh;
      background-color: var(--bg-color);
      transition: background-color 0.3s ease;
    }

    .sidebar {
      width: 260px;
      background-color: var(--sidebar-bg);
      color: var(--sidebar-text);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex-shrink: 0;
      transition: background-color 0.3s ease;
      border-top-right-radius: 16px;
      border-bottom-right-radius: 16px;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--sidebar-border);
    }

    .sidebar-logo {
      width: 32px;
      height: 32px;
      margin-right: 12px;
    }

    .dark-mode-button {
      position: absolute;
      top: 20px;
      right: 20px;
      background-color: var(--theme-toggle-bg);
      border: 2px solid var(--theme-toggle-border);
      color: var(--theme-toggle-text);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      padding: 8px 16px;
      border-radius: 8px;
      transition: background-color 0.2s, color 0.2s, border-color 0.2s;
    }

    .sidebar-title {
      font-size: 1.8rem;
      font-weight: 700;
      color: var(--sidebar-title-text);
      margin: 0;
    }

    .sidebar-link {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--sidebar-text);
      text-decoration: none;
      padding: 12px 16px;
      border-radius: 8px;
      font-weight: 500;
      transition: background-color 0.2s, color 0.2s;
    }

    .sidebar-link-icon {
      font-size: 1.2rem;
      width: 24px; /* Fixed width for alignment */
      text-align: center;
    }

    .sidebar-link:hover {
      background-color: var(--sidebar-link-hover-bg);
      color: #fff;
    }

    .sidebar-link.active {
      background-color: var(--sidebar-link-active-bg);
      color: #fff;
      font-weight: 600;
    }

    .debug-button {
      position: absolute;
      bottom: 20px;
      right: 20px;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      background-color: #4b5563; /* zinc-600 */
      color: #d1d5db; /* zinc-300 */
      border: none;
      transition: background-color 0.2s, color 0.2s, border-color 0.2s;
    }

    .debug-button:hover {
      background-color: #ef4444; /* red-500 */
      color: #fff;
    }

    main { 
      position: relative; /* For absolute positioning of the button */
      flex-grow: 1;
      padding: 40px;
      background-color: var(--bg-color);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    @media (max-width: 768px) {
      .app-container {
        flex-direction: column;
      }
      .sidebar {
        width: 100%;
        height: auto;
        border-radius: 0;
      }
      main {
        /* Add extra top padding to make space for the absolute-positioned dark mode button */
        padding: 80px 20px 20px 20px;
      }
    }

    /* Global styles for the body */
    ::ng-deep body {
      margin: 0;
      background-color: var(--bg-color);
      transition: background-color 0.3s ease;
    }
  `]
})
export class App {
  private platformId = inject(PLATFORM_ID);
  private readonly darkModeKey = 'mangadle-dark-mode';
  private router = inject(Router);

  isDarkMode = signal<boolean>(this.getInitialDarkMode());
  isMangaPanelRouteActive = signal(false);
  isRecommendationRouteActive = signal(false);

  constructor() {
    // Effect to check the current route and highlight the correct sidebar link.
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      const url = event.urlAfterRedirects;

      // "Manga Panel" is active for its main, historical, and history pages.
      const isMangaPanelActive = url === '/' || url.startsWith('/game/') || url === '/history';
      this.isMangaPanelRouteActive.set(isMangaPanelActive);

      // "Recommendations" is active for its main, historical, and history pages.
      const isRecommendationActive = url.startsWith('/recommendation') || url === '/history-recommendation';
      this.isRecommendationRouteActive.set(isRecommendationActive);
    });

    // This effect will run whenever `isDarkMode` changes, saving the preference.
    effect(() => {
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem(this.darkModeKey, JSON.stringify(this.isDarkMode()));
      }
    });
  }

  @HostBinding('class.dark')
  get isDark() {
    return this.isDarkMode();
  }

  toggleDarkMode(): void {
    this.isDarkMode.set(!this.isDarkMode());
  }

  /**
   * Clears all application-related data from localStorage for debugging.
   * This preserves the dark mode setting.
   */
  clearCache(): void {
    if (isPlatformBrowser(this.platformId)) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key !== this.darkModeKey) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });

      alert('Application cache cleared. Please refresh the page.');
    }
  }

  private getInitialDarkMode(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false; // Default to light mode on the server
    }
    // Check for an explicit preference in localStorage first.
    const storedValue = localStorage.getItem(this.darkModeKey);
    if (storedValue !== null) {
      return JSON.parse(storedValue);
    }

    // If no stored preference, check the user's system preference.
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return true;
    }

    // Default to light mode if no preference is found.
    return false;
  }
}
