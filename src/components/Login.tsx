import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PlaneTakeoff, LogIn, AlertCircle } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (loading) return;
    setLoading(false);
    setError(null);
    try {
      setLoading(true);
      await login();
    } catch (e: any) {
      console.error('[Login] Error during sign-in:', e);
      setError(e?.message || 'Đã xảy ra lỗi không xác định khi đăng nhập bằng Google.');
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <PlaneTakeoff size={28} />
        </div>
        
        <h1 className="auth-title">DAD Flight Operations</h1>
        <p className="auth-desc">
          Hệ thống Thống kê & Phân tích phục vụ chuyến bay Đà Nẵng. Đăng nhập để truy cập dữ liệu và công cụ quản trị.
        </p>

        {error && (
          <div className="auth-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <button 
          className="auth-btn-google" 
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <div className="spinner" style={{ margin: 0, width: 18, height: 18 }} />
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
          )}
          <span>{loading ? 'Đang kết nối...' : 'Đăng nhập bằng Google'}</span>
        </button>

        <div style={{ marginTop: '30px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Hệ sinh thái PKT Security • Phiên bản 2.0.0
        </div>
      </div>
    </div>
  );
}
