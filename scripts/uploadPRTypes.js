const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('../path/to/your/service-account-key.json'); // You'll need to download this
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function uploadPRTypes() {
  try {
    console.log('Starting PR types upload...');
    
    // Read the pr_types.json file
    const prTypesPath = path.join(__dirname, '../pr_types.json');
    const prTypesData = JSON.parse(fs.readFileSync(prTypesPath, 'utf8'));
    
    console.log(`Found ${prTypesData.length} PR types to upload`);
    
    // Upload to the top-level pr_types collection (template collection)
    const batch = db.batch();
    
    for (const prType of prTypesData) {
      const docRef = db.collection('pr_types').doc(prType.activity_key);
      batch.set(docRef, {
        ...prType,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    await batch.commit();
    console.log('✅ Successfully uploaded all PR types to Firestore!');
    
    // Optionally, also update existing users' pr_types subcollections
    console.log('Checking for existing users to update...');
    const usersSnapshot = await db.collection('users').get();
    
    if (!usersSnapshot.empty) {
      console.log(`Found ${usersSnapshot.size} users. Updating their PR types...`);
      
      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const userPRTypesRef = db.collection('users').doc(userId).collection('pr_types');
        
        const userBatch = db.batch();
        
        for (const prType of prTypesData) {
          const userPRTypeRef = userPRTypesRef.doc(prType.activity_key);
          userBatch.set(userPRTypeRef, {
            ...prType,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true }); // Use merge to preserve any user customizations
        }
        
        await userBatch.commit();
        console.log(`✅ Updated PR types for user ${userId}`);
      }
    }
    
    console.log('🎉 All done! PR types uploaded successfully.');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error uploading PR types:', error);
    process.exit(1);
  }
}

uploadPRTypes();