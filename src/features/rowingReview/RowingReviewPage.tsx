import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';
import { FirebaseService } from '../../services/firebaseService';
import { REVIEW_START, reviewWindow, summarizeReview, type ReviewSummary } from './reviewData';
import { fullRange } from './reviewPresentation';
import { ReviewFrame, ReviewPlayer } from './ReviewPlayer';

const DevProfiles = import.meta.env.DEV ? lazy(() => import('./ReviewDevProfiles')) : null;

type ReviewLoad =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; review: ReviewSummary };

function LoadingReview({ controls }: { controls?: ReactNode }) {
  return (
    <ReviewFrame controls={controls}>
      <div className="stage" data-scene="message">
        <div className="scene" data-chapter="message" role="status">
          <LoadingSpinner size="lg" />
          <p className="note">Loading your saved workouts…</p>
        </div>
      </div>
    </ReviewFrame>
  );
}

function ReviewResult({ review, controls, sample, connected }: {
  review: ReviewSummary; controls?: ReactNode; sample?: string; connected: boolean;
}) {
  if (review.sessions > 0) return <ReviewPlayer review={review} controls={controls} sample={sample} />;

  return (
    <ReviewFrame controls={controls} sample={!!sample}>
      <section className="stage" data-scene="empty">
        <div className="scene" data-chapter="empty">
          <div className="copy">
            <p className="kicker">RowErg · {fullRange}</p>
            <h2>No rowing sessions yet.</h2>
            <p className="note">There are no saved RowErg workouts with distance in this review period.</p>
            {!sample && <Link to={connected ? '/profile' : '/dashboard'} className="button">
              {connected ? 'Manage workout sync' : 'Connect Concept2 from Dashboard'}
            </Link>}
          </div>
        </div>
      </section>
    </ReviewFrame>
  );
}

function OwnerReview({ uid, connected, controls }: { uid: string; connected: boolean; controls?: ReactNode }) {
  const [load, setLoad] = useState<ReviewLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let obsolete = false;
    const window = reviewWindow();
    const service = FirebaseService.getInstance();

    service.getResultsInDateRange(uid, REVIEW_START, window.endExclusive).then(
      workouts => {
        if (!obsolete) setLoad({ status: 'ready', review: summarizeReview(workouts, window) });
      },
      () => {
        if (!obsolete) setLoad({ status: 'error' });
      },
    );

    return () => { obsolete = true; };
  }, [uid, attempt]);

  if (load.status === 'loading') return <LoadingReview controls={controls} />;
  if (load.status === 'error') {
    return (
      <ReviewFrame controls={controls}>
        <section className="stage" data-scene="message">
          <div className="scene" data-chapter="message">
            <div className="copy">
              <h2>Could not load your review.</h2>
              <p className="note" role="alert">We couldn’t read your saved workouts. Try loading them again.</p>
              <button className="button primary" type="button" onClick={() => {
                setLoad({ status: 'loading' });
                setAttempt(value => value + 1);
              }}>Retry</button>
            </div>
          </div>
        </section>
      </ReviewFrame>
    );
  }

  return <ReviewResult review={load.review} controls={controls} connected={connected} />;
}

export default function RowingReviewPage() {
  const { user, concept2Connected } = useAuth();
  if (!user) return null;

  // Key the owner view by UID so a new account can never render the last account's review.
  if (!DevProfiles) return <OwnerReview key={user.uid} uid={user.uid} connected={concept2Connected} />;

  return (
    <Suspense fallback={<LoadingReview />}>
      <DevProfiles key={user.uid} render={(controls, sample) => sample
        ? <ReviewResult key={sample.name} review={sample.review} sample={sample.name} controls={controls} connected={false} />
        : <OwnerReview key={user.uid} uid={user.uid} connected={concept2Connected} controls={controls} />} />
    </Suspense>
  );
}
