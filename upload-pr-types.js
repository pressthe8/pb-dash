const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase Admin
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function uploadPRTypes() {
  try {
    // Read the JSON file
    const rawData = fs.readFileSync('pr_types.json', 'utf8');
    const jsonData = JSON.parse(rawData);
    
    console.log('JSON structure detected:', typeof jsonData);
    console.log('JSON keys:', Object.keys(jsonData));
    
    // Handle object structure where keys are activity_keys
    let prTypesData;
    if (Array.isArray(jsonData)) {
      // If it's already an array
      prTypesData = jsonData;
      console.log('Processing as array structure');
    } else if (typeof jsonData === 'object' && jsonData !== null) {
      // Convert object to array of values
      prTypesData = Object.values(jsonData);
      console.log('Processing as object structure - converting to array');
    } else {
      throw new Error('Invalid JSON structure. Expected an array or object.');
    }

    console.log(`Found ${prTypesData.length} PR types to upload`);

    // Upload each PR type
    const batch = db.batch();
    
    prTypesData.forEach((prType, index) => {
      // Validate that each item has required fields
      if (!prType.activity_key || !prType.activity_name) {
        console.error(`Invalid PR type at index ${index}:`, prType);
        throw new Error(`PR type at index ${index} is missing required fields (activity_key or activity_name)`);
      }
      
      // Use the activity_key as the document ID
      const docRef = db.collection('pr_types').doc(prType.activity_key);
      
      // Add timestamps
      const prTypeWithTimestamps = {
        ...prType,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      };
      
      batch.set(docRef, prTypeWithTimestamps);
      console.log(`Added ${prType.activity_name} (${prType.activity_key}) to batch`);
    });

    // Commit the batch
    await batch.commit();
    console.log('Successfully uploaded all PR types!');
    
    // Verify the upload
    const snapshot = await db.collection('pr_types').get();
    console.log(`Verification: ${snapshot.size} documents now exist in pr_types collection`);
    
    // Show a few examples of what was uploaded
    console.log('\nSample uploaded documents:');
    snapshot.docs.slice(0, 3).forEach(doc => {
      const data = doc.data();
      console.log(`- ${data.activity_name} (${doc.id}): ${data.metric_type}, order: ${data.display_order}`);
    });
    
  } catch (error) {
    console.error('Error uploading PR types:', error);
    
    // Additional debugging info
    console.log('\nDebugging info:');
    try {
      const rawData = fs.readFileSync('pr_types.json', 'utf8');
      const jsonData = JSON.parse(rawData);
      console.log('JSON type:', typeof jsonData);
      console.log('Is array:', Array.isArray(jsonData));
      console.log('Keys:', Object.keys(jsonData).slice(0, 5)); // Show first 5 keys
      console.log('First value:', Object.values(jsonData)[0]);
    } catch (debugError) {
      console.log('Could not read file for debugging:', debugError.message);
    }
  }
}

// Run the upload
uploadPRTypes().then(() => {
  console.log('Script completed');
  process.exit(0);
}).catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});