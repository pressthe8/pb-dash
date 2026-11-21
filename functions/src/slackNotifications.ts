import { getFirestore } from 'firebase-admin/firestore';
import { info, warn } from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';

export const slackWebhookUrl = defineSecret('SLACK_WEBHOOK_URL');

const sports = {
  rower: 'Row',
  bike: 'Bike',
  skierg: 'Ski',
} as const;

type GridSport = keyof typeof sports;

type SlackActivity = {
  uid: string;
} & (
  { type: 'concept2_connected'; signInProvider?: string } |
  { type: 'pb_image_saved'; displayName?: string; sport?: GridSport; imageUrl: string }
);

export function slackStateRef(uid: string) {
  return getFirestore().collection('users').doc(uid).collection('notification_state').doc('slack');
}

export function gridSport(value: unknown): GridSport | undefined {
  if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(sports, value)) return value as GridSport;
  return undefined;
}

function plainText(text: string) {
  return { type: 'plain_text' as const, text };
}

type PlainText = ReturnType<typeof plainText>;
type SlackBlock =
  | { type: 'header'; text: PlainText }
  | { type: 'section'; fields: PlainText[] }
  | { type: 'section'; text: { type: 'mrkdwn'; text: string } }
  | { type: 'image'; image_url: string; alt_text: string };

function displayName(value?: string) {
  const name = value?.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').trim();
  return name ? Array.from(name).slice(0, 100).join('') : 'PB Dash user';
}

export async function postSlackActivity(activity: SlackActivity): Promise<void> {
  try {
    const webhook = slackWebhookUrl.value();
    if (!webhook) {
      warn('Slack activity skipped: webhook unavailable', { event: activity.type });
      return;
    }

    const isConnection = activity.type === 'concept2_connected';
    const title = isConnection ? 'New Concept2 connection' : 'PB image saved';
    const fields = [plainText(`User ID\n${activity.uid}`)];
    if (isConnection) {
      const provider = activity.signInProvider === 'google.com' ? 'Google'
        : activity.signInProvider === 'password' ? 'Email' : 'Firebase';
      fields.push(plainText(`Sign-in provider\n${provider}`));
    } else {
      fields.push(plainText(`User\n${displayName(activity.displayName)}`));
      if (activity.sport) fields.push(plainText(`Sport\n${sports[activity.sport]}`));
    }
    const blocks: SlackBlock[] = [
      { type: 'header', text: plainText(title) },
      { type: 'section', fields },
    ];
    if (!isConnection) {
      blocks.push(
        { type: 'image', image_url: activity.imageUrl, alt_text: 'PB Dash personal best grid' },
        { type: 'section', text: { type: 'mrkdwn', text: `<${activity.imageUrl}|View PB image>` } },
      );
    }

    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: title, blocks, unfurl_links: false, unfurl_media: false }),
      redirect: 'error',
      signal: AbortSignal.timeout(2500),
    });
    await response.text();
    if (response.ok) {
      info('Slack activity delivered', { event: activity.type, uid: activity.uid });
    } else {
      warn('Slack activity rejected', { event: activity.type, status: response.status });
    }
  } catch {
    // Fetch errors can include the webhook URL. Keep response data and URLs out of logs.
    warn('Slack activity could not be delivered', { event: activity.type });
  }
}
