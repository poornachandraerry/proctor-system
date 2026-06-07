import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, CheckCircle, RefreshCw, Eye,
  Filter, FileSpreadsheet, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const SEVERITY_STYLE = {
  critical: 'badge-critical',
  high:     'badge-high',
  medium:   'badge-medium',
  low:      'badge-low',
};

const SEVERITY_ROW = {
  critical: 'border-l-4 border-l-red-500 bg-red-500/5',
  high:     'border-l-4 border-l-orange-500 bg-orange-500/5',
  medium:   'border-l-4 border-l-yellow-500 bg-yellow-500/5',
  low:      'border-l-4 border-l-emerald-500 bg-emerald-500/5',
};

export default function AlertsPage() {
  const [alerts, setAlerts]       = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [severity, setSeverity]   = useState('');
  const [reviewed, setReviewed]   = useState('false');
  const [reviewing, setReviewing] = useState(null);
  const [summary, setSummary]     = useState([]);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 100 });
      if (severity) params.set('severity', severity);
      if (reviewed)  params.set('isReviewed', reviewed);
      const [alertsRes, summaryRes] = await Promise.all([
        api.get(`/alerts?${params}`),
        api.get('/alerts/summary'),
      ]);
      setAlerts(alertsRes.data.alerts || []);
      setTotal(alertsRes.data.total || 0);
      setSummary(summaryRes.data || []);
    } catch { toast.error('Failed to load alerts'); }
    finally { setLoading(false); }
  }, [severity, reviewed]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const handleReview = async (id, action) => {
    setReviewing(id);
    try {
      await api.patch(`/alerts/${id}/review`, { action, notes: `Reviewed: ${action}` });
      toast.success(`Alert marked as ${action}`);
      fetchAlerts();
    } catch { toast.error('Failed to review alert'); }
    finally { setReviewing(null); }
  };

  const totalBySev = {};
  summary.forEach(s => { totalBySev[s.severity] = (totalBySev[s.severity] || 0) + parseInt(s.count); });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="page-title">Alert Centre</h1>
          <p className="text-surface-400 text-sm mt-1">{total} alert{total !== 1 ? 's' : ''} matching filters</p>
        </div>
        <button onClick={fetchAlerts} className="btn-secondary"><RefreshCw size={15} />Refresh</button>
      </div>

      {/* Severity summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { key:'critical', label:'Critical', color:'text-red-400',    bg:'bg-red-500/10 border-red-500/20' },
          { key:'high',     label:'High',     color:'text-orange-400', bg:'bg-orange-500/10 border-orange-500/20' },
          { key:'medium',   label:'Medium',   color:'text-yellow-400', bg:'bg-yellow-500/10 border-yellow-500/20' },
          { key:'low',      label:'Low',      color:'text-emerald-400',bg:'bg-emerald-500/10 border-emerald-500/20' },
        ].map(({ key, label, color, bg }) => (
          <button
            key={key}
            onClick={() => setSeverity(severity === key ? '' : key)}
            className={`rounded-2xl p-4 text-center border transition-all ${bg} ${severity === key ? 'ring-2 ring-primary-500' : 'hover:opacity-80'}`}
          >
            <div className={`font-display text-3xl font-bold ${color}`}>{totalBySev[key] || 0}</div>
            <div className="text-xs font-semibold text-surface-400 mt-0.5 font-heading">{label}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <select value={severity} onChange={e => setSeverity(e.target.value)} className="input w-40">
          <option value="">All Severities</option>
          {['critical','high','medium','low'].map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        <select value={reviewed} onChange={e => setReviewed(e.target.value)} className="input w-44">
          <option value="false">Pending Review</option>
          <option value="true">Reviewed</option>
          <option value="">All Alerts</option>
        </select>
      </div>

      {/* Alerts table */}
      {loading ? (
        <div className="space-y-2">{[...Array(8)].map((_,i) => <div key={i} className="glass rounded-xl h-16 animate-pulse" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="glass rounded-2xl p-16 text-center">
          <CheckCircle size={48} className="text-emerald-600 mx-auto mb-4" />
          <h3 className="font-display text-xl font-semibold text-surface-400 mb-2">No alerts</h3>
          <p className="text-surface-500 text-sm">No alerts match your current filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
              className={`glass rounded-xl p-4 ${SEVERITY_ROW[a.severity] || ''}`}
            >
              <div className="flex items-center gap-4 flex-wrap">
                {/* Badge */}
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize border shrink-0 ${SEVERITY_STYLE[a.severity] || ''}`}>
                  {a.severity}
                </span>

                {/* Type + description */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-white capitalize font-heading">
                    {a.alert_type?.replace(/_/g, ' ')}
                  </span>
                  {a.description && (
                    <span className="text-sm text-surface-400 ml-2">— {a.description}</span>
                  )}
                </div>

                {/* Student + exam */}
                <div className="text-xs text-surface-500 shrink-0 text-right">
                  <div className="text-surface-300 font-medium">{a.student_name}</div>
                  <div className="truncate max-w-[160px]">{a.exam_title}</div>
                </div>

                {/* Time */}
                <div className="flex items-center gap-1 text-xs text-surface-500 shrink-0">
                  <Clock size={11} />
                  {new Date(a.timestamp).toLocaleString()}
                </div>

                {/* Actions */}
                {!a.is_reviewed ? (
                  <div className="flex gap-2 shrink-0">
                    <button
                      disabled={reviewing === a.id}
                      onClick={() => handleReview(a.id, 'dismissed')}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-surface-700 text-surface-300 hover:bg-surface-600 transition-colors font-medium"
                    >
                      Dismiss
                    </button>
                    <button
                      disabled={reviewing === a.id}
                      onClick={() => handleReview(a.id, 'confirmed')}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors border border-red-500/20 font-medium"
                    >
                      Confirm
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 shrink-0 font-medium">
                    <CheckCircle size={12} />Reviewed
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
