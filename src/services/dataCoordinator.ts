/**
 * Data loading coordinator to prevent duplicate simultaneous loads
 * Ensures only one load operation per data type per user at a time
 */
export class DataCoordinator {
  private static instance: DataCoordinator;
  private loadingPromises = new Map<string, Promise<any>>();
  
  private constructor() {}
  
  static getInstance(): DataCoordinator {
    if (!DataCoordinator.instance) {
      DataCoordinator.instance = new DataCoordinator();
    }
    return DataCoordinator.instance;
  }

  /**
   * Coordinate data loading to prevent duplicate requests
   * @param key Unique key for the data being loaded (e.g., "allResults_userId")
   * @param loader Function that loads the data
   * @returns Promise that resolves to the loaded data
   */
  async coordinatedLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    // If already loading this data, return the existing promise
    if (this.loadingPromises.has(key)) {
      console.log(`Coordinated load: Using existing promise for ${key}`);
      return this.loadingPromises.get(key);
    }
    
    console.log(`Coordinated load: Starting new load for ${key}`);
    const promise = loader();
    this.loadingPromises.set(key, promise);
    
    try {
      const result = await promise;
      console.log(`Coordinated load: Completed load for ${key}`);
      return result;
    } catch (error) {
      console.error(`Coordinated load: Failed load for ${key}:`, error);
      throw error;
    } finally {
      // Always clean up the promise when done
      this.loadingPromises.delete(key);
    }
  }

  /**
   * Clear all loading promises (useful for cleanup)
   */
  clearAll(): void {
    this.loadingPromises.clear();
  }

  /**
   * Clear loading promises for a specific user (useful when user signs out)
   */
  clearForUser(userId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.loadingPromises.keys()) {
      if (key.includes(userId)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.loadingPromises.delete(key));
  }

  /**
   * Get current loading status for debugging
   */
  getLoadingStatus(): { activeLoads: string[]; count: number } {
    return {
      activeLoads: Array.from(this.loadingPromises.keys()),
      count: this.loadingPromises.size
    };
  }
}