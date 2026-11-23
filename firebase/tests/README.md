# Security-rules tests

Tests for `firestore.rules` and `storage.rules` using `@firebase/rules-unit-testing`.
They run against an **already running** Firebase emulator, under their own project
id (`demo-rules-test`), so they never touch the app's data.

```
cd firebase/tests && npm ci && npm test
```

- Firestore tests: `FIRESTORE_EMULATOR_HOST` (default `127.0.0.1:8080`).
- Storage tests: `FIREBASE_STORAGE_EMULATOR_HOST` (default `127.0.0.1:9199`).
- To start the emulators yourself first: `firebase emulators:start --only auth,firestore,storage,functions --project demo-godoggydate`.
  CI can wrap the run in `firebase emulators:exec --only firestore,storage "npm --prefix firebase/tests test"`
  (then the host variables are set for you).

A test file is a plain `node --test` file (`*.test.mjs`); this folder has its own
`package.json` and does not touch the root dependencies.
