import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Trash2, RefreshCw, Search, Shield,
  Building2, Activity, Key, Upload, Download,
  CheckCircle, XCircle, AlertTriangle, Eye, EyeOff,
  ToggleLeft, ToggleRight, UserPlus, FileSpreadsheet,
  RotateCcw, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import api from '../utils/api';
import useAuthStore from '../store/authStore';

const ROLE_STYLE = {
  org_admin: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  examiner:  'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  student:   'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
};

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{opacity:0,scale:0.95,y:16}} animate={{opacity:1,scale:1,y:0}}
        className={`relative glass rounded-2xl p-6 w-full ${wide?'max-w-2xl':'max-w-lg'} max-h-[90vh] overflow-y-auto z-10`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-white"><XCircle size={20}/></button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

// ── Usage meter ────────────────────────────────────────────
function Meter({ label, used, max, color='primary' }) {
  const unlimited = max >= 9999 || max >= 99999;
  const pct = unlimited ? 0 : Math.min((used/max)*100, 100);
  const warn = pct >= 80, crit = pct >= 95;
  return (
    <div className="bg-surface-800 rounded-xl p-4 space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-surface-400 font-medium">{label}</span>
        <span className={`font-mono font-bold ${crit?'text-red-400':warn?'text-amber-400':'text-white'}`}>
          {unlimited ? `${used} / ∞` : `${used} / ${max}`}
        </span>
      </div>
      {!unlimited && (
        <div className="bg-surface-700 rounded-full h-1.5">
          <div className={`h-1.5 rounded-full transition-all ${crit?'bg-red-500':warn?'bg-amber-500':'bg-primary-500'}`}
            style={{width:`${pct}%`}}/>
        </div>
      )}
      {unlimited && <div className="text-xs text-emerald-400">Unlimited on your plan</div>}
    </div>
  );
}

export default function OrgAdminPage() {
  const { user } = useAuthStore();
  const [orgData, setOrgData]   = useState(null);
  const [users, setUsers]       = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('users');
  const [search, setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showAddUser, setShowAddUser]   = useState(false);
  const [showBulk, setShowBulk]         = useState(false);
  const [resetResult, setResetResult]   = useState(null);
  const [bulkPreview, setBulkPreview]   = useState([]);
  const [bulkErrors, setBulkErrors]     = useState([]);
  const [addForm, setAddForm] = useState({ firstName:'', lastName:'', email:'', role:'student', phone:'' });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [orgRes, usersRes, actRes] = await Promise.all([
        api.get('/org-admin/my-org'),
        api.get('/org-admin/users'),
        api.get('/org-admin/activity'),
      ]);
      setOrgData(orgRes.data);
      setUsers(usersRes.data.users || []);
      setActivity(actRes.data || []);
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/org-admin/users', addForm);
      toast.success(`User created! Temp password: ${data.tempPassword}`);
      setResetResult({ name: `${addForm.firstName} ${addForm.lastName}`, email: addForm.email, tempPassword: data.tempPassword });
      setShowAddUser(false);
      setAddForm({ firstName:'', lastName:'', email:'', role:'student', phone:'' });
      loadAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add user'); }
  };

  const handleToggleActive = async (id, current) => {
    try {
      await api.put(`/org-admin/users/${id}`, { isActive: !current });
      toast.success(current ? 'User deactivated' : 'User activated');
      loadAll();
    } catch { toast.error('Failed to update'); }
  };

  const handleRemove = async (id, name) => {
    if (!confirm(`Remove ${name} from your organisation? They will lose access.`)) return;
    try {
      await api.delete(`/org-admin/users/${id}`);
      toast.success(`${name} removed`);
      loadAll();
    } catch { toast.error('Failed to remove user'); }
  };

  const handleResetPassword = async (id, name) => {
    try {
      const { data } = await api.post(`/org-admin/users/${id}/reset-password`);
      setResetResult({ name, tempPassword: data.tempPassword });
      toast.success('Password reset!');
    } catch { toast.error('Failed to reset password'); }
  };

  // Bulk upload from Excel
  const handleBulkFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type:'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows  = XLSX.utils.sheet_to_json(sheet);
        const parsed = [], errors = [];
        rows.forEach((row, i) => {
          const email = String(row['email']||row['Email']||'').trim();
          const first = String(row['first_name']||row['First Name']||row['firstName']||'').trim();
          const last  = String(row['last_name'] ||row['Last Name'] ||row['lastName'] ||'').trim();
          const role  = String(row['role']||row['Role']||'student').trim().toLowerCase();
          if (!email||!first||!last) { errors.push(`Row ${i+2}: missing email/first_name/last_name`); return; }
          parsed.push({ email, firstName:first, lastName:last, role:['student','examiner','org_admin'].includes(role)?role:'student', phone:String(row['phone']||'') });
        });
        setBulkPreview(parsed); setBulkErrors(errors);
        toast.success(`${parsed.length} users ready to import`);
      } catch { toast.error('Failed to parse file'); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleBulkImport = async () => {
    try {
      const { data } = await api.post('/org-admin/users/bulk', { users: bulkPreview });
      toast.success(`${data.added} users added!`);
      if (data.errors?.length) toast.error(`${data.errors.length} errors — check console`);
      setBulkPreview([]); setShowBulk(false); loadAll();
    } catch { toast.error('Bulk import failed'); }
  };

  const downloadBulkTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['email','first_name','last_name','role','phone'],
      ['student@example.com','Priya','Sharma','student','+91 98765 43210'],
      ['examiner@example.com','Rahul','Verma','examiner','+91 91234 56789'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, 'ProctorAI_User_Upload_Template.xlsx');
  };

  const filtered = users.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(search.toLowerCase()) &&
    (roleFilter ? u.role === roleFilter : true)
  );

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  const { org, usage } = orgData || {};

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-600/20 border border-purple-500/20">
            <Building2 size={22} className="text-purple-400"/>
          </div>
          <div>
            <h1 className="page-title">{org?.name || 'Organisation Admin'}</h1>
            <p className="text-surface-400 text-sm mt-0.5">{org?.plan_name} Plan · Manage your users and settings</p>
          </div>
          <div className="ml-auto">
            <span className={`text-xs px-3 py-1.5 rounded-full font-semibold border capitalize ${
              org?.license_status==='active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
              org?.license_status==='trial'  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
              'bg-red-500/20 text-red-400 border-red-500/30'
            }`}>{org?.license_status}</span>
          </div>
        </div>
      </div>

      {/* Usage meters */}
      {usage && org && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Meter label="Concurrent Sessions" used={usage.liveSessions}  max={org.effective_concurrent}/>
          <Meter label="Registered Students" used={usage.students}      max={org.effective_students}/>
          <Meter label="Examiners"           used={usage.examiners}     max={org.effective_examiners}/>
          <Meter label="Published Exams"     used={usage.activeExams}   max={org.max_active_exams||9999}/>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900 p-1 rounded-xl border border-surface-800 mb-5 w-fit">
        {[
          { id:'users',    label:'Users',    icon:Users    },
          { id:'activity', label:'Activity', icon:Activity },
        ].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all font-heading ${tab===t.id?'bg-primary-600 text-white':'text-surface-400 hover:text-white'}`}>
            <t.icon size={14}/>{t.label}
          </button>
        ))}
      </div>

      {/* ── USERS TAB ─────────────────────────────────────── */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search users..." className="input pl-9"/>
            </div>
            <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} className="input w-36">
              <option value="">All Roles</option>
              <option value="student">Students</option>
              <option value="examiner">Examiners</option>
              <option value="org_admin">Org Admins</option>
            </select>
            <button onClick={loadAll} className="btn-secondary px-3"><RefreshCw size={15}/></button>
            <button onClick={()=>setShowBulk(true)} className="btn-secondary">
              <Upload size={15}/>Bulk Import
            </button>
            <button onClick={()=>setShowAddUser(true)} className="btn-primary">
              <UserPlus size={15}/>Add User
            </button>
          </div>

          {/* User count badges */}
          <div className="flex gap-3 flex-wrap">
            {[
              { role:'student',   label:'Students',   color:'text-emerald-400' },
              { role:'examiner',  label:'Examiners',  color:'text-blue-400'    },
              { role:'org_admin', label:'Org Admins', color:'text-purple-400'  },
            ].map(r => (
              <div key={r.role} className="glass rounded-xl px-4 py-2 flex items-center gap-2">
                <span className={`font-bold font-display text-xl ${r.color}`}>
                  {users.filter(u=>u.role===r.role).length}
                </span>
                <span className="text-xs text-surface-400">{r.label}</span>
              </div>
            ))}
          </div>

          {/* Users table */}
          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-surface-800">
                {['User','Role','Status','Last Login','Actions'].map(h=>(
                  <th key={h} className="text-left text-xs font-semibold text-surface-400 px-4 py-3 font-heading">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-surface-800">
                {filtered.map((u,i) => (
                  <motion.tr key={u.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.02}}
                    className="hover:bg-surface-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {u.first_name?.[0]}{u.last_name?.[0]}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{u.first_name} {u.last_name}</div>
                          <div className="text-xs text-surface-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${ROLE_STYLE[u.role]||''}`}>{u.role?.replace('_',' ')}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={()=>handleToggleActive(u.id, u.is_active)}
                        className={`${u.is_active?'text-emerald-400':'text-surface-600'}`}>
                        {u.is_active?<ToggleRight size={22}/>:<ToggleLeft size={22}/>}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-surface-400">
                        {u.last_login ? new Date(u.last_login).toLocaleDateString('en-IN') : 'Never'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={()=>handleResetPassword(u.id, `${u.first_name} ${u.last_name}`)}
                          title="Reset Password" className="p-1.5 text-surface-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg">
                          <RotateCcw size={13}/>
                        </button>
                        <button onClick={()=>handleRemove(u.id, `${u.first_name} ${u.last_name}`)}
                          title="Remove from org" className="p-1.5 text-surface-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {filtered.length===0 && (
              <div className="text-center py-12 text-surface-500">
                <Users size={32} className="mx-auto mb-3 opacity-30"/>No users found
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ACTIVITY TAB ──────────────────────────────────── */}
      {tab === 'activity' && (
        <div className="space-y-2">
          {activity.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center text-surface-500">
              <Activity size={32} className="mx-auto mb-3 opacity-30"/>No activity yet
            </div>
          ) : activity.map((a,i) => (
            <motion.div key={a.id} initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} transition={{delay:i*0.02}}
              className="glass rounded-xl p-3 flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-primary-400 shrink-0"/>
              <span className="text-sm text-white font-medium capitalize">{a.action?.replace(/_/g,' ')}</span>
              <span className="text-sm text-surface-400 flex-1">{a.actor_name || 'System'}</span>
              <span className="text-xs text-surface-500">{new Date(a.created_at).toLocaleString('en-IN')}</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Add User Modal ─────────────────────────────────── */}
      <Modal open={showAddUser} onClose={()=>setShowAddUser(false)} title="Add New User">
        <form onSubmit={handleAddUser} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label text-xs">First Name *</label><input value={addForm.firstName} onChange={e=>setAddForm({...addForm,firstName:e.target.value})} className="input" required/></div>
            <div><label className="label text-xs">Last Name *</label><input value={addForm.lastName} onChange={e=>setAddForm({...addForm,lastName:e.target.value})} className="input" required/></div>
          </div>
          <div><label className="label text-xs">Email *</label><input type="email" value={addForm.email} onChange={e=>setAddForm({...addForm,email:e.target.value})} className="input" placeholder="user@organisation.com" required/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label text-xs">Role</label>
              <select value={addForm.role} onChange={e=>setAddForm({...addForm,role:e.target.value})} className="input">
                <option value="student">Student</option>
                <option value="examiner">Examiner</option>
                <option value="org_admin">Org Admin</option>
              </select>
            </div>
            <div><label className="label text-xs">Phone</label><input value={addForm.phone} onChange={e=>setAddForm({...addForm,phone:e.target.value})} className="input" placeholder="+91 98765 43210"/></div>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
            ⚠️ A temporary password will be generated. Share it with the user securely.
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={()=>setShowAddUser(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center"><UserPlus size={15}/>Create User</button>
          </div>
        </form>
      </Modal>

      {/* ── Bulk Import Modal ──────────────────────────────── */}
      <Modal open={showBulk} onClose={()=>setShowBulk(false)} title="Bulk Import Users" wide>
        <div className="space-y-4">
          <p className="text-sm text-surface-400">Download the template, fill in your users, then upload. Supported roles: student, examiner, org_admin.</p>
          <div className="flex gap-3">
            <button onClick={downloadBulkTemplate} className="btn-secondary text-sm"><Download size={14}/>Download Template</button>
            <label className="btn-primary text-sm cursor-pointer">
              <Upload size={14}/>Choose Excel File
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkFile}/>
            </label>
          </div>
          {bulkErrors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-red-400">{bulkErrors.length} errors:</p>
              {bulkErrors.map((e,i)=><p key={i} className="text-xs text-red-300">{e}</p>)}
            </div>
          )}
          {bulkPreview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{bulkPreview.length} users ready:</p>
                <button onClick={handleBulkImport} className="btn-primary text-sm py-2"><CheckCircle size={14}/>Import All</button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {bulkPreview.map((u,i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-surface-800 rounded-lg text-xs">
                    <span className="font-mono text-surface-500 w-6">{i+1}</span>
                    <span className="text-white flex-1">{u.firstName} {u.lastName}</span>
                    <span className="text-surface-400">{u.email}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ROLE_STYLE[u.role]||''}`}>{u.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Password Result Modal ──────────────────────────── */}
      <Modal open={!!resetResult} onClose={()=>setResetResult(null)} title="Credentials Created">
        {resetResult && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <p className="text-sm text-emerald-300 mb-3">Share these credentials securely with <strong>{resetResult.name}</strong>:</p>
              {resetResult.email && (
                <div className="mb-2">
                  <span className="text-xs text-surface-400">Email:</span>
                  <code className="block text-sm text-white font-mono mt-0.5">{resetResult.email}</code>
                </div>
              )}
              <div>
                <span className="text-xs text-surface-400">Temporary Password:</span>
                <code className="block text-lg text-primary-300 font-mono font-bold mt-0.5 tracking-wider">{resetResult.tempPassword}</code>
              </div>
            </div>
            <p className="text-xs text-surface-500">The user must change this password after their first login.</p>
            <button onClick={()=>{ navigator.clipboard.writeText(resetResult.tempPassword); toast.success('Copied!'); }}
              className="btn-secondary w-full justify-center">Copy Password</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
