import { Routes } from '@angular/router';
import { Search } from './search/search';
import { Recommendation } from './recommendation/recommendation';
import { LeastPopularComponent } from './least-popular/least-popular';
import { HistoryComponent } from './history/history';
import { TraitsComponent } from './traits/traits';
import { HistoryRecommendationComponent } from './history-recommendation/history-recommendation';
import { HistoryLeastPopularComponent } from './history-least-popular/history-least-popular';
import { HistoryTraitsComponent } from './history-traits/history-traits';

export const routes: Routes = [
    { path: '', component: Search },
    { path: 'recommendation', component: Recommendation, data: { isRecommendationPage: true } },
    { path: 'least-popular', component: LeastPopularComponent, data: { isRecommendationPage: true } },
    { path: 'traits', component: TraitsComponent, data: { isRecommendationPage: true } },
    { path: 'recommendation/:date', component: Recommendation, data: { isRecommendationPage: true } },
    { path: 'least-popular/:date', component: LeastPopularComponent, data: { isRecommendationPage: true } },
    { path: 'traits/:date', component: TraitsComponent, data: { isRecommendationPage: true } },
    { path: 'game/:date', component: Search }, // Route for historical games
    { path: 'history', component: HistoryComponent },
    { path: 'history-recommendation', component: HistoryRecommendationComponent },
    { path: 'history-least-popular', component: HistoryLeastPopularComponent },
    { path: 'history-traits', component: HistoryTraitsComponent },
    { path: '**', redirectTo: '' } // Redirect any unknown paths to the home page
];