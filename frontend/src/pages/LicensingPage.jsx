import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Key, FlaskConical, FileText, Plus, Search,
  CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw,
  Copy, ExternalLink, Shield, TrendingUp, Users, CreditCard,
  ChevronRight, Zap, Globe, ToggleLeft, ToggleRight,
  Ban, Play, Eye, Activity, IndianRupee, Percent, UserPlus
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

// ── Helpers ────────────────────────────────────────────────
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

const STATUS_STYLE = {
  active:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  trial:     'bg-blue-500/15 text-blue-400 border-blue-500/30',
  suspended: 'bg-red-500/15 text-red-400 border-red-500/30',
  expired:   'bg-surface-700 text-surface-400 border-surface-600',
  cancelled: 'bg-surface-800 text-surface-500 border-surface-700',
};

const TABS = [
  { id:'overview',   label:'Overview',       icon: TrendingUp   },
  { id:'orgs',       label:'Organisations',  icon: Building2    },
  { id:'plans',      label:'Plans',          icon: Key          },
  { id:'sandboxes',  label:'Sandboxes',      icon: FlaskConical },
  { id:'invoices',   label:'GST Invoices',   icon: FileText     },
];

// ── Reusable ───────────────────────────────────────────────
function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{opacity:0,scale:0.95,y:16}} animate={{opacity:1,scale:1,y:0}}
        className={`relative glass rounded-2xl p-6 w-full ${wide?'max-w-2xl':'max-w-lg'} max-h-[90vh] overflow-y-auto z-10`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-white p-1 rounded-lg hover:bg-surface-700"><XCircle size={20}/></button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

// Usage meter bar
function UsageMeter({ label, used, max, color='primary' }) {
  const pct = max >= 9999 ? 0 : Math.min((used/max)*100, 100);
  const isUnlimited = max >= 9999;
  const isWarning   = pct >= 80;
  const isCritical  = pct >= 95;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-surface-400 font-medium">{label}</span>
        <span className={`font-mono font-bold ${isCritical?'text-red-400':isWarning?'text-amber-400':'text-white'}`}>
          {isUnlimited ? `${used} / ∞` : `${used} / ${max}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="w-full bg-surface-800 rounded-full h-1.5">
          <div className={`h-1.5 rounded-full transition-all ${isCritical?'bg-red-500':isWarning?'bg-amber-500':'bg-primary-500'}`}
            style={{width:`${pct}%`}} />
        </div>
      )}
      {isUnlimited && <div className="text-xs text-emerald-400 font-medium">Unlimited</div>}
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────
function OverviewTab({ overview, onRefresh }) {
  if (!overview) return <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"/></div>;
  const byStatus = {};
  (overview.orgsByStatus||[]).forEach(r => { byStatus[r.license_status] = parseInt(r.count); });
  const total = Object.values(byStatus).reduce((a,b)=>a+b,0);
  const rev = overview.revenue || {};

  return (
    <div className="space-y-6">
      {/* Revenue cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'Total Clients',      value: total,                                  icon: Building2,    color:'from-primary-500/20 to-primary-600/10 border-primary-500/20 text-primary-400' },
          { label:'Active Licences',    value: byStatus.active||0,                     icon: CheckCircle,  color:'from-emerald-500/20 to-emerald-600/10 border-emerald-500/20 text-emerald-400' },
          { label:'Revenue This Month', value: inr(rev.this_month||0),                 icon: IndianRupee,  color:'from-amber-500/20 to-amber-600/10 border-amber-500/20 text-amber-400' },
          { label:'Live Sandboxes',     value: overview.activeSandboxes||0,            icon: FlaskConical, color:'from-purple-500/20 to-purple-600/10 border-purple-500/20 text-purple-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className={`glass rounded-2xl p-5 border bg-gradient-to-br ${color}`}>
            <div className={`p-2.5 rounded-xl bg-gradient-to-br ${color} border mb-3 w-fit`}><Icon size={20}/></div>
            <div className="font-display text-3xl font-bold text-white mb-0.5">{value}</div>
            <div className="text-sm text-surface-300 font-heading font-medium">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Status breakdown */}
        <div className="glass rounded-2xl p-5">
          <h3 className="section-title mb-4">Licence Status</h3>
          <div className="space-y-3">
            {[{s:'active',l:'Active'},{s:'trial',l:'Trial'},{s:'suspended',l:'Suspended'},{s:'expired',l:'Expired'},{s:'cancelled',l:'Cancelled'}].map(({s,l})=>
              (byStatus[s]||0) > 0 && (
                <div key={s} className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${STATUS_STYLE[s]}`}>{l}</span>
                  <div className="flex-1 bg-surface-800 rounded-full h-1.5">
                    <div className="bg-primary-500 h-1.5 rounded-full" style={{width:`${total?(byStatus[s]/total*100):0}%`}}/>
                  </div>
                  <span className="text-sm font-bold text-white w-5 text-right">{byStatus[s]}</span>
                </div>
              )
            )}
          </div>
        </div>

        {/* Revenue summary */}
        <div className="glass rounded-2xl p-5">
          <h3 className="section-title mb-4">Revenue Summary</h3>
          <div className="space-y-3">
            {[
              { label:'Collected (All Time)', value: inr(rev.total_collected||0), color:'text-emerald-400' },
              { label:'This Month',           value: inr(rev.this_month||0),      color:'text-primary-400' },
              { label:'Pending Invoices',     value: inr(rev.pending||0),         color:'text-amber-400'   },
            ].map(({label,value,color})=>(
              <div key={label} className="flex justify-between items-center py-2 border-b border-surface-800 last:border-0">
                <span className="text-sm text-surface-400">{label}</span>
                <span className={`text-sm font-bold font-mono ${color}`}>{value}</span>
              </div>
            ))}
            <p className="text-xs text-surface-500 pt-1">All amounts exclusive of GST (18%)</p>
          </div>
        </div>

        {/* Expiring soon */}
        <div className="glass rounded-2xl p-5">
          <h3 className="section-title mb-4 flex items-center gap-2"><AlertTriangle size={15} className="text-amber-400"/>Expiring Soon</h3>
          {!(overview.expiringLicenses||[]).length
            ? <p className="text-sm text-surface-500">No licences expiring in 30 days ✅</p>
            : <div className="space-y-2">
                {(overview.expiringLicenses||[]).map(org=>(
                  <div key={org.id} className="flex items-center justify-between p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20">
                    <span className="text-sm text-white font-medium truncate flex-1">{org.name}</span>
                    <span className="text-xs text-amber-400 shrink-0 ml-2">
                      {new Date(org.license_expires_at||org.trial_ends_at).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

      {/* Top active orgs */}
      {(overview.topOrgs||[]).filter(o=>o.live_sessions>0).length > 0 && (
        <div className="glass rounded-2xl p-5">
          <h3 className="section-title mb-4 flex items-center gap-2"><Activity size={15} className="text-emerald-400"/>Live Activity Right Now</h3>
          <div className="grid md:grid-cols-3 gap-3">
            {(overview.topOrgs||[]).filter(o=>o.live_sessions>0).map(org=>(
              <div key={org.name} className="flex items-center gap-3 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"/>
                <span className="text-sm text-white font-medium flex-1 truncate">{org.name}</span>
                <span className="text-sm font-bold text-emerald-400">{org.live_sessions} live</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Plans Tab ──────────────────────────────────────────────
function PlansTab({ plans, onRefresh }) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name:'', slug:'', description:'',
    priceMonthly:0, priceYearly:0, priceSetup:0,
    maxExaminers:5, maxStudents:500, maxConcurrentSessions:50, maxActiveExams:30,
    maxStorageGb:10, aiProctoring:true, aiQuestionGen:false,
    customBranding:false, sandboxAccess:false, apiAccess:false, prioritySupport:false,
  });

  const FEATURES = [
    {key:'aiProctoring',     label:'AI Proctoring'},
    {key:'aiQuestionGen',    label:'AI Question Generator'},
    {key:'customBranding',   label:'Custom Branding'},
    {key:'sandboxAccess',    label:'Sandbox / Demo Access'},
    {key:'apiAccess',        label:'API Access'},
    {key:'prioritySupport',  label:'Priority Support'},
  ];

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/licensing/plans', form);
      toast.success('Plan created!');
      setShowCreate(false);
      onRefresh();
    } catch (err) { toast.error(err.response?.data?.error||'Failed'); }
  };

  const PLAN_COLORS = {
    trial:        'border-surface-700',
    starter:      'border-blue-500/30',
    professional: 'border-primary-500/30',
    enterprise:   'border-amber-500/30',
    sandbox:      'border-purple-500/30',
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={()=>setShowCreate(true)} className="btn-primary"><Plus size={15}/>New Plan</button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {plans.map(plan=>(
          <div key={plan.id} className={`glass rounded-2xl p-5 border hover:scale-[1.01] transition-all ${PLAN_COLORS[plan.slug]||'border-surface-700'}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-heading font-bold text-white text-lg">{plan.name}</h3>
                <p className="text-xs text-surface-400 mt-0.5 leading-relaxed">{plan.description}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${plan.is_active?'bg-emerald-500/20 text-emerald-400':'bg-surface-700 text-surface-500'}`}>
                {plan.is_active?'Active':'Off'}
              </span>
            </div>

            {/* Pricing */}
            <div className="mb-4 p-3 bg-surface-800 rounded-xl">
              {plan.price_monthly === 0
                ? <div className="text-2xl font-bold text-white font-display">Free</div>
                : <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-white font-display">{inr(plan.price_monthly)}</span>
                      <span className="text-surface-400 text-sm">/month</span>
                    </div>
                    {plan.price_yearly > 0 && (
                      <div className="text-xs text-emerald-400 mt-0.5">
                        {inr(plan.price_yearly)}/year · save {Math.round((1-(plan.price_yearly/(plan.price_monthly*12)))*100)}%
                      </div>
                    )}
                    {plan.price_setup > 0 && (
                      <div className="text-xs text-amber-400 mt-0.5">+ {inr(plan.price_setup)} one-time setup</div>
                    )}
                    <div className="text-xs text-surface-500 mt-1">+ 18% GST</div>
                  </>
              }
            </div>

            {/* Limits */}
            <div className="space-y-2 mb-4">
              {[
                {label:`${plan.max_examiners >= 9999 ? 'Unlimited' : plan.max_examiners} Examiners`},
                {label:`${plan.max_students >= 99999 ? 'Unlimited' : plan.max_students?.toLocaleString('en-IN')} Registered Students`},
                {label:`${plan.max_concurrent_sessions >= 9999 ? 'Unlimited' : plan.max_concurrent_sessions} Concurrent Test-Takers`},
                {label:`${plan.max_active_exams >= 9999 ? 'Unlimited' : plan.max_active_exams} Active Published Exams`},
                {label:`${plan.max_storage_gb}GB Storage`},
              ].map(f=>(
                <div key={f.label} className="flex items-center gap-2 text-xs text-surface-300">
                  <CheckCircle size={11} className="text-emerald-400 shrink-0"/>{f.label}
                </div>
              ))}
              {FEATURES.filter(f=>plan[f.key]).map(f=>(
                <div key={f.key} className="flex items-center gap-2 text-xs text-primary-300">
                  <Zap size={11} className="text-primary-400 shrink-0"/>{f.label}
                </div>
              ))}
            </div>
            <div className="text-xs text-surface-600 font-mono">slug: {plan.slug}</div>
          </div>
        ))}
      </div>

      <Modal open={showCreate} onClose={()=>setShowCreate(false)} title="Create New Plan" wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label text-xs">Plan Name *</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="input" placeholder="Professional" required/></div>
            <div><label className="label text-xs">Slug *</label><input value={form.slug} onChange={e=>setForm({...form,slug:e.target.value})} className="input font-mono text-sm" placeholder="professional" required/></div>
          </div>
          <div><label className="label text-xs">Description</label><input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="input" placeholder="For mid-size colleges..."/></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label text-xs">Monthly (₹)</label><input type="number" value={form.priceMonthly} onChange={e=>setForm({...form,priceMonthly:e.target.value})} className="input" min="0"/></div>
            <div><label className="label text-xs">Yearly (₹)</label><input type="number" value={form.priceYearly} onChange={e=>setForm({...form,priceYearly:e.target.value})} className="input" min="0"/></div>
            <div><label className="label text-xs">Setup Fee (₹)</label><input type="number" value={form.priceSetup} onChange={e=>setForm({...form,priceSetup:e.target.value})} className="input" min="0"/></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="label text-xs">Examiners</label><input type="number" value={form.maxExaminers} onChange={e=>setForm({...form,maxExaminers:parseInt(e.target.value)})} className="input" min="1"/></div>
            <div><label className="label text-xs">Students</label><input type="number" value={form.maxStudents} onChange={e=>setForm({...form,maxStudents:parseInt(e.target.value)})} className="input" min="1"/></div>
            <div><label className="label text-xs">Concurrent</label><input type="number" value={form.maxConcurrentSessions} onChange={e=>setForm({...form,maxConcurrentSessions:parseInt(e.target.value)})} className="input" min="1"/></div>
            <div><label className="label text-xs">Active Exams</label><input type="number" value={form.maxActiveExams} onChange={e=>setForm({...form,maxActiveExams:parseInt(e.target.value)})} className="input" min="1"/></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {FEATURES.map(({key,label})=>(
              <label key={key} className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${form[key]?'border-primary-500/40 bg-primary-500/10':'border-surface-700 hover:border-surface-600'}`}>
                <input type="checkbox" checked={form[key]} onChange={e=>setForm({...form,[key]:e.target.checked})} className="hidden"/>
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${form[key]?'bg-primary-500 border-primary-500':'border-surface-500'}`}>
                  {form[key]&&<CheckCircle size={10} className="text-white"/>}
                </div>
                <span className="text-xs text-surface-300">{label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={()=>setShowCreate(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center">Create Plan</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ── Organisations Tab ──────────────────────────────────────
function OrgsTab({ plans }) {
  const [orgs, setOrgs]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate]     = useState(false);
  const [liveDetail, setLiveDetail]     = useState(null);
  const [loadingLive, setLoadingLive]   = useState(false);
  const [showOrgAdmin, setShowOrgAdmin] = useState(false);
  const [orgAdminTarget, setOrgAdminTarget] = useState(null);
  const [orgAdminResult, setOrgAdminResult] = useState(null);
  const [orgAdminForm, setOrgAdminForm] = useState({ firstName:'', lastName:'', email:'', phone:'' });
  const [form, setForm] = useState({
    name:'', slug:'', domain:'', contactName:'', contactEmail:'',
    contactPhone:'', address:'', city:'', state:'', pincode:'',
    country:'India', gstNumber:'', panNumber:'',
    planId:'', billingCycle:'monthly', trialDays:14, notes:''
  });

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit:100 });
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/licensing/orgs?${params}`);
      setOrgs(data.orgs||[]); setTotal(data.total||0);
    } catch { toast.error('Failed to load organisations'); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(()=>{ fetch(); }, [fetch]);

  const autoSlug = n => n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/licensing/orgs', form);
      toast.success('Organisation created!');
      setShowCreate(false);
      fetch();
    } catch (err) { toast.error(err.response?.data?.error||'Failed to create'); }
  };

  const viewLive = async (org) => {
    setLiveDetail({ org, data: null });
    setLoadingLive(true);
    try {
      const { data } = await api.get(`/licensing/orgs/${org.id}/live`);
      setLiveDetail({ org, data });
    } catch { toast.error('Failed to load live data'); }
    finally { setLoadingLive(false); }
  };

  const handleSuspend = async (id) => {
    if (!confirm('Suspend this organisation? All active sessions will be terminated.')) return;
    try { await api.post(`/licensing/orgs/${id}/suspend`); toast.success('Suspended'); fetch(); }
    catch { toast.error('Failed'); }
  };

  const handleActivate = async (id) => {
    try { await api.post(`/licensing/orgs/${id}/activate`); toast.success('Activated'); fetch(); }
    catch { toast.error('Failed'); }
  };

  const handleRegenKey = async (id) => {
    if (!confirm('Regenerate licence key? The old key will stop working immediately.')) return;
    try {
      const { data } = await api.post(`/licensing/orgs/${id}/regen-key`);
      navigator.clipboard.writeText(data.licenseKey);
      toast.success('New key generated & copied!');
      fetch();
    } catch { toast.error('Failed'); }
  };

  const handleCreateOrgAdmin = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/licensing/orgs/${orgAdminTarget.id}/create-admin`, orgAdminForm);
      setOrgAdminResult({ org: orgAdminTarget.name, ...data });
      setShowOrgAdmin(false);
      setOrgAdminForm({ firstName:'', lastName:'', email:'', phone:'' });
      toast.success('Org admin created!');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to create admin'); }
  };

  const filtered = orgs.filter(o =>
    `${o.name} ${o.contact_email||''}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search organisations..." className="input pl-9"/>
        </div>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="input w-40">
          <option value="">All Status</option>
          {['active','trial','suspended','expired','cancelled'].map(s=><option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        <button onClick={fetch} className="btn-secondary px-3"><RefreshCw size={15}/></button>
        <button onClick={()=>setShowCreate(true)} className="btn-primary"><Plus size={15}/>Add Organisation</button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(6)].map((_,i)=><div key={i} className="glass rounded-xl h-16 animate-pulse"/>)}</div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-surface-800">
              {['Organisation','Plan','Contact','Live / Max','Status','Expires','Actions'].map(h=>(
                <th key={h} className="text-left text-xs font-semibold text-surface-400 px-4 py-3 font-heading">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-surface-800">
              {filtered.map((org,i)=>(
                <motion.tr key={org.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.02}}
                  className="hover:bg-surface-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-white">{org.name}</div>
                    <div className="text-xs text-surface-500">{org.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-surface-300 font-medium">{org.plan_name||'—'}</div>
                    {org.price_monthly > 0 && <div className="text-xs text-surface-500">{inr(org.price_monthly)}/mo</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-surface-300">{org.contact_email||'—'}</div>
                    {org.city && <div className="text-xs text-surface-500">{org.city}, {org.state}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold font-mono ${parseInt(org.live_sessions)>0?'text-emerald-400':'text-surface-400'}`}>
                        {org.live_sessions||0}
                      </span>
                      <span className="text-surface-600 text-xs">/</span>
                      <span className="text-xs text-surface-400">{org.effective_concurrent>=9999?'∞':org.effective_concurrent}</span>
                      {parseInt(org.live_sessions)>0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>}
                    </div>
                    <div className="text-xs text-surface-500">{org.student_count||0} students</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border capitalize ${STATUS_STYLE[org.license_status]||''}`}>
                      {org.license_status}
                    </span>
                    {org.is_sandbox && <span className="ml-1 text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded-full">demo</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${org.license_expires_at&&new Date(org.license_expires_at)<new Date(Date.now()+30*86400000)?'text-amber-400':'text-surface-500'}`}>
                      {org.license_expires_at ? new Date(org.license_expires_at).toLocaleDateString('en-IN') : org.license_status==='trial' ? `Trial ends ${new Date(org.trial_ends_at).toLocaleDateString('en-IN')}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={()=>viewLive(org)} title="Live Usage" className="p-1.5 text-surface-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg"><Activity size={13}/></button>
                      <button onClick={()=>handleRegenKey(org.id)} title="Regen Key" className="p-1.5 text-surface-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg"><Key size={13}/></button>
                      {org.license_status==='suspended'
                        ? <button onClick={()=>handleActivate(org.id)} title="Activate" className="p-1.5 text-surface-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg"><Play size={13}/></button>
                        : <button onClick={()=>handleSuspend(org.id)} title="Suspend" className="p-1.5 text-surface-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg"><Ban size={13}/></button>
                      }
                      <button onClick={()=>{ setOrgAdminTarget(org); setShowOrgAdmin(true); }}
                        title="Create Org Admin Login"
                        className="p-1.5 text-surface-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg">
                        <UserPlus size={13}/>
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0 && <div className="text-center py-12 text-surface-500"><Building2 size={32} className="mx-auto mb-3 opacity-30"/>No organisations found</div>}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={()=>setShowCreate(false)} title="Add New Organisation" wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label text-xs">Organisation Name *</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value,slug:autoSlug(e.target.value)})} className="input" placeholder="Apex Coaching Centre" required/></div>
            <div><label className="label text-xs">Slug *</label><input value={form.slug} onChange={e=>setForm({...form,slug:e.target.value})} className="input font-mono text-sm" placeholder="apex-coaching" required/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label text-xs">Contact Name</label><input value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})} className="input" placeholder="Rajesh Kumar"/></div>
            <div><label className="label text-xs">Contact Email</label><input type="email" value={form.contactEmail} onChange={e=>setForm({...form,contactEmail:e.target.value})} className="input" placeholder="admin@apex.edu"/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label text-xs">Phone</label><input value={form.contactPhone} onChange={e=>setForm({...form,contactPhone:e.target.value})} className="input" placeholder="+91 98765 43210"/></div>
            <div><label className="label text-xs">Domain / Website</label><input value={form.domain} onChange={e=>setForm({...form,domain:e.target.value})} className="input" placeholder="apex.edu.in"/></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label text-xs">City</label><input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} className="input" placeholder="Mumbai"/></div>
            <div><label className="label text-xs">State</label><input value={form.state} onChange={e=>setForm({...form,state:e.target.value})} className="input" placeholder="Maharashtra"/></div>
            <div><label className="label text-xs">PIN Code</label><input value={form.pincode} onChange={e=>setForm({...form,pincode:e.target.value})} className="input" placeholder="400001"/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label text-xs">GST Number</label><input value={form.gstNumber} onChange={e=>setForm({...form,gstNumber:e.target.value})} className="input font-mono" placeholder="27AAPFU0939F1ZV"/></div>
            <div><label className="label text-xs">PAN Number</label><input value={form.panNumber} onChange={e=>setForm({...form,panNumber:e.target.value})} className="input font-mono" placeholder="AAPFU0939F"/></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label text-xs">Licence Plan *</label>
              <select value={form.planId} onChange={e=>setForm({...form,planId:e.target.value})} className="input" required>
                <option value="">Select Plan</option>
                {plans.map(p=><option key={p.id} value={p.id}>{p.name} — {p.price_monthly===0?'Free':inr(p.price_monthly)+'/mo'}</option>)}
              </select>
            </div>
            <div><label className="label text-xs">Billing Cycle</label>
              <select value={form.billingCycle} onChange={e=>setForm({...form,billingCycle:e.target.value})} className="input">
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div><label className="label text-xs">Trial Days</label><input type="number" value={form.trialDays} onChange={e=>setForm({...form,trialDays:e.target.value})} className="input" min="0" max="90"/></div>
          </div>
          <div><label className="label text-xs">Internal Notes</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="input resize-none h-16" placeholder="Notes about this client..."/></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={()=>setShowCreate(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center">Create Organisation</button>
          </div>
        </form>
      </Modal>

      {/* Create Org Admin Modal */}
      <Modal open={showOrgAdmin} onClose={()=>setShowOrgAdmin(false)} title={`Create Admin Login — ${orgAdminTarget?.name}`}>
        <form onSubmit={handleCreateOrgAdmin} className="space-y-4">
          <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-300">
            👤 This creates a separate login for your client's administrator. They will be able to manage their own users, view exams and alerts — but cannot access other organisations or your licensing dashboard.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">First Name *</label>
              <input value={orgAdminForm.firstName} onChange={e=>setOrgAdminForm({...orgAdminForm,firstName:e.target.value})} className="input" placeholder="Priya" required/>
            </div>
            <div>
              <label className="label text-xs">Last Name *</label>
              <input value={orgAdminForm.lastName} onChange={e=>setOrgAdminForm({...orgAdminForm,lastName:e.target.value})} className="input" placeholder="Sharma" required/>
            </div>
          </div>
          <div>
            <label className="label text-xs">Email Address *</label>
            <input type="email" value={orgAdminForm.email} onChange={e=>setOrgAdminForm({...orgAdminForm,email:e.target.value})} className="input" placeholder="admin@clientorganisation.com" required/>
          </div>
          <div>
            <label className="label text-xs">Phone (optional)</label>
            <input value={orgAdminForm.phone} onChange={e=>setOrgAdminForm({...orgAdminForm,phone:e.target.value})} className="input" placeholder="+91 98765 43210"/>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
            ⚠️ A temporary password will be generated automatically. Write it down and share it securely with your client.
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={()=>setShowOrgAdmin(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center"><UserPlus size={15}/>Create Admin Login</button>
          </div>
        </form>
      </Modal>

      {/* Org Admin Credentials Result Modal */}
      <Modal open={!!orgAdminResult} onClose={()=>setOrgAdminResult(null)} title="Admin Credentials Created ✓">
        {orgAdminResult && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <p className="text-sm text-emerald-300 font-medium mb-3">
                Share these login credentials with your client: <strong>{orgAdminResult.org}</strong>
              </p>
              <div className="space-y-3">
                <div className="bg-surface-900 rounded-xl p-3">
                  <div className="text-xs text-surface-400 mb-1">Login URL</div>
                  <code className="text-sm text-primary-300 font-mono">{window.location.origin}/login</code>
                </div>
                <div className="bg-surface-900 rounded-xl p-3">
                  <div className="text-xs text-surface-400 mb-1">Email</div>
                  <code className="text-sm text-white font-mono">{orgAdminResult.user?.email}</code>
                </div>
                <div className="bg-surface-900 rounded-xl p-3">
                  <div className="text-xs text-surface-400 mb-1">Temporary Password</div>
                  <code className="text-xl text-amber-300 font-mono font-bold tracking-wider">{orgAdminResult.tempPassword}</code>
                </div>
              </div>
            </div>
            <p className="text-xs text-surface-500">The client should change this password after their first login. They will only see their own organisation's data.</p>
            <div className="flex gap-3">
              <button onClick={()=>{ navigator.clipboard.writeText(`Login: ${window.location.origin}/login\nEmail: ${orgAdminResult.user?.email}\nPassword: ${orgAdminResult.tempPassword}`); toast.success('Credentials copied!'); }}
                className="btn-secondary flex-1 justify-center">Copy All Credentials</button>
              <button onClick={()=>setOrgAdminResult(null)} className="btn-primary flex-1 justify-center">Done</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Live Usage Modal */}
      <Modal open={!!liveDetail} onClose={()=>setLiveDetail(null)} title={`Live Usage — ${liveDetail?.org?.name}`} wide>
        {loadingLive ? (
          <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"/></div>
        ) : liveDetail?.data && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <UsageMeter label="Concurrent Sessions (Live)" used={liveDetail.data.usage.concurrentSessions} max={liveDetail.data.limits.max_concurrent}/>
              <UsageMeter label="Registered Students" used={liveDetail.data.usage.registeredStudents} max={liveDetail.data.limits.max_students}/>
              <UsageMeter label="Examiners" used={liveDetail.data.usage.registeredExaminers} max={liveDetail.data.limits.max_examiners}/>
              <UsageMeter label="Published Exams" used={liveDetail.data.usage.activeExams} max={liveDetail.data.limits.max_active_exams}/>
            </div>
            {liveDetail.data.liveSessions.length > 0 ? (
              <div>
                <h4 className="text-sm font-semibold text-white font-heading mb-3">Active Sessions Right Now</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {liveDetail.data.liveSessions.map(s=>(
                    <div key={s.id} className="flex items-center gap-3 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"/>
                      <span className="text-white font-medium flex-1">{s.student_name}</span>
                      <span className="text-surface-400 text-xs">{s.exam_title}</span>
                      <span className="text-surface-500 text-xs">{new Date(s.started_at).toLocaleTimeString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-surface-400 text-sm text-center py-4">No active sessions right now</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Sandboxes Tab ──────────────────────────────────────────
function SandboxesTab({ orgs }) {
  const [sandboxes, setSandboxes] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ orgId:'', demoName:'', welcomeMessage:'', presetType:'standard', expiresInDays:7, maxAccesses:50 });

  const fetchSandboxes = async () => {
    setLoading(true);
    try { const {data}=await api.get('/licensing/sandboxes'); setSandboxes(data); }
    catch { toast.error('Failed to load sandboxes'); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ fetchSandboxes(); },[]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const {data} = await api.post('/licensing/sandboxes', form);
      toast.success('Sandbox created!');
      navigator.clipboard.writeText(data.demoUrl);
      toast.success('Demo URL copied to clipboard!');
      setShowCreate(false); fetchSandboxes();
    } catch (err) { toast.error(err.response?.data?.error||'Failed'); }
  };

  const handleToggle = async (id) => {
    try {
      const {data} = await api.patch(`/licensing/sandboxes/${id}/toggle`);
      toast.success(data.isActive?'Sandbox enabled':'Sandbox disabled');
      fetchSandboxes();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-surface-400 text-sm">Create shareable demo links for prospects. Each link expires automatically after the set duration.</p>
        <button onClick={()=>setShowCreate(true)} className="btn-primary"><Plus size={15}/>New Sandbox</button>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_,i)=><div key={i} className="glass rounded-2xl h-28 animate-pulse"/>)}</div>
      ) : sandboxes.length===0 ? (
        <div className="glass rounded-2xl p-14 text-center">
          <FlaskConical size={44} className="text-surface-700 mx-auto mb-4"/>
          <h3 className="font-heading text-lg font-semibold text-surface-400 mb-2">No Sandboxes Yet</h3>
          <p className="text-surface-500 text-sm mb-4">Create a demo sandbox to share with potential clients</p>
          <button onClick={()=>setShowCreate(true)} className="btn-primary mx-auto"><Plus size={15}/>Create Sandbox</button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {sandboxes.map((sb,i)=>(
            <motion.div key={sb.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
              className={`glass rounded-2xl p-5 border transition-all ${sb.is_active?'border-purple-500/20':'border-surface-700/50 opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${sb.is_active?'bg-purple-500/20':'bg-surface-800'}`}>
                    <FlaskConical size={18} className={sb.is_active?'text-purple-400':'text-surface-500'}/>
                  </div>
                  <div>
                    <h3 className="font-heading font-semibold text-white text-sm">{sb.demo_name}</h3>
                    <p className="text-xs text-surface-400">{sb.org_name}</p>
                  </div>
                </div>
                <button onClick={()=>handleToggle(sb.id)} className={`${sb.is_active?'text-purple-400':'text-surface-600'}`}>
                  {sb.is_active?<ToggleRight size={22}/>:<ToggleLeft size={22}/>}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  {label:'Accesses', val:`${sb.access_count}/${sb.max_accesses}`},
                  {label:'Expires',  val: sb.expires_at ? new Date(sb.expires_at).toLocaleDateString('en-IN') : '—'},
                  {label:'Type',     val: sb.preset_type},
                ].map(({label,val})=>(
                  <div key={label} className="bg-surface-800 rounded-lg p-2 text-center">
                    <div className="text-xs font-semibold text-white">{val}</div>
                    <div className="text-xs text-surface-500">{label}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 bg-surface-800 rounded-lg p-2">
                <Globe size={11} className="text-surface-500 shrink-0"/>
                <code className="text-xs text-primary-300 flex-1 truncate">{sb.demoUrl}</code>
                <button onClick={()=>{navigator.clipboard.writeText(sb.demoUrl);toast.success('URL copied!');}} className="p-1 text-surface-400 hover:text-white shrink-0"><Copy size={11}/></button>
                <a href={sb.demoUrl} target="_blank" rel="noreferrer" className="p-1 text-surface-400 hover:text-white shrink-0"><ExternalLink size={11}/></a>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={()=>setShowCreate(false)} title="Create Demo Sandbox" wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300">
            💡 A shareable link will be created for your prospect to experience ProctorAI without signing up. The link auto-expires.
          </div>
          <div><label className="label text-xs">Organisation *</label>
            <select value={form.orgId} onChange={e=>setForm({...form,orgId:e.target.value})} className="input" required>
              <option value="">Select Organisation</option>
              {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div><label className="label text-xs">Demo Name *</label><input value={form.demoName} onChange={e=>setForm({...form,demoName:e.target.value})} className="input" placeholder="Apex Coaching — AI Proctoring Demo" required/></div>
          <div><label className="label text-xs">Welcome Message</label><textarea value={form.welcomeMessage} onChange={e=>setForm({...form,welcomeMessage:e.target.value})} className="input resize-none h-20" placeholder="Welcome to ProctorAI! This is a live demonstration..."/></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label text-xs">Preset</label>
              <select value={form.presetType} onChange={e=>setForm({...form,presetType:e.target.value})} className="input">
                <option value="standard">Standard</option>
                <option value="ai_showcase">AI Showcase</option>
                <option value="minimal">Minimal</option>
              </select>
            </div>
            <div><label className="label text-xs">Expires In (days)</label><input type="number" value={form.expiresInDays} onChange={e=>setForm({...form,expiresInDays:e.target.value})} className="input" min="1" max="90"/></div>
            <div><label className="label text-xs">Max Accesses</label><input type="number" value={form.maxAccesses} onChange={e=>setForm({...form,maxAccesses:e.target.value})} className="input" min="1" max="1000"/></div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={()=>setShowCreate(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center"><FlaskConical size={15}/>Create &amp; Copy Link</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ── GST Invoices Tab ───────────────────────────────────────
function InvoicesTab({ orgs, plans }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ orgId:'', planName:'', baseAmount:'', billingStart:'', billingEnd:'', dueDate:'', isIgst:false, notes:'' });

  const fetchInvoices = async () => {
    setLoading(true);
    try { const {data}=await api.get('/licensing/invoices'); setInvoices(data); }
    catch { toast.error('Failed to load invoices'); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ fetchInvoices(); },[]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try { await api.post('/licensing/invoices', form); toast.success('Invoice created!'); setShowCreate(false); fetchInvoices(); }
    catch (err) { toast.error(err.response?.data?.error||'Failed'); }
  };

  const handleMarkPaid = async (id) => {
    const ref = prompt('Payment reference / UTR number (optional):') || '';
    try { await api.patch(`/licensing/invoices/${id}/pay`, { paymentMethod:'bank_transfer', paymentReference:ref }); toast.success('Marked as paid!'); fetchInvoices(); }
    catch { toast.error('Failed'); }
  };

  const base    = parseFloat(form.baseAmount||0);
  const isIgst  = form.isIgst;
  const cgst    = isIgst ? 0 : base*0.09;
  const sgst    = isIgst ? 0 : base*0.09;
  const igst    = isIgst ? base*0.18 : 0;
  const total   = base + cgst + sgst + igst;

  const INV_STATUS = {
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    paid:    'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    overdue: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={()=>setShowCreate(true)} className="btn-primary"><Plus size={15}/>New Invoice</button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_,i)=><div key={i} className="glass rounded-xl h-14 animate-pulse"/>)}</div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-surface-800">
              {['Invoice #','Organisation','Plan','Base Amt','GST','Total','Status','Due','Actions'].map(h=>(
                <th key={h} className="text-left text-xs font-semibold text-surface-400 px-4 py-3 font-heading">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-surface-800">
              {invoices.map((inv,i)=>(
                <motion.tr key={inv.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.02}}
                  className="hover:bg-surface-800/30 transition-colors">
                  <td className="px-4 py-3"><code className="text-xs text-primary-300 font-mono">{inv.invoice_number}</code></td>
                  <td className="px-4 py-3"><span className="text-sm text-white">{inv.org_name}</span></td>
                  <td className="px-4 py-3"><span className="text-xs text-surface-400">{inv.plan_name||'—'}</span></td>
                  <td className="px-4 py-3"><span className="text-sm text-white font-mono">{inr(inv.base_amount)}</span></td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-surface-400">
                      {inv.igst_amount>0 ? `IGST ${inr(inv.igst_amount)}` : `CGST ${inr(inv.cgst_amount)} + SGST ${inr(inv.sgst_amount)}`}
                    </span>
                  </td>
                  <td className="px-4 py-3"><span className="text-sm font-bold text-white font-mono">{inr(inv.total_amount)}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border font-semibold capitalize ${INV_STATUS[inv.status]||''}`}>{inv.status}</span></td>
                  <td className="px-4 py-3"><span className="text-xs text-surface-400">{inv.due_date?new Date(inv.due_date).toLocaleDateString('en-IN'):'—'}</span></td>
                  <td className="px-4 py-3">
                    {inv.status==='pending' && (
                      <button onClick={()=>handleMarkPaid(inv.id)} className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/20 font-medium">
                        Mark Paid
                      </button>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {invoices.length===0 && <div className="text-center py-10 text-surface-500"><FileText size={28} className="mx-auto mb-3 opacity-30"/>No invoices yet</div>}
        </div>
      )}

      <Modal open={showCreate} onClose={()=>setShowCreate(false)} title="Create GST Invoice" wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label text-xs">Organisation *</label>
              <select value={form.orgId} onChange={e=>setForm({...form,orgId:e.target.value})} className="input" required>
                <option value="">Select Organisation</option>
                {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div><label className="label text-xs">Plan Name</label>
              <select value={form.planName} onChange={e=>setForm({...form,planName:e.target.value})} className="input">
                <option value="">Select Plan</option>
                {plans.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label text-xs">Billing Period Start</label><input type="date" value={form.billingStart} onChange={e=>setForm({...form,billingStart:e.target.value})} className="input"/></div>
            <div><label className="label text-xs">Billing Period End</label><input type="date" value={form.billingEnd} onChange={e=>setForm({...form,billingEnd:e.target.value})} className="input"/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label text-xs">Base Amount (₹, excl. GST) *</label><input type="number" value={form.baseAmount} onChange={e=>setForm({...form,baseAmount:e.target.value})} className="input" min="0" step="0.01" required/></div>
            <div><label className="label text-xs">Due Date</label><input type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})} className="input"/></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isIgst} onChange={e=>setForm({...form,isIgst:e.target.checked})} className="w-4 h-4 rounded accent-primary-500"/>
            <span className="text-sm text-surface-300">Apply IGST (18%) instead of CGST+SGST — use for inter-state billing</span>
          </label>
          {base > 0 && (
            <div className="bg-surface-800 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-surface-400">Base Amount</span><span className="text-white font-mono">{inr(base)}</span></div>
              {!isIgst && <>
                <div className="flex justify-between"><span className="text-surface-400">CGST @ 9%</span><span className="text-white font-mono">{inr(cgst)}</span></div>
                <div className="flex justify-between"><span className="text-surface-400">SGST @ 9%</span><span className="text-white font-mono">{inr(sgst)}</span></div>
              </>}
              {isIgst && <div className="flex justify-between"><span className="text-surface-400">IGST @ 18%</span><span className="text-white font-mono">{inr(igst)}</span></div>}
              <div className="flex justify-between border-t border-surface-700 pt-2">
                <span className="font-semibold text-white">Total Payable</span>
                <span className="font-bold text-primary-300 font-mono text-base">{inr(total)}</span>
              </div>
            </div>
          )}
          <div><label className="label text-xs">Notes</label><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="input" placeholder="Monthly subscription — July 2026"/></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={()=>setShowCreate(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center"><IndianRupee size={15}/>Create Invoice</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────
export default function LicensingPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [plans, setPlans]         = useState([]);
  const [orgs, setOrgs]           = useState([]);
  const [overview, setOverview]   = useState(null);

  const loadBase = useCallback(async () => {
    try {
      const [pRes, oRes, ovRes] = await Promise.all([
        api.get('/licensing/plans'),
        api.get('/licensing/orgs?limit=200'),
        api.get('/licensing/overview'),
      ]);
      setPlans(pRes.data||[]);
      setOrgs(oRes.data?.orgs||[]);
      setOverview(ovRes.data);
    } catch { toast.error('Failed to load licensing data'); }
  }, []);

  useEffect(()=>{ loadBase(); },[loadBase]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary-500/20 to-purple-600/20 border border-primary-500/20">
            <Key size={22} className="text-primary-400"/>
          </div>
          <div>
            <h1 className="page-title">Licence Management</h1>
            <p className="text-surface-400 text-sm mt-0.5">Manage client organisations, plans, sandboxes and GST billing</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-surface-900 p-1 rounded-2xl border border-surface-800 w-fit overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all font-heading ${
              activeTab===id ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30' : 'text-surface-400 hover:text-white hover:bg-surface-700/50'
            }`}>
            <Icon size={14}/>{label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.15}}>
          {activeTab==='overview'  && <OverviewTab overview={overview} onRefresh={loadBase}/>}
          {activeTab==='orgs'      && <OrgsTab plans={plans}/>}
          {activeTab==='plans'     && <PlansTab plans={plans} onRefresh={loadBase}/>}
          {activeTab==='sandboxes' && <SandboxesTab orgs={orgs}/>}
          {activeTab==='invoices'  && <InvoicesTab orgs={orgs} plans={plans}/>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
