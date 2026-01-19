// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";  // ← ADD THIS

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBXlAXgKNA-hyD_MxarvfRj4ysVa651z2c",
  authDomain: "visual-finance-analyzer.firebaseapp.com",
  projectId: "visual-finance-analyzer",
  storageBucket: "visual-finance-analyzer.firebasestorage.app",
  messagingSenderId: "768493917033",
  appId: "1:768493917033:web:2daff42a33034b58d263f8",
  measurementId: "G-PH0K599LRV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);  // ← ADD THIS