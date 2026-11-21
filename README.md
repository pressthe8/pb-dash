# Concept2 Rowing Data Visualization App

A modern, responsive web application that connects to your Concept2 Logbook account to visualize and analyze your rowing performance data. Built with React, TypeScript, Firebase, and the Concept2 API.

## Features

### 🚣 Concept2 Integration
- **Secure OAuth2 Authentication** - Connect your Concept2 account safely
- **Automatic Data Sync** - Import all your historical workout data
- **Real-time Updates** - Keep your data synchronized with Concept2

### 📊 Performance Analytics
- **Workout Statistics** - Total workouts, distance, time, and averages
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
     - Local development: `http://localhost:5173/auth/callback`
     - Netlify dev branch: `https://dev--pb-dash.netlify.app/auth/callback`
     - Production: `https://pbdash.pressthe8.com/auth/callback`

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd concept2-rowing-dashboard
   ```

2. **Install dependencies**
   Use Node.js 22 for the Functions build.

   ```bash
   npm install
   npm --prefix functions ci
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
   ```

   Use the public Firebase web config for your target project. Concept2 credentials belong in Secret Manager.

4. **Configure Firebase Cloud Functions**

   Set up Secret Manager for your target project and follow the [Functions deployment instructions](#firebase-functions-deployment).

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

#### 4. Firestore rules and indexes

The rules and index definitions are checked in as `firestore.rules` and `firestore.indexes.json`. Token and OAuth state documents are accessible only to the backend. Signed-in users can read their own workouts and PBs and update their own profile.

## Troubleshooting

### "Internal" Error During Data Sync

Check the Cloud Functions logs for the underlying error. If the logs report missing Concept2 credentials, check that `CONCEPT2_CLIENT_ID` and `CONCEPT2_CLIENT_SECRET` exist in Secret Manager for that Firebase project. After adding or changing a secret, [redeploy the functions](#firebase-functions-deployment) so they pick up the new version.

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
   - Use the registered `http://localhost:5173/auth/callback` for local Concept2 sign-in.

3. **Common WebContainer Domain Patterns**:
   - `[random-id]-5173.preview.webcontainer.io`
   - `[random-id]-3000.preview.webcontainer.io`
   - `[random-id]-8080.preview.webcontainer.io`

4. **Important Notes**:
   - Each new WebContainer session may get a different URL
   - You may need to update the authorized domain when restarting
   - The domain must match exactly (case-sensitive)
   - Don't include `https://` or port numbers in the authorized domain

### Concept2 OAuth and Firestore errors

- Confirm the app is using the intended Firebase project and that project's Functions and rules are deployed.
- Check the Concept2 app registration for the exact callback shown in the prerequisites.
- For a token exchange failure, check the Functions logs and the target project's Secret Manager configuration.
- For Firestore query failures, check the Functions logs and the deployed indexes for the affected project.

## Deployment

### Firebase Functions Deployment

Use Node.js 22 and a current [Firebase CLI](https://firebase.google.com/docs/cli). The GitHub Actions workflow installs dependencies and builds the Functions package. Deploy manually from the repository root.

For a new target project, set `CONCEPT2_CLIENT_ID`, `CONCEPT2_CLIENT_SECRET`, and `SLACK_WEBHOOK_URL` in that project's Secret Manager. Use `firebase functions:secrets:set SECRET_NAME --project PROJECT_ID` to enter a value at the prompt. Existing projects can reuse their configured secrets for a runtime upgrade.

```bash
npm --prefix functions ci
npm --prefix functions run build
```

Use the development target for Firebase deployment testing:

```bash
firebase deploy --only functions --project bolt-c2
```

For the server-side OAuth cutover on dev, deploy Functions first. Remove the legacy Concept2 variables from the Netlify dev build and publish the matching frontend. Once it uses the new callables, apply the rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project bolt-c2
```

Existing users can keep their saved connections until Concept2 rejects their refresh token or the app credentials change. Rotate the old dev client secret in Concept2 after the frontend no longer needs it, update Secret Manager, and redeploy the Functions that use it.

Run the production deployment separately when ready:

```bash
firebase deploy --only functions --project pb-dash
```

### Netlify Deployment

1. **Connect your repository** to Netlify
2. **Configure build settings**:
   - Build command: `npm run build`
   - Publish directory: `dist`
3. **Set environment variables** in Netlify dashboard
4. **Update Firebase authorized domains** to include your production domain
5. **Update Concept2 redirect URI** to your production domain
6. **Deploy the site on Netlify**

The `netlify.toml` file is already configured for proper SPA routing.

### Environment Variables for Production

Ensure all environment variables are set in your Netlify dashboard:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

**Important**: 
- Update your Firebase authorized domains to include your production domain: `your-domain.com`
- Confirm `https://pbdash.pressthe8.com/auth/callback` is registered in the Concept2 Developer Portal.
- Ensure Firebase Functions have the Concept2 credentials configured in production

## Usage

1. **Visit your deployed application**
2. **Sign in** using Google authentication
3. **Connect your Concept2 account** via OAuth
4. **View your dashboard** with imported workout data
5. **Sync New Data** adds workouts the app hasn't imported yet. In Profile → Workout data, select **Sync edits and deletions** after editing or deleting a workout in Concept2. **Recalculate All PRs** rebuilds personal bests from the workouts already stored in PB Dash.

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
