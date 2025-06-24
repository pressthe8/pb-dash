// This script works with Firebase CLI authentication
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, writeBatch, serverTimestamp } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

// Your Firebase config (from your .env file)
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

async function uploadPRTypes() {
  try {
    console.log('Starting PR types upload...');
    
    // Load environment variables
    require('dotenv').config();
    
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    
    // Load PR types from JSON file
    const jsonFilePath = path.join(__dirname, 'pr_types.json');
    
    if (!fs.existsSync(jsonFilePath)) {
      console.error('Error: pr_types.json file not found!');
      process.exit(1);
    }
    
    const jsonData = fs.readFileSync(jsonFilePath, 'utf8');
    const prTypes = JSON.parse(jsonData);
    
    console.log(`Loaded ${prTypes.length} PR types from pr_types.json`);
    
    const batch = writeBatch(db);
    
    prTypes.forEach((prType) => {
      const docRef = doc(collection(db, 'pr_types'), prType.activity_key);
      batch.set(docRef, {
        ...prType,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
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
  }
}

uploadPRTypes();