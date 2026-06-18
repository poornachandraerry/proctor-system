import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Plus, Search, Trash2, BookOpen, Zap,
  CheckCircle, XCircle, RefreshCw, Globe, Lock,
  Sparkles, Loader, ChevronDown, ChevronUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import useAuthStore from '../store/authStore';

const DIFF_STYLE = {
  easy:   'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  hard:   'bg-red-500/20 text-red-400 border-red-500/30',
};

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{ opacity:0, scale:0.95, y:16 }} animate={{ opacity:1, scale:1, y:0 }}
        className={`relative glass rounded-2xl p-6 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto z-10`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-white p-1 rounded-lg hover:bg-surface-700">
            <XCircle size={20}/>
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

const EMPTY_Q = {
  questionText: '', questionType: 'mcq', difficulty: 'medium',
  topic: '', marks: 1, negativeMarks: 0, explanation: '',
  options: [{ id:'a', text:'' }, { id:'b', text:'' }, { id:'c', text:'' }, { id:'d', text:'' }],
  correctAnswer: 'a',
};

export default function QuestionBankPage() {
  const { user }  = useAuthStore();
  const navigate  = useNavigate();
  const isStaff   = ['admin','org_admin','examiner'].includes(user?.role);

  const [banks, setBanks]               = useState([]);
  const [selectedBank, setSelectedBank] = useState(null);
  const [questions, setQuestions]       = useState([]);
  const [qTotal, setQTotal]             = useState(0);
  const [loading, setLoading]           = useState(true);
  const [qLoading, setQLoading]         = useState(false);
  const [search, setSearch]             = useState('');
  const [diffFilter, setDiffFilter]     = useState('');
  const [showCreateBank, setShowCreateBank] = useState(false);
  const [showAddQ, setShowAddQ]         = useState(false);
  const [showGenExam, setShowGenExam]   = useState(false);
  const [showGenPractice, setShowGenPractice] = useState(false);
  const [savingQ, setSavingQ]           = useState(false);
  const [aiGenerating, setAiGen]        = useState(false);

  const [bankForm, setBankForm] = useState({ name:'', description:'', subject:'', module:'', isPublic: false });
  const [qForm, setQForm]       = useState({ ...EMPTY_Q });
  const [genExamForm, setGenExamForm]   = useState({ title:'', numQuestions:20, durationMinutes:30, difficulty:'mixed', passPercentage:40 });
  const [genPractForm, setGenPractForm] = useState({ numQuestions:10, durationMinutes:20, difficulty:'mixed' });
  const [aiTopic, setAiTopic]   = useState('');
  const [aiDiff, setAiDiff]     = useState('medium');
  const [aiCount, setAiCount]   = useState(10);

  const loadBanks = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/question-banks');
      setBanks(data);
    } catch { toast.error('Failed to load question banks'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBanks(); }, [loadBanks]);

  const loadQuestions = useCallback(async (bankId) => {
    if (!bankId) return;
    setQLoading(true);
    try {
      const params = new URLSearchParams({ limit: 100 });
      if (diffFilter) params.set('difficulty', diffFilter);
      if (search)     params.set('search', search);
      const { data } = await api.get(`/question-banks/${bankId}/questions?${params}`);
      setQuestions(data.questions || []);
      setQTotal(data.total || 0);
    } catch { toast.error('Failed to load questions'); }
    finally { setQLoading(false); }
  }, [diffFilter, search]);

  useEffect(() => { if (selectedBank) loadQuestions(selectedBank.id); }, [selectedBank, loadQuestions]);

  const handleCreateBank = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/question-banks', bankForm);
      toast.success('Question bank created!');
      setShowCreateBank(false);
      setBankForm({ name:'', description:'', subject:'', module:'', isPublic: false });
      await loadBanks();
      setSelectedBank(data);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleDeleteBank = async (id) => {
    if (!confirm('Delete this bank and ALL its questions? This cannot be undone.')) return;
    try {
      await api.delete(`/question-banks/${id}`);
      toast.success('Bank deleted');
      if (selectedBank?.id === id) { setSelectedBank(null); setQuestions([]); }
      loadBanks();
    } catch { toast.error('Failed to delete'); }
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    setSavingQ(true);
    try {
      await api.post(`/question-banks/${selectedBank.id}/questions`, qForm);
      toast.success('Question added!');
      setShowAddQ(false);
      setQForm({ ...EMPTY_Q, options:[{id:'a',text:''},{id:'b',text:''},{id:'c',text:''},{id:'d',text:''}] });
      loadQuestions(selectedBank.id);
      loadBanks();
    } catch { toast.error('Failed to add question'); }
    finally { setSavingQ(false); }
  };

  const handleDeleteQ = async (qid) => {
    try {
      await api.delete(`/question-banks/${selectedBank.id}/questions/${qid}`);
      setQuestions(p => p.filter(q => q.id !== qid));
      toast.success('Question deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const handleAIGenerate = async () => {
    if (!aiTopic.trim()) return toast.error('Enter a topic first');
    setAiGen(true);
    try {
      const { data } = await api.post('/ai/generate-questions', {
        topic: aiTopic, difficulty: aiDiff, questionType: 'mcq', count: aiCount
      });
      const toAdd = data.questions.map(q => ({
        questionText: q.questionText, questionType: q.questionType || 'mcq',
        options: q.options, correctAnswer: q.correctAnswer,
        marks: q.marks || 1, negativeMarks: 0,
        difficulty: q.difficulty || aiDiff, topic: q.topic || aiTopic,
        explanation: q.explanation || '',
      }));
      const { data: res } = await api.post(`/question-banks/${selectedBank.id}/questions/bulk`, { questions: toAdd });
      toast.success(`${res.added} AI questions added!`);
      loadQuestions(selectedBank.id);
      loadBanks();
    } catch (err) { toast.error(err.response?.data?.error || 'AI generation failed — check your API key'); }
    finally { setAiGen(false); }
  };

  const handleGenerateExam = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/question-banks/generate-exam', {
        ...genExamForm,
        bankId: selectedBank.id,
        numQuestions: parseInt(genExamForm.numQuestions),
        durationMinutes: parseInt(genExamForm.durationMinutes),
      });
      toast.success(`Exam "${data.exam.title}" created with ${data.questionsAdded} questions! Go to Exams to publish it.`);
      setShowGenExam(false);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to generate exam'); }
  };

  const handleGeneratePractice = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/question-banks/practice/generate', {
        ...genPractForm,
        bankId: selectedBank.id,
        numQuestions: parseInt(genPractForm.numQuestions),
        durationMinutes: parseInt(genPractForm.durationMinutes),
      });
      toast.success(`Practice test ready — ${data.questions.length} questions!`);
      setShowGenPractice(false);
      localStorage.setItem('practiceSession', JSON.stringify({
        sessionId: data.practiceSession.id,
        questions: data.questions,
        totalMarks: data.totalMarks,
        durationMinutes: parseInt(genPractForm.durationMinutes),
        bankName: selectedBank.name,
      }));
      navigate('/practice-test');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to generate practice test'); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="page-title">Question Banks</h1>
          <p className="text-surface-400 text-sm mt-1">
            {isStaff
              ? 'Create reusable banks for exams and practice tests'
              : 'Take practice tests from available question banks'}
          </p>
        </div>
        {isStaff && (
          <button onClick={() => setShowCreateBank(true)} className="btn-primary">
            <Plus size={16}/>New Bank
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Bank list */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider font-heading">
            {banks.length} Banks
          </p>
          {loading ? (
            [...Array(4)].map((_,i) => <div key={i} className="glass rounded-2xl h-24 animate-pulse"/>)
          ) : banks.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center border border-surface-700">
              <Database size={32} className="text-surface-700 mx-auto mb-3"/>
              <p className="text-surface-500 text-sm">No question banks yet</p>
              {isStaff && (
                <button onClick={() => setShowCreateBank(true)} className="btn-primary mx-auto mt-3 text-sm">
                  <Plus size={14}/>Create First Bank
                </button>
              )}
            </div>
          ) : banks.map(bank => (
            <motion.div key={bank.id} layout
              onClick={() => setSelectedBank(bank)}
              className={`glass rounded-2xl p-4 cursor-pointer transition-all border ${
                selectedBank?.id === bank.id
                  ? 'border-primary-500/40 bg-primary-500/10'
                  : 'border-surface-700/50 hover:border-primary-500/20'
              }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Database size={14} className="text-primary-400 shrink-0"/>
                    <span className="text-sm font-semibold text-white truncate">{bank.name}</span>
                    {bank.is_public
                      ? <Globe size={11} className="text-emerald-400 shrink-0"/>
                      : <Lock size={11} className="text-surface-600 shrink-0"/>}
                  </div>
                  {bank.subject && (
                    <p className="text-xs text-surface-500 mb-2">
                      {bank.subject}{bank.module ? ` · ${bank.module}` : ''}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-white font-bold font-mono">{bank.question_count}</span>
                    <span className="text-surface-500">total</span>
                    <span className="text-emerald-400">{bank.easy_count}E</span>
                    <span className="text-amber-400">{bank.medium_count}M</span>
                    <span className="text-red-400">{bank.hard_count}H</span>
                  </div>
                </div>
                {isStaff && (
                  <button onClick={e => { e.stopPropagation(); handleDeleteBank(bank.id); }}
                    className="p-1.5 text-surface-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg shrink-0">
                    <Trash2 size={12}/>
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Questions panel */}
        <div className="lg:col-span-2">
          {!selectedBank ? (
            <div className="glass rounded-2xl p-16 text-center border border-surface-700/50">
              <BookOpen size={48} className="text-surface-700 mx-auto mb-4"/>
              <h3 className="font-display text-xl font-semibold text-surface-400 mb-2">Select a Bank</h3>
              <p className="text-surface-500 text-sm">Click a bank on the left to view its questions</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Bank actions */}
              <div className="glass rounded-2xl p-4 border border-surface-700">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="section-title">{selectedBank.name}</h2>
                    <p className="text-xs text-surface-400 mt-0.5">{qTotal} questions</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {isStaff && (
                      <>
                        <button onClick={() => setShowAddQ(true)} className="btn-primary text-sm py-2">
                          <Plus size={14}/>Add Question
                        </button>
                        <button onClick={() => setShowGenExam(true)} className="btn-secondary text-sm py-2">
                          <Zap size={14}/>Create Exam
                        </button>
                      </>
                    )}
                    <button onClick={() => setShowGenPractice(true)} className="btn-secondary text-sm py-2">
                      <BookOpen size={14}/>Practice Test
                    </button>
                  </div>
                </div>

                {/* AI bulk generator */}
                {isStaff && (
                  <div className="mt-4 pt-4 border-t border-surface-700 flex items-center gap-3 flex-wrap">
                    <Sparkles size={14} className="text-primary-400 shrink-0"/>
                    <input value={aiTopic} onChange={e => setAiTopic(e.target.value)}
                      className="input flex-1 min-w-[150px] py-1.5 text-sm"
                      placeholder="AI topic (e.g. Thermodynamics)"/>
                    <select value={aiDiff} onChange={e => setAiDiff(e.target.value)} className="input w-28 py-1.5 text-sm">
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                    <input type="number" value={aiCount}
                      onChange={e => setAiCount(Math.max(1, Math.min(20, parseInt(e.target.value)||1)))}
                      className="input w-16 py-1.5 text-sm text-center" min="1" max="20"/>
                    <button onClick={handleAIGenerate} disabled={aiGenerating} className="btn-primary text-sm py-1.5">
                      {aiGenerating ? <Loader size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                      Generate
                    </button>
                  </div>
                )}
              </div>

              {/* Filters */}
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500"/>
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search questions..." className="input pl-9 text-sm py-2"/>
                </div>
                <select value={diffFilter} onChange={e => setDiffFilter(e.target.value)} className="input w-32 text-sm py-2">
                  <option value="">All Levels</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                <button onClick={() => loadQuestions(selectedBank.id)} className="btn-secondary px-3">
                  <RefreshCw size={14}/>
                </button>
              </div>

              {/* Questions list */}
              {qLoading ? (
                [...Array(5)].map((_,i) => <div key={i} className="glass rounded-xl h-16 animate-pulse"/>)
              ) : questions.length === 0 ? (
                <div className="glass rounded-2xl p-10 text-center border border-surface-700">
                  <BookOpen size={32} className="text-surface-700 mx-auto mb-3"/>
                  <p className="text-surface-500 text-sm">No questions in this bank yet</p>
                  {isStaff && (
                    <button onClick={() => setShowAddQ(true)} className="btn-primary mx-auto mt-3 text-sm">
                      <Plus size={14}/>Add First Question
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto pr-1">
                  {questions.map((q, i) => (
                    <motion.div key={q.id} initial={{ opacity:0, x:8 }} animate={{ opacity:1, x:0 }}
                      transition={{ delay: i * 0.02 }}
                      className="glass rounded-xl p-3.5 border border-surface-700 hover:border-surface-600 transition-colors">
                      <div className="flex items-start gap-3">
                        <span className="text-xs font-mono text-surface-500 shrink-0 mt-0.5 w-6">{i+1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-surface-200 line-clamp-2">{q.question_text}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={`text-xs px-1.5 py-0.5 rounded border ${DIFF_STYLE[q.difficulty]}`}>
                              {q.difficulty}
                            </span>
                            <span className="text-xs text-surface-500 capitalize">
                              {q.question_type?.replace(/_/g,' ')}
                            </span>
                            {q.topic && (
                              <span className="text-xs text-surface-600 bg-surface-800 px-1.5 py-0.5 rounded">
                                {q.topic}
                              </span>
                            )}
                            <span className="text-xs text-surface-500">{q.marks}m</span>
                          </div>
                        </div>
                        {isStaff && (
                          <button onClick={() => handleDeleteQ(q.id)}
                            className="p-1.5 text-surface-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg shrink-0">
                            <Trash2 size={12}/>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Bank Modal */}
      <Modal open={showCreateBank} onClose={() => setShowCreateBank(false)} title="Create Question Bank">
        <form onSubmit={handleCreateBank} className="space-y-4">
          <div>
            <label className="label text-xs">Bank Name *</label>
            <input value={bankForm.name} onChange={e => setBankForm({...bankForm, name:e.target.value})}
              className="input" placeholder="Mathematics — Calculus" required/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Subject</label>
              <input value={bankForm.subject} onChange={e => setBankForm({...bankForm, subject:e.target.value})}
                className="input" placeholder="Mathematics"/>
            </div>
            <div>
              <label className="label text-xs">Module / Chapter</label>
              <input value={bankForm.module} onChange={e => setBankForm({...bankForm, module:e.target.value})}
                className="input" placeholder="Differential Calculus"/>
            </div>
          </div>
          <div>
            <label className="label text-xs">Description</label>
            <textarea value={bankForm.description} onChange={e => setBankForm({...bankForm, description:e.target.value})}
              className="input resize-none h-16" placeholder="What this bank covers..."/>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={bankForm.isPublic}
              onChange={e => setBankForm({...bankForm, isPublic:e.target.checked})}
              className="w-4 h-4 accent-primary-500"/>
            <span className="text-sm text-surface-300">Make public (visible to all students)</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowCreateBank(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center">Create Bank</button>
          </div>
        </form>
      </Modal>

      {/* Add Question Modal */}
      <Modal open={showAddQ} onClose={() => setShowAddQ(false)} title="Add Question to Bank" wide>
        <form onSubmit={handleAddQuestion} className="space-y-4">
          <div>
            <label className="label text-xs">Question Text *</label>
            <textarea value={qForm.questionText} onChange={e => setQForm({...qForm, questionText:e.target.value})}
              className="input resize-none" rows={3} required/>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label text-xs">Type</label>
              <select value={qForm.questionType} onChange={e => setQForm({...qForm, questionType:e.target.value})} className="input text-sm">
                <option value="mcq">MCQ</option>
                <option value="true_false">True/False</option>
                <option value="short_answer">Short Answer</option>
                <option value="essay">Essay</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Difficulty</label>
              <select value={qForm.difficulty} onChange={e => setQForm({...qForm, difficulty:e.target.value})} className="input text-sm">
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Marks</label>
              <input type="number" value={qForm.marks}
                onChange={e => setQForm({...qForm, marks:parseFloat(e.target.value)||1})}
                className="input text-sm" min="0.5" step="0.5"/>
            </div>
            <div>
              <label className="label text-xs">Neg. Marks</label>
              <input type="number" value={qForm.negativeMarks}
                onChange={e => setQForm({...qForm, negativeMarks:parseFloat(e.target.value)||0})}
                className="input text-sm" min="0" step="0.25"/>
            </div>
          </div>
          <div>
            <label className="label text-xs">Topic</label>
            <input value={qForm.topic} onChange={e => setQForm({...qForm, topic:e.target.value})}
              className="input" placeholder="e.g. Limits, Derivatives"/>
          </div>
          {(qForm.questionType === 'mcq' || qForm.questionType === 'true_false') && (
            <div>
              <label className="label text-xs">Options — select the correct answer</label>
              <div className="space-y-2">
                {qForm.options.map((opt, oi) => (
                  <div key={oi} className={`flex items-center gap-2 p-2 rounded-xl border transition-colors ${
                    qForm.correctAnswer === opt.id ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-surface-700'
                  }`}>
                    <input type="radio" name="correct" checked={qForm.correctAnswer === opt.id}
                      onChange={() => setQForm({...qForm, correctAnswer:opt.id})}
                      className="w-4 h-4 accent-emerald-500 shrink-0"/>
                    <span className="text-xs font-mono font-bold text-surface-400 w-5">{opt.id.toUpperCase()}.</span>
                    <input value={opt.text}
                      onChange={e => {
                        const ops = [...qForm.options];
                        ops[oi] = { ...ops[oi], text:e.target.value };
                        setQForm({...qForm, options:ops});
                      }}
                      className="input text-sm flex-1 border-0 bg-transparent focus:ring-0 p-0"
                      placeholder={`Option ${opt.id.toUpperCase()}`}/>
                    {qForm.correctAnswer === opt.id && <CheckCircle size={14} className="text-emerald-400 shrink-0"/>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="label text-xs">Explanation (shown after test)</label>
            <input value={qForm.explanation} onChange={e => setQForm({...qForm, explanation:e.target.value})}
              className="input" placeholder="Why is this correct?"/>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowAddQ(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={savingQ} className="btn-primary flex-1 justify-center">
              {savingQ ? <Loader size={14} className="animate-spin"/> : <Plus size={14}/>}
              Add Question
            </button>
          </div>
        </form>
      </Modal>

      {/* Generate Exam Modal */}
      <Modal open={showGenExam} onClose={() => setShowGenExam(false)} title={`Create Exam from "${selectedBank?.name}"`}>
        <form onSubmit={handleGenerateExam} className="space-y-4">
          <div className="p-3 bg-primary-500/10 border border-primary-500/20 rounded-xl text-xs text-primary-300">
            ⚡ Questions are randomly selected from the bank and copied into a new exam draft. Go to Exams to edit, add email invites, and publish.
          </div>
          <div>
            <label className="label text-xs">Exam Title *</label>
            <input value={genExamForm.title} onChange={e => setGenExamForm({...genExamForm, title:e.target.value})}
              className="input" placeholder="End Term Assessment — Calculus" required/>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label text-xs">Questions</label>
              <input type="number" value={genExamForm.numQuestions}
                onChange={e => setGenExamForm({...genExamForm, numQuestions:e.target.value})}
                className="input" min="1"/>
            </div>
            <div>
              <label className="label text-xs">Duration (min)</label>
              <input type="number" value={genExamForm.durationMinutes}
                onChange={e => setGenExamForm({...genExamForm, durationMinutes:e.target.value})}
                className="input" min="5"/>
            </div>
            <div>
              <label className="label text-xs">Pass %</label>
              <input type="number" value={genExamForm.passPercentage}
                onChange={e => setGenExamForm({...genExamForm, passPercentage:e.target.value})}
                className="input" min="0" max="100"/>
            </div>
          </div>
          <div>
            <label className="label text-xs">Difficulty Selection</label>
            <select value={genExamForm.difficulty} onChange={e => setGenExamForm({...genExamForm, difficulty:e.target.value})} className="input">
              <option value="mixed">Mixed (all levels)</option>
              <option value="easy">Easy only</option>
              <option value="medium">Medium only</option>
              <option value="hard">Hard only</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowGenExam(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center"><Zap size={14}/>Generate Exam</button>
          </div>
        </form>
      </Modal>

      {/* Generate Practice Modal */}
      <Modal open={showGenPractice} onClose={() => setShowGenPractice(false)} title={`Practice Test — ${selectedBank?.name}`}>
        <form onSubmit={handleGeneratePractice} className="space-y-4">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300">
            📚 A timed practice test with randomly selected questions. Your score is shown at the end but not saved in the main system.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Number of Questions</label>
              <input type="number" value={genPractForm.numQuestions}
                onChange={e => setGenPractForm({...genPractForm, numQuestions:e.target.value})}
                className="input" min="1" max="100"/>
            </div>
            <div>
              <label className="label text-xs">Time Limit (minutes)</label>
              <input type="number" value={genPractForm.durationMinutes}
                onChange={e => setGenPractForm({...genPractForm, durationMinutes:e.target.value})}
                className="input" min="1" max="180"/>
            </div>
          </div>
          <div>
            <label className="label text-xs">Difficulty Level</label>
            <select value={genPractForm.difficulty} onChange={e => setGenPractForm({...genPractForm, difficulty:e.target.value})} className="input">
              <option value="mixed">Mixed (all levels)</option>
              <option value="easy">Easy only</option>
              <option value="medium">Medium only</option>
              <option value="hard">Hard only</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowGenPractice(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center"><BookOpen size={14}/>Start Practice Test</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
