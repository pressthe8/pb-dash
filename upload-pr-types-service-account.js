// Upload script using Firebase service account
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

async function uploadPRTypes() {
  try {
    console.log('Starting PR types upload...');
    
    // Check for service account key file
    const serviceAccountPath = path.join(__dirname, 'service-account-key.json');
    
    if (!fs.existsSync(serviceAccountPath)) {
      console.error('\n❌ Error: service-account-key.json file not found!');
      console.log('\n📋 To fix this:');
      console.log('1. Go to Firebase Console → Project Settings → Service Accounts');
      console.log('2. Click "Generate new private key"');
      console.log('3. Save the downloaded file as "service-account-key.json" in this directory');
      console.log('4. Run this script again');
      process.exit(1);
    }
    
    // Initialize Firebase Admin with service account
    const serviceAccount = require('./service-account-key.json');
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    
    const db = admin.firestore();
    
    // Load PR types from JSON file
    const jsonFilePath = path.join(__dirname, 'pr_types.json');
    
    if (!fs.existsSync(jsonFilePath)) {
      console.error('❌ Error: pr_types.json file not found!');
      process.exit(1);
    }
    
    const jsonData = fs.readFileSync(jsonFilePath, 'utf8');
    const prTypes = JSON.parse(jsonData);
    
    console.log(`📊 Loaded ${prTypes.length} PR types from pr_types.json`);
    
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
    console.log(`✅ Successfully uploaded ${prTypes.length} PR types to Firestore!`);
    
    console.log('\n📋 Uploaded PR types:');
    prTypes.forEach(prType => {
      console.log(`   - ${prType.activity_name} (${prType.activity_key})`);
    });
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('❌ Error: Required file not found!');
    } else if (error instanceof SyntaxError) {
      console.error('❌ Error: Invalid JSON format:', error.message);
    } else {
      console.error('❌ Error uploading PR types:', error.message);
    }
  } finally {
    process.exit(0);
  }
}

uploadPRTypes();