// Simple Node.js script using firebase-admin (which works with require)
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin with your project ID
admin.initializeApp({
  projectId: 'bolt-c2', // Your Firebase project ID
});

const db = admin.firestore();

async function uploadPRTypes() {
  try {
    console.log('Starting PR types upload...');
    
    // Load PR types from JSON file
    const jsonFilePath = path.join(__dirname, 'pr_types.json');
    
    if (!fs.existsSync(jsonFilePath)) {
      console.error('Error: pr_types.json file not found!');
      process.exit(1);
    }
    
    const jsonData = fs.readFileSync(jsonFilePath, 'utf8');
    const prTypes = JSON.parse(jsonData);
    
    console.log(`Loaded ${prTypes.length} PR types from pr_types.json`);
    
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