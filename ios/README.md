# My One Password iOS

Native SwiftUI iOS V1 for the existing FastAPI backend.

## What Is Included

- `MyOnePassword.xcodeproj`
- `MyOnePassword` SwiftUI app target
- `CredentialProvider` Password AutoFill extension target
- Shared bearer-token API client, Keychain storage, and identity sync code
- App Group and Associated Domains entitlement templates

## Required Setup

Before opening the project in Xcode, replace placeholders:

- `ios/Shared/AppConfiguration.swift`
  - `apiBaseURL`: defaults to `https://jimmi2051-ideapad-l340-15irh-gaming.tailcd88c1.ts.net`
  - `appGroupIdentifier`: your App Group ID
  - `associatedDomains`: defaults to `webcredentials:jimmi2051-ideapad-l340-15irh-gaming.tailcd88c1.ts.net`
- `ios/MyOnePasswordApp/MyOnePassword.entitlements`
- `ios/CredentialProvider/CredentialProvider.entitlements`
- `ios/MyOnePassword.xcodeproj/project.pbxproj`
  - `DEVELOPMENT_TEAM`
  - `PRODUCT_BUNDLE_IDENTIFIER`
- `backend/.well-known/apple-app-site-association`
  - Replace `TEAMID.com.example.myonepassword` with your Apple Team ID and app bundle ID.

## Backend Requirements

Set these in `backend/.env` for mobile auth:

```bash
IOS_REDIRECT_SCHEMES=myonepassword
GOOGLE_REDIRECT_URI=https://jimmi2051-ideapad-l340-15irh-gaming.tailcd88c1.ts.net/auth/callback
```

Google OAuth must allow the backend callback URL. The iOS app starts login with:

```text
GET /auth/google?mobile_redirect_uri=myonepassword://auth/callback
```

The backend callback redirects back to the app with a bearer token. The app and extension use:

```text
Authorization: Bearer <token>
```

The existing web cookie flow remains supported.

## AutoFill Setup

1. Enable Associated Domains for both targets.
2. Enable App Groups for both targets.
3. Enable Keychain Sharing for both targets.
4. Host this URL over HTTPS:

```text
https://jimmi2051-ideapad-l340-15irh-gaming.tailcd88c1.ts.net/.well-known/apple-app-site-association
```

5. Install the app on a real device.
6. Enable the credential provider in iOS Settings.

AutoFill V1 syncs username/password identities from currently loaded vault entries into `ASCredentialIdentityStore`. When a credential is selected, the extension calls `/api/entries/autofill?url=<hostname>` and returns an `ASPasswordCredential`.

## Security Notes

- The iOS app does not store decrypted vault entries.
- The session token is stored in the Keychain for app/extension access.
- The optional biometric unlock secret is stored in a ThisDeviceOnly Keychain item protected by biometry and user presence.
- Logout clears Keychain session and biometric unlock state.
