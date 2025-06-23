import { 
  collection, 
  getDocs, 
  query, 
  orderBy,
  where
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { PREvent, PRStats } from '../types/personalRecords';
import { CloudFunctionsService } from './cloudFunctions';

export class PersonalRecordsService {
  private static instance: PersonalRecordsService;
  private cloudFunctions: CloudFunctionsService;
  
  private constructor() {
    this.cloudFunctions = CloudFunctionsService.getInstance();
  }
  
  static getInstance(): PersonalRecordsService {
    if (!PersonalRecordsService.instance) {
      PersonalRecordsService.instance = new PersonalRecordsService();
    }
    return PersonalRecordsService.instance;
  }

  /**
   * Calculate season identifier from date
   * Rowing seasons run May 1st to April 30th, using end year as identifier
   */
  getSeasonIdentifier(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-based (0 = January)
    
    // If January-April, use current year
    // If May-December, use next year
    const seasonEndYear = month < 4 ? year : year + 1;
    return seasonEndYear.toString();
  }

  /**
   * Get all PR events for a user with optional filtering
   * Reason: This is the main function that reads PR data from the database
   */
  async getPREvents(userId: string, filters?: {
    scope?: string;           // 'all-time', 'season-2025', 'year-2024'
    activity?: string;        // '2k_row', 'marathon_row'
    limit?: number;
  }): Promise<PREvent[]> {
    try {
      const prEventsRef = collection(db, 'users', userId, 'pr_events');
      const prEventsQuery = query(prEventsRef, orderBy('achieved_at', 'desc'));
      
      const snapshot = await getDocs(prEventsQuery);
      let prEvents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PREvent[];
      
      // Apply filters in memory
      if (filters?.scope) {
        prEvents = prEvents.filter(event => 
          event.pr_scope.includes(filters.scope!)
        );
      }
      
      if (filters?.activity) {
        prEvents = prEvents.filter(event => 
          event.activity_key === filters.activity
        );
      }
      
      if (filters?.limit) {
        prEvents = prEvents.slice(0, filters.limit);
      }
      
      console.log(`Retrieved ${prEvents.length} PR events for user ${userId} with filters:`, filters);
      return prEvents;
    } catch (error) {
      console.error('Error fetching PR events:', error);
      throw error;
    }
  }

  /**
   * Get PR statistics for dashboard with proper display order
   * Reason: Builds stats from PR events data for UI display, now sorted by display_order
   */
  async getPRStats(userId: string): Promise<PRStats[]> {
    try {
      // Get all PR events for the user
      const allPREvents = await this.getPREvents(userId);
      
      // Get user's PR types with display order
      const prTypesRef = collection(db, 'users', userId, 'pr_types');
      const prTypesQuery = query(
        prTypesRef, 
        where('is_active', '==', true),
        orderBy('display_order', 'asc')
      );
      const prTypesSnapshot = await getDocs(prTypesQuery);
      
      const prTypes = prTypesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log(`Retrieved ${prTypes.length} active PR types for user ${userId}`);
      
      // Create stats array in display order
      const stats: PRStats[] = [];
      const currentYear = new Date().getFullYear().toString();
      const currentSeason = this.getSeasonIdentifier(new Date());

      // Reason: Process PR types in display_order sequence to ensure correct UI ordering
      for (const prType of prTypes) {
        const activityKey = prType.activity_key;
        const activityEvents = allPREvents.filter(event => 
          event.activity_key === activityKey
        );

        // Only include activities that have PR events
        if (activityEvents.length === 0) {
          continue;
        }

        const activityName = prType.activity_name || this.getActivityDisplayName(activityKey);

        const allTimeRecord = activityEvents.find(event => 
          event.pr_scope.includes("all-time")
        ) || null;

        const currentSeasonRecord = activityEvents.find(event => 
          event.pr_scope.includes(`season-${currentSeason}`)
        ) || null;

        const currentYearRecord = activityEvents.find(event => 
          event.pr_scope.includes(`year-${currentYear}`)
        ) || null;

        stats.push({
          activity_key: activityKey,
          activity_name: activityName,
          all_time_record: allTimeRecord,
          current_season_record: currentSeasonRecord,
          current_year_record: currentYearRecord,
          total_attempts: activityEvents.length,
          improvement_count: activityEvents.filter(event => 
            event.pr_scope.length > 0
          ).length
        });
      }

      console.log(`Generated ${stats.length} PR stats in display order`);
      return stats;
    } catch (error) {
      console.error('Error getting PR stats:', error);
      throw error;
    }
  }

  /**
   * Get display name for activity key
   * Reason: Simple mapping instead of separate database table (fallback only)
   */
  private getActivityDisplayName(activityKey: string): string {
    const displayNames: Record<string, string> = {
      '100m_row': '100m Row',
      '500m_row': '500m Row',
      '1k_row': '1K Row',
      '2k_row': '2K Row',
      '5k_row': '5K Row',
      '6k_row': '6K Row',
      '10k_row': '10K Row',
      'half_marathon_row': 'Half Marathon Row',
      'marathon_row': 'Marathon Row',
      '1min_row': '1min Row',
      '4min_row': '4min Row',
      '30min_row': '30min Row',
      '60min_row': '60min Row'
    };
    
    return displayNames[activityKey] || activityKey.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Process new results and recalculate PRs via Cloud Function
   * Reason: All PR processing now happens in Cloud Functions for consistency
   */
  async processNewResultsAndRecalculate(userId: string): Promise<void> {
    try {
      console.log('Starting smart PR processing and recalculation via Cloud Function for user:', userId);
      await this.cloudFunctions.processNewResultsAndRecalculate(userId);
      console.log('Smart PR processing and recalculation completed via Cloud Function');
    } catch (error) {
      console.error('Error in smart PR processing and recalculation:', error);
      throw error;
    }
  }
}