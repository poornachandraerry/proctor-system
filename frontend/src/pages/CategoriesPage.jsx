import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, Plus, Pencil, Trash2, X, Users, Database, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

function Modal({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
          <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.95 }}
            onClick={e => e.stopPropagation()}
            className="glass rounded-2xl p-6 w-full max-w-md border border-surface-700/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <button onClick={onClose} className="text-surface-400 hover:text-white"><X size={18}/></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/categories');
      setCategories(data || []);
    } catch { toast.error('Failed to load categories'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/categories', form);
      toast.success('Category created');
      setShowCreate(false);
      setForm({ name:'', description:'' });
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to create category'); }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/categories/${editing.id}`, { name: form.name, description: form.description });
      toast.success('Category updated');
      setEditing(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to update category'); }
  };

  const toggleActive = async (cat) => {
    try {
      await api.put(`/categories/${cat.id}`, { isActive: !cat.is_active });
      toast.success(cat.is_active ? 'Category deactivated' : 'Category activated');
      load();
    } catch { toast.error('Failed to update category'); }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"? This can't be undone.`)) return;
    try {
      await api.delete(`/categories/${cat.id}`);
      toast.success('Category deleted');
      load();
    } catch (err) {
      if (err.response?.data?.code === 'CATEGORY_IN_USE') {
        toast.error(err.response.data.error);
      } else {
        toast.error('Failed to delete category');
      }
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="page-title">Student Categories</h1>
          <p className="text-surface-400 text-sm mt-1">
            Target-exam labels students pick at registration (e.g. "CAT Aspirant") — used to tag and filter question banks by audience. These are separate from account roles and never affect permissions.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary w-fit shrink-0">
          <Plus size={16}/>Add Category
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_,i) => <div key={i} className="glass rounded-xl h-16 animate-pulse"/>)}</div>
      ) : categories.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center border border-surface-700">
          <GraduationCap size={32} className="text-surface-700 mx-auto mb-3"/>
          <p className="text-surface-500 text-sm">No categories yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map(cat => (
            <div key={cat.id} className={`glass rounded-xl p-4 border flex items-center gap-4 ${cat.is_active ? 'border-surface-700' : 'border-surface-800 opacity-60'}`}>
              <div className="w-10 h-10 rounded-xl bg-primary-500/15 flex items-center justify-center shrink-0">
                <GraduationCap size={18} className="text-primary-400"/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white truncate">{cat.name}</span>
                  {!cat.is_active && <span className="text-xs text-surface-500 bg-surface-800 px-1.5 py-0.5 rounded-full shrink-0">Inactive</span>}
                </div>
                {cat.description && <p className="text-xs text-surface-500 truncate mt-0.5">{cat.description}</p>}
                <div className="flex items-center gap-3 mt-1.5 text-xs text-surface-500">
                  <span className="flex items-center gap-1"><Users size={11}/>{cat.user_count} student{cat.user_count !== '1' ? 's' : ''}</span>
                  <span className="flex items-center gap-1"><Database size={11}/>{cat.bank_count} bank{cat.bank_count !== '1' ? 's' : ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggleActive(cat)} title={cat.is_active ? 'Deactivate' : 'Activate'}
                  className={`p-2 rounded-lg ${cat.is_active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-surface-500 hover:bg-surface-700'}`}>
                  <Power size={14}/>
                </button>
                <button onClick={() => { setEditing(cat); setForm({ name: cat.name, description: cat.description || '' }); }}
                  className="p-2 rounded-lg text-surface-400 hover:text-primary-400 hover:bg-primary-500/10">
                  <Pencil size={14}/>
                </button>
                <button onClick={() => handleDelete(cat)}
                  className="p-2 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10">
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Category">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label text-xs">Name</label>
            <input value={form.name} onChange={e => setForm({...form, name:e.target.value})} className="input" placeholder="e.g. CAT Aspirant" required/>
          </div>
          <div>
            <label className="label text-xs">Description (optional)</label>
            <textarea value={form.description} onChange={e => setForm({...form, description:e.target.value})} className="input" rows={2}/>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center">Create</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Category">
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="label text-xs">Name</label>
            <input value={form.name} onChange={e => setForm({...form, name:e.target.value})} className="input" required/>
          </div>
          <div>
            <label className="label text-xs">Description (optional)</label>
            <textarea value={form.description} onChange={e => setForm({...form, description:e.target.value})} className="input" rows={2}/>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditing(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
