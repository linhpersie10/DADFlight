const { initializeApp } = require('firebase/app');
const { initializeFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyCBIa_RPbjli4KQqrbN04G_pjObZmzWYd8',
  authDomain: 'banafi-kpi.web.app',
  projectId: 'banafi-kpi',
  storageBucket: 'banafi-kpi.firebasestorage.app',
  messagingSenderId: '176320092517',
  appId: '1:176320092517:web:97aa4397ccdbcb3ee7e98c',
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, 'pkt-dad');

async function run() {
  const querySnapshot = await getDocs(collection(db, "PKT_DAD_users"));
  const users = [];
  querySnapshot.forEach((doc) => {
    users.push({ id: doc.id, ...doc.data() });
  });
  console.log(JSON.stringify(users, null, 2));
  process.exit(0);
}

run().catch(console.error);
