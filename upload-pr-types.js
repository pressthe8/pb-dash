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
    
    // Handle different JSON structures
    let prTypesData;
    if (Array.isArray(jsonData)) {
      // If it's already an array
      prTypesData = jsonData;
    } else if (jsonData.pr_types && Array.isArray(jsonData.pr_types)) {
      // If it's wrapped in an object with pr_types property
      prTypesData = jsonData.pr_types;
    } else if (jsonData.data && Array.isArray(jsonData.data)) {
      // If it's wrapped in an object with data property
      prTypesData = jsonData.data;
    } else {
      throw new Error('Could not find array of PR types in JSON file. Expected an array or object with "pr_types" or "data" property.');
    }

    console.log(`Found ${prTypesData.length} PR types to upload`);

    // Upload each PR type
    const batch = db.batch();
    
    prTypesData.forEach(prType => {
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
    
  } catch (error) {
    console.error('Error uploading PR types:', error);
    
    // Additional debugging info
    if (error.message.includes('forEach')) {
      console.log('\nDebugging info:');
      try {
        const rawData = fs.readFileSync('pr_types.json', 'utf8');
        const jsonData = JSON.parse(rawData);
        console.log('JSON structure:', typeof jsonData);
        console.log('JSON keys:', Object.keys(jsonData));
        console.log('First few characters of file:', rawData.substring(0, 100));
      } catch (debugError) {
        console.log('Could not read file for debugging:', debugError.message);
      }
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