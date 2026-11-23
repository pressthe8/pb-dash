# PB Dash task history

Historical record of completed work through 2026-11-22.

## Completed

- **Onboarding and dashboard redesign.** The homepage, Logbook connection, dashboard and profile use the 2026 review’s visual language. The dashboard shows a twelve-month workout radar, machine-specific totals and personal bests with period filters and pace history. The [previous UI](archive/README.md) can be restored from its snapshot.
- **2026 RowErg Review.** Signed-in athletes can replay a review of their saved Concept2 rowing data and share an overview image.
- **Workout maintenance.** Profile tools import new workouts, reconcile edits and deletions in the Logbook, and rebuild personal records from imported history.
- **Account and sharing.** Firebase handles sign-in and password reset. Cloud Functions handle Concept2 authorization, account deletion and PB image uploads.

## Completed verification

- The redesign was browser-checked at desktop and mobile widths with synthetic workout data, local Firebase emulators and simulated Concept2 responses.

Earlier implementation notes are preserved in the [previous task log](archive/task-logs/TASK.md) and [legacy task log](TASK_legacy.md). See [pending work](PENDING.md) for open items.
