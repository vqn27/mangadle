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
  private dbPromise: Promise<IDBPDatabase<ImageCacheDB>>;

  constructor() {
    this.dbPromise = openDB<ImageCacheDB>('mangadle-db', 1, {
      upgrade(db) {
        db.createObjectStore('image-cache');
      },
    });
  }

  async getImage(key: string): Promise<Blob | undefined> {
    return (await this.dbPromise).get('image-cache', key);
  }

  async setImage(key: string, value: Blob): Promise<string> {
    return (await this.dbPromise).put('image-cache', value, key);
  }

  async clearAllImages(): Promise<void> {
    return (await this.dbPromise).clear('image-cache');
  }
}
