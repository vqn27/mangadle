import { Routes } from '@angular/router';
import { Search } from './search/search';
import { Recommendation } from './recommendation/recommendation';

export const routes: Routes = [
  // The default route will render the Search component
  { path: '', component: Search },
  // The 'recommendation' route will render the Recommendation component
  { path: 'recommendation', component: Recommendation, data: { isRecommendationPage: true } },
];