import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Save, Plus, Trash2, Sparkles, Loader, ArrowLeft, Shield,
  Upload, Download, FileSpreadsheet, CheckCircle,
  ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import api from '../utils/api';
import RichQuestionEditor from '../components/exam/RichQuestionEditor';

const DEFAULT_PROCTORING = {
  webcam_required: true, fullscreen_required: true,
  tab_switch_allowed: false, copy_paste_blocked: true,
  face_detection: true, gaze_tracking: true, ai_analysis: true,
  screenshot_interval: 30, max_warnings: 3,
};

const EMPTY_Q = () => ({
  questionText: '', questionType: 'mcq',
  options: [{ id:'a', text:'' },{ id:'b', text:'' },{ id:'c', text:'' },{ id:'d', text:'' }],
  correctAnswer: 'a', marks: 1, negativeMarks: 0,
  difficulty: 'medium', topic: '', explanation: '',
  useRichEditor: false,
});

export default function ExamCreatePage() {
  const navigate = useNavigate();
  const [saving, setSaving]         = useState(false);
  const [activeTab, setActiveTab]   = useState('details');
  const [aiGenerating, setAiGen]    = useState(false);
  const [aiTopic, setAiTopic]       = useState('');
  const [aiDiff, setAiDiff]         = useState('medium');
  const [aiCount, setAiCount]       = useState(5);
  const [aiType, setAiType]         = useState('mcq');
  const [expandedQ, setExpandedQ]   = useState(0);
  const [uploadPreview, setUploadPreview] = useState([]);
  const [uploadErrors, setUploadErrors]   = useState([]);
  const [showUpload, setShowUpload]       = useState(false);
  const fileRef = useRef(null);

  const [exam, setExam] = useState({
    title:'', description:'',
    instructions:'Read each question carefully. Webcam and microphone must be enabled throughout the exam. Do not switch tabs or exit fullscreen.',
    durationMinutes:60, totalMarks:100, passPercentage:40,
    startTime:'', endTime:'',
    globalNegativeMarking: false, globalNegativeMarks: 0.25,
    proctoringSettings: { ...DEFAULT_PROCTORING },
  });
  const [questions, setQuestions] = useState([EMPTY_Q()]);

  const addQ = () => {
    const neg = exam.globalNegativeMarking ? exam.globalNegativeMarks : 0;
    const q = { ...EMPTY_Q(), negativeMarks: neg };
    setQuestions(p => [...p, q]);
    setExpandedQ(questions.length);
  };
  const removeQ = (i) => { setQuestions(p => p.filter((_,idx) => idx !== i)); };
  const updateQ = (i, field, val) => setQuestions(p => { const qs=[...p]; qs[i]={...qs[i],[field]:val}; return qs; });
  const updateOpt = (qi, oi, val) => setQuestions(p => {
    const qs=[...p]; qs[qi].options[oi]={...qs[qi].options[oi],text:val}; return qs;
  });

  const applyGlobalNeg = (enabled, val) => {
    if (enabled) setQuestions(p => p.map(q => ({ ...q, negativeMarks: parseFloat(val)||0 })));
  };

  // Download template
  const downloadTemplate = async () => {
    try {
      const res = await api.get('/reports/questions/template', { responseType:'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'ProctorAI_Question_Template.xlsx'; a.click();
      URL.revokeObjectURL(url);
      toast.success('Template downloaded!');
    } catch { toast.error('Download failed'); }
  };

  // Parse Excel upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type:'array' });
        const sheet = wb.Sheets['Questions'] || wb.Sheets[wb.SheetNames[0]];
        const rows  = XLSX.utils.sheet_to_json(sheet, { header:1 });
        const hIdx  = rows.findIndex(r => r.some(c => String(c).toLowerCase().includes('question_text')));
        if (hIdx === -1) { toast.error('Cannot find header row. Use the official template.'); return; }
        const headers = rows[hIdx].map(h => String(h||'').toLowerCase().trim());
        const data    = rows.slice(hIdx+1).filter(r => r.some(c => c !== undefined && c !== ''));
        const errors=[], parsed=[];
        data.forEach((row, i) => {
          const get = k => { const idx=headers.indexOf(k); return idx>=0?String(row[idx]||'').trim():''; };
          const qText = get('question_text');
          const qType = get('question_type') || 'mcq';
          if (!qText) { errors.push(`Row ${hIdx+i+2}: question_text is empty`); return; }
          const validTypes = ['mcq','true_false','short_answer','essay','code'];
          if (!validTypes.includes(qType)) { errors.push(`Row ${hIdx+i+2}: invalid type "${qType}"`); return; }
          const marks    = parseFloat(get('marks'))||1;
          const negMarks = parseFloat(get('negative_marks'))||(exam.globalNegativeMarking?exam.globalNegativeMarks:0);
          const optA=get('option_a'), optB=get('option_b'), optC=get('option_c'), optD=get('option_d');
          const correct=get('correct_answer').toLowerCase();
          const q = {
            questionText:qText, questionType:qType, marks, negativeMarks:negMarks,
            difficulty:['easy','medium','hard'].includes(get('difficulty'))?get('difficulty'):'medium',
            topic:get('topic'), explanation:get('explanation'),
            options:null, correctAnswer:null, useRichEditor:false,
          };
          if (qType==='mcq'||qType==='true_false') {
            if (!optA||!optB) { errors.push(`Row ${hIdx+i+2}: option_a and option_b required`); return; }
            q.options=[{id:'a',text:optA},{id:'b',text:optB}];
            if (optC) q.options.push({id:'c',text:optC});
            if (optD) q.options.push({id:'d',text:optD});
            q.correctAnswer=correct||'a';
          }
          parsed.push(q);
        });
        setUploadPreview(parsed); setUploadErrors(errors);
        toast.success(`${parsed.length} questions ready${errors.length?`, ${errors.length} errors`:''}`);
      } catch { toast.error('Failed to parse file'); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value='';
  };

  const importQuestions = () => {
    if (!uploadPreview.length) return;
    setQuestions(p => [...p.filter(q=>q.questionText.trim()), ...uploadPreview]);
    setUploadPreview([]); setShowUpload(false);
    toast.success(`${uploadPreview.length} questions imported!`);
  };

  // AI Generator
  const generateAI = async () => {
    if (!aiTopic.trim()) return toast.error('Enter a topic');
    setAiGen(true);
    try {
      const { data } = await api.post('/ai/generate-questions', {
        topic:aiTopic, difficulty:aiDiff, questionType:aiType, count:aiCount
      });
      const neg = exam.globalNegativeMarking ? exam.globalNegativeMarks : 0;
      const mapped = data.questions.map(q => ({
        questionText:q.questionText, questionType:q.questionType||aiType,
        options:q.options||[{id:'a',text:''},{id:'b',text:''},{id:'c',text:''},{id:'d',text:''}],
        correctAnswer:q.correctAnswer||'a', marks:q.marks||1, negativeMarks:neg,
        difficulty:q.difficulty||aiDiff, topic:q.topic||aiTopic,
        explanation:q.explanation||'', useRichEditor:false,
      }));
      setQuestions(p => [...p.filter(q=>q.questionText), ...mapped]);
      toast.success(`${mapped.length} questions generated!`);
    } catch (err) { toast.error(err.response?.data?.error||'AI failed — check API key'); }
    setAiGen(false);
  };

  const handleSave = async (publish=false) => {
    if (!exam.title.trim()) return toast.error('Exam title is required');
    const validQs = questions.filter(q => q.questionText.trim());
    if (!validQs.length) return toast.error('Add at least one question');
    setSaving(true);
    try {
      const { data: created } = await api.post('/exams', {
        ...exam,
        durationMinutes: parseInt(exam.durationMinutes),
        totalMarks: parseInt(exam.totalMarks),
        passPercentage: parseFloat(exam.passPercentage),
        startTime: exam.startTime||undefined,
        endTime:   exam.endTime||undefined,
      });
      await api.post(`/exams/${created.id}/questions/bulk`, { questions: validQs });
      if (publish) { await api.patch(`/exams/${created.id}/publish`); toast.success('Exam published!'); }
      else toast.success('Exam saved as draft!');
      navigate(`/exams/${created.id}`);
    } catch (err) { toast.error(err.response?.data?.error||'Failed to save'); }
    setSaving(false);
  };

  const tabs = [
    { id:'details',    label:'Exam Details'            },
    { id:'questions',  label:`Questions (${questions.length})` },
    { id:'proctoring', label:'Proctoring'              },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/exams')} className="p-2 rounded-xl hover:bg-surface-800 text-surface-400 hover:text-white transition-colors">
          <ArrowLeft size={20}/>
        </button>
        <div>
          <h1 className="page-title">Create New Exam</h1>
          <p className="text-surface-400 text-sm mt-0.5">Build with AI, bulk upload or manual entry</p>
        </div>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => handleSave(false)} disabled={saving} className="btn-secondary">
            <Save size={15}/>{saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={() => handleSave(true)} disabled={saving} className="btn-primary">
            {saving ? <><Loader size={15} className="animate-spin"/>Publishing...</> : <><Shield size={15}/>Publish</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900 rounded-xl p-1 mb-6 border border-surface-800">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all font-heading ${activeTab===t.id?'bg-primary-600 text-white shadow':'text-surface-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DETAILS TAB ────────────────────────────────────── */}
      {activeTab==='details' && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} className="space-y-5">
          <div className="card space-y-5">
            <div>
              <label className="label">Exam Title *</label>
              <input value={exam.title} onChange={e=>setExam({...exam,title:e.target.value})} className="input text-base" placeholder="e.g. Advanced JavaScript Assessment"/>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea value={exam.description} onChange={e=>setExam({...exam,description:e.target.value})} className="input resize-none" rows={3} placeholder="Brief overview..."/>
            </div>
            <div>
              <label className="label">Student Instructions</label>
              <textarea value={exam.instructions} onChange={e=>setExam({...exam,instructions:e.target.value})} className="input resize-none" rows={3}/>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><label className="label">Duration (minutes)</label><input type="number" value={exam.durationMinutes} onChange={e=>setExam({...exam,durationMinutes:e.target.value})} className="input" min="5"/></div>
              <div><label className="label">Total Marks</label><input type="number" value={exam.totalMarks} onChange={e=>setExam({...exam,totalMarks:e.target.value})} className="input" min="1"/></div>
              <div><label className="label">Pass % </label><input type="number" value={exam.passPercentage} onChange={e=>setExam({...exam,passPercentage:e.target.value})} className="input" min="0" max="100"/></div>
              <div><label className="label">Start Time</label><input type="datetime-local" value={exam.startTime} onChange={e=>setExam({...exam,startTime:e.target.value})} className="input"/></div>
              <div><label className="label">End Time</label><input type="datetime-local" value={exam.endTime} onChange={e=>setExam({...exam,endTime:e.target.value})} className="input"/></div>
            </div>
          </div>

          {/* Global Negative Marking */}
          <div className="card border border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={18} className="text-amber-400"/>
                <h3 className="section-title">Global Negative Marking</h3>
              </div>
              <button onClick={() => {
                const v = !exam.globalNegativeMarking;
                setExam({...exam, globalNegativeMarking:v});
                applyGlobalNeg(v, exam.globalNegativeMarks);
              }} className={`relative w-11 h-6 rounded-full transition-colors ${exam.globalNegativeMarking?'bg-amber-500':'bg-surface-600'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${exam.globalNegativeMarking?'translate-x-5':''}`}/>
              </button>
            </div>
            <p className="text-xs text-surface-400 mb-3">Applies the same deduction to every wrong answer across all questions.</p>
            {exam.globalNegativeMarking && (
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-surface-300 font-heading whitespace-nowrap">Marks deducted per wrong answer:</label>
                <input type="number" step="0.25" min="0" max="10" value={exam.globalNegativeMarks}
                  onChange={e => { const v=parseFloat(e.target.value)||0; setExam({...exam,globalNegativeMarks:v}); applyGlobalNeg(true,v); }}
                  className="input w-28"/>
                <span className="text-xs text-amber-400">Common: 0.25, 0.33, 0.5, 1</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── QUESTIONS TAB ───────────────────────────────────── */}
      {activeTab==='questions' && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">

          {/* AI Generator */}
          <div className="card border-primary-500/20 bg-primary-500/5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={18} className="text-primary-400"/>
              <h3 className="section-title">AI Question Generator</h3>
              <span className="ml-auto text-xs text-primary-300 bg-primary-500/20 px-2 py-0.5 rounded-full">Claude AI</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
              <div className="md:col-span-2">
                <input value={aiTopic} onChange={e=>setAiTopic(e.target.value)} className="input" placeholder="Topic (e.g. Organic Chemistry)"/>
              </div>
              <select value={aiType} onChange={e=>setAiType(e.target.value)} className="input">
                <option value="mcq">MCQ</option>
                <option value="true_false">True / False</option>
                <option value="essay">Essay</option>
                <option value="code">Code</option>
              </select>
              <select value={aiDiff} onChange={e=>setAiDiff(e.target.value)} className="input">
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <input type="number" value={aiCount} onChange={e=>setAiCount(Math.max(1,Math.min(20,parseInt(e.target.value)||1)))} className="input" min="1" max="20" placeholder="Count"/>
            </div>
            <button onClick={generateAI} disabled={aiGenerating} className="btn-primary">
              {aiGenerating ? <><Loader size={15} className="animate-spin"/>Generating...</> : <><Sparkles size={15}/>Generate Questions</>}
            </button>
          </div>

          {/* Bulk Upload */}
          <div className="card border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-emerald-400"/>
                <h3 className="section-title">Bulk Upload via Excel</h3>
              </div>
              <button onClick={() => setShowUpload(!showUpload)} className="text-surface-400 hover:text-white">
                {showUpload ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
              </button>
            </div>
            {showUpload && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-surface-400">Use the official template — it has dropdown validations built in.</p>
                <div className="flex gap-3 flex-wrap">
                  <button onClick={downloadTemplate} className="btn-secondary text-sm py-2"><Download size={14}/>Download Template</button>
                  <button onClick={() => fileRef.current?.click()} className="btn-primary text-sm py-2"><Upload size={14}/>Choose File</button>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden"/>
                </div>
                {uploadErrors.length > 0 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-semibold text-red-400">{uploadErrors.length} errors:</p>
                    {uploadErrors.map((e,i) => <p key={i} className="text-xs text-red-300">{e}</p>)}
                  </div>
                )}
                {uploadPreview.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">{uploadPreview.length} questions ready:</p>
                      <button onClick={importQuestions} className="btn-success text-sm py-2"><CheckCircle size={14}/>Import All</button>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {uploadPreview.map((q,i) => (
                        <div key={i} className="flex items-center gap-3 p-2 bg-surface-800 rounded-xl text-xs">
                          <span className="text-primary-400 font-mono w-6">{i+1}</span>
                          <span className="text-surface-200 flex-1 line-clamp-1">{q.questionText}</span>
                          <span className="text-surface-500 capitalize">{q.questionType?.replace('_',' ')}</span>
                          <span className="text-amber-400">{q.marks}m</span>
                          {q.negativeMarks>0 && <span className="text-red-400">-{q.negativeMarks}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Questions list */}
          {questions.map((q, qi) => (
            <div key={qi} className="card border border-surface-700">
              {/* Collapsed header */}
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedQ(expandedQ===qi?null:qi)}>
                <span className="text-xs font-mono font-bold text-primary-400 shrink-0">Q{qi+1}</span>
                <span className="text-sm text-surface-300 flex-1 truncate">
                  {q.questionText || <span className="text-surface-600 italic">Empty question</span>}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${q.difficulty==='hard'?'bg-red-500/20 text-red-400':q.difficulty==='medium'?'bg-amber-500/20 text-amber-400':'bg-emerald-500/20 text-emerald-400'}`}>{q.difficulty}</span>
                  <span className="text-xs text-surface-400">{q.marks}m{q.negativeMarks>0?` / -${q.negativeMarks}`:''}</span>
                  {q.useRichEditor && <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 rounded">Rich</span>}
                  <button onClick={e=>{e.stopPropagation();removeQ(qi);}} className="p-1.5 rounded-lg hover:bg-red-500/20 text-surface-500 hover:text-red-400 transition-colors"><Trash2 size={13}/></button>
                  {expandedQ===qi ? <ChevronUp size={16} className="text-surface-400"/> : <ChevronDown size={16} className="text-surface-400"/>}
                </div>
              </div>

              {/* Expanded editor */}
              {expandedQ===qi && (
                <div className="mt-4 pt-4 border-t border-surface-700 space-y-3">
                  {/* Rich editor toggle */}
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-surface-400 font-heading">Question Text</label>
                    <button type="button"
                      onClick={() => updateQ(qi,'useRichEditor',!q.useRichEditor)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${q.useRichEditor?'bg-purple-500/20 text-purple-300 border-purple-500/30':'text-surface-500 border-surface-700 hover:border-surface-600'}`}>
                      {q.useRichEditor ? '✦ Rich Editor ON' : 'Enable Rich Editor'}
                    </button>
                  </div>

                  {q.useRichEditor ? (
                    <RichQuestionEditor
                      value={q.questionText}
                      onChange={val => updateQ(qi,'questionText',val)}
                      examId={null}
                      placeholder="Type or paste your question. Use toolbar for formatting, formulas, tables and media..."
                    />
                  ) : (
                    <textarea value={q.questionText} onChange={e=>updateQ(qi,'questionText',e.target.value)}
                      className="input resize-none" rows={2} placeholder="Enter question text..."/>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="label text-xs">Type</label>
                      <select value={q.questionType} onChange={e=>updateQ(qi,'questionType',e.target.value)} className="input text-sm">
                        <option value="mcq">MCQ</option>
                        <option value="true_false">True / False</option>
                        <option value="short_answer">Short Answer</option>
                        <option value="essay">Essay</option>
                        <option value="code">Code</option>
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs">Marks</label>
                      <input type="number" value={q.marks} onChange={e=>updateQ(qi,'marks',parseInt(e.target.value)||1)} className="input text-sm" min="1"/>
                    </div>
                    <div>
                      <label className="label text-xs">Negative Marks</label>
                      <input type="number" step="0.25" value={q.negativeMarks} onChange={e=>updateQ(qi,'negativeMarks',parseFloat(e.target.value)||0)} className="input text-sm" min="0"/>
                    </div>
                    <div>
                      <label className="label text-xs">Difficulty</label>
                      <select value={q.difficulty} onChange={e=>updateQ(qi,'difficulty',e.target.value)} className="input text-sm">
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label text-xs">Topic</label>
                    <input value={q.topic||''} onChange={e=>updateQ(qi,'topic',e.target.value)} className="input text-sm" placeholder="e.g. Algebra, Arrays..."/>
                  </div>

                  {/* MCQ Options */}
                  {(q.questionType==='mcq'||q.questionType==='true_false') && (
                    <div>
                      <label className="label text-xs">Options — click radio to mark correct</label>
                      <div className="space-y-2">
                        {(q.options||[]).map((opt,oi) => (
                          <div key={oi} className={`flex items-center gap-2 p-2 rounded-xl border transition-colors ${q.correctAnswer===opt.id?'border-emerald-500/40 bg-emerald-500/10':'border-surface-700'}`}>
                            <input type="radio" name={`correct-${qi}`} checked={q.correctAnswer===opt.id} onChange={() => updateQ(qi,'correctAnswer',opt.id)} className="w-4 h-4 accent-emerald-500 shrink-0"/>
                            <span className="text-xs font-mono font-bold text-surface-400 w-5">{opt.id.toUpperCase()}.</span>
                            <input value={opt.text} onChange={e=>updateOpt(qi,oi,e.target.value)} className="input text-sm flex-1 border-0 bg-transparent focus:ring-0 p-0" placeholder={`Option ${opt.id.toUpperCase()}`}/>
                            {q.correctAnswer===opt.id && <CheckCircle size={14} className="text-emerald-400 shrink-0"/>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="label text-xs">Explanation (shown after exam)</label>
                    <input value={q.explanation||''} onChange={e=>updateQ(qi,'explanation',e.target.value)} className="input text-sm" placeholder="Why is this the correct answer?"/>
                  </div>
                </div>
              )}
            </div>
          ))}

          <button onClick={addQ} className="btn-secondary w-full justify-center py-3 border-dashed border-surface-600">
            <Plus size={16}/>Add Question Manually
          </button>

          {questions.filter(q=>q.questionText).length > 0 && (
            <div className="glass rounded-xl p-4 flex items-center justify-between">
              <div className="text-sm text-surface-400">
                <span className="text-white font-semibold">{questions.filter(q=>q.questionText).length}</span> questions ·{' '}
                <span className="text-white font-semibold">{questions.filter(q=>q.questionText).reduce((s,q)=>s+q.marks,0)}</span> total marks
                {exam.globalNegativeMarking && <span className="text-amber-400 ml-2">· -{exam.globalNegativeMarks} per wrong</span>}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ── PROCTORING TAB ─────────────────────────────────── */}
      {activeTab==='proctoring' && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield size={18} className="text-primary-400"/>
            <h3 className="section-title">Proctoring Configuration</h3>
          </div>
          {[
            { key:'webcam_required',    label:'Require Webcam',          desc:'Students must have webcam on throughout' },
            { key:'fullscreen_required',label:'Require Fullscreen',       desc:'Exam must run fullscreen — alerts on exit' },
            { key:'tab_switch_allowed', label:'Allow Tab Switching',      desc:'When OFF, switching tabs triggers an alert' },
            { key:'copy_paste_blocked', label:'Block Copy & Paste',       desc:'Prevents copying questions or pasting answers' },
            { key:'face_detection',     label:'Face Detection (AI)',      desc:'Checks face is visible in webcam continuously' },
            { key:'gaze_tracking',      label:'Gaze Tracking (AI)',       desc:'Alerts when student looks away too long' },
            { key:'ai_analysis',        label:'AI Behaviour Analysis',    desc:'Claude AI analyses frames for cheating in real time' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-4 rounded-xl bg-surface-800 border border-surface-700">
              <div>
                <div className="text-sm font-semibold text-white font-heading">{label}</div>
                <div className="text-xs text-surface-400 mt-0.5">{desc}</div>
              </div>
              <button
                onClick={() => setExam({...exam, proctoringSettings:{...exam.proctoringSettings,[key]:!exam.proctoringSettings[key]}})}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-4 ${exam.proctoringSettings[key]?'bg-primary-500':'bg-surface-600'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${exam.proctoringSettings[key]?'translate-x-5':''}`}/>
              </button>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <label className="label">Screenshot Interval (seconds)</label>
              <input type="number" value={exam.proctoringSettings.screenshot_interval}
                onChange={e=>setExam({...exam,proctoringSettings:{...exam.proctoringSettings,screenshot_interval:parseInt(e.target.value)}})}
                className="input" min="10" max="300"/>
            </div>
            <div>
              <label className="label">Max Warnings Before Termination</label>
              <input type="number" value={exam.proctoringSettings.max_warnings}
                onChange={e=>setExam({...exam,proctoringSettings:{...exam.proctoringSettings,max_warnings:parseInt(e.target.value)}})}
                className="input" min="1" max="10"/>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
