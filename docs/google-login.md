# Enable Google sign-in

The Google sign-in integration is implemented. It remains unavailable until you configure your own Web OAuth client ID. Email/password access continues to work. This flow needs no Google client secret and does not request Gmail access.

## 1. Create the Google client

1. Open the [Google Cloud console](https://console.cloud.google.com/) and select or create your project.
2. Open **Google Auth Platform**. Configure Branding with the app name **StockWise AI**, your support email, and developer contact email. In Audience, choose the appropriate audience; if the app is in testing, add the Google accounts you want to test as test users.
3. Go to **Clients → Create client → Web application** (also available through APIs & Services → Credentials).
4. Add **Authorized JavaScript origins**:
   - `http://localhost:5173` for this local frontend.
   - Your actual HTTPS frontend origin when deployed, without a path or trailing slash.
5. Create the client and copy its **Client ID**, which ends in `.apps.googleusercontent.com`. No authorized redirect URI is needed for this implementation's popup callback flow.

See Google's [client setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) and [button/popup guide](https://developers.google.com/identity/gsi/web/guides/display-button).

## 2. Configure locally

In `server/.env`:

```env
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
CLIENT_URL=http://localhost:5173
```

The API supplies this public client ID to the frontend. Optionally put the same value in `VITE_GOOGLE_CLIENT_ID` in `client/.env`; if present it must match the server value. Never put a client secret in the frontend.

Restart the backend and Vite after editing environment files. Open **http://localhost:5173/login**. The official Google button appears when configured. Browser privacy extensions or blocked Google scripts can prevent it loading; email sign-in remains available.

## 3. Grant access deliberately

Google sign-in authenticates an existing, invited StockWise account. It does not create public accounts or assign admin privileges. Its Gmail/Workspace address must match the invited account on first sign-in. Afterwards, the verified Google subject identifies that account even if its Google email changes.

To prepare a non-admin demo account for your Gmail, privately set `DEMO_LOGIN_EMAIL` to that Gmail address and retain a unique `DEMO_LOGIN_PASSWORD` in `server/.env`, then run `npm run demo:prepare` from `server/`. The script only creates/updates staff accounts and refuses to overwrite an admin account. Do not change owner credentials or publish a privileged login.

First linking supports Gmail and verified Google Workspace identities where Google is authoritative for the email address. Other email providers should use email/password rather than automatic identity linking.

## 4. Verify before publishing

- Sign in with an invited Google account and confirm dashboard access.
- Confirm an uninvited Google account is refused, and demo writes remain blocked.
- Repeat on the deployed HTTPS origin after adding it to the Google client and updating `CLIENT_URL`.
- The backend verifies Google's signature, audience, issuer and expiry via the official library, plus a short-lived signed login challenge and matching nonce. Browser-supplied roles are ignored. See [Google token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

The automated security tests use mocked Google identities. Live Google consent/sign-in has not been tested because the project client ID is not configured yet.
