import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertTriangle, BarChart3, CheckCircle2, ChevronRight,
  Clock3, FileAudio, History, LayoutDashboard, Mic, Paperclip,
  RefreshCw, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Upload,
  UserRound, X, Zap
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function riskClass(risk = '') {
  return risk.toLowerCase();
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function App() {
  const [caseId, setCaseId] = useState('CASE_001');
  const [text, setText] = useState('');
  const [audio, setAudio] = useState(null);
  const [result, setResult] = useState(null);
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [activePage, setActivePage] = useState('Analyze');
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const loadCase = async (id = caseId) => {
    if (!id.trim()) return;
    setHistoryLoading(true);
    try {
      const [h, s] = await Promise.all([
        fetch(`${API}/case/${encodeURIComponent(id)}/history`),
        fetch(`${API}/case/${encodeURIComponent(id)}/summary`)
      ]);
      if (h.ok) setHistory((await h.json()).history || []);
      else setHistory([]);
      if (s.ok) setSummary(await s.json());
      else setSummary(null);
    } catch {
      setError('Could not reach the backend. Make sure FastAPI is running on port 8000.');
    } finally { setHistoryLoading(false); }
  };

  const analyze = async () => {
    setError('');
    if (!caseId.trim()) return setError('Enter a case ID.');
    if (!text.trim() && !audio) return setError('Provide text, audio, or both.');
    setLoading(true);
    try {
      const form = new FormData();
      form.append('case_id', caseId.trim());
      if (text.trim()) form.append('text', text.trim());
      if (audio) form.append('audio', audio, audio.name || 'recording.webm');
      const response = await fetch(`${API}/analyze-interaction`, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Analysis failed.');
      setResult(data);
      await loadCase(caseId.trim());
    } catch (e) {
      setError(e.message || 'Analysis failed.');
    } finally { setLoading(false); }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file) setAudio(file);
  };

  const startRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        setAudio(new File([blob], 'recording.webm', { type: blob.type }));
        stream.getTracks().forEach(track => track.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    } catch {
      setError('Microphone access was unavailable. You can upload an audio file instead.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    clearInterval(timerRef.current);
    setRecording(false);
  };

  const currentScore = result?.distress_score ?? summary?.current_score ?? 0;
  const currentRisk = result?.risk_level ?? summary?.current_risk ?? '—';
  const trend = summary?.trend || 'Insufficient data';
  const emotions = result?.text_analysis?.probabilities || result?.audio_analysis?.probabilities || {};
  const emotionEntries = Object.entries(emotions).sort((a,b) => b[1] - a[1]);
  const chartData = history.map((x, i) => ({ index: i + 1, score: Number(x.distress_score), risk: x.risk_level }));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Activity size={21}/></div><div><strong>MindWatch</strong><span>Distress Monitoring</span></div></div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <button className={activePage === 'Overview' ? 'nav-item active' : 'nav-item'} onClick={() => setActivePage('Overview')}><LayoutDashboard size={18}/> Overview</button>
          <button className={activePage === 'Analyze' ? 'nav-item active' : 'nav-item'} onClick={() => setActivePage('Analyze')}><Sparkles size={18}/> Analyze case</button>
          <button className={activePage === 'History' ? 'nav-item active' : 'nav-item'} onClick={() => { setActivePage('History'); loadCase(); }}><History size={18}/> Case history</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy"><ShieldCheck size={17}/><div><b>Privacy first</b><span>Data stays in your local system.</span></div></div>
          <div className="system"><span className="online-dot"/> API connected</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><div className="eyebrow">MOJSE • SIH 2026</div><h1>{activePage === 'Analyze' ? 'Case analysis' : activePage}</h1><p>AI-assisted longitudinal distress monitoring</p></div>
          <div className="top-actions"><div className="api-pill"><span className="online-dot"/> System online</div><div className="avatar"><UserRound size={18}/></div></div>
        </header>

        {error && <div className="error-banner"><AlertTriangle size={18}/><span>{error}</span><button onClick={() => setError('')}><X size={16}/></button></div>}

        {activePage === 'Analyze' && <>
          <section className="hero-grid">
            <div className="analysis-card card">
              <div className="card-heading"><div><span className="section-kicker">NEW INTERACTION</span><h2>Capture a response</h2><p>Use text, voice, or both modalities for the most complete assessment.</p></div><div className="step-badge">01 <ChevronRight size={14}/> 02 <ChevronRight size={14}/> 03</div></div>
              <label>Case ID</label>
              <div className="case-row"><div className="input-wrap"><UserRound size={17}/><input value={caseId} onChange={e => setCaseId(e.target.value)} placeholder="CASE_001"/></div><button className="ghost-btn" onClick={() => loadCase()}><RefreshCw size={16}/> Load case</button></div>
              <label>How is the person feeling?</label>
              <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Enter the participant's response..." rows={5}/>
              <div className="input-footer"><span>{text.length} characters</span><span>Emotion analysis enabled</span></div>
              <div className="audio-zone">
                <div className="audio-icon"><FileAudio size={20}/></div>
                <div className="audio-copy"><b>{audio ? audio.name : 'Add a voice response'}</b><span>{audio ? `${(audio.size / 1024 / 1024).toFixed(2)} MB ready` : 'Optional • WAV, MP3, M4A, WEBM'}</span></div>
                {audio && <button className="icon-btn" onClick={() => setAudio(null)}><X size={17}/></button>}
                <label className="upload-btn"><Upload size={16}/> Upload<input type="file" accept="audio/*" onChange={handleFile}/></label>
                {!recording ? <button className="record-btn" onClick={startRecording}><Mic size={16}/> Record</button> : <button className="record-btn recording" onClick={stopRecording}><span className="record-dot"/> Stop {String(Math.floor(recordSeconds/60)).padStart(2,'0')}:{String(recordSeconds%60).padStart(2,'0')}</button>}
              </div>
              <button className="analyze-btn" onClick={analyze} disabled={loading}>{loading ? <><RefreshCw className="spin" size={18}/> Analyzing modalities...</> : <><Zap size={18}/> Analyze interaction</>}</button>
              <div className="assist-note"><ShieldCheck size={14}/> AI output is decision support, not a clinical diagnosis.</div>
            </div>

            <div className="score-card card">
              <div className="score-top"><div><span className="section-kicker">CURRENT DISTRESS</span><h3>{caseId}</h3></div><span className={`risk-badge ${riskClass(currentRisk)}`}>{currentRisk}</span></div>
              <div className="score-ring-wrap"><div className="score-ring" style={{'--score': `${Math.min(Number(currentScore) / 24 * 100, 100)}%`}}><div><strong>{Number(currentScore).toFixed(1)}</strong><span>/ 24</span></div></div></div>
              <div className="score-label">Dynamic distress score</div>
              <div className="metric-list">
                <div><span><Activity size={15}/> Trend</span><b className={trend === 'Increasing' ? 'danger-text' : trend === 'Decreasing' ? 'good-text' : ''}>{trend === 'Increasing' && <TrendingUp size={15}/>} {trend === 'Decreasing' && <TrendingDown size={15}/>} {trend}</b></div>
                <div><span><Clock3 size={15}/> Interactions</span><b>{summary?.interaction_count ?? history.length || 0}</b></div>
                <div><span><AlertTriangle size={15}/> Priority</span><b>{summary?.priority ?? 'Routine'}</b></div>
              </div>
            </div>
          </section>

          <section className="dashboard-grid">
            <div className="card chart-card"><div className="card-heading compact"><div><span className="section-kicker">LONGITUDINAL VIEW</span><h2>Distress trajectory</h2></div><span className="small-muted">/ 24 scale</span></div>{chartData.length ? <div className="chart"><ResponsiveContainer width="100%" height={245}><AreaChart data={chartData}><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopOpacity={0.25}/><stop offset="100%" stopOpacity={0.02}/></linearGradient></defs><XAxis dataKey="index" tickLine={false} axisLine={false}/><YAxis domain={[0,24]} tickLine={false} axisLine={false} width={32}/><Tooltip formatter={(v) => [`${Number(v).toFixed(2)} / 24`, 'Distress']} labelFormatter={v => `Interaction ${v}`}/><Area type="monotone" dataKey="score" strokeWidth={3} fill="url(#fill)" /></AreaChart></ResponsiveContainer></div> : <div className="empty-chart"><BarChart3 size={30}/><b>No longitudinal data yet</b><span>Analyze this case multiple times to see the trajectory.</span></div>}</div>
            <div className="card emotion-card"><div className="card-heading compact"><div><span className="section-kicker">EMOTION SIGNALS</span><h2>Model output</h2></div></div>{emotionEntries.length ? <div className="emotion-list">{emotionEntries.map(([name,value]) => <div className="emotion-row" key={name}><div className="emotion-name"><span>{name}</span><b>{(value*100).toFixed(1)}%</b></div><div className="bar"><i style={{width:`${Math.max(value*100,1)}%`}}/></div></div>)}</div> : <div className="empty-state"><Sparkles size={25}/><span>Run an analysis to view emotion probabilities.</span></div>}</div>
          </section>

          {result?.shap_explanation && <section className="card explanation-card"><div className="card-heading compact"><div><span className="section-kicker">EXPLAINABLE AI</span><h2>Why the score changed</h2><p>Top factors from the multimodal XGBoost model.</p></div></div><div className="factor-grid">{result.shap_explanation.top_contributing_factors?.map(f => <div className="factor" key={f.feature}><div className={f.direction === 'increases_risk' ? 'factor-icon up' : 'factor-icon down'}>{f.direction === 'increases_risk' ? <TrendingUp size={16}/> : <TrendingDown size={16}/>}</div><div><b>{f.display_name}</b><span>Signal {Number(f.value).toFixed(3)} • impact {Number(f.impact).toFixed(3)}</span></div></div>)}</div></section>}
        </>}

        {activePage === 'History' && <section className="card history-page"><div className="card-heading"><div><span className="section-kicker">CASE TIMELINE</span><h2>{caseId}</h2><p>Every analyzed interaction stored by the local monitoring service.</p></div><button className="ghost-btn" onClick={() => loadCase()}><RefreshCw size={16}/> Refresh</button></div>{historyLoading ? <div className="loading-state"><RefreshCw className="spin"/> Loading case history...</div> : history.length ? <div className="history-table"><div className="table-head"><span>Interaction</span><span>Timestamp</span><span>Distress</span><span>Risk</span></div>{history.map((h,i) => <div className="table-row" key={`${h.timestamp}-${i}`}><span>#{i+1}</span><span>{formatTime(h.timestamp)}</span><span><b>{Number(h.distress_score).toFixed(2)}</b> / 24</span><span className={`risk-badge ${riskClass(h.risk_level)}`}>{h.risk_level}</span></div>)}</div> : <div className="empty-state large"><History size={34}/><b>No interactions for this case</b><span>Analyze an interaction first.</span></div>}</section>}

        {activePage === 'Overview' && <section className="overview-grid"><div className="card overview-welcome"><div className="welcome-icon"><Sparkles/></div><span className="section-kicker">MONITORING OVERVIEW</span><h2>AI-assisted distress monitoring</h2><p>MindWatch combines text and speech emotion signals with a trained multimodal model to provide a transparent, longitudinal view of distress.</p><button className="analyze-btn small" onClick={() => setActivePage('Analyze')}>Start analysis <ChevronRight size={17}/></button></div><div className="card overview-stat"><span className="section-kicker">ACTIVE CASE</span><strong>{caseId}</strong><div className="overview-score">{Number(currentScore).toFixed(1)} <small>/ 24</small></div><span className={`risk-badge ${riskClass(currentRisk)}`}>{currentRisk}</span></div><div className="card overview-stat"><span className="section-kicker">INTERACTIONS</span><strong>{summary?.interaction_count ?? history.length || 0}</strong><p>Recorded for current case</p><div className="mini-line"><Activity size={17}/> Longitudinal monitoring enabled</div></div></section>}

        <footer><span>MindWatch • SIH 2026 prototype</span><span>Local AI processing • Human oversight required</span></footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
