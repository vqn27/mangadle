import { Routes } from '@angular/router';
import { Search } from './search/search';
import { Recommendation } from './recommendation/recommendation';
import { LeastPopularComponent } from './least-popular/least-popular';
import { HistoryComponent } from './history/history';

export const routes: Routes = [
    { path: '', component: Search },
    { path: 'recommendation', component: Recommendation, data: { isRecommendationPage: true } },
    { path: 'least-popular', component: LeastPopularComponent, data: { isRecommendationPage: true } },
    { path: 'game/:date', component: Search }, // Route for historical games
    { path: 'history', component: HistoryComponent },
    { path: '**', redirectTo: '' } // Redirect any unknown paths to the home page
];