import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Search, Shield, Mail, Building, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const ROLE_STYLES = {
  admin: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  examiner: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  student: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
};

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  useEffect(() => { fetchUsers(); }, [roleFilter]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 100 });
      if (roleFilter) params.set('role', roleFilter);
      const { data } = await api.get(`/users?${params}`);
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  };

  const toggleActive = async (userId, current) => {
    try {
      await api.patch(`/users/${userId}`, { isActive: !current });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !current } : u));
      toast.success(`User ${!current ? 'activated' : 'deactivated'}`);
    } catch { toast.error('Failed to update user'); }
  };

  const filtered = users.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">User Management</h1>
          <p className="text-surface-400 mt-1">{total} total users</p>
        </div>
        <button onClick={fetchUsers} className="btn-secondary"><RefreshCw size={16} />Refresh</button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Admins', role: 'admin', color: 'text-purple-400' },
          { label: 'Examiners', role: 'examiner', color: 'text-blue-400' },
          { label: 'Students', role: 'student', color: 'text-emerald-400' },
        ].map(({ label, role, color }) => (
          <div key={role} className="glass rounded-2xl p-4 text-center">
            <div className={`text-2xl font-bold font-display ${color}`}>
              {users.filter(u => u.role === role).length}
            </div>
            <div className="text-sm text-surface-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..." className="input pl-9 py-2.5" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="input w-40 py-2.5">
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="examiner">Examiner</option>
          <option value="student">Student</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => <div key={i} className="glass rounded-2xl p-4 animate-pulse h-16" />)}
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-800">
                <th className="text-left text-xs font-semibold text-surface-400 px-5 py-4">User</th>
                <th className="text-left text-xs font-semibold text-surface-400 px-4 py-4">Role</th>
                <th className="text-left text-xs font-semibold text-surface-400 px-4 py-4">Organization</th>
                <th className="text-left text-xs font-semibold text-surface-400 px-4 py-4">Last Login</th>
                <th className="text-left text-xs font-semibold text-surface-400 px-4 py-4">Status</th>
                <th className="text-left text-xs font-semibold text-surface-400 px-4 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {filtered.map((user, i) => (
                <motion.tr key={user.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  className="hover:bg-surface-800/30 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                        {user.first_name?.[0]}{user.last_name?.[0]}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{user.first_name} {user.last_name}</div>
                        <div className="text-xs text-surface-400 flex items-center gap-1"><Mail size={10} />{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ROLE_STYLES[user.role] || ''}`}>{user.role}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-surface-300 flex items-center gap-1">
                      {user.organization ? <><Building size={12} className="text-surface-500" />{user.organization}</> : <span className="text-surface-600">—</span>}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-xs text-surface-400">
                      {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-700 text-surface-500'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <button onClick={() => toggleActive(user.id, user.is_active)}
                      className={`p-1.5 rounded-lg transition-colors ${user.is_active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-surface-500 hover:bg-surface-700'}`}
                      title={user.is_active ? 'Deactivate' : 'Activate'}>
                      {user.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-16">
              <Users size={40} className="text-surface-600 mx-auto mb-3" />
              <p className="text-surface-400">No users found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
