const assert = require('node:assert/strict');
const test = require('node:test');
const { gridSport, postSlackActivity } = require('../lib/slackNotifications');

const mockWebhook = 'https://example.invalid/slack-test';
process.env.SLACK_WEBHOOK_URL = mockWebhook;

test('a saved PB image uses plain text for account data and links to the saved image', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('ok'));
  const imageUrl = 'https://storage.googleapis.com/pb-test/pr_images/account/pbdash_grid.png';
  await postSlackActivity({
    type: 'pb_image_saved',
    uid: 'account',
    displayName: 'Name <!channel>\nExample',
    imageUrl,
    sport: gridSport('skierg'),
  });

  assert.equal(fetch.mock.callCount(), 1);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, mockWebhook);
  assert.equal(options.redirect, 'error');
  const payload = JSON.parse(options.body);
  assert.equal(payload.text, 'PB image saved');
  assert.deepEqual(payload.blocks[1].fields, [
    { type: 'plain_text', text: 'User ID\naccount' },
    { type: 'plain_text', text: 'User\nName <!channel> Example' },
    { type: 'plain_text', text: 'Sport\nSki' },
  ]);
  assert.deepEqual(payload.blocks[2], {
    type: 'image', image_url: imageUrl, alt_text: 'PB Dash personal best grid',
  });
  assert.equal(payload.blocks[3].text.text, `<${imageUrl}|View PB image>`);
  assert.equal(payload.unfurl_media, false);
  assert.equal(gridSport('toString'), undefined);
  assert.equal(gridSport('<!here>'), undefined);
});

test('a webhook rejection or request failure stays inside the notification helper', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('rejected', { status: 503 }));
  const activity = { type: 'concept2_connected', uid: 'account', signInProvider: 'google.com' };
  await postSlackActivity(activity);
  const payload = JSON.parse(fetch.mock.calls[0].arguments[1].body);
  assert.equal(payload.text, 'New Concept2 connection');
  assert.deepEqual(payload.blocks[1].fields[1], { type: 'plain_text', text: 'Sign-in provider\nGoogle' });

  fetch.mock.mockImplementation(async () => { throw new Error(mockWebhook); });
  await postSlackActivity(activity);
  assert.equal(fetch.mock.callCount(), 2);
});
