# PB Dash architecture

PB Dash is a React and Vite single-page app backed by Firebase Auth, Firestore, Cloud Functions and Storage. Concept2 Logbook supplies workout history. Netlify builds the frontend from the repository, and Firebase Hosting has a separate SPA configuration. Both rewrite client routes to the HTML entry point.

## Frontend

| Route | Responsibility |
| --- | --- |
| `/login` | Email and Google sign-in, account creation and password reset |
| `/auth/callback` | Completes Concept2 authorization and coordinates the initial import and record processing |
| `/dashboard` | Prompts for Logbook connection or shows RowErg, BikeErg and SkiErg totals, workout radar and personal bests |
| `/profile` | Preferences, workout maintenance, PB image sharing, disconnection and account deletion |
| `/review/2026` | Authenticated RowErg review built from saved workouts, with an overview poster and development-only sample profiles |

[App routing](../src/App.tsx) gates protected pages on Firebase Auth. [The auth hook](../src/hooks/useAuth.ts) also tracks the Concept2 connection and starts a background incremental sync for connected sessions. [FirebaseService](../src/services/firebaseService.ts) reads workout and profile documents. [DataCacheService](../src/services/dataCacheService.ts) caches reads per user, and sync and record-processing flows invalidate the affected entries. The review queries its workout date range directly and aggregates it in the browser.

## Connect, import and calculate

1. A signed-in browser calls `beginConcept2Connection` with its callback URL. The backend creates a short-lived OAuth attempt tied to the Firebase user and returns the Concept2 authorization URL.
2. Concept2 redirects to `/auth/callback`. The browser passes the code and state to `completeConcept2Connection`. The callable checks and consumes state, exchanges the code and saves credentials server-side.
3. `initialDataLoadFunction` imports workout history. The callback then runs a full record build for a new history or processes new results when an existing history needs updating.
4. `incrementalSyncFunction` imports new workouts. `reconcileConcept2History` compares saved history with Concept2 so edits and deletions can update records. These operations coordinate through a per-user workout sync lock.
5. `processAllResultsForPRs` can rebuild records from saved workouts. Record eligibility and ranking live in [prEligibility.ts](../functions/src/prEligibility.ts) and [personalBests.ts](../functions/src/personalBests.ts). Periods use the workout’s recorded calendar date, with seasons running May through April.

The [Functions entry point](../functions/src/index.ts) lists deployed callable names. The [browser client](../src/services/cloudFunctions.ts) is the corresponding call site.

## Data and access

| Path | Purpose |
| --- | --- |
| `users/{uid}` | Profile and preferences |
| `users/{uid}/results/{id}` | Imported Concept2 workouts |
| `users/{uid}/pr_types/{id}` and `users/{uid}/pr_events/{id}` | Activities and personal record events |
| `user_tokens/user_{uid}` and `concept2_oauth_states/{uid}` | Server-side credentials and pending authorization |
| `users/{uid}/sync_state/workouts` | Server-side sync coordination |
| `users/{uid}/notification_state/slack` | Server-side notification state |
| `account_deletions/{uid}` | Guard for deletion and overlapping writes |

[Firestore rules](../firestore.rules) permit athletes to read their own workout and record data. Callable Functions use Firebase Admin for imports, sync and record writes. Concept2 and Slack secrets live in Secret Manager. PB image upload and account deletion run through callables, with [Storage rules](../storage.rules) defining browser access to shared images.

## Making changes

- Start with the [README](../README.md) for setup, checks and deployment. Use a development project for tests that write data.
- Update the callable export and its browser client together when changing a callable contract.
- Review [Firestore rules and indexes](../firebase.json) with any data-model change. Run the Functions tests for changes to workout eligibility, periods, record ordering or notifications.
- Record completed changes in [task history](../TASK.md) and open items in [pending work](../PENDING.md).
