import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, LayoutDashboard, ArrowLeft, PlusCircle,
  Camera, UploadCloud, LogOut, Mail, Lock,
  ChevronRight, AlertCircle, Info, Database,
  ScanLine, ShieldCheck, History
} from 'lucide-react'

const API_URL = '/api'

// --- Components ---

const Notification = ({ message, type = 'info', onClear }) => {
  useEffect(() => {
    const timer = setTimeout(onClear, 3000)
    return () => clearTimeout(timer)
  }, [onClear])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="glass"
      style={{
        position: 'fixed', bottom: 20, right: 20, padding: '1rem 2rem',
        zIndex: 1000, maxWidth: 350,
        borderLeft: `4px solid ${type === 'error' ? '#f43f5e' : '#8b5cf6'}`,
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
      }}
    >
      {type === 'error' ? <AlertCircle size={20} color="#f43f5e" /> : <Info size={20} color="#8b5cf6" />}
      <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{message}</span>
    </motion.div>
  )
}

// --- Main App ---

export default function App() {
  const [view, setView] = useState('auth') // auth, home, setup, monitor, results, gateDetect
  const [user, setUser] = useState(null)
  const [isSignup, setIsSignup] = useState(false)
  const [notification, setNotification] = useState(null)

  // Data State
  const [plants, setPlants] = useState([])
  const [selectedPlant, setSelectedPlant] = useState('')
  const [sections, setSections] = useState([])
  const [selectedSection, setSelectedSection] = useState(null)
  const [history, setHistory] = useState([])
  const [results, setResults] = useState(null)
  const [gateResults, setGateResults] = useState(null)
  const [loading, setLoading] = useState(false)

  const showNotify = (message, type = 'info') => setNotification({ message, type })

  useEffect(() => {
    if (user) setView('home')
    else setView('auth')
  }, [user])

  const fetchPlants = async () => {
    try {
      const res = await axios.get(`${API_URL}/plants`)
      setPlants(res.data)
    } catch (err) {
      showNotify('Server connection error. Check API URL.', 'error')
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    const email = e.target.email.value
    const password = e.target.password.value
    try {
      const res = await axios.post(`${API_URL}/login`, { email, password })
      setUser(res.data.user)
      showNotify('Welcome back, ' + email.split('@')[0])
    } catch (err) {
      showNotify(err.response?.data?.error || 'Authentication failed', 'error')
    }
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    const email = e.target.email.value
    const password = e.target.password.value
    try {
      await axios.post(`${API_URL}/signup`, { email, password })
      showNotify('Account created! Sign in to continue.')
      setIsSignup(false)
    } catch (err) {
      showNotify(err.response?.data?.error || 'Registration failed', 'error')
    }
  }

  const handleLogout = () => {
    setUser(null)
    setView('auth')
    setSelectedSection(null)
    setResults(null)
    setGateResults(null)
  }

  // View Transitions
  const pageVariants = {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.02 }
  }

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <AnimatePresence>
        {notification && (
          <Notification
            {...notification}
            onClear={() => setNotification(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {view === 'auth' && (
          <motion.div key="auth" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="glass" style={{ width: '100%', maxWidth: 420, padding: 40, marginTop: '10vh' }}>
            <div style={{ textAlign: 'center', marginBottom: 35 }}>
              <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'white', border: '1px solid var(--border)' }}>
                <Database size={32} />
              </div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>{isSignup ? 'New Account' : 'Security Portal'}</h1>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Smart Plant & Material Tracking</p>
            </div>

            <form onSubmit={isSignup ? handleSignup : handleLogin}>
              <div className="input-group">
                <label>Email ID</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: 14, top: 16, color: 'var(--text-dim)' }} />
                  <input type="email" name="email" required placeholder="admin@system.com" style={{ paddingLeft: 42 }} />
                </div>
              </div>
              <div className="input-group">
                <label>Access Pin / Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: 14, top: 16, color: 'var(--text-dim)' }} />
                  <input type="password" name="password" required placeholder="••••••••" style={{ paddingLeft: 42 }} />
                </div>
              </div>
              <button type="submit" className="btn" style={{ width: '100%', marginTop: 15, fontSize: '1.1rem' }}>
                {isSignup ? 'Enroll Now' : 'Authorize Access'}
                <ChevronRight size={20} />
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 28, fontSize: '0.9rem', color: 'var(--text-dim)' }}>
              {isSignup ? 'Already registered?' : 'Need system access?'}{' '}
              <span
                style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 700 }}
                onClick={() => setIsSignup(!isSignup)}
              >
                {isSignup ? 'Login' : 'Signup'}
              </span>
            </p>
          </motion.div>
        )}

        {view === 'home' && (
          <motion.div key="home" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ width: '100%', maxWidth: 1000, textAlign: 'center', paddingBottom: 50 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 60, marginTop: 40 }}>
              <div style={{ textAlign: 'left' }}>
                <h1 style={{ fontSize: '2.8rem', fontWeight: 800, letterSpacing: '-1px', marginBottom: 5 }}>Inventory Vision AI</h1>
                <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem' }}>CCTV Raw Material & Logistics Management</p>
              </div>
              <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '10px 15px', borderRadius: 15 }}>
                <LogOut size={18} /> Exit
              </button>
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 30 }}>
              <div className="glass" style={{ padding: 40, cursor: 'pointer', transition: 'transform 0.3s' }} onClick={() => setView('setup')}>
                <div style={{ width: 60, height: 60, borderRadius: 18, background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 25px', boxShadow: '0 8px 15px rgba(79, 70, 229, 0.4)' }}>
                  <Settings size={28} color="white" />
                </div>
                <h2 style={{ marginBottom: 12, fontSize: '1.4rem' }}>Infrastructure</h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', lineHeight: 1.5 }}>Setup plants, sections & pit dimensions</p>
              </div>

              <div className="glass" style={{ padding: 40, cursor: 'pointer', transition: 'transform 0.3s' }} onClick={async () => { await fetchPlants(); setView('monitor'); }}>
                <div style={{ width: 60, height: 60, borderRadius: 18, background: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 25px', boxShadow: '0 8px 15px rgba(168, 85, 247, 0.4)' }}>
                  <LayoutDashboard size={28} color="white" />
                </div>
                <h2 style={{ marginBottom: 12, fontSize: '1.4rem' }}>Scan Dashboard</h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', lineHeight: 1.5 }}>Live volume calculation & CCTV analysis</p>
              </div>

              <div className="glass" style={{ padding: 40, cursor: 'pointer', transition: 'transform 0.3s' }} onClick={() => setView('gateDetect')}>
                <div style={{ width: 60, height: 60, borderRadius: 18, background: '#ec4899', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 25px', boxShadow: '0 8px 15px rgba(236, 72, 153, 0.4)' }}>
                  <ScanLine size={28} color="white" />
                </div>
                <h2 style={{ marginBottom: 12, fontSize: '1.4rem' }}>Gate Logistics</h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', lineHeight: 1.5 }}>YOLO Detection for incoming materials</p>
              </div>
            </div>
          </motion.div>
        )}

        {view === 'setup' && (
          <motion.div key="setup" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="glass" style={{ width: '100%', maxWidth: 650, padding: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 35 }}>
              <button onClick={() => setView('home')} className="btn btn-secondary" style={{ padding: 12, borderRadius: 14 }}><ArrowLeft size={20} /></button>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Infrastructure Setup</h2>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault()
              const formData = new FormData(e.target)
              const data = Object.fromEntries(formData)
              setLoading(true)
              try {
                await axios.post(`${API_URL}/contractor`, {
                  plantName: data.plant_name,
                  section: data.section,
                  material: data.material,
                  length: parseFloat(data.length),
                  width: parseFloat(data.width),
                  pitDepth: parseFloat(data.pit_depth),
                  density: parseFloat(data.density)
                })
                showNotify('Section Infrastructure recorded!')
                e.target.reset()
              } catch (err) { showNotify('Configuration failed', 'error') }
              finally { setLoading(false) }
            }}>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="input-group"><label>Plant ID / Name</label><input name="plant_name" required placeholder="e.g. Unit 4" /></div>
                <div className="input-group"><label>Section Name</label><input name="section" required placeholder="e.g. Bay A" /></div>
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="input-group"><label>Pit Height (m)</label><input type="number" step="0.01" name="pit_depth" required placeholder="5.0" /></div>
                <div className="input-group"><label>Pit Breadth (m)</label><input type="number" step="0.01" name="width" required placeholder="6.5" /></div>
              </div>
              <div className="input-group"><label>Section Length (m)</label><input type="number" step="0.01" name="length" required placeholder="12.0" /></div>
              <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
                <div className="input-group">
                  <label>Material Profiling</label>
                  <select name="material" required>
                    <option value="10mm">10mm Aggregate</option>
                    <option value="20mm">20mm Aggregate</option>
                    <option value="coarse_sand">Coarse Sand</option>
                    <option value="fine_sand">Natural/Fine Sand</option>
                  </select>
                </div>
                <div className="input-group"><label>Density (kg/m³)</label><input type="number" name="density" defaultValue="1600" /></div>
              </div>
              <button type="submit" className="btn" disabled={loading} style={{ width: '100%', padding: 15, borderRadius: 15, fontSize: '1.05rem', marginTop: 10 }}>
                {loading ? 'Processing...' : <><PlusCircle size={20} /> Register Section</>}
              </button>
            </form>
          </motion.div>
        )}

        {view === 'monitor' && (
          <motion.div key="monitor" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="glass" style={{ width: '100%', maxWidth: 900, padding: 45 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 40 }}>
              <button onClick={() => setView('home')} className="btn btn-secondary" style={{ padding: 12, borderRadius: 14 }}><ArrowLeft size={20} /></button>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 700 }}>Scan Dashboard</h2>
            </div>

            <div className="input-group">
              <label>Select Deployment Plant</label>
              <select onChange={async (e) => {
                const name = e.target.value
                setSelectedPlant(name)
                setLoading(true)
                try {
                  const res = await axios.get(`${API_URL}/sections/${encodeURIComponent(name)}`)
                  setSections(res.data)
                } finally { setLoading(false) }
              }}>
                <option value="">Choose Site location</option>
                {plants.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {loading && <p style={{ textAlign: 'center', margin: '20px 0', color: 'var(--primary)' }}>Syncing with server...</p>}

            {sections.length > 0 && (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', marginTop: 35, gap: 20 }}>
                {sections.map(s => (
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} key={s.id} className="glass" style={{ padding: 25, textAlign: 'center', cursor: 'pointer', borderColor: selectedSection?.id === s.id ? 'var(--primary)' : '', background: selectedSection?.id === s.id ? 'rgba(139, 92, 246, 0.1)' : '' }}
                    onClick={async () => {
                      setSelectedSection(s)
                      try {
                        const res = await axios.get(`${API_URL}/stats/${s.id}`)
                        setHistory(res.data)
                      } catch (e) { showNotify('Error fetching history', 'error') }
                    }}
                  >
                    <h3 style={{ marginBottom: 10, fontSize: '1.2rem' }}>{s.section}</h3>
                    <div style={{ fontSize: '0.75rem', color: 'white', background: 'var(--primary)', padding: '4px 12px', borderRadius: 20, display: 'inline-block', fontWeight: 600 }}>{s.material}</div>
                  </motion.div>
                ))}
              </div>
            )}

            {selectedSection && (
              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 50, padding: 35, background: 'rgba(255,255,255,0.03)', borderRadius: 28, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 35 }}>
                  <div>
                    <h3 style={{ fontSize: '1.5rem', marginBottom: 8 }}>Section: {selectedSection.section}</h3>
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.95rem' }}>{selectedSection.plant_name} Dashboard</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 5 }}>Material Density</div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{selectedSection.density} <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>kg/m³</span></div>
                  </div>
                </div>

                <button className="btn" style={{ width: '100%', height: 60, fontSize: '1.2rem', borderRadius: 18 }} onClick={() => setView('results')}>
                  <Camera size={24} /> Trigger CCTV Analysis
                </button>

                <div style={{ marginTop: 50 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <History size={20} color="var(--primary)" />
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Telemetry Logs</h4>
                  </div>

                  {history.length === 0 ? <p style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center', background: 'rgba(0,0,0,0.1)', borderRadius: 15 }}>No historical data found for this section</p> : (
                    <div className="grid" style={{ gap: 12 }}>
                      {history.map(h => (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: 15, border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{new Date(h.timestamp).toLocaleDateString()}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Load Weight</div>
                            <strong style={{ color: 'var(--primary)', fontSize: '1.1rem' }}>{h.weight_ton} <span style={{ fontSize: '0.8rem' }}>T</span></strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {view === 'results' && (
          <motion.div key="results" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="glass" style={{ width: '100%', maxWidth: 1050, padding: 45 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 40 }}>
              <button onClick={() => setView('monitor')} className="btn btn-secondary" style={{ padding: 12, borderRadius: 14 }}><ArrowLeft size={20} /></button>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 700 }}>CV Volumetric Analysis</h2>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1.2fr 1.8fr', gap: 40 }}>
              <div>
                <label style={{ marginBottom: 15, display: 'block' }}>Simulate CCTV Feed</label>
                <div style={{ border: '2px dashed var(--border)', borderRadius: 28, padding: 45, textAlign: 'center', background: 'rgba(255,255,255,0.02)', transition: 'all 0.3s' }} onDragOver={(e) => e.preventDefault()}>
                  <input type="file" accept="image/*" onChange={(e) => {
                    const file = e.target.files[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onload = async (ev) => {
                        const base64 = ev.target.result
                        setLoading(true)
                        try {
                          const res = await axios.post(`${API_URL}/process-image`, {
                            image: base64,
                            material: selectedSection.material,
                            density: selectedSection.density,
                            wall_height: selectedSection.pit_depth,
                            pit_width: selectedSection.width,
                            section_breadth: selectedSection.length
                          })
                          setResults({ ...res.data, original: base64 })
                          showNotify('Processing logic: GrabCut + Slice calculation active')
                        } catch (err) { showNotify('Vision Server error', 'error') }
                        finally { setLoading(false) }
                      }
                      reader.readAsDataURL(file)
                    }
                  }} style={{ display: 'none' }} id="cam-input" />
                  <label htmlFor="cam-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                      <Camera size={38} color="var(--primary)" />
                    </div>
                    <p style={{ fontWeight: 600, color: 'var(--text)' }}>Choose Image</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 8 }}>JPG, PNG up to 10MB</p>
                  </label>
                </div>
              </div>

              <div style={{ borderRadius: 28, overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', border: '1px solid var(--border)' }}>
                {results ? <img src={results.original} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : loading ? <div className="loader">Analyzing...</div> : (
                  <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
                    <LayoutDashboard size={40} style={{ opacity: 0.2, marginBottom: 15 }} />
                    <p>Awaiting snapshot input...</p>
                  </div>
                )}
              </div>
            </div>

            {results && (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} style={{ marginTop: 50 }}>
                <h3 style={{ fontSize: '1.4rem', marginBottom: 25, fontWeight: 700 }}>Computed Fragment Values</h3>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 40 }}>
                  <div className="glass" style={{ padding: 30, textAlign: 'center', background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 10 }}>Frontal Area</div>
                    <div style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--text)' }}>{results.frontal_area}<span style={{ fontSize: '1.2rem', opacity: 0.5 }}> m²</span></div>
                  </div>
                  <div className="glass" style={{ padding: 30, textAlign: 'center', background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 10 }}>Est. Volume</div>
                    <div style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--text)' }}>{results.volume}<span style={{ fontSize: '1.2rem', opacity: 0.5 }}> m³</span></div>
                  </div>
                  <div className="glass" style={{ padding: 30, textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderColor: 'var(--primary)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--primary)', marginBottom: 10, fontWeight: 700 }}>Total Mass</div>
                    <div style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--primary)' }}>{results.weight_ton}<span style={{ fontSize: '1.2rem' }}> T</span></div>
                  </div>
                </div>

                <div className="grid" style={{ gridTemplateColumns: '1fr 2fr', gap: 25 }}>
                  <div className="input-group">
                    <label style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)', marginBottom: 12 }}>Vision Path Mask</label>
                    <div className="glass" style={{ borderRadius: 18, overflow: 'hidden', border: '1px solid var(--primary-glow)' }}>
                      <img src={`data:image/jpeg;base64,${results.mask}`} style={{ width: '100%', display: 'block' }} />
                    </div>
                  </div>
                  <div className="input-group">
                    <label style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)', marginBottom: 12 }}>Edge Analysis (Blur/Sobel)</label>
                    <div className="glass" style={{ borderRadius: 18, overflow: 'hidden', height: '100%', maxHeight: 315 }}>
                      <img src={`data:image/jpeg;base64,${results.blur}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                  </div>
                </div>

                <button className="btn" disabled={loading} style={{ width: '100%', height: 65, marginTop: 40, fontSize: '1.25rem', borderRadius: 20 }} onClick={async () => {
                  setLoading(true)
                  try {
                    await axios.post(`${API_URL}/user`, {
                      section_id: selectedSection.id,
                      volume: results.volume,
                      weight_ton: results.weight_ton,
                      frontal_area: results.frontal_area,
                      img_original: results.original || '',
                      img_grayscale: results.grayscale || '',
                      img_blur: results.blur || '',
                      img_mask: results.mask || ''
                    })
                    showNotify('Log captured & encrypted in database')
                    setView('monitor')
                    setResults(null)
                  } catch (err) { showNotify('Ledger commit failed', 'error') }
                  finally { setLoading(false) }
                }}>
                  <UploadCloud size={24} /> {loading ? 'Committing...' : 'Commit to Site Ledger'}
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        {view === 'gateDetect' && (
          <motion.div key="gateDetect" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="glass" style={{ width: '100%', maxWidth: 1000, padding: 45 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                <button onClick={() => setView('home')} className="btn btn-secondary" style={{ padding: 12, borderRadius: 14 }}><ArrowLeft size={20} /></button>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 700 }}>Gate Material Recognition</h2>
              </div>
              <div style={{ background: 'rgba(236, 72, 153, 0.1)', padding: '8px 16px', borderRadius: 12, border: '1px solid rgba(236, 72, 153, 0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={18} color="#ec4899" />
                <span style={{ fontSize: '0.9rem', color: '#ec4899', fontWeight: 700 }}>AI Safeguard Active</span>
              </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 40 }}>
              <div>
                <label style={{ marginBottom: 15, display: 'block' }}>Entry Guard CCTV</label>
                <div style={{ border: '2px dashed var(--border)', borderRadius: 28, padding: 45, textAlign: 'center', background: 'rgba(255,255,255,0.02)' }}>
                  <input type="file" accept="image/*" onChange={(e) => {
                    const file = e.target.files[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onload = async (ev) => {
                        const base64 = ev.target.result
                        setLoading(true)
                        setGateResults(null)
                        try {
                          const res = await axios.post(`${API_URL}/detect-gate-material`, { image: base64 })
                          setGateResults(res.data)
                          if (!res.data.detections || res.data.detections.length === 0) {
                            showNotify('No distinct material detected', 'info')
                          } else {
                            showNotify(`AI identified: ${res.data.detections[0].class}`)
                          }
                        } catch (err) { showNotify('Gate AI link lost', 'error') }
                        finally { setLoading(false) }
                      }
                      reader.readAsDataURL(file)
                    }
                  }} style={{ display: 'none' }} id="gate-cam-input" />
                  <label htmlFor="gate-cam-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(236, 72, 153, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                      <ScanLine size={38} color="#ec4899" />
                    </div>
                    <p style={{ fontWeight: 600, color: 'var(--text)' }}>Monitor Entry</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 8 }}>Capture Truck Load Image</p>
                  </label>
                </div>
              </div>

              <div style={{ borderRadius: 28, overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', border: '1px solid var(--border)', minHeight: 400 }}>
                {gateResults ? (
                  <img src={`data:image/jpeg;base64,${gateResults.image_with_bboxes}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : loading ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 40, height: 40, border: '4px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 15px' }}></div>
                    <p style={{ color: 'var(--primary)', fontWeight: 600 }}>Analyzing Load...</p>
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-dim)' }}>Ready for entry scan...</p>
                )}
              </div>
            </div>

            {gateResults && gateResults.detections && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 45 }}>
                <h3 style={{ fontSize: '1.4rem', marginBottom: 25, fontWeight: 700 }}>AI Inference Results</h3>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
                  {gateResults.detections.length === 0 ? (
                    <div className="glass" style={{ padding: 25, textAlign: 'center', gridColumn: '1/-1' }}>
                      <AlertCircle size={30} color="var(--text-dim)" style={{ marginBottom: 15 }} />
                      <p style={{ color: 'var(--text-dim)' }}>Low confidence detection. No clear material class identified.</p>
                    </div>
                  ) : (
                    gateResults.detections.map((det, i) => (
                      <div key={i} className="glass" style={{ padding: 25, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '5px solid #ec4899' }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 5 }}>Detected Material</div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 800, textTransform: 'capitalize' }}>{det.class}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 5 }}>Confidence</div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ec4899' }}>{det.confidence}%</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ marginTop: 40, display: 'flex', gap: 15 }}>
                  <button className="btn" style={{ flex: 1, height: 50, borderRadius: 15 }} onClick={() => {
                    showNotify('Material Dispatch Authorized')
                    setGateResults(null)
                  }}>Approve Entry</button>
                  <button className="btn btn-secondary" style={{ flex: 1, height: 50, borderRadius: 15, borderColor: '#f43f5e', color: '#f43f5e' }} onClick={() => setGateResults(null)}>Reject Load</button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .loader { color: var(--primary); font-weight: bold; }
        .input-group label { text-transform: uppercase; letter-spacing: 1px; font-weight: 700; opacity: 0.8; }
        input, select { font-family: 'Outfit', sans-serif; font-size: 1rem; }
        .glass:hover { border-color: var(--primary-glow); }
      `}</style>
    </div>
  )
}
