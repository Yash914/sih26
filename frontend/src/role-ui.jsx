import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Clock3, History, LayoutDashboard, LogOut, Mic, Phone, Shield, ShieldCheck, TrendingUp, Users, X, Upload } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const demoCases = [
  { case_id: 'CASE_001', score: 8.34, risk: 'Moderate', trend: 'Increasing' },
  { case_id: 'CASE_002', score: 16.8, risk: 'Severe', trend: 'Increasing' },
  { case_id: 'CASE_003', score: 4.2, risk: 'Low', trend: 'Stable' },
  { case_id: 'CASE_004', score: 12.1, risk: 'High', trend: 'Increasing' }
];
const riskClass = r => (r || '').toLowerCase();

function Login({ onLogin }) {
  const [role, setRole] = useState('participant');
  const [id, setId] = useState('CASE_001');
  const [password, setPassword] = useState('password');

  useEffect(() => {
    setId(role === 'participant' ? 'CASE_001' : 'AUTH_001');
  }, [role]);

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand centered">
          <div className="brand-mark"><Activity size={22} /></div>
          <div><strong>MindWatch</strong><span>Wellbeing Check-in</span></div>
        </div>
        <div className="login-copy">
          <span className="section-kicker">SECURE ACCESS</span>
          <h1>Welcome</h1>
          <p>Choose how you would like to access MindWatch.</p>
        </div>
        <div className="role-tabs">
          <button className={role === 'participant' ? 'role-tab active' : 'role-tab'} onClick={() => setRole('participant')}>
            <Activity size={21} /><span><b>Participant</b><small>Private wellbeing check-in</small></span>
          </button>
          <button className={role === 'authority' ? 'role-tab active' : 'role-tab'} onClick={() => setRole('authority')}>
            <Shield size={21} /><span><b>Authority</b><small>Case monitoring & response</small></span>
          </button>
        </div>
        <label>{role === 'participant' ? 'Case ID' : 'Authority ID'}</label>
        <input className="plain-input" value={id} onChange={e => setId(e.target.value)} placeholder="ID" />
        <label>Password</label>
        <input className="plain-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
        <button className="primary-btn full login-button" onClick={() => onLogin(role, id)}>
          {role === 'participant' ? 'Continue securely' : 'Open authority console'} <ArrowRight size={17} />
        </button>
        <div className="login-safe"><ShieldCheck size={15} /> Privacy-first access with human oversight.</div>
      </div>
    </div>
  );
}

function VoiceInput({ audio, setAudio, setError }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  useEffect(() => () => clearInterval(timerRef.current), []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        setAudio(new File([blob], 'voice-checkin.webm', { type: blob.type }));
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true); setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch {
      setError('Microphone unavailable. You can upload an audio file instead.');
    }
  };
  const stop = () => { recorderRef.current?.stop(); clearInterval(timerRef.current); setRecording(false); };

  return (
    <div className="voice-box">
      <div className="voice-symbol"><Mic size={21} /></div>
      <div className="voice-copy"><b>{audio ? audio.name : 'Voice check-in'}</b><span>{audio ? 'Ready to submit' : 'Speak naturally and share what you are comfortable sharing.'}</span></div>
      {audio && <button className="icon-btn" onClick={() => setAudio(null)}><X size={17} /></button>}
      <label className="secondary-btn"><Upload size={16} /> Upload<input type="file" accept="audio/*" onChange={e => e.target.files?.[0] && setAudio(e.target.files[0])} /></label>
      {recording ? <button className="record-btn recording" onClick={stop}>● Stop {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</button> : <button className="record-btn" onClick={start}><Mic size={16} /> Record</button>}
    </div>
  );
}

function Participant({ caseId, logout }) {
  const [text, setText] = useState('');
  const [audio, setAudio] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!text.trim() && !audio) return setError('Please write something or record a voice response.');
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('case_id', caseId || 'CASE_001');
      if (text.trim()) form.append('text', text.trim());
      if (audio) form.append('audio', audio, audio.name);
      const response = await fetch(`${API}/analyze-interaction`, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Your check-in could not be saved.');
      setDone(true); setText(''); setAudio(null);
    } catch (e) { setError(e.message || 'Your check-in could not be saved.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="participant-shell">
      <header className="participant-top">
        <div className="brand"><div className="brand-mark"><Activity /></div><div><strong>MindWatch</strong><span>Private wellbeing check-in</span></div></div>
        <button className="logout-btn" onClick={logout}><LogOut size={16} /> Sign out</button>
      </header>
      <main className="participant-main">
        <div className="participant-welcome"><span className="section-kicker">PRIVATE CHECK-IN</span><h1>How are you feeling today?</h1><p>Share in your own words or voice. There is no right or wrong answer.</p></div>
        {done ? (
          <div className="success-card"><div className="success-icon"><CheckCircle2 size={32} /></div><h2>Thank you for checking in.</h2><p>Your response has been securely recorded.</p><button className="secondary-btn" onClick={() => setDone(false)}>Make another check-in</button></div>
        ) : (
          <div className="checkin-card">
            <label>Write your response <span>Optional</span></label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={7} placeholder="Tell us anything you would like to share..." />
            <div className="field-note">Share only what you feel comfortable sharing.</div>
            <div className="or"><span /> OR <span /></div>
            <VoiceInput audio={audio} setAudio={setAudio} setError={setError} />
            {error && <div className="error-banner"><AlertTriangle size={16} /> {error}</div>}
            <button className="primary-btn full large" disabled={busy} onClick={submit}>{busy ? 'Saving your check-in…' : 'Submit check-in'} <ArrowRight size={18} /></button>
          </div>
        )}
        <div className="participant-reassurance"><ShieldCheck size={19} /><div><b>Your privacy matters</b><span>Your assessment results are not shown here. Authorized support teams use submitted responses to decide when additional support may be needed.</span></div></div>
      </main>
      <footer className="participant-footer"><b><Phone size={14} /> Need immediate help?</b><span>Contact your designated helpline or local emergency service if you are in immediate danger.</span></footer>
    </div>
  );
}

function CaseTable({ cases, open }) {
  return <div className="case-table"><div className="table-head"><span>Case</span><span>Distress</span><span>Risk</span><span>Trend</span><span /></div>{cases.map(c => <div className="case-row-admin" key={c.case_id}><span><b>{c.case_id}</b><small>Active monitoring</small></span><span><b>{c.score.toFixed(1)}</b> / 24</span><span><i className={`risk-badge ${riskClass(c.risk)}`}>{c.risk}</i></span><span className={c.trend === 'Increasing' ? 'danger-text' : ''}>{c.trend === 'Increasing' && <TrendingUp size={15} />} {c.trend}</span><button className="view-btn" onClick={() => open(c)}>View <ArrowRight size={15} /></button></div>)}</div>;
}

function Authority({ logout }) {
  const [selected, setSelected] = useState(demoCases[1]);
  const [page, setPage] = useState('Overview');
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [assignment, setAssignment] = useState(null);
  const [modal, setModal] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [h, s] = await Promise.all([fetch(`${API}/case/${selected.case_id}/history`), fetch(`${API}/case/${selected.case_id}/summary`)]);
        if (h.ok) setHistory((await h.json()).history || []); else setHistory([]);
        if (s.ok) setSummary(await s.json()); else setSummary(null);
      } catch { setError('Backend unavailable. Showing available case overview data.'); }
    })();
  }, [selected]);

  const score = summary?.current_score ?? selected.score;
  const risk = summary?.current_risk ?? selected.risk;
  const trend = summary?.trend ?? selected.trend;
  const priority = summary?.priority ?? (risk === 'High' || risk === 'Severe' ? 'Urgent' : 'Routine');
  const chart = history.map((x, i) => ({ i: i + 1, score: Number(x.distress_score) }));
  const urgent = demoCases.filter(x => x.risk === 'High' || x.risk === 'Severe').length;
  const increasing = demoCases.filter(x => x.trend === 'Increasing').length;
  const openCase = c => { setSelected(c); setPage('Case'); };

  return (
    <div className="authority-shell">
      <aside className="authority-sidebar">
        <div className="brand"><div className="brand-mark"><Activity /></div><div><strong>MindWatch</strong><span>Authority Console</span></div></div>
        <div className="authority-badge"><Shield size={15} /> Government Authority</div>
        <nav>
          <button className={page === 'Overview' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('Overview')}><LayoutDashboard /> Overview</button>
          <button className={page === 'Cases' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('Cases')}><Users /> All cases</button>
        </nav>
        <div className="sidebar-bottom"><div className="privacy"><ShieldCheck /><div><b>Protected workspace</b><span>Authorized access only.</span></div></div><button className="logout-side" onClick={logout}><LogOut /> Sign out</button></div>
      </aside>
      <main className="authority-main">
        <header className="authority-top"><div><div className="eyebrow">MoSJE • SIH 2026</div><h1>{page === 'Overview' ? 'Authority overview' : page === 'Cases' ? 'Case monitoring' : `Case ${selected.case_id}`}</h1><p>Human-led monitoring and intervention workspace</p></div><div className="authority-user"><Shield size={17} /><b>Authority Officer</b></div></header>
        {error && <div className="error-banner"><AlertTriangle size={17} />{error}</div>}
        {page === 'Overview' && <><section className="admin-stat-grid"><div className="admin-stat"><span>Total active cases</span><strong>{demoCases.length}</strong><Users /></div><div className="admin-stat urgent"><span>High / severe</span><strong>{urgent}</strong><AlertTriangle /></div><div className="admin-stat watch"><span>Increasing trend</span><strong>{increasing}</strong><TrendingUp /></div><div className="admin-stat"><span>Interventions</span><strong>{assignment ? 1 : 0}</strong><CheckCircle2 /></div></section><h2 className="section-title">Cases needing review</h2><CaseTable cases={demoCases.filter(x => x.risk !== 'Low')} open={openCase} /></>}
        {page === 'Cases' && <section className="card admin-card"><span className="section-kicker">CASE REGISTER</span><h2>All monitored cases</h2><p>Review current status and open a case for intervention.</p><CaseTable cases={demoCases} open={openCase} /></section>}
        {page === 'Case' && <>
          <div className="case-toolbar"><button className="back-link" onClick={() => setPage('Cases')}>← All cases</button><div><i className={`risk-badge ${riskClass(risk)}`}>{risk}</i><button className="primary-btn" onClick={() => setModal(true)}><Users size={16} /> Assign support</button></div></div>
          <section className="case-summary-grid"><div className="case-score-admin"><span className="section-kicker">CURRENT DISTRESS</span><div className="big-score">{Number(score).toFixed(1)} <small>/ 24</small></div><i className={`risk-badge ${riskClass(risk)}`}>{risk}</i></div><div className="case-metric"><span>Trend</span><strong className={trend === 'Increasing' ? 'danger-text' : ''}>{trend === 'Increasing' && <TrendingUp size={17} />} {trend}</strong></div><div className="case-metric"><span>Priority</span><strong>{priority}</strong></div><div className="case-metric"><span>Interactions</span><strong>{summary?.interaction_count ?? history.length}</strong></div></section>
          {(risk === 'High' || risk === 'Severe' || trend === 'Increasing') && !assignment && <div className="alert-card"><AlertTriangle /><div><b>Intervention review recommended</b><span>This case has an elevated or increasing distress signal. Authority review is required.</span></div><button className="primary-btn" onClick={() => setModal(true)}>Assign support <ArrowRight size={16} /></button></div>}
          {assignment && <div className="assignment-card"><CheckCircle2 /><div><b>{assignment} assigned</b><span>{selected.case_id} • Status: Pending</span></div></div>}
          <section className="dashboard-grid"><div className="card chart-card"><span className="section-kicker">LONGITUDINAL MONITORING</span><h2>Distress trajectory</h2>{chart.length ? <ResponsiveContainer width="100%" height={260}><AreaChart data={chart}><XAxis dataKey="i" /><YAxis domain={[0, 24]} /><Tooltip /><Area type="monotone" dataKey="score" fillOpacity={.12} /></AreaChart></ResponsiveContainer> : <div className="empty-chart"><BarChart3 /><b>No history available</b><span>Additional check-ins build the trend.</span></div>}</div><div className="card action-card"><span className="section-kicker">RESPONSE</span><h2>Operational action</h2><p>AI signals support decisions; they do not autonomously dispatch services.</p><button className="action-option" onClick={() => { setAssignment('Counsellor'); setModal(false); }}><Users /><span><b>Assign counsellor</b><small>Psychosocial support</small></span><ArrowRight /></button><button className="action-option" onClick={() => { setAssignment('Police officer'); setModal(false); }}><Shield /><span><b>Assign police officer</b><small>Safety/protection response</small></span><ArrowRight /></button></div></section>
          <section className="card admin-card"><span className="section-kicker">CASE HISTORY</span><h2>Recorded interactions</h2>{history.length ? <div className="history-table"><div className="table-head"><span>#</span><span>Timestamp</span><span>Distress</span><span>Risk</span></div>{history.map((h, i) => <div className="table-row" key={`${h.timestamp}-${i}`}><span>#{i + 1}</span><span>{new Date(h.timestamp).toLocaleString()}</span><span><b>{Number(h.distress_score).toFixed(2)}</b> / 24</span><i className={`risk-badge ${riskClass(h.risk_level)}`}>{h.risk_level}</i></div>)}</div> : <div className="empty-state">No recorded interactions.</div>}</section>
        </>}
        {page === 'Case' && modal && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setModal(false)}><X /></button><span className="section-kicker">INTERVENTION</span><h2>Assign support</h2><p>Choose an appropriate support pathway for <b>{selected.case_id}</b>.</p><button className="assignment-option" onClick={() => { setAssignment('Counsellor'); setModal(false); }}><Users /><div><b>Counsellor</b><span>Psychosocial support and follow-up</span></div><ArrowRight /></button><button className="assignment-option" onClick={() => { setAssignment('Police officer'); setModal(false); }}><Shield /><div><b>Police officer</b><span>Safety or protection response</span></div><ArrowRight /></button><div className="modal-note"><ShieldCheck size={15} /> Final intervention decision remains with the authority.</div></div></div>}
        <footer>MindWatch • SIH 2026 prototype <span>AI decision support • Human oversight required</span></footer>
      </main>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  return session ? (session.role === 'participant' ? <Participant caseId={session.id} logout={() => setSession(null)} /> : <Authority logout={() => setSession(null)} />) : <Login onLogin={(role, id) => setSession({ role, id })} />;
}

createRoot(document.getElementById('root')).render(<App />);
