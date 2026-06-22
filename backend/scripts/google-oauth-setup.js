'use strict';

// One-time interactive script to obtain a Google Calendar refresh token.
// Run locally: node scripts/google-oauth-setup.js <client_id> <client_secret>
//
// 1. Opens a consent URL — paste it into a browser and log in with the
//    Google account whose calendar should receive bookings.
// 2. Google redirects to a URL containing a `code` query param (the page
//    will show an error since nothing is listening on that port — that's
//    fine, just copy the `code` value out of the browser's address bar).
// 3. Paste that code back into this script's prompt.
// 4. The resulting refresh_token gets printed — copy it into the client's
//    google_refresh_token field in clients.json.

const readline = require('readline');
const { google } = require('googleapis');

const [, , clientId, clientSecret] = process.argv;

if (!clientId || !clientSecret) {
  console.error('Usage: node scripts/google-oauth-setup.js <client_id> <client_secret>');
  process.exit(1);
}

const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; // out-of-band: code shown in browser, no listener needed
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

async function main() {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token to be issued even on repeat consent
    scope: SCOPES,
  });

  console.log('\n1. Open this URL in a browser and approve access:\n');
  console.log(authUrl);
  console.log('\n2. After approving, copy the code Google shows you.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise((resolve) => rl.question('Paste the code here: ', resolve));
  rl.close();

  const { tokens } = await oauth2Client.getToken(code.trim());

  if (!tokens.refresh_token) {
    console.error(
      '\nNo refresh_token was returned. This usually means the account already granted ' +
      'consent before without "prompt: consent" forcing a new one — revoke access at ' +
      'https://myaccount.google.com/permissions and run this script again.'
    );
    process.exit(1);
  }

  console.log('\nSuccess. Copy this refresh token into the client\'s google_refresh_token field in clients.json:\n');
  console.log(tokens.refresh_token);
  console.log('');
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
