"use client";
import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { MaintenanceScreen } from './MaintenanceScreen';

interface MaintenanceGuardProps {
  db: any;
  auth: any;
  children: React.ReactNode;
}

export const MaintenanceGuard: React.FC<MaintenanceGuardProps> = ({ db, auth, children }) => {
  const [isLocked, setIsLocked] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (!db) {
      return;
    }

    const docRef = doc(db, 'system_settings', 'maintenance');
    const unsubscribeDoc = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setIsLocked(!!data.isLocked);
        } else {
          setIsLocked(false);
        }
      },
      (error) => {
        console.warn('Error listening to maintenance status, using fallback inactive:', error);
        setIsLocked(false);
      }
    );

    return () => {
      unsubscribeDoc();
    };
  }, [db]);

  useEffect(() => {
    if (!auth) {
      setCurrentUser(null);
      return;
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });

    return () => unsubscribeAuth();
  }, [auth]);

  const isSuperadmin = currentUser && currentUser.email === 'linh.persie.10@gmail.com';

  if (isLocked && !isSuperadmin) {
    return <MaintenanceScreen />;
  }

  return <>{children}</>;
};
