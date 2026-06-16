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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) {
      setLoading(false);
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
        setLoading(false);
      },
      (error) => {
        console.warn('Error listening to maintenance status, using fallback inactive:', error);
        setIsLocked(false);
        setLoading(false);
      }
    );

    return () => unsubscribeDoc();
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

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div className="guard-spin" style={{
            border: '4px solid rgba(255,255,255,0.1)',
            borderTop: '4px solid #eab308',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
          }} />
          <div>Đang kết nối hệ thống...</div>
        </div>
        <style>{`
          @keyframes guardSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .guard-spin {
            animation: guardSpin 1s linear infinite;
          }
        `}</style>
      </div>
    );
  }

  const isSuperadmin = currentUser && currentUser.email === 'linh.persie.10@gmail.com';

  if (isLocked && !isSuperadmin) {
    return <MaintenanceScreen />;
  }

  return <>{children}</>;
};
