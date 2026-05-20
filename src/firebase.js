import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDuoMRmRqh05uxbOdoVjV88IskljmR1HJk",
  authDomain: "tradetrack-pro-f2173.firebaseapp.com",
  projectId: "tradetrack-pro-f2173",
  storageBucket: "tradetrack-pro-f2173.firebasestorage.app",
  messagingSenderId: "545737192612",
  appId: "1:545737192612:web:e4a379b37b1e2bb8256231"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };