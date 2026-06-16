"use client";
import React from 'react';

export const MaintenanceScreen: React.FC = () => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 99999,
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      padding: '24px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        maxWidth: '480px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px'
      }}>
        {/* Animated Maintenance Icon */}
        <div className="maintenance-pulse" style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '96px',
          height: '96px',
          borderRadius: '50%',
          backgroundColor: 'rgba(234, 179, 8, 0.1)',
        }}>
          <svg
            style={{ width: '48px', height: '48px', color: '#eab308' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>

        <h1 style={{
          fontSize: '32px',
          fontWeight: 700,
          margin: 0,
          letterSpacing: '-0.025em',
          background: 'linear-gradient(to right, #fef08a, #eab308)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Hệ Thống Đang Bảo Trì
        </h1>

        <p style={{
          fontSize: '16px',
          lineHeight: '1.6',
          color: '#94a3b8',
          margin: 0
        }}>
          Chúng tôi đang tiến hành bảo trì hệ thống khẩn cấp. Mọi hoạt động tạm thời bị vô hiệu hóa để bảo đảm an toàn dữ liệu. Vui lòng quay lại sau.
        </p>

        <div style={{
          marginTop: '16px',
          padding: '16px 24px',
          borderRadius: '12px',
          backgroundColor: '#1e293b',
          border: '1px solid #334155'
        }}>
          <p style={{
            fontSize: '13px',
            lineHeight: '1.5',
            color: '#64748b',
            margin: 0
          }}>
            Lưu ý: Tài khoản quản trị cấp cao (Superadmin) vẫn có quyền truy cập và thao tác bình thường trong suốt quá trình bảo trì.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes maintenancePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        .maintenance-pulse {
          animation: maintenancePulse 2s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};
