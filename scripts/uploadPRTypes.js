const admin = require('firebase-admin');

// Initialize Firebase Admin with service account
// Make sure you have GOOGLE_APPLICATION_CREDENTIALS set or provide the path
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

// Standard PR Types for Concept2 activities
const prTypes = [
  // Distance-based rowing events (time is the metric)
  {
    id: '100m_row',
    activity_name: '100m Row',
    activity_key: '100m_row',
    sport: 'rower',
    metric_type: 'time',
    target_distance: 100,
    target_time: null,
    is_active: true,
    display_order: 1
  },
  {
    id: '500m_row',
    activity_name: '500m Row',
    activity_key: '500m_row',
    sport: 'rower',
    metric_type: 'time',
    target_distance: 500,
    target_time: null,
    is_active: true,
    display_order: 2
  },
  {
    id: '1k_row',
    activity_name: '1K Row',
    activity_key: '1k_row',
    sport: 'rower',
    metric_type: 'time',
    target_distance: 1000,
    target_time: null,
    is_active: true,
    display_order: 3
  },
  {
    id: '2k_row',
    activity_name: '2K Row',
    activity_key: '2k_row',
    sport: 'rower',
    metric_type: 'time',
    target_distance: 2000,
    target_time: null,
    is_active: true,
    display_order: 4
  },
  {
    id: '5k_row',
    activity_name: '5K Row',
    activity_key: '5k_row',
    sport: 'rower',
    metric_type: 'time',
    target_distance: 5000,
    target_time: null,
    is_active: true,
    display_order: 5
  },
  {
    id: '6k_row',
    activity_name: '6K Row',
    activity_key: '6k_row',
    sport: 'rower',
    metric_type: 'time',
    target_distance: 6000,
    target_time: null,
    is_active: true,
    display_order: 6
  },
  {
    id: '10k_row',
    activity_name: '10K Row',
    activity_key: '10k_row',
    sport: 'rower',
    metric_type: 'time',
    target_distance: 10000,
    target_time: null,
    is_active: true,
    display_order: 7
  },
  {
    id: 'half_marathon_row',
    activity_name: 'Half Marathon Row',
    activity_key: 'half_marathon_row',
    sport: 'rower',
    metric_type: 'time',
    target_distance: 21097,
    target_time: null,
    is_active: true,
    display_order: 8
  },
  {
    id: 'marathon_row',
    activity_name: 'Marathon Row',
    activity_key: 'marathon_row',
    sport: 'rower',
    metric_type: 'time',
    target_distance: 42195,
    target_time: null,
    is_active: true,
    display_order: 9
  },

  // Time-based rowing events (distance is the metric)
  {
    id: '1min_row',
    activity_name: '1min Row',
    activity_key: '1min_row',
    sport: 'rower',
    metric_type: 'distance',
    target_distance: null,
    target_time: 600, // 1 minute in tenths of seconds
    is_active: true,
    display_order: 10
  },
  {
    id: '4min_row',
    activity_name: '4min Row',
    activity_key: '4min_row',
    sport: 'rower',
    metric_type: 'distance',
    target_distance: null,
    target_time: 2400, // 4 minutes in tenths of seconds
    is_active: true,
    display_order: 11
  },
  {
    id: '30min_row',
    activity_name: '30min Row',
    activity_key: '30min_row',
    sport: 'rower',
    metric_type: 'distance',
    target_distance: null,
    target_time: 18000, // 30 minutes in tenths of seconds
    is_active: true,
    display_order: 12
  },
  {
    id: '60min_row',
    activity_name: '60min Row',
    activity_key: '60min_row',
    sport: 'rower',
    metric_type: 'distance',
    target_distance: null,
    target_time: 36000, // 60 minutes in tenths of seconds
    is_active: true,
    display_order: 13
  },

  // BikeErg events
  {
    id: '500m_bike',
    activity_name: '500m Bike',
    activity_key: '500m_bike',
    sport: 'bike',
    metric_type: 'time',
    target_distance: 500,
    target_time: null,
    is_active: true,
    display_order: 14
  },
  {
    id: '1k_bike',
    activity_name: '1K Bike',
    activity_key: '1k_bike',
    sport: 'bike',
    metric_type: 'time',
    target_distance: 1000,
    target_time: null,
    is_active: true,
    display_order: 15
  },
  {
    id: '4k_bike',
    activity_name: '4K Bike',
    activity_key: '4k_bike',
    sport: 'bike',
    metric_type: 'time',
    target_distance: 4000,
    target_time: null,
    is_active: true,
    display_order: 16
  },

  // SkiErg events
  {
    id: '500m_ski',
    activity_name: '500m Ski',
    activity_key: '500m_ski',
    sport: 'skierg',
    metric_type: 'time',
    target_distance: 500,
    target_time: null,
    is_active: true,
    display_order: 17
  },
  {
    id: '1k_ski',
    activity_name: '1K Ski',
    activity_key: '1k_ski',
    sport: 'skierg',
    metric_type: 'time',
    target_distance: 1000,
    target_time: null,
    is_active: true,
    display_order: 18
  }
];

async function uploadPRTypes() {
  try {
    console.log('Starting PR types upload to production database...');
    
    const batch = db.batch();
    let count = 0;

    for (const prType of prTypes) {
      const docRef = db.collection('pr_types').doc(prType.id);
      batch.set(docRef, {
        ...prType,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      count++;
    }

    await batch.commit();
    console.log(`✅ Successfully uploaded ${count} PR types to production database`);
    
    // Verify the upload
    const snapshot = await db.collection('pr_types').get();
    console.log(`✅ Verification: ${snapshot.size} PR types now exist in database`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error uploading PR types:', error);
    process.exit(1);
  }
}

uploadPRTypes();