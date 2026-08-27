/**
 * FIREBASE-CONFIG für 100blend
 *
 * Angelegt aus Peters Werten (25.08.2026, Firebase-Console Screenshot).
 * Projekt heisst BLEND-LIVE (nicht 100blend-live wie in der Anleitung
 * geplant - Peter hat abgekuerzt, ist voellig OK).
 *
 * Diese Werte sind KEIN Geheimnis - Google sagt das ausdruecklich.
 * Was schuetzt sind die Firestore-Rules (rules.txt) plus die
 * Authentication.
 *
 * DAS GEHEIMNIS ist die serviceAccount.json (fuer die Migration).
 * Die kommt in .gitignore und wird NICHT gepusht.
 */
export const firebaseConfig = {
  apiKey:            "AIzaSyCSdpU1lGz9S0UVzr82wPnjgBl8E40H4Fs",
  authDomain:        "blend-live.firebaseapp.com",
  projectId:         "blend-live",
  storageBucket:     "blend-live.firebasestorage.app",
  messagingSenderId: "224989206591",
  appId:             "1:224989206591:web:83de800551f62b7c31408a"
};
