import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, LogOut, Clock, XCircle } from 'lucide-react';

export default function PendingApproval() {
  const { profile, logout } = useAuth();

  const isRejected = profile?.status === 'rejected' || profile?.isRejected === true;

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: '480px' }}>
        <div className={`auth-logo ${isRejected ? 'rejected' : 'pending-badge-icon'}`} style={{ 
          background: isRejected ? 'rgba(248, 113, 113, 0.1)' : 'rgba(245, 158, 11, 0.1)',
          borderColor: isRejected ? 'rgba(248, 113, 113, 0.3)' : 'rgba(245, 158, 11, 0.3)',
          color: isRejected ? 'var(--accent-red)' : 'var(--accent-gold)'
        }}>
          {isRejected ? <XCircle size={28} /> : <Clock size={28} />}
        </div>

        <h1 className="auth-title">
          {isRejected ? 'Tài khoản bị từ chối' : 'Đang chờ phê duyệt'}
        </h1>
        
        <div style={{ margin: '16px 0 24px', padding: '16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', textAlign: 'left' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Họ và tên</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>{profile?.displayName}</div>
          
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Địa chỉ Email</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.email}</div>
        </div>

        <p className="auth-desc" style={{ marginBottom: '32px' }}>
          {isRejected 
            ? 'Yêu cầu tham gia của bạn đã bị quản trị viên hệ thống từ chối. Vui lòng liên hệ quản trị viên để giải quyết.' 
            : 'Tài khoản của bạn đã được đăng ký thành công và đang chờ quản trị viên phê duyệt cấp quyền truy cập.'}
        </p>

        <button 
          className="auth-btn-secondary" 
          onClick={logout}
          style={{ width: '100%', justifyContent: 'center', marginTop: 0 }}
        >
          <LogOut size={16} />
          <span>Đăng xuất tài khoản</span>
        </button>
      </div>
    </div>
  );
}
