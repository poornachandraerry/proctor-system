import React, { useState, useRef, useCallback } from 'react';
import {
  Bold, Italic, Underline, List, Image, Music, Video,
  Table, Subscript, Superscript, Code, Upload, X,
  ChevronDown, ChevronUp, Eye, EyeOff, Loader
} from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

// ── Toolbar Button ─────────────────────────────────────────
function TB({ icon: Icon, title, action, active }) {
  return (
    <button type="button" title={title} onMouseDown={e => { e.preventDefault(); action(); }}
      className={`p-1.5 rounded-lg transition-colors ${active ? 'bg-primary-500/30 text-primary-300' : 'text-surface-400 hover:text-white hover:bg-surface-700'}`}>
      <Icon size={14}/>
    </button>
  );
}

// ── Formula helper ─────────────────────────────────────────
function insertAtCursor(el, text) {
  if (!el) return;
  const start = el.selectionStart;
  const end   = el.selectionEnd;
  const val   = el.value;
  el.value = val.slice(0,start) + text + val.slice(end);
  el.selectionStart = el.selectionEnd = start + text.length;
  el.dispatchEvent(new Event('input', { bubbles:true }));
}

// ── Main Component ─────────────────────────────────────────
export default function RichQuestionEditor({ value, onChange, questionId, examId, placeholder = 'Enter question text...' }) {
  const [mode, setMode]           = useState('text'); // 'text' | 'html' | 'preview'
  const [uploading, setUploading] = useState(false);
  const [assets, setAssets]       = useState([]);
  const [showFormula, setShowFormula] = useState(false);
  const [formula, setFormula]     = useState('');
  const [showTable, setShowTable] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const fileRef  = useRef(null);
  const textRef  = useRef(null);

  // ── Format helpers ─────────────────────────────────────
  const wrap = (tag) => {
    const el = textRef.current;
    if (!el) return;
    const sel = el.value.slice(el.selectionStart, el.selectionEnd);
    const wrapped = `<${tag}>${sel || 'text'}</${tag}>`;
    insertAtCursor(el, wrapped);
    onChange(el.value);
  };

  const insertList = () => {
    const el = textRef.current;
    insertAtCursor(el, '\n<ul>\n  <li>Item 1</li>\n  <li>Item 2</li>\n</ul>\n');
    onChange(el.value);
  };

  const insertTable = () => {
    const header = `<tr>${Array(parseInt(tableCols)).fill(0).map((_,i)=>`<th>Header ${i+1}</th>`).join('')}</tr>`;
    const rows   = Array(parseInt(tableRows)).fill(0).map(()=>`<tr>${Array(parseInt(tableCols)).fill(0).map((_,i)=>`<td>Cell ${i+1}</td>`).join('')}</tr>`).join('\n  ');
    const table  = `\n<table class="q-table">\n  ${header}\n  ${rows}\n</table>\n`;
    const el = textRef.current;
    insertAtCursor(el, table);
    onChange(el.value);
    setShowTable(false);
  };

  const insertFormula = () => {
    if (!formula.trim()) return;
    const el = textRef.current;
    insertAtCursor(el, ` <span class="q-formula">\\(${formula}\\)</span> `);
    onChange(el.value);
    setFormula('');
    setShowFormula(false);
  };

  // ── File upload ────────────────────────────────────────
  const handleUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (questionId) formData.append('questionId', questionId);
      if (examId)     formData.append('examId', examId);
      formData.append('altText', file.name);
      const { data } = await api.post('/question-media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      // Insert embed tag into text
      const el = textRef.current;
      insertAtCursor(el, `\n${data.embedHtml}\n`);
      onChange(el.value);
      setAssets(prev => [...prev, data.asset]);
      toast.success(`${data.asset.asset_type} uploaded!`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, [questionId, examId, onChange]);

  return (
    <div className="border border-surface-700 rounded-xl overflow-hidden bg-surface-900">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-surface-800 border-b border-surface-700 flex-wrap">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 mr-2 pr-2 border-r border-surface-700">
          {[
            { id:'text', label:'Text' },
            { id:'html', label:'HTML' },
            { id:'preview', label:'Preview' },
          ].map(m => (
            <button key={m.id} type="button" onClick={() => setMode(m.id)}
              className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${mode===m.id ? 'bg-primary-600 text-white' : 'text-surface-400 hover:text-white'}`}>
              {m.label}
            </button>
          ))}
        </div>

        {mode !== 'preview' && <>
          <TB icon={Bold}        title="Bold"        action={() => wrap('strong')} />
          <TB icon={Italic}      title="Italic"      action={() => wrap('em')} />
          <TB icon={Underline}   title="Underline"   action={() => wrap('u')} />
          <TB icon={Subscript}   title="Subscript"   action={() => wrap('sub')} />
          <TB icon={Superscript} title="Superscript" action={() => wrap('sup')} />
          <TB icon={Code}        title="Code"        action={() => wrap('code')} />
          <div className="w-px h-4 bg-surface-700 mx-1" />
          <TB icon={List}   title="Bullet List" action={insertList} />
          <TB icon={Table}  title="Insert Table" action={() => setShowTable(!showTable)} active={showTable} />
          <div className="w-px h-4 bg-surface-700 mx-1" />
          {/* Formula */}
          <button type="button" title="Insert Formula (LaTeX)"
            onMouseDown={e => { e.preventDefault(); setShowFormula(!showFormula); }}
            className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${showFormula ? 'bg-primary-600 text-white' : 'text-surface-400 hover:text-white hover:bg-surface-700'}`}>
            ∑ Formula
          </button>
          <div className="w-px h-4 bg-surface-700 mx-1" />
          {/* Media upload */}
          <button type="button" title="Upload Image / Audio / Video"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-surface-400 hover:text-white hover:bg-surface-700 transition-colors disabled:opacity-50">
            {uploading ? <Loader size={12} className="animate-spin"/> : <Upload size={12}/>}
            Media
          </button>
          <input ref={fileRef} type="file" className="hidden"
            accept="image/*,audio/*,video/*"
            onChange={handleUpload} />
        </>}
      </div>

      {/* Table insert helper */}
      {showTable && (
        <div className="px-3 py-2 bg-surface-800 border-b border-surface-700 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-surface-400">Table size:</span>
          <div className="flex items-center gap-1.5">
            <input type="number" value={tableRows} onChange={e=>setTableRows(e.target.value)} min="1" max="20" className="input w-14 py-1 text-xs text-center"/>
            <span className="text-surface-500 text-xs">rows ×</span>
            <input type="number" value={tableCols} onChange={e=>setTableCols(e.target.value)} min="1" max="10" className="input w-14 py-1 text-xs text-center"/>
            <span className="text-surface-500 text-xs">cols</span>
          </div>
          <button type="button" onClick={insertTable} className="btn-primary text-xs py-1 px-3">Insert</button>
          <button type="button" onClick={() => setShowTable(false)} className="text-surface-500 hover:text-white"><X size={14}/></button>
        </div>
      )}

      {/* Formula input */}
      {showFormula && (
        <div className="px-3 py-2 bg-surface-800 border-b border-surface-700 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-surface-400">LaTeX formula:</span>
          <input value={formula} onChange={e => setFormula(e.target.value)}
            onKeyDown={e => e.key==='Enter' && insertFormula()}
            className="input flex-1 min-w-[180px] py-1 text-sm font-mono"
            placeholder="e.g. x^2 + y^2 = r^2" />
          <button type="button" onClick={insertFormula} className="btn-primary text-xs py-1 px-3">Insert</button>
          <button type="button" onClick={() => setShowFormula(false)} className="text-surface-500 hover:text-white"><X size={14}/></button>
        </div>
      )}

      {/* Editor area */}
      {mode === 'preview' ? (
        <div
          className="min-h-[120px] p-3 text-sm text-surface-200 leading-relaxed prose-sm"
          style={{ fontFamily: 'inherit' }}
          dangerouslySetInnerHTML={{ __html: value || '<span class="text-surface-600 italic">Nothing to preview</span>' }}
        />
      ) : (
        <textarea
          ref={textRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={mode === 'html' ? 'Enter HTML or plain text. Use toolbar buttons to insert formatting...' : placeholder}
          className="w-full min-h-[120px] p-3 bg-transparent text-sm text-surface-200 resize-y focus:outline-none font-mono leading-relaxed placeholder-surface-600"
          style={{ fontFamily: mode === 'html' ? 'JetBrains Mono, monospace' : 'inherit' }}
        />
      )}

      {/* Uploaded assets strip */}
      {assets.length > 0 && (
        <div className="px-3 py-2 border-t border-surface-700 flex gap-2 flex-wrap bg-surface-800">
          {assets.map(a => (
            <div key={a.id} className="flex items-center gap-1.5 text-xs bg-surface-700 text-surface-300 px-2 py-1 rounded-lg">
              {a.asset_type === 'image' ? <Image size={11}/> : a.asset_type === 'audio' ? <Music size={11}/> : <Video size={11}/>}
              <span className="truncate max-w-[120px]">{a.file_name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Helper text */}
      <div className="px-3 py-1.5 bg-surface-800 border-t border-surface-700 text-xs text-surface-600">
        Supports plain text, HTML formatting, LaTeX formulas (∑), tables, images, audio and video
      </div>
    </div>
  );
}
