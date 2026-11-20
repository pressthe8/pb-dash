import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Read only the Firebase settings above so Vite need not bundle the entire environment.
const missingSettings = Object.entries(firebaseConfig).filter(([, value]) => !value).map(([key]) => key);
if (missingSettings.length > 0) {
  throw new Error(`Missing Firebase configuration: ${missingSettings.join(', ')}`);
}

// Validate that environment variables don't contain placeholder values
const placeholderPatterns = [
  'your_firebase_api_key',
  'your_project_id',
  'your_messaging_sender_id',
  'your_app_id'
];

const hasPlaceholders = Object.values(firebaseConfig).some(value => 
  placeholderPatterns.some(pattern => value.includes(pattern))
);

if (hasPlaceholders) {
  throw new Error('Firebase configuration contains placeholder values. Please update your .env file with actual Firebase credentials.');
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);

export default app;
