import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  GoogleAuthProvider, 
  signInWithRedirect,
  getRedirectResult,
  signOut,
  setPersistence,
  browserLocalPersistence 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  onSnapshot, 
  arrayUnion, 
  deleteField 
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';
import toast from 'react-hot-toast';

const SUPER_ADMIN_EMAIL = 'linh.persie.10@gmail.com';

const getPinSessionKey = (uid: string) => `pkt_dad_pin_verified_${uid}`;

const HASH_ITERATIONS = 100000;
const HASH_KEY_LEN = 32;
const STATIC_SALT = 'PKT_DAD_SECURE_SALT_V1';

async function derivePinHash(pin: string, uid: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  const saltString = `${uid}_${STATIC_SALT}`;
  const salt = enc.encode(saltString);
  
  const buffer = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: HASH_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    HASH_KEY_LEN * 8
  );
  
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isPinVerified: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  setPinCode: (pin: string) => Promise<void>;
  resetPin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPinVerified, setIsPinVerified] = useState(false);
  const isAuthenticatingRef = useRef(false);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(console.error);

    // Handle PIN reset or redirect result on mount
    getRedirectResult(auth).then(async (result) => {
      if (result && result.user) {
        if (sessionStorage.getItem('is_resetting_pin') === 'true') {
          sessionStorage.removeItem('is_resetting_pin');
          try {
            const userRef = doc(db, 'PKT_DAD_users', result.user.uid);
            const secretRef = doc(db, 'PKT_DAD_users', result.user.uid, 'private', 'pin');
            await deleteDoc(secretRef);
            await updateDoc(userRef, { hasPin: deleteField() });
            setIsPinVerified(false);
            toast.success('Xác minh thành công. Vui lòng tạo mã PIN mới.');
            console.info('[Auth] PIN reset successfully after redirect');
          } catch (e) {
            toast.error('Lỗi khi đặt lại PIN.');
            console.error('[Auth] PIN reset failed after redirect:', e);
          }
        }
      }
    }).catch(err => {
      console.warn('[Auth] getRedirectResult error:', err?.code);
    });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        const sessionKey = getPinSessionKey(currentUser.uid);
        const storedVerified = sessionStorage.getItem(sessionKey) === 'true';
        setIsPinVerified(storedVerified);

        try {
          const isSuperAdminEmail = currentUser.email === SUPER_ADMIN_EMAIL;
          const userRef = doc(db, 'PKT_DAD_users', currentUser.uid);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            const newProfile = {
              uid: currentUser.uid,
              email: (currentUser.email || '').toLowerCase().trim(),
              displayName: currentUser.displayName || '',
              photoURL: currentUser.photoURL || '',
              isApproved: isSuperAdminEmail,
              isAdmin: isSuperAdminEmail,
              isSuperadmin: isSuperAdminEmail,
              isRejected: false,
              role: isSuperAdminEmail ? 'superadmin' : 'user',
              status: isSuperAdminEmail ? 'approved' : 'pending',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              requestedApps: ['dadflight'],
            };
            await setDoc(userRef, newProfile);
          } else if (isSuperAdminEmail) {
            // Ensure superadmin flags are always set
            await updateDoc(userRef, {
              isApproved: true,
              isAdmin: true,
              isSuperadmin: true,
              isRejected: false,
              role: 'superadmin',
              status: 'approved',
              updatedAt: serverTimestamp(),
            });
          }

          // Real-time listener for profile changes
          const unsubProfile = onSnapshot(userRef, (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();

              // Auto-request dadflight app if not present
              if (!data.requestedApps || !data.requestedApps.includes('dadflight')) {
                updateDoc(userRef, {
                  requestedApps: arrayUnion('dadflight')
                }).catch(console.error);
              }

              // Extract token claims to support backend custom claims
              currentUser.getIdTokenResult(true).then((tokenResult) => {
                const claims = tokenResult.claims;
                const isSuperAdminClaim = claims.isSuperadmin === true || claims.role === 'superadmin' || isSuperAdminEmail;
                const isAdminClaim = claims.isAdmin === true || claims.role === 'admin' || isSuperAdminClaim || data.isAdmin === true;
                const isApprovedClaim = data.isApproved === true || claims.status === 'approved' || claims.isApproved === true || isSuperAdminEmail;

                const unifiedProfile = {
                  uid: snapshot.id,
                  ...data,
                  isAdmin: isAdminClaim,
                  isSuperadmin: isSuperAdminClaim,
                  isApproved: isApprovedClaim,
                  role: isSuperAdminClaim ? 'superadmin' : (isAdminClaim ? 'admin' : (data.role || 'user')),
                  status: isApprovedClaim
                    ? 'approved'
                    : (data.isRejected ? 'rejected' : (data.status || 'pending'))
                } as UserProfile;

                setProfile(unifiedProfile);
                setLoading(false);
              }).catch((e) => {
                console.error('[Auth] Failed to retrieve ID token claims:', e);
                // Fallback to Firestore data
                const unifiedProfile = {
                  uid: snapshot.id,
                  ...data,
                  role: data.isSuperadmin ? 'superadmin' : (data.isAdmin ? 'admin' : (data.role || 'user')),
                  status: data.isApproved
                    ? 'approved'
                    : (data.isRejected ? 'rejected' : (data.status || 'pending'))
                } as UserProfile;
                setProfile(unifiedProfile);
                setLoading(false);
              });
            } else {
              setProfile(null);
              setLoading(false);
            }
          });

          return () => unsubProfile();
        } catch (error) {
          console.error('[Auth] Failed to bootstrap user profile:', error);
          setProfile(null);
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
        setIsPinVerified(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    if (isAuthenticatingRef.current) return;
    try {
      isAuthenticatingRef.current = true;
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithRedirect(auth, provider);
    } catch (error: any) {
      console.error('[Auth] Redirect login failed:', error);
      throw error;
    } finally {
      isAuthenticatingRef.current = false;
    }
  };

  const logout = async () => {
    try {
      if (user?.uid) {
        sessionStorage.removeItem(getPinSessionKey(user.uid));
      }
      await signOut(auth);
      setProfile(null);
      setUser(null);
      setIsPinVerified(false);
    } catch (error) {
      console.error('[Auth] Logout failed:', error);
      throw error;
    }
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const hashedPin = await derivePinHash(pin, user.uid);
      const secretRef = doc(db, 'PKT_DAD_users', user.uid, 'private', 'pin');
      const secretSnap = await getDoc(secretRef);
      if (secretSnap.exists() && secretSnap.data().pinHash === hashedPin) {
        setIsPinVerified(true);
        sessionStorage.setItem(getPinSessionKey(user.uid), 'true');
        return true;
      }
      return false;
    } catch (e) {
      console.error('[Auth] verifyPin error:', e);
      return false;
    }
  };

  const setPinCode = async (pin: string): Promise<void> => {
    if (!user) throw new Error('No authenticated user');
    const hashedPin = await derivePinHash(pin, user.uid);
    const secretRef = doc(db, 'PKT_DAD_users', user.uid, 'private', 'pin');
    await setDoc(secretRef, { pinHash: hashedPin, updatedAt: serverTimestamp() });
    await updateDoc(doc(db, 'PKT_DAD_users', user.uid), { hasPin: true, updatedAt: serverTimestamp() });
    setIsPinVerified(true);
    sessionStorage.setItem(getPinSessionKey(user.uid), 'true');
  };

  const resetPin = async () => {
    if (!user) throw new Error('No authenticated user');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    sessionStorage.setItem('is_resetting_pin', 'true');
    await signInWithRedirect(auth, provider);
  };

  const isAdmin = profile?.isAdmin === true || profile?.role === 'admin' || profile?.role === 'superadmin' || user?.email === SUPER_ADMIN_EMAIL;
  const isSuperAdmin = profile?.isSuperadmin === true || profile?.role === 'superadmin' || user?.email === SUPER_ADMIN_EMAIL;

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isSuperAdmin, isPinVerified, login, logout, verifyPin, setPinCode, resetPin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
