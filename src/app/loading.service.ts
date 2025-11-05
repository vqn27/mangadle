import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoadingService {
  /** A signal that is `true` when any game component is loading data. */
  isGameLoading = signal(false);
}