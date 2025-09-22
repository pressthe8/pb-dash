import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { SlackNotificationPayload } from './types';

const SLACK_WEBHOOK_URL = defineSecret('SLACK_WEBHOOK_URL');

export const sendSlackNotification = onCall<SlackNotificationPayload>(
  {
    secrets: [SLACK_WEBHOOK_URL],
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      console.warn('Unauthorized call to sendSlackNotification');
      throw new Error('Unauthorized: User must be authenticated to call this function.');
    }

    const { type, userId, details } = request.data;
    const webhookUrl = SLACK_WEBHOOK_URL.value();

    if (!webhookUrl) {
      console.error('SLACK_WEBHOOK_URL secret is not set.');
      throw new Error('Server configuration error: Slack webhook URL is missing.');
    }

    let blocks: any[] = [];

    switch (type) {
      case 'new_user':
        blocks = [
          {
            "type": "header",
            "text": {
              "type": "plain_text",
              "text": "🎉 New User Signed Up!"
            }
          },
          {
            "type": "section",
            "fields": [
              { "type": "mrkdwn", "text": `*User ID:*\n\`${userId || 'N/A'}\`` },
              { "type": "mrkdwn", "text": `*Auth Provider:*\n${details?.authProvider || 'N/A'}` },
              { "type": "mrkdwn", "text": `*Timestamp:*\n${new Date().toISOString()}` }
            ]
          },
          {
            "type": "context",
            "elements": [
              { "type": "mrkdwn", "text": "App Activity" }
            ]
          }
        ];
        break;

      case 'error':
        // Truncate stack trace if too long for Slack
        const stackTrace = details?.errorStack || 'No stack trace provided.';
        const truncatedStack = stackTrace.length > 2000 
          ? stackTrace.substring(0, 2000) + '...\n[Stack trace truncated]'
          : stackTrace;

        blocks = [
          {
            "type": "header",
            "text": {
              "type": "plain_text",
              "text": "🚨 Application Error!"
            }
          },
          {
            "type": "section",
            "fields": [
              { "type": "mrkdwn", "text": `*Error Message:*\n\`${details?.errorMessage || 'N/A'}\`` },
              { "type": "mrkdwn", "text": `*Context:*\n\`${details?.context || 'N/A'}\`` },
              { "type": "mrkdwn", "text": `*Affected User ID:*\n\`${userId || 'N/A'}\`` },
              { "type": "mrkdwn", "text": `*Timestamp:*\n${new Date().toISOString()}` }
            ]
          },
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": `*Stack Trace:*\n\`\`\`\n${truncatedStack}\n\`\`\``
            }
          },
          {
            "type": "context",
            "elements": [
              { "type": "mrkdwn", "text": "System Alerts" }
            ]
          }
        ];
        break;

      case 'pb_image_saved':
        blocks = [
          {
            "type": "header",
            "text": {
              "type": "plain_text",
              "text": "🖼️ New PB Image Generated!"
            }
          },
          {
            "type": "section",
            "fields": [
              { "type": "mrkdwn", "text": `*User:*\n${details?.userDisplayName || 'Unknown User'}` },
              { "type": "mrkdwn", "text": `*Sport:*\n${details?.sport || 'N/A'}` },
              { "type": "mrkdwn", "text": `*User ID:*\n\`${userId || 'N/A'}\`` },
              { "type": "mrkdwn", "text": `*Timestamp:*\n${new Date().toISOString()}` }
            ]
          }
        ];
        
        // Add image section if URL is provided
        if (details?.imageUrl) {
          blocks.push({
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": `*View Image:* <${details.imageUrl}|Click here to view the PB image>`
            }
          });
        }
        
        blocks.push({
          "type": "context",
          "elements": [
            { "type": "mrkdwn", "text": "Feature Usage" }
          ]
        });
        break;

      default:
        console.warn(`Unknown Slack notification type: ${type}`);
        throw new Error(`Invalid notification type: ${type}`);
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ blocks }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to send Slack message: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`Slack API error: ${errorText}`);
      }

      console.log(`Slack notification sent successfully for type: ${type}`);
      return { success: true };
    } catch (error) {
      console.error(`Error sending Slack notification for type ${type}:`, error);
      throw new Error(`Failed to send Slack notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);