import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { App } from './app/app';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app/app.routes';

bootstrapApplication(App, {
  providers: [
    // This is where you would configure global services like HTTP client or Router
    provideHttpClient(),
    // Provide the router configuration to the application
    provideRouter(routes),
    // ... other global providers
  ]
}).catch((err) => console.error(err));