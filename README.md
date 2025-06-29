# Concept2 Rowing Data Visualization App

A modern, responsive web application that connects to your Concept2 Logbook account to visualize and analyze your rowing performance data. Built with React, TypeScript, Firebase, and the Concept2 API.

## Features

### 🚣 Concept2 Integration
- **Secure OAuth2 Authentication** - Connect your Concept2 account safely
- **Automatic Data Sync** - Import all your historical workout data
- **Real-time Updates** - Keep your data synchronized with Concept2

### 📊 Performance Analytics
- **Workout Statistics** - Total workouts, distance, time, and averages
- **Recent Activity** - View your latest rowing sessions
- **Beautiful Dashboard** - Clean, modern interface with intuitive navigation

### 🔒 Security & Privacy
- **Secure Token Storage** - OAuth tokens safely stored in Firebase
- **User Isolation** - Your data is private and associated only with your account
- **Google Authentication** - Secure sign-in with your Google account

### 🎨 Modern Design
- **Responsive Design** - Works perfectly on desktop, tablet, and mobile
- **Beautiful UI** - Gradient backgrounds, smooth animations, and professional styling
- **Accessible** - Built with accessibility best practices

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Firebase (Firestore, Authentication, Cloud Functions)
- **API Integration**: Concept2 Logbook API
- **Deployment**: Netlify
- **Build Tool**: Vite

## Getting Started

### Prerequisites

1. **Firebase Project**
   - Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Firestore Database
   - Enable Authentication (Google sign-in provider)
   - Enable Cloud Functions
   - **🚨 CRITICAL**: Add authorized domains for your development environment

2. **Concept2 API Credentials**
   - Register your application at [Concept2 Developer Portal](https://log.concept2.com/developers)
   - Obtain your Client ID and Client Secret
   - **CRITICAL**: Set your redirect URI to match your environment:
     - Development: `https://localhost:5173/auth/callback`
     - WebContainer: `https://[your-webcontainer-url]/auth/callback`
     - Production: `https://your-domain.com/auth/callback`

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd concept2-rowing-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd functions
   npm install
   cd ..
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```
   
   Fill in your environment variables:
   ```env
   # Firebase Configuration
   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id

   # Concept2 API Configuration
   VITE_CONCEPT2_CLIENT_ID=your_concept2_client_id
   VITE_CONCEPT2_CLIENT_SECRET=your_concept2_client_secret
   ```

   **⚠️ IMPORTANT**: Make sure your Concept2 credentials are correct and the redirect URI in your Concept2 Developer Portal matches exactly your current environment URL.

4. **🚨 CRITICAL: Configure Firebase Cloud Functions Secrets**
   
   **The most common cause of "INTERNAL" errors is missing Concept2 API credentials for Cloud Functions.**
   
   **Method 1: Using Firebase Console (Recommended)**
   
   1. Go to [Firebase Console](https://console.firebase.google.com/)
   2. Select your project
   3. Navigate to **Functions** → **Configuration** tab
   4. Click **"Add secret"**
   5. Create these two secrets:
      - **Secret name**: `CONCEPT2_CLIENT_ID`
      - **Secret value**: Your Concept2 Client ID from the Developer Portal
      - Click **"Add secret"**
      
      - **Secret name**: `CONCEPT2_CLIENT_SECRET`
      - **Secret value**: Your Concept2 Client Secret from the Developer Portal
      - Click **"Add secret"**
   
   **Method 2: Using Firebase CLI**
   
   ```bash
   # Install Firebase CLI if you haven't already
   npm install -g firebase-tools
   
   # Login to Firebase
   firebase login
   
   # Set your project
   firebase use your-project-id
   
   # Create the secrets (replace with your actual credentials)
   firebase functions:secrets:set CONCEPT2_CLIENT_ID
   # Enter your Concept2 Client ID when prompted
   
   firebase functions:secrets:set CONCEPT2_CLIENT_SECRET
   # Enter your Concept2 Client Secret when prompted
   ```
   
   **Deploy functions with the new secrets**:
   ```bash
   firebase deploy --only functions
   ```
   
   **⚠️ CRITICAL**: Without these secrets, all data synchronization will fail with "INTERNAL" errors.

5. **🚨 CRITICAL: Configure Firebase Authorized Domains**
   
   **For WebContainer/Bolt environments**, you need to add your specific WebContainer URL:
   
   1. **Find your current URL**: Look at your browser address bar (e.g., `https://abc123-5173.preview.webcontainer.io`)
   2. **Copy the domain part**: `abc123-5173.preview.webcontainer.io` (without `https://` and without the path)
   3. **Add to Firebase**:
      - Go to [Firebase Console](https://console.firebase.google.com/)
      - Select your project
      - Navigate to **Authentication** → **Settings** tab
      - Scroll down to **"Authorized domains"**
      - Click **"Add domain"**
      - Enter your WebContainer domain: `abc123-5173.preview.webcontainer.io`
      - Click **"Add"**
   
   **Example WebContainer domains**:
   - `abc123-5173.preview.webcontainer.io`
   - `def456-5173.preview.webcontainer.io`
   - `xyz789-5173.preview.webcontainer.io`
   
   **Note**: Each WebContainer session gets a unique URL, so you may need to update this when starting a new session.

6. **Start development server**
   ```bash
   npm run dev
   ```

### Firebase Setup

#### 1. Enable Google Authentication

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Authentication**
4. Click on the **"Sign-in method"** tab
5. Click on **"Google"**
6. Toggle **"Enable"**
7. Add your project's support email
8. Click **"Save"**

#### 2. Enable Cloud Functions

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Functions**
4. Click **"Get started"** if you haven't enabled Functions yet
5. Follow the setup instructions

#### 3. Create Firestore Collections

The app will automatically create the following collections:
- `user_tokens` - Stores OAuth tokens securely
- `users/{userId}/results` - Stores rowing workout data (subcollection)
- `users/{userId}/pr_types` - Stores personal record types (subcollection)
- `users/{userId}/pr_events` - Stores personal record events (subcollection)

#### 4. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own tokens
    match /user_tokens/{document} {
      allow read, write: if request.auth != null && 
        (resource == null || resource.data.firebase_user_id == request.auth.uid);
    }
    
    // Users can only access their own data in subcollections
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

#### 5. Create Required Firestore Indexes

**🚨 CRITICAL STEP**: You MUST create these indexes manually in your Firebase Console before the OAuth flow will work. Without these indexes, you'll get "internal" errors during the callback process.

**Step-by-step instructions:**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database**
4. Click on the **"Indexes"** tab

**Create Single-Field Indexes:**

1. Click on the **"Single field"** tab
2. For each index below, click **"Create Index"**:

   **Index 1: user_tokens collection**
   - Collection ID: `user_tokens`
   - Field path: `firebase_user_id`
   - Query scopes: Collection
   - Click **"Create"**

   **Index 2: results subcollection**
   - Collection ID: `results`
   - Field path: `date`
   - Query scopes: Collection group
   - Click **"Create"**

   **Index 3: pr_types subcollection**
   - Collection ID: `pr_types`
   - Field path: `is_active`
   - Query scopes: Collection group
   - Click **"Create"**

   **Index 4: pr_types subcollection (display_order)**
   - Collection ID: `pr_types`
   - Field path: `display_order`
   - Query scopes: Collection group
   - Click **"Create"**

   **Index 5: pr_events subcollection**
   - Collection ID: `pr_events`
   - Field path: `activity_key`
   - Query scopes: Collection group
   - Click **"Create"**

   **Index 6: pr_events subcollection (achieved_at)**
   - Collection ID: `pr_events`
   - Field path: `achieved_at`
   - Query scopes: Collection group
   - Click **"Create"**

**Create Composite Indexes:**

1. Click on the **"Composite"** tab
2. For each composite index below, click **"Create Index"**:

   **Composite Index 1: pr_types subcollection**
   - Collection ID: `pr_types`
   - Add field: `is_active` (Ascending)
   - Add field: `display_order` (Ascending)
   - Query scopes: Collection group
   - Click **"Create"**

   **Composite Index 2: pr_events subcollection**
   - Collection ID: `pr_events`
   - Add field: `activity_key` (Ascending)
   - Add field: `achieved_at` (Ascending)
   - Query scopes: Collection group
   - Click **"Create"**

**Important Notes:**
- **Collection group indexes** are required for subcollections (`results`, `pr_types`, `pr_events`)
- **Collection indexes** are for top-level collections (`user_tokens`)
- Indexes can take 5-10 minutes to build after creation
- You must wait for all indexes to finish building before the OAuth flow will work

**Alternative Method:**
If you can't find the index creation options:
1. Try running the OAuth flow (it will fail with "internal" error)
2. Check the Firebase Console logs for specific index creation links
3. Click those links to auto-create the required indexes
4. Then manually create any remaining indexes as described above

**Expected Result:**
After setup, you should see these indexes:
- **Single field tab**: 
  - `user_tokens.firebase_user_id` (Collection)
  - `results.date` (Collection group)
  - `pr_types.is_active` (Collection group)
  - `pr_types.display_order` (Collection group)
  - `pr_events.activity_key` (Collection group)
  - `pr_events.achieved_at` (Collection group)
- **Composite tab**: 
  - `pr_types` with `is_active` + `display_order` (Collection group)
  - `pr_events` with `activity_key` + `achieved_at` (Collection group)

## Troubleshooting

### "INTERNAL" Error During Data Sync

**🚨 MOST COMMON ISSUE**: If you see "Error syncing data: INTERNAL" or "Cloud Function initialDataLoadFunction failed: INTERNAL":

**Root Cause**: The Firebase Cloud Functions don't have the Concept2 API credentials configured as secrets.

**Solution**:

**Method 1: Firebase Console (Recommended)**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Functions** → **Configuration** tab
4. Click **"Add secret"**
5. Create these secrets:
   - `CONCEPT2_CLIENT_ID` with your Concept2 Client ID
   - `CONCEPT2_CLIENT_SECRET` with your Concept2 Client Secret
6. Deploy functions: `firebase deploy --only functions`

**Method 2: Firebase CLI**
```bash
# Set the secrets using Firebase CLI
firebase functions:secrets:set CONCEPT2_CLIENT_ID
firebase functions:secrets:set CONCEPT2_CLIENT_SECRET

# Deploy the functions
firebase deploy --only functions
```

**Verify the secrets are set**:
```bash
firebase functions:secrets:access CONCEPT2_CLIENT_ID
firebase functions:secrets:access CONCEPT2_CLIENT_SECRET
```

**Important**: 
- These are **secrets**, not environment variables
- Firebase Functions v2 uses `defineSecret()` which requires secrets to be set in Firebase Console or CLI
- Without these secrets, all data synchronization operations will fail with "INTERNAL" errors
- The old `firebase functions:config:set` method does NOT work with v2 functions

### Firebase Authentication Errors

#### "Firebase: Error (auth/unauthorized-domain)"

This error occurs when your development domain is not authorized in Firebase:

1. **For WebContainer/Bolt/Cloud IDEs** (MOST COMMON):
   - **Find your exact URL**: Look at your browser address bar
   - **Example**: `https://abc123-5173.preview.webcontainer.io/login`
   - **Extract domain**: `abc123-5173.preview.webcontainer.io`
   - **Add to Firebase**: Go to Firebase Console → Authentication → Settings → Authorized domains → Add domain
   - **Enter exactly**: `abc123-5173.preview.webcontainer.io` (no https://, no port, no path)

2. **For Local Development**:
   - Add `localhost:5173` to Firebase authorized domains
   - Make sure you're using `https://localhost:5173` (not `http://`)

3. **Common WebContainer Domain Patterns**:
   - `[random-id]-5173.preview.webcontainer.io`
   - `[random-id]-3000.preview.webcontainer.io`
   - `[random-id]-8080.preview.webcontainer.io`

4. **Important Notes**:
   - Each new WebContainer session may get a different URL
   - You may need to update the authorized domain when restarting
   - The domain must match exactly (case-sensitive)
   - Don't include `https://` or port numbers in the authorized domain

### OAuth Callback "Internal" Errors

If you see "Callback handling failed: internal" during the OAuth flow:

1. **Missing Firebase Secrets** (MOST COMMON):
   - This error typically means the Cloud Functions are missing Concept2 API secrets
   - Follow the "Configure Firebase Cloud Functions Secrets" section above
   - Ensure you create **secrets** (not config variables) for v2 functions

2. **Missing Firestore Indexes**:
   - Follow the "Create Required Firestore Indexes" section above carefully
   - Ensure you create **Collection group** indexes for subcollections
   - Wait 5-10 minutes for indexes to build after creation

3. **Check Firebase Functions Logs**:
   - Go to Firebase Console → Functions → Logs
   - Look for specific error messages about missing secrets or indexes
   - Use the provided links to create missing indexes automatically

4. **Verify Secret Configuration**:
   - Go to Firebase Console → Functions → Configuration
   - Ensure `CONCEPT2_CLIENT_ID` and `CONCEPT2_CLIENT_SECRET` secrets exist
   - If missing, create them and redeploy functions

### OAuth Token Exchange Errors

If you see "Token exchange failed" with an HTML error page:

1. **Check Concept2 Credentials**:
   - Verify `VITE_CONCEPT2_CLIENT_ID` and `VITE_CONCEPT2_CLIENT_SECRET` are correct
   - These should be from your Concept2 Developer Portal

2. **Check Redirect URI**:
   - In your Concept2 Developer Portal, ensure the redirect URI matches your current environment
   - WebContainer: `https://abc123-5173.preview.webcontainer.io/auth/callback`
   - Local: `https://localhost:5173/auth/callback`

3. **Environment Variables**:
   - Restart your dev server after changing `.env` file
   - Ensure no extra spaces or quotes around the values

### Firestore Permission Errors

If you see "Missing or insufficient permissions":

1. **Create Required Secrets** (see Firebase Setup section above)
2. **Create Required Indexes** (see Firebase Setup section above)
3. **Check Firestore Rules** are properly configured for subcollections
4. **Verify Authentication** is working (user should be signed in with Google)
5. **Wait for Index Building** - indexes can take 5-10 minutes to become active

### Common Issues

- **CORS Errors**: Make sure you're using `https://` (not `http://`)
- **State Parameter Errors**: Clear browser cache and localStorage
- **Index Creation**: Indexes can take a few minutes to build after creation
- **Domain Authorization**: Always add your exact development URL to Firebase authorized domains
- **WebContainer URLs**: Remember that WebContainer URLs change between sessions
- **Subcollection Indexes**: Make sure to use "Collection group" scope for subcollection indexes
- **Cloud Functions Secrets**: Ensure Concept2 API credentials are set as **secrets** (not config) for v2 functions
- **Secret vs Config**: Firebase Functions v2 uses `defineSecret()` which requires secrets, not the old `functions:config:set` method

## Deployment

### Netlify Deployment

1. **Connect your repository** to Netlify
2. **Configure build settings**:
   - Build command: `npm run build`
   - Publish directory: `dist`
3. **Set environment variables** in Netlify dashboard
4. **Update Firebase authorized domains** to include your production domain
5. **Update Concept2 redirect URI** to your production domain
6. **Configure Firebase Secrets for Production**:
   ```bash
   # Set production secrets
   firebase functions:secrets:set CONCEPT2_CLIENT_ID --project your-prod-project-id
   firebase functions:secrets:set CONCEPT2_CLIENT_SECRET --project your-prod-project-id
   
   # Deploy functions to production
   firebase deploy --only functions --project your-prod-project-id
   ```
7. **Deploy!**

The `netlify.toml` file is already configured for proper SPA routing.

### Environment Variables for Production

Ensure all environment variables are set in your Netlify dashboard:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_CONCEPT2_CLIENT_ID`
- `VITE_CONCEPT2_CLIENT_SECRET`

**Important**: 
- Update your Firebase authorized domains to include your production domain: `your-domain.com`
- Update your Concept2 Developer Portal redirect URI to your production domain: `https://your-domain.com/auth/callback`
- Ensure Firebase Functions have the Concept2 credentials configured as **secrets** in production
- Use the correct Firebase project ID for production deployments

## Usage

1. **Visit your deployed application**
2. **Sign in** using Google authentication
3. **Connect your Concept2 account** via OAuth
4. **View your dashboard** with imported workout data
5. **Sync new workouts** manually or they'll sync automatically

## API Reference

### Concept2 API Integration

The app integrates with the following Concept2 API endpoints:

- **OAuth Authorization**: `/oauth/authorize`
- **Token Exchange**: `/oauth/access_token`
- **User Results**: `/api/users/me/results`

### Firebase Collections

#### `user_tokens`
```javascript
{
  firebase_user_id: string,
  access_token: string,
  refresh_token: string,
  expires_in: number,
  token_type: string,
  scope: string,
  created_at: timestamp,
  updated_at: timestamp
}
```

#### `users/{userId}/results` (subcollection)
```javascript
{
  id: number,
  user_id: number,
  firebase_user_id: string,
  date: string,
  timezone: string | null,
  date_utc: string | null,
  distance: number,
  type: 'rower' | 'skierg' | 'bikeerg',
  time: number,
  time_formatted: string,
  workout_type: string,
  source: string,
  weight_class: string,
  verified: boolean,
  ranked: boolean,
  comments: string | null,
  privacy: string,
  raw_data: object,
  created_at: timestamp,
  updated_at: timestamp
}
```

#### `users/{userId}/pr_types` (subcollection)
```javascript
{
  activity_key: string,
  display_name: string,
  sport: string,
  metric_type: string,
  target_distance: number | null,
  target_time: number | null,
  is_active: boolean,
  display_order: number,
  created_at: timestamp,
  updated_at: timestamp
}
```

#### `users/{userId}/pr_events` (subcollection)
```javascript
{
  user_id: string,
  results_id: string,
  activity_key: string,
  pr_scope: string[],
  metric_type: string,
  metric_value: number,
  achieved_at: string,
  season_identifier: string,
  previous_record: object | null,
  created_at: timestamp,
  updated_at: timestamp
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please open an issue in the GitHub repository or contact the development team.

## Acknowledgments

- **Concept2** for providing the excellent Logbook API
- **Firebase** for reliable backend services
- **Tailwind CSS** for beautiful, responsive styling
- **React** and **TypeScript** for the robust frontend framework