// c:\Users\Vince\Desktop\Coding\Angular\mangadle\src\app\db.service.ts
import { Injectable } from '@angular/core';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface ImageCacheDB extends DBSchema {
  'image-cache': {
    key: string; // The image URL
    value: Blob; // The image data as a Blob
  };
}

@Injectable({
  providedIn: 'root'
})
export class DbService {
  // Make the promise static to ensure it's shared across all instances of the service.
  private static dbPromise: Promise<IDBPDatabase<ImageCacheDB>>;

  constructor() {
    // Only initialize the database connection if it hasn't been already.
    if (!DbService.dbPromise) {
      DbService.dbPromise = openDB<ImageCacheDB>('mangadle-db', 3, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('image-cache')) {
            db.createObjectStore('image-cache');
          }
        },
      });
    }
  }

  async getImage(key: string): Promise<Blob | undefined> {
    return (await DbService.dbPromise).get('image-cache', key);
  }

  async setImage(key: string, value: Blob): Promise<string> {
    return (await DbService.dbPromise).put('image-cache', value, key);
  }

  async clearAllImages(): Promise<void> {
    return (await DbService.dbPromise).clear('image-cache');
  }
}
