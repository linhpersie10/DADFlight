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
  ShieldCheck,
  ShieldAlert, 
  Key, 
  ArrowLeft,
  Clock, 
  UserCheck, 
  UserX, 
  Trash2,
  Lock,
  History,
  RotateCcw,
  Laptop,
  Smartphone
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
  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; uid: string; userName: string; email: string }>({ 
    isOpen: false, 
    uid: '', 
    userName: '',
    email: ''
  });

  useEffect(() => {
    const q = collection(db, 'PKT_DAD_users');
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const rawUserList: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        rawUserList.push({
          uid: docSnap.id,
          ...data,
        } as UserProfile);
      });

      // ── BACKEND AUTO-DEDUPLICATION & MERGE LOGIC ──
      const emailGroups = new Map<string, UserProfile[]>();
      for (const u of rawUserList) {
        const email = (u.email || '').toLowerCase().trim();
        if (!email) {
          emailGroups.set(u.uid, [u]);
          continue;
        }
        const existing = emailGroups.get(email) || [];
        existing.push(u);
        emailGroups.set(email, existing);
      }

      const deduplicatedList: UserProfile[] = [];
      const duplicateMergeTasks: Array<{ keeper: UserProfile; duplicates: UserProfile[] }> = [];

      for (const [_, group] of emailGroups.entries()) {
        if (group.length === 1) {
          deduplicatedList.push(group[0]);
          continue;
        }

        // Multiple docs found for the same email: pick the most active/latest document
        group.sort((a, b) => {
          const timeA = (a.lastLoginAt?.seconds || a.createdAt?.seconds || 0);
          const timeB = (b.lastLoginAt?.seconds || b.createdAt?.seconds || 0);
          return timeB - timeA;
        });

        const keeper = group[0];
        const duplicates = group.slice(1);

        // Combine permissions so nothing is lost in UI state
        const combinedRole = group.some(u => u.role === 'superadmin') 
          ? 'superadmin' 
          : group.some(u => u.role === 'admin' || u.isAdmin) 
            ? 'admin' 
            : keeper.role || 'user';

        const combinedStatus = group.some(u => u.status === 'approved' || u.isApproved)
          ? 'approved'
          : keeper.status || 'pending';

        const hasPin = group.some(u => u.hasPin);

        deduplicatedList.push({
          ...keeper,
          role: combinedRole,
          status: combinedStatus,
          isAdmin: combinedRole === 'admin' || combinedRole === 'superadmin',
          isSuperadmin: combinedRole === 'superadmin',
          isApproved: combinedStatus === 'approved',
          hasPin,
        });

        duplicateMergeTasks.push({ keeper, duplicates });
      }

      // Sort: pending status first, then by createdAt desc
      deduplicatedList.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });

      setUsers(deduplicatedList);
      setLoading(false);

      // SILENT BACKGROUND DEDUPLICATION IN FIRESTORE (Backend clean)
      if (duplicateMergeTasks.length > 0 && isSuperAdmin) {
        for (const task of duplicateMergeTasks) {
          try {
            const { keeper, duplicates } = task;
            const shouldBeAdmin = duplicates.some(u => u.role === 'admin' || u.role === 'superadmin' || u.isAdmin);
            const shouldBeApproved = duplicates.some(u => u.status === 'approved' || u.isApproved);
            const hasPin = duplicates.some(u => u.hasPin);

            const updatePayload: Record<string, any> = { updatedAt: serverTimestamp() };
            if (shouldBeAdmin && keeper.role !== 'admin' && keeper.role !== 'superadmin') {
              updatePayload.role = 'admin';
              updatePayload.isAdmin = true;
            }
            if (shouldBeApproved && keeper.status !== 'approved') {
              updatePayload.status = 'approved';
              updatePayload.isApproved = true;
            }
            if (hasPin && !keeper.hasPin) {
              updatePayload.hasPin = true;
            }

            await updateDoc(doc(db, 'PKT_DAD_users', keeper.uid), updatePayload);

            for (const dup of duplicates) {
              await deleteDoc(doc(db, 'PKT_DAD_users', dup.uid, 'private', 'pin')).catch(() => {});
              await deleteDoc(doc(db, 'PKT_DAD_users', dup.uid)).catch(() => {});
              console.info(`[Backend] Auto-merged and cleaned duplicate doc: ${dup.uid} for ${dup.email}`);
            }
          } catch (e) {
            console.warn('[Backend] Silent duplicate cleanup error:', e);
          }
        }
      }
    }, (error) => {
      console.error("Error loading users:", error);
      toast.error("Không thể tải danh sách tài khoản.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isSuperAdmin]);

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
      toast.success(newStatus === 'approved' ? `Đã kích hoạt tài khoản ${targetUser.displayName}!` : `Đã khóa tài khoản ${targetUser.displayName}!`);
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
      toast.success(`Đã đổi vai trò của ${targetUser.displayName} thành ${newRole === 'superadmin' ? 'Super Admin' : newRole === 'admin' ? 'Admin' : 'Thành viên'}!`);
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
      toast.success(`Đã xóa mã PIN của ${targetUser.displayName}!`);
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

    if (!window.confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản ${targetUser.displayName} (${targetUser.email}) khỏi hệ thống?`)) {
      return;
    }

    try {
      const secretRef = doc(db, 'PKT_DAD_users', uid, 'private', 'pin');
      await deleteDoc(secretRef).catch(() => {});

      const userRef = doc(db, 'PKT_DAD_users', uid);
      await deleteDoc(userRef);

      toast.success(`Đã xóa vĩnh viễn tài khoản ${targetUser.displayName}!`);
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Lỗi khi xóa tài khoản.");
    }
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
      (u.displayName || '').toLowerCase().includes(queryStr) || 
      (u.email || '').toLowerCase().includes(queryStr);
    
    const matchesRole = 
      roleFilter === 'all' || 
      u.role === roleFilter;

    const matchesStatus = 
      statusFilter === 'all' || 
      u.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="um-container">
      {/* ── TOP HEADER / NAVIGATION BAR ── */}
      <div className="um-header-card">
        <div className="um-header-left">
          <button onClick={onBack} className="um-btn-back" title="Quay lại bảng dữ liệu Dashboard">
            <ArrowLeft size={15} />
            <span>Về Dashboard</span>
          </button>
          <div className="um-header-text">
            <h2>Quản lý Người dùng & Phân quyền</h2>
            <p>Kiểm soát quyền truy cập, xét duyệt tài khoản và quản trị bảo mật hệ thống</p>
          </div>
        </div>
        <div className="um-header-right">
          <div className={`um-role-pill ${isSuperAdmin ? 'superadmin' : 'admin'}`}>
            <ShieldCheck size={14} />
            <span>{isSuperAdmin ? 'Cấp quyền: Super Admin' : 'Cấp quyền: Admin'}</span>
          </div>
          <div className="um-stat-pill">
            <UsersIcon size={13} />
            <span>{totalCount} tài khoản</span>
          </div>
        </div>
      </div>

      {/* ── OVERVIEW METRICS GRID ── */}
      <div className="um-stats-grid">
        <div className="um-stat-card color-blue">
          <div className="um-stat-icon color-blue"><UsersIcon size={18} /></div>
          <div className="um-stat-info">
            <span className="um-stat-label">Tổng thành viên</span>
            <span className="um-stat-value">{totalCount}</span>
            <span className="um-stat-desc">Tài khoản Google liên kết</span>
          </div>
        </div>

        <div className={`um-stat-card color-gold ${pendingCount > 0 ? 'is-alert' : ''}`}>
          <div className="um-stat-icon color-gold"><Clock size={18} /></div>
          <div className="um-stat-info">
            <span className="um-stat-label">Chờ phê duyệt</span>
            <span className="um-stat-value" style={{ color: pendingCount > 0 ? 'var(--accent-gold)' : 'var(--text-primary)' }}>
              {pendingCount}
            </span>
            <span className="um-stat-desc">{pendingCount > 0 ? 'Cần xét duyệt truy cập' : 'Không có yêu cầu mới'}</span>
          </div>
        </div>

        <div className="um-stat-card color-green">
          <div className="um-stat-icon color-green"><UserCheck size={18} /></div>
          <div className="um-stat-info">
            <span className="um-stat-label">Đang hoạt động</span>
            <span className="um-stat-value">{approvedCount}</span>
            <span className="um-stat-desc">Đã cấp quyền truy cập</span>
          </div>
        </div>

        <div className="um-stat-card color-purple">
          <div className="um-stat-icon color-purple"><Shield size={18} /></div>
          <div className="um-stat-info">
            <span className="um-stat-label">Quản trị viên</span>
            <span className="um-stat-value">{adminCount}</span>
            <span className="um-stat-desc">Admin & Super Admin</span>
          </div>
        </div>
      </div>

      {/* ── SEARCH & FILTERS TOOLBAR ── */}
      <div className="um-toolbar">
        <div className="um-search-box">
          <Search size={15} className="um-search-icon" />
          <input
            type="text"
            placeholder="Tìm kiếm theo tên người dùng hoặc địa chỉ email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="um-search-clear" onClick={() => setSearch('')} title="Xóa tìm kiếm">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="um-filters-group">
          <select 
            value={roleFilter} 
            onChange={(e) => setRoleFilter(e.target.value)}
            className="um-select"
          >
            <option value="all">Tất cả vai trò</option>
            <option value="user">Thành viên</option>
            <option value="admin">Quản trị (Admin)</option>
            <option value="superadmin">Super Admin</option>
          </select>

          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="um-select"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Chờ phê duyệt</option>
            <option value="approved">Đã hoạt động</option>
            <option value="rejected">Bị từ chối / Khóa</option>
          </select>

          {(search || roleFilter !== 'all' || statusFilter !== 'all') && (
            <button 
              onClick={() => { setSearch(''); setRoleFilter('all'); setStatusFilter('all'); }} 
              className="um-btn-reset"
              title="Đặt lại bộ lọc"
            >
              <RotateCcw size={13} />
              <span>Đặt lại</span>
            </button>
          )}
        </div>
      </div>

      {/* ── USERS TABLE CARD ── */}
      <div className="um-table-card">
        {loading ? (
          <div className="um-loading">
            <div className="spinner" />
            <p>Đang tải danh sách người dùng...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="um-empty">
            <UserX size={36} opacity={0.3} />
            <h4>Không tìm thấy người dùng</h4>
            <p>Không có kết quả nào phù hợp với từ khóa hoặc điều kiện lọc hiện tại.</p>
          </div>
        ) : (
          <div className="um-table-wrap">
            <table className="um-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Thành viên</th>
                  <th style={{ width: '16%' }}>Vai trò</th>
                  <th style={{ width: '13%', textAlign: 'center' }}>Trạng thái</th>
                  <th style={{ width: '11%', textAlign: 'center' }}>Mã PIN</th>
                  <th style={{ width: '15%' }}>Hoạt động gần nhất</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isSelf = u.uid === profile?.uid;
                  const isDefaultSuperAdmin = u.email === 'linh.persie.10@gmail.com';
                  const showActions = !isSelf && !isDefaultSuperAdmin;

                  // Format dates
                  let lastActiveStr = "Chưa đăng nhập";
                  if (u.lastLoginAt) {
                    const d = u.lastLoginAt.toDate ? u.lastLoginAt.toDate() : new Date(u.lastLoginAt);
                    lastActiveStr = d.toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                  } else if (u.createdAt) {
                    const d = u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
                    lastActiveStr = "Tham gia " + d.toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit', year: 'numeric' });
                  }

                  return (
                    <tr key={u.uid} className={`um-row ${u.status === 'pending' ? 'is-pending' : ''}`}>
                      {/* USER INFO */}
                      <td>
                        <div className="um-user-cell">
                          <img 
                            src={u.photoURL || 'https://lh3.googleusercontent.com/a/default-user'} 
                            alt={u.displayName} 
                            referrerPolicy="no-referrer"
                            className="um-user-avatar"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://lh3.googleusercontent.com/a/default-user';
                            }}
                          />
                          <div className="um-user-meta">
                            <div className="um-user-name">
                              <span>{u.displayName || "Chưa đặt tên"}</span>
                              {isSelf && <span className="um-self-tag">Tôi</span>}
                              {isDefaultSuperAdmin && <span className="um-root-tag">Root</span>}
                            </div>
                            <div className="um-user-email">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* ROLE */}
                      <td>
                        {isSelf || isDefaultSuperAdmin || !isSuperAdmin ? (
                          <div className={`um-role-badge ${u.role || 'user'}`}>
                            {u.role === 'superadmin' ? (
                              <><ShieldAlert size={13} /><span>Super Admin</span></>
                            ) : u.role === 'admin' ? (
                              <><Shield size={13} /><span>Admin</span></>
                            ) : (
                              <><UsersIcon size={13} /><span>Thành viên</span></>
                            )}
                          </div>
                        ) : (
                          <select 
                            value={u.role || 'user'} 
                            onChange={(e) => handleUpdateRole(u.uid, e.target.value as any)}
                            className={`um-role-select ${u.role || 'user'}`}
                          >
                            <option value="user">Thành viên</option>
                            <option value="admin">Quản trị (Admin)</option>
                            <option value="superadmin">Super Admin</option>
                          </select>
                        )}
                      </td>

                      {/* STATUS */}
                      <td style={{ textAlign: 'center' }}>
                        <span className={`um-status-pill ${u.status || 'pending'}`}>
                          <span className="um-status-dot" />
                          {u.status === 'approved' ? 'Đã kích hoạt' : u.status === 'rejected' ? 'Đã khóa' : 'Chờ duyệt'}
                        </span>
                      </td>

                      {/* PIN STATUS */}
                      <td style={{ textAlign: 'center' }}>
                        <span className={`um-pin-pill ${u.hasPin ? 'active' : 'inactive'}`}>
                          <Key size={12} />
                          <span>{u.hasPin ? 'Đã tạo' : 'Chưa đặt'}</span>
                        </span>
                      </td>

                      {/* LAST ACTIVE & HISTORY */}
                      <td>
                        <div className="um-history-cell">
                          <span className="um-time-text">{lastActiveStr}</span>
                          {isAdmin && (
                            <button 
                              onClick={() => setHistoryModal({ isOpen: true, uid: u.uid, userName: u.displayName || u.email, email: u.email })}
                              className="um-btn-history"
                              title="Xem nhật ký truy cập"
                            >
                              <History size={12} />
                              <span>Nhật ký</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* ACTIONS */}
                      <td style={{ textAlign: 'right' }}>
                        <div className="um-actions-cluster">
                          {/* Approval / Lock toggles */}
                          {showActions && u.status !== 'approved' && (
                            <button 
                              onClick={() => handleUpdateStatus(u.uid, 'approved')} 
                              className="um-action-btn btn-approve"
                              title="Phê duyệt quyền truy cập"
                            >
                              <Check size={13} />
                              <span>Duyệt</span>
                            </button>
                          )}

                          {showActions && u.status === 'approved' && (
                            <button 
                              onClick={() => handleUpdateStatus(u.uid, 'rejected')} 
                              className="um-action-btn btn-lock"
                              title="Khóa truy cập của tài khoản này"
                            >
                              <Lock size={12} />
                              <span>Khóa</span>
                            </button>
                          )}

                          {/* Reset PIN */}
                          {u.hasPin && (isSelf || showActions) && (
                            <button 
                              onClick={() => handleResetPin(u.uid)} 
                              className="um-action-btn btn-pin"
                              title="Xóa mã PIN hiện tại (yêu cầu người dùng đặt lại)"
                            >
                              <Key size={13} />
                              <span>Reset PIN</span>
                            </button>
                          )}

                          {/* Delete (Superadmin only) */}
                          {isSuperAdmin && showActions && (
                            <button 
                              onClick={() => handleDeleteUser(u.uid)} 
                              className="um-action-btn btn-delete"
                              title="Xóa vĩnh viễn tài khoản khỏi Firestore"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── ACCESS HISTORY MODAL ── */}
      {historyModal.isOpen && (
        <AccessHistoryModal 
          uid={historyModal.uid} 
          userName={historyModal.userName} 
          email={historyModal.email}
          onClose={() => setHistoryModal({ ...historyModal, isOpen: false })} 
        />
      )}
    </div>
  );
}

function AccessHistoryModal({ 
  uid, 
  userName, 
  email, 
  onClose 
}: { 
  uid: string; 
  userName: string; 
  email: string; 
  onClose: () => void; 
}) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const q = query(
          collection(db, 'PKT_DAD_users', uid, 'access_history'),
          orderBy('timestamp', 'desc'),
          limit(40)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setHistory(data);
      } catch (err) {
        console.error(err);
        toast.error('Lỗi khi tải nhật ký truy cập');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [uid]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="um-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="um-modal-header">
          <div className="um-modal-title">
            <History size={18} className="um-modal-icon" />
            <div>
              <h3>Nhật ký truy cập hệ thống</h3>
              <p>{userName} <span className="um-modal-email">({email})</span></p>
            </div>
          </div>
          <button onClick={onClose} className="um-modal-close" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        
        <div className="um-modal-body">
          {loading ? (
            <div className="um-modal-loading">
              <div className="spinner" />
              <p>Đang tải nhật ký...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="um-modal-empty">
              <Clock size={32} opacity={0.3} />
              <p>Chưa ghi nhận lượt truy cập nào từ tài khoản này.</p>
            </div>
          ) : (
            <div className="um-modal-table-wrap">
              <table className="um-modal-table">
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Thời gian</th>
                    <th style={{ width: '45%' }}>Thiết bị / Trình duyệt</th>
                    <th style={{ width: '20%', textAlign: 'right' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => {
                    let timeStr = '—';
                    if (item.timestamp) {
                      const d = item.timestamp.toDate ? item.timestamp.toDate() : new Date(item.timestamp);
                      timeStr = d.toLocaleString('vi-VN');
                    }
                    const isMobile = (item.userAgent || '').toLowerCase().includes('mobile') || (item.userAgent || '').toLowerCase().includes('android') || (item.userAgent || '').toLowerCase().includes('iphone');

                    return (
                      <tr key={item.id}>
                        <td className="um-log-time">{timeStr}</td>
                        <td className="um-log-device" title={item.userAgent}>
                          <div className="um-device-cell">
                            {isMobile ? <Smartphone size={14} /> : <Laptop size={14} />}
                            <span>{item.userAgent ? item.userAgent.slice(0, 50) + '...' : 'Không xác định'}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="um-log-success-badge">Thành công</span>
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
    </div>
  );
}
