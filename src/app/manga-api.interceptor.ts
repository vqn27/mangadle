import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Intercepts outgoing HTTP requests to add specific headers.
 *
 * NOTE: Headers like 'Referer' and 'User-Agent' are "forbidden headers" and
 * cannot be set by client-side JavaScript in a browser. The browser will
 * ignore these values for security reasons. The correct place to set these
 * is on a server-side proxy.
 *
 * This interceptor is provided as a demonstration of the correct Angular pattern
 * for adding headers that *are* allowed, such as 'Authorization'.
 */
export const mangaApiInterceptor: HttpInterceptorFn = (req, next) => {
  // We only want to intercept requests going to our manga API proxy
  if (req.url.startsWith('/api')) {
    const clonedReq = req.clone({
      setHeaders: {
        // The browser will ignore this header, but this is where you would set it.
        'Referer': 'https://www.natomanga.com/'
      }
    });
    return next(clonedReq);
  }

  // For all other requests, pass them through without modification.
  return next(req);
};