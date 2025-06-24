const admin = require('firebase-admin');

// Initialize Firebase Admin with your project configuration
// This uses the same project ID from your existing Firebase config
admin.initializeApp({
  projectId: 'bolt-c2', // Your Firebase project ID from firebase.json
});

const db = admin.firestore();

const prTypes = [
  {
    "activity_name": "100m Row",
    "activity_key": "100m_row",
    "sport": "rower",
    "metric_type": "time",
    "target_distance": 100,
    "target_time": null,
    "is_active": true,
    "display_order": 1
  },
  {
    "activity_name": "500m Row",
    "activity_key": "500m_row",
    "sport": "rower",
    "metric_type": "time",
    "target_distance": 500,
    "target_time": null,
    "is_active": true,
    "display_order": 2
  },
  {
    "activity_name": "1K Row",
    "activity_key": "1k_row",
    "sport": "rower",
    "metric_type": "time",
    "target_distance": 1000,
    "target_time": null,
    "is_active": true,
    "display_order": 3
  },
  {
    "activity_name": "2K Row",
    "activity_key": "2k_row",
    "sport": "rower",
    "metric_type": "time",
    "target_distance": 2000,
    "target_time": null,
    "is_active": true,
    "display_order": 4
  },
  {
    "activity_name": "5K Row",
    "activity_key": "5k_row",
    "sport": "rower",
    "metric_type": "time",
    "target_distance": 5000,
    "target_time": null,
    "is_active": true,
    "display_order": 5
  },
  {
    "activity_name": "6K Row",
    "activity_key": "6k_row",
    "sport": "rower",
    "metric_type": "time",
    "target_distance": 6000,
    "target_time": null,
    "is_active": true,
    "display_order": 6
  },
  {
    "activity_name": "10K Row",
    "activity_key": "10k_row",
    "sport": "rower",
    "metric_type": "time",
    "target_distance": 10000,
    "target_time": null,
    "is_active": true,
    "display_order": 7
  },
  {
    "activity_name": "Half Marathon Row",
    "activity_key": "half_marathon_row",
    "sport": "rower",
    "metric_type": "time",
    "target_distance": 21097,
    "target_time": null,
    "is_active": true,
    "display_order": 8
  },
  {
    "activity_name": "Marathon Row",
    "activity_key": "marathon_row",
    "sport": "rower",
    "metric_type": "time",
    "target_distance": 42195,
    "target_time": null,
    "is_active": true,
    "display_order": 9
  },
  {
    "activity_name": "1min Row",
    "activity_key": "1min_row",
    "sport": "rower",
    "metric_type": "distance",
    "target_distance": null,
    "target_time": 600,
    "is_active": true,
    "display_order": 10
  },
  {
    "activity_name": "4min Row",
    "activity_key": "4min_row",
    "sport": "rower",
    "metric_type": "distance",
    "target_distance": null,
    "target_time": 2400,
    "is_active": true,
    "display_order": 11
  },
  {
    "activity_name": "30min Row",
    "activity_key": "30min_row",
    "sport": "rower",
    "metric_type": "distance",
    "target_distance": null,
    "target_time": 18000,
    "is_active": true,
    "display_order": 12
  },
  {
    "activity_name": "60min Row",
    "activity_key": "60min_row",
    "sport": "rower",
    "metric_type": "distance",
    "target_distance": null,
    "target_time": 36000,
    "is_active": true,
    "display_order": 13
  }
];

async function uploadPRTypes() {
  try {
    console.log('Starting PR types upload...');
    
    const batch = db.batch();
    
    prTypes.forEach((prType) => {
      const docRef = db.collection('pr_types').doc(prType.activity_key);
      batch.set(docRef, {
        ...prType,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    await batch.commit();
    console.log(`Successfully uploaded ${prTypes.length} PR types to Firestore!`);
    
    // List what was uploaded
    prTypes.forEach(prType => {
      console.log(`- ${prType.activity_name} (${prType.activity_key})`);
    });
    
  } catch (error) {
    console.error('Error uploading PR types:', error);
  } finally {
    process.exit(0);
  }
}

uploadPRTypes();