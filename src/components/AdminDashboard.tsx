import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db, UserProfile } from '../firebase';
import { ArrowLeft, Shield, Crown, User, RefreshCw, Search } from 'lucide-react';

export default function AdminDashboard({ onBack, currentUser }: { onBack: () => void, currentUser: UserProfile }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const usersList: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        usersList.push(doc.data() as UserProfile);
      });
      // Sort: Admins first, then VIPs, then Users
      usersList.sort((a, b) => {
        const roleWeight = { admin: 3, vip: 2, user: 1 };
        return roleWeight[b.role] - roleWeight[a.role];
      });
      setUsers(usersList);
    } catch (error) {
      console.error("Error fetching users:", error);
      alert("Lỗi khi tải danh sách người dùng. Đảm bảo bạn đã cấu hình Firebase và Rules cho phép Admin đọc dữ liệu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'vip' | 'user') => {
    if (userId === currentUser.uid && newRole !== 'admin') {
      const confirm = window.confirm("Bạn đang tự hạ quyền của chính mình. Bạn sẽ mất quyền Admin. Bạn có chắc chắn?");
      if (!confirm) return;
    }

    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setUsers(users.map(u => u.uid === userId ? { ...u, role: newRole } : u));
    } catch (error) {
      console.error("Error updating role:", error);
      alert("Lỗi khi cập nhật quyền. Hãy kiểm tra Firestore Rules.");
    }
  };

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Shield className="w-6 h-6 text-sky-500" />
              Admin Dashboard
            </h1>
            <p className="text-xs text-slate-500 font-medium">Quản lý phân quyền khách hàng</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-700">{currentUser.displayName || currentUser.email}</p>
            <p className="text-xs text-sky-500 font-bold uppercase tracking-wider">Administrator</p>
          </div>
          {currentUser.photoURL ? (
            <img src={currentUser.photoURL} alt="Avatar" className="w-10 h-10 rounded-full border-2 border-sky-100" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center text-sky-500 font-bold">
              {currentUser.email?.charAt(0)}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
            <div className="relative max-w-md w-full">
              <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Tìm kiếm email hoặc tên..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-all"
              />
            </div>
            
            <button 
              onClick={fetchUsers}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="p-4 font-bold">Người dùng</th>
                  <th className="p-4 font-bold">Email</th>
                  <th className="p-4 font-bold text-center">Phân quyền (Gói)</th>
                  <th className="p-4 font-bold text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 opacity-50" />
                      Đang tải dữ liệu...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 font-medium">
                      Không tìm thấy người dùng nào.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.uid} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {user.photoURL ? (
                            <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                              {user.email?.charAt(0)}
                            </div>
                          )}
                          <span className="font-bold text-slate-700 text-sm">{user.displayName || 'Chưa cập nhật'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-600">{user.email}</td>
                      <td className="p-4 text-center">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                          user.role === 'admin' ? 'bg-rose-50 border-rose-200 text-rose-600' :
                          user.role === 'vip' ? 'bg-sky-50 border-sky-200 text-sky-600' :
                          'bg-slate-100 border-slate-200 text-slate-500'
                        }`}>
                          {user.role === 'admin' && <Shield className="w-3 h-3" />}
                          {user.role === 'vip' && <Crown className="w-3 h-3" />}
                          {user.role === 'user' && <User className="w-3 h-3" />}
                          {user.role.toUpperCase()}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <select 
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.uid, e.target.value as any)}
                          className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 cursor-pointer"
                        >
                          <option value="user">Basic (User)</option>
                          <option value="vip">Khách VIP</option>
                          <option value="admin">Quản trị viên</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
