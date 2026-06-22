import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc,
  deleteField,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs 
} from 'firebase/firestore';
import { 
  Search, 
  Users as UsersIcon, 
  Check, 
  X, 
  Shield, 
  ShieldAlert, 
  Key, 
  ArrowLeft,
  Clock,
  UserCheck,
  UserX,
  Trash2
} from 'lucide-react';
import { UserProfile } from '../types';
import { toast } from 'react-hot-toast';

export default function UserManagement({ onBack }: { onBack: () => void }) {
  const { profile, isSuperAdmin, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean, uid: string, userName: string }>({ isOpen: false, uid: '', userName: '' });

  useEffect(() => {
    const q = collection(db, 'PKT_DAD_users');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        userList.push({
          uid: docSnap.id,
          ...data,
        } as UserProfile);
      });
      // Sort: pending status first, then by createdAt desc
      userList.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setUsers(userList);
      setLoading(false);
    }, (error) => {
      console.error("Error loading users:", error);
      toast.error("Không thể tải danh sách tài khoản.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleUpdateStatus = async (uid: string, newStatus: 'approved' | 'rejected') => {
    const targetUser = users.find(u => u.uid === uid);
    if (!targetUser) return;

    if (targetUser.email === 'linh.persie.10@gmail.com') {
      toast.error("Không thể thay đổi trạng thái của Super Admin mặc định.");
      return;
    }

    try {
      const userRef = doc(db, 'PKT_DAD_users', uid);
      await updateDoc(userRef, {
        status: newStatus,
        isApproved: newStatus === 'approved',
        isRejected: newStatus === 'rejected',
        updatedAt: serverTimestamp()
      });
      toast.success(newStatus === 'approved' ? 'Đã phê duyệt tài khoản!' : 'Đã từ chối tài khoản!');
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Lỗi khi cập nhật trạng thái.");
    }
  };

  const handleUpdateRole = async (uid: string, newRole: 'user' | 'admin' | 'superadmin') => {
    const targetUser = users.find(u => u.uid === uid);
    if (!targetUser) return;

    if (targetUser.email === 'linh.persie.10@gmail.com') {
      toast.error("Không thể thay đổi vai trò của Super Admin mặc định.");
      return;
    }

    if (!isSuperAdmin) {
      toast.error("Chỉ Super Admin mới có quyền thay đổi vai trò người dùng.");
      return;
    }

    try {
      const userRef = doc(db, 'PKT_DAD_users', uid);
      await updateDoc(userRef, {
        role: newRole,
        isAdmin: newRole === 'admin' || newRole === 'superadmin',
        isSuperadmin: newRole === 'superadmin',
        updatedAt: serverTimestamp()
      });
      toast.success('Đã cập nhật vai trò người dùng!');
    } catch (error) {
      console.error("Error updating role:", error);
      toast.error("Lỗi khi cập nhật vai trò.");
    }
  };

  const handleResetPin = async (uid: string) => {
    const targetUser = users.find(u => u.uid === uid);
    if (!targetUser) return;

    if (targetUser.email === 'linh.persie.10@gmail.com' && profile?.email !== 'linh.persie.10@gmail.com') {
      toast.error("Không thể đặt lại PIN của Super Admin mặc định.");
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn xóa mã PIN của người dùng ${targetUser.displayName}? Họ sẽ phải thiết lập lại mã PIN mới trong lần đăng nhập tiếp theo.`)) {
      return;
    }

    try {
      const secretRef = doc(db, 'PKT_DAD_users', uid, 'private', 'pin');
      await deleteDoc(secretRef);

      const userRef = doc(db, 'PKT_DAD_users', uid);
      await updateDoc(userRef, {
        hasPin: deleteField(),
        updatedAt: serverTimestamp()
      });
      toast.success('Đã đặt lại mã PIN thành công!');
    } catch (error) {
      console.error("Error resetting PIN:", error);
      toast.error("Lỗi khi đặt lại mã PIN.");
    }
  };

  const handleDeleteUser = async (uid: string) => {
    const targetUser = users.find(u => u.uid === uid);
    if (!targetUser) return;

    if (targetUser.email === 'linh.persie.10@gmail.com') {
      toast.error("Không thể xóa Super Admin mặc định.");
      return;
    }

    if (!isSuperAdmin) {
      toast.error("Chỉ Super Admin mới có quyền xóa tài khoản.");
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản của ${targetUser.displayName} (${targetUser.email}) khỏi Firestore? Hành động này không thể hoàn tác!`)) {
      return;
    }

    try {
      // 1. Delete private subcollection (PIN document)
      const secretRef = doc(db, 'PKT_DAD_users', uid, 'private', 'pin');
      await deleteDoc(secretRef).catch(() => {}); // ignore if it doesn't exist

      // 2. Delete main user document
      const userRef = doc(db, 'PKT_DAD_users', uid);
      await deleteDoc(userRef);

      toast.success('Đã xóa tài khoản thành công!');
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Lỗi khi xóa tài khoản.");
    }
  };

  const handleViewHistory = (uid: string, userName: string) => {
    setHistoryModal({ isOpen: true, uid, userName });
  };

  // Stats calculation
  const totalCount = users.length;
  const pendingCount = users.filter(u => u.status === 'pending').length;
  const approvedCount = users.filter(u => u.status === 'approved').length;
  const adminCount = users.filter(u => u.role === 'admin' || u.role === 'superadmin').length;

  // Filter & Search
  const filteredUsers = users.filter((u) => {
    const queryStr = search.trim().toLowerCase();
    const matchesSearch = 
      u.displayName.toLowerCase().includes(queryStr) || 
      u.email.toLowerCase().includes(queryStr);
    
    const matchesRole = 
      roleFilter === 'all' || 
      u.role === roleFilter;

    const matchesStatus = 
      statusFilter === 'all' || 
      u.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="user-management-panel" style={{ animation: 'slideDown 0.25s ease' }}>
      {/* Header */}
      <div className="um-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBack} className="preset-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px' }}>
            <ArrowLeft size={14} />
            <span>Dashboard</span>
          </button>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Quản lý Thành viên & Phân quyền</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>Phê duyệt tài khoản mới và thiết lập quyền truy cập hệ thống DADFlight</p>
          </div>
        </div>
        <div className="um-active-badge" style={{ background: 'rgba(0, 212, 255, 0.08)', border: '1px solid rgba(0, 212, 255, 0.2)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.72rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
          {isSuperAdmin ? 'CẤP QUYỀN: SUPER ADMIN' : 'CẤP QUYỀN: ADMIN'}
        </div>
      </div>

      {/* Overview stats */}
      <div className="score-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <div className="score-card color-blue">
          <div className="score-icon color-blue"><UsersIcon size={18} /></div>
          <div>
            <div className="score-label">Tổng thành viên</div>
            <div className="score-value">{totalCount}</div>
            <div className="score-detail">Tài khoản Google liên kết</div>
          </div>
        </div>
        <div className="score-card color-gold">
          <div className="score-icon color-gold"><Clock size={18} /></div>
          <div>
            <div className="score-label">Chờ phê duyệt</div>
            <div className="score-value" style={{ color: pendingCount > 0 ? 'var(--accent-gold)' : 'var(--text-primary)' }}>{pendingCount}</div>
            <div className="score-detail">Cần phê duyệt truy cập</div>
          </div>
        </div>
        <div className="score-card color-green">
          <div className="score-icon color-green"><UserCheck size={18} /></div>
          <div>
            <div className="score-label">Đã hoạt động</div>
            <div className="score-value">{approvedCount}</div>
            <div className="score-detail">Tài khoản được truy cập</div>
          </div>
        </div>
        <div className="score-card color-purple">
          <div className="score-icon color-purple"><Shield size={18} /></div>
          <div>
            <div className="score-label">Quản trị viên</div>
            <div className="score-value">{adminCount}</div>
            <div className="score-detail">Admin & Superadmin</div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="um-filters" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', background: 'rgba(0, 0, 0, 0.15)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Tìm theo tên hoặc địa chỉ email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '32px', minHeight: '36px' }}
          />
        </div>
        <div style={{ width: '150px' }}>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ minHeight: '36px' }}>
            <option value="all">Mọi vai trò</option>
            <option value="user">Thành viên</option>
            <option value="admin">Quản trị (Admin)</option>
            <option value="superadmin">Super Admin</option>
          </select>
        </div>
        <div style={{ width: '150px' }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minHeight: '36px' }}>
            <option value="all">Mọi trạng thái</option>
            <option value="pending">Chờ phê duyệt</option>
            <option value="approved">Đã hoạt động</option>
            <option value="rejected">Bị từ chối</option>
          </select>
        </div>
      </div>

      {/* Users table */}
      <div className="table-wrapper" style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px' }}>
            <div className="spinner" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
            <UserX size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
            <p>Không tìm thấy thành viên nào khớp với điều kiện lọc.</p>
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Người dùng</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Ngày tham gia</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Vai trò</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', width: '120px' }}>Trạng thái</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Data Collection</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', width: '140px' }}>Lịch sử truy cập</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', width: '100px' }}>Bảo mật PIN</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', width: '220px' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const isSelf = u.uid === profile?.uid;
                const isDefaultSuperAdmin = u.email === 'linh.persie.10@gmail.com';
                const showActions = !isSelf && !isDefaultSuperAdmin;
                
                // Formatted date string
                let dateStr = "—";
                if (u.createdAt) {
                  const d = u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
                  dateStr = d.toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit', year: 'numeric' });
                }

                return (
                  <tr key={u.uid} style={{ borderBottom: '1px solid var(--border-subtle)', background: u.status === 'pending' ? 'rgba(245, 158, 11, 0.02)' : 'transparent' }}>
                    {/* User profile details */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img 
                          src={u.photoURL} 
                          alt={u.displayName} 
                          referrerPolicy="no-referrer"
                          style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.05)' }} 
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {u.displayName} {isSelf && <span style={{ fontSize: '0.68rem', color: 'var(--accent-cyan)', background: 'rgba(0, 212, 255, 0.08)', padding: '1px 5px', borderRadius: '3px', marginLeft: '4px' }}>Tôi</span>}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.email}</span>
                        </div>
                      </div>
                    </td>

                    {/* Join Date */}
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{dateStr}</td>

                    {/* Role dropdown */}
                    <td style={{ padding: '12px 16px' }}>
                      {isSelf || isDefaultSuperAdmin || !isSuperAdmin ? (
                        <span style={{ textTransform: 'capitalize', color: u.role === 'superadmin' ? 'var(--accent-purple)' : u.role === 'admin' ? 'var(--accent-cyan)' : 'var(--text-secondary)', fontWeight: u.role !== 'user' ? 600 : 400 }}>
                          {u.role === 'superadmin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'Thành viên'}
                        </span>
                      ) : (
                        <select 
                          value={u.role || 'user'} 
                          onChange={(e) => handleUpdateRole(u.uid, e.target.value as any)}
                          style={{ minHeight: '28px', padding: '2px 8px', fontSize: '0.8rem', width: '130px', margin: 0 }}
                        >
                          <option value="user">Thành viên</option>
                          <option value="admin">Quản trị (Admin)</option>
                          <option value="superadmin">Super Admin</option>
                        </select>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span className={`status-badge ${u.status || 'pending'}`} style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '99px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                        textAlign: 'center',
                        minWidth: '85px',
                        border: '1px solid transparent',
                        background: u.status === 'approved' ? 'rgba(16, 185, 129, 0.08)' : u.status === 'rejected' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                        color: u.status === 'approved' ? 'var(--accent-green)' : u.status === 'rejected' ? 'var(--accent-red)' : 'var(--accent-gold)',
                        borderColor: u.status === 'approved' ? 'rgba(16, 185, 129, 0.2)' : u.status === 'rejected' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      }}>
                        {u.status === 'approved' ? 'Đã duyệt' : u.status === 'rejected' ? 'Bị từ chối' : 'Chờ duyệt'}
                      </span>
                    </td>

                    {/* Data Collection */}
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }} title="Data Collection - Firebase UID">
                          PKT_DAD_users/{u.uid}
                        </span>
                      </div>
                    </td>

                    {/* Access History */}
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {u.lastLoginAt ? (u.lastLoginAt.toDate ? u.lastLoginAt.toDate().toLocaleDateString("vi-VN") : new Date(u.lastLoginAt).toLocaleDateString("vi-VN")) : "Chưa có"}
                        </span>
                        {isAdmin && (
                          <button 
                            onClick={() => handleViewHistory(u.uid, u.displayName)}
                            className="preset-btn"
                            style={{ padding: '2px 8px', fontSize: '0.7rem', background: 'rgba(0, 212, 255, 0.08)', color: 'var(--accent-cyan)', border: '1px solid rgba(0, 212, 255, 0.2)' }}
                            title="Xem chi tiết lịch sử"
                          >
                            Xem lịch sử
                          </button>
                        )}
                      </div>
                    </td>

                    {/* PIN status */}
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: u.hasPin ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <Key size={12} style={{ opacity: u.hasPin ? 1 : 0.4 }} />
                        <span style={{ fontSize: '0.72rem' }}>{u.hasPin ? "Đã đặt" : "Chưa đặt"}</span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {/* Status approval buttons */}
                        {showActions && (
                          <>
                            {u.status !== 'approved' && (
                              <button 
                                onClick={() => handleUpdateStatus(u.uid, 'approved')} 
                                className="preset-btn"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.75rem', borderColor: 'rgba(16, 185, 129, 0.3)', color: 'var(--accent-green)', background: 'rgba(16, 185, 129, 0.04)' }}
                                title="Phê duyệt truy cập"
                              >
                                <Check size={12} />
                                <span>Duyệt</span>
                              </button>
                            )}
                            {u.status !== 'rejected' && (
                              <button 
                                onClick={() => handleUpdateStatus(u.uid, 'rejected')} 
                                className="preset-btn"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.75rem', borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.04)' }}
                                title="Từ chối/Khóa tài khoản"
                              >
                                <X size={12} />
                                <span>Khóa</span>
                              </button>
                            )}
                          </>
                        )}
                        
                        {/* Reset PIN button */}
                        {u.hasPin && (isSelf || showActions) && (
                          <button 
                            onClick={() => handleResetPin(u.uid)} 
                            className="preset-btn"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.75rem' }}
                            title="Xóa mã PIN cũ để yêu cầu người dùng cài đặt lại"
                          >
                            <Key size={12} />
                            <span>Reset PIN</span>
                          </button>
                        )}

                        {/* Delete User button (Super Admin only) */}
                        {isSuperAdmin && showActions && (
                          <button 
                            onClick={() => handleDeleteUser(u.uid)} 
                            className="preset-btn"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.75rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.04)' }}
                            title="Xóa vĩnh viễn tài khoản này khỏi Firestore"
                          >
                            <Trash2 size={12} />
                            <span>Xóa</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {historyModal.isOpen && (
        <AccessHistoryModal 
          uid={historyModal.uid} 
          userName={historyModal.userName} 
          onClose={() => setHistoryModal({ ...historyModal, isOpen: false })} 
        />
      )}
    </div>
  );
}

function AccessHistoryModal({ uid, userName, onClose }: { uid: string, userName: string, onClose: () => void }) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const q = query(
          collection(db, 'PKT_DAD_users', uid, 'access_history'),
          orderBy('timestamp', 'desc'),
          limit(30)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setHistory(data);
      } catch (err) {
        console.error(err);
        toast.error('Lỗi khi tải lịch sử truy cập');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [uid]);

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={onClose}>
      <div className="modal-content" style={{ background: 'var(--bg-panel)', padding: '20px', borderRadius: 'var(--radius-lg)', width: '90%', maxWidth: '500px', border: '1px solid var(--border-subtle)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Lịch sử truy cập - {userName}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            Không có dữ liệu truy cập.
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Thời gian</th>
                  <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Thiết bị / Trình duyệt</th>
                </tr>
              </thead>
              <tbody>
                {history.map(item => {
                  let timeStr = '—';
                  if (item.timestamp) {
                    const d = item.timestamp.toDate ? item.timestamp.toDate() : new Date(item.timestamp);
                    timeStr = d.toLocaleString('vi-VN');
                  }
                  return (
                    <tr key={item.id}>
                      <td style={{ padding: '10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>{timeStr}</td>
                      <td style={{ padding: '10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.userAgent}>
                        {item.userAgent || 'Không xác định'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
