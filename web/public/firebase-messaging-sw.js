/* eslint-disable no-undef */
// FCM background-message service worker. Values below are the public
// Firebase web config (already shipped in every page); security comes from
// Firestore rules, not key secrecy. Messages sent by the Cloud Function
// include a `notification` payload + webpush link, so FCM displays them
// and handles clicks without custom code here.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBUb1-qlQrGZ4bKEJSGWYldw0Ovz0mET3k',
  authDomain: 'godoggydate.firebaseapp.com',
  projectId: 'godoggydate',
  storageBucket: 'godoggydate.firebasestorage.app',
  messagingSenderId: '597697529529',
  appId: '1:597697529529:web:f6fad41448299716543d68',
});

firebase.messaging();
