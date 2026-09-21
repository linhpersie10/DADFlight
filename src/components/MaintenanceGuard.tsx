"use client";
import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { MaintenanceScreen } from './MaintenanceScreen';

interface MaintenanceGuardProps {
  db: any;
  auth?: any;
  children: React.ReactNode;
}

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 phút kiểm tra 1 lần

export const MaintenanceGuard: React.FC<MaintenanceGuardProps> = ({ db, auth, children }) => {
  const [isLocked, setIsLocked] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (!db) {
      return;
    }

    let cancelled = false;
    const docRef = doc(db, 'system_settings', 'maintenance');

    const checkMaintenance = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const snapshot = await getDoc(docRef);
        if (cancelled) return;
        setIsLocked(snapshot.exists() ? !!snapshot.data().isLocked : false);
      } catch (error) {
        console.warn('Error checking maintenance status, using fallback inactive:', error);
        if (!cancelled) setIsLocked(false);
      }
    };

    checkMaintenance();
    const intervalId = setInterval(checkMaintenance, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkMaintenance();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
