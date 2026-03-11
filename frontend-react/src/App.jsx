import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, LayoutDashboard, ArrowLeft, PlusCircle,
  Camera, UploadCloud, LogOut, Mail, Lock,
  ChevronRight, AlertCircle, Info, Database
} from 'lucide-react'

const API_URL = 'http://localhost:5000/api'

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
        zIndex: 1000, maxWidth: 300,
        borderLeft: `4px solid ${type === 'error' ? '#f43f5e' : '#8b5cf6'}`,
        display: 'flex', alignItems: 'center', gap: 10
      }}
    >
      {type === 'error' ? <AlertCircle size={20} /> : <Info size={20} />}
      <span style={{ fontSize: '0.9rem' }}>{message}</span>
    </motion.div>
  )
}

// --- Main App ---

export default function App() {
  const [view, setView] = useState('auth') // auth, home, setup, monitor, results
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
      showNotify('Failed to fetch plants', 'error')
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    const email = e.target.email.value
    const password = e.target.password.value
    try {
      const res = await axios.post(`${API_URL}/login`, { email, password })
      setUser(res.data.user)
      showNotify('Login Successful!')
    } catch (err) {
      showNotify(err.response?.data?.error || 'Login failed', 'error')
    }
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    const email = e.target.email.value
    const password = e.target.password.value
    try {
      await axios.post(`${API_URL}/signup`, { email, password })
      showNotify('Account created! Please login.')
      setIsSignup(false)
    } catch (err) {
      showNotify(err.response?.data?.error || 'Signup failed', 'error')
    }
  }

  const handleLogout = () => {
    setUser(null)
    setView('auth')
  }

  // View Transitions
  const pageVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  }

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh' }}>
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
          <motion.div key="auth" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="glass fade-in" style={{ width: '100%', maxWidth: 400, padding: 40, marginTop: '10vh' }}>
            <div style={{ textAlign: 'center', marginBottom: 30 }}>
              <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--primary-glow)', display: 'flex', alignItems: 'center', justifyCenter: 'center', margin: '0 auto 20px', color: 'var(--primary)', border: '1px solid var(--border)' }}>
                <Database size={32} style={{ margin: 'auto' }} />
              </div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 700 }}>{isSignup ? 'Create Account' : 'Welcome Back'}</h1>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Plant Management System</p>
            </div>

            <form onSubmit={isSignup ? handleSignup : handleLogin}>
              <div className="input-group">
                <label>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: 14, top: 16, color: 'var(--text-dim)' }} />
                  <input type="email" name="email" required placeholder="name@company.com" style={{ paddingLeft: 42 }} />
                </div>
              </div>
              <div className="input-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: 14, top: 16, color: 'var(--text-dim)' }} />
                  <input type="password" name="password" required placeholder="••••••••" style={{ paddingLeft: 42 }} />
                </div>
              </div>
              <button type="submit" className="btn" style={{ width: '100%', marginTop: 10 }}>
                {isSignup ? 'Register' : 'Sign In'}
                <ChevronRight size={18} />
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.9rem', color: 'var(--text-dim)' }}>
              {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
              <span
                style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => setIsSignup(!isSignup)}
              >
                {isSignup ? 'Login' : 'Create one'}
              </span>
            </p>
          </motion.div>
        )}

        {view === 'home' && (
          <motion.div key="home" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ width: '100%', maxWidth: 800, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 60 }}>
              <div>
                <h1 style={{ fontSize: '2.5rem', fontWeight: 700, textAlign: 'left' }}>Plant Management System</h1>
                <p style={{ color: 'var(--text-dim)', textAlign: 'left' }}>CCTV Vision-Based Inventory Monitoring</p>
              </div>
              <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '8px 12px' }}>
                <LogOut size={18} /> Logout
              </button>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="glass" style={{ padding: 40, cursor: 'pointer' }} onClick={() => setView('setup')}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <Settings size={30} />
                </div>
                <h2 style={{ marginBottom: 10 }}>Setup Portal</h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Configure plants, sections & materials</p>
              </div>
              <div className="glass" style={{ padding: 40, cursor: 'pointer' }} onClick={async () => { await fetchPlants(); setView('monitor'); }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <LayoutDashboard size={30} />
                </div>
                <h2 style={{ marginBottom: 10 }}>Monitoring Dashboard</h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>View live volumes & CCTV analysis</p>
              </div>
            </div>
          </motion.div>
        )}

        {view === 'setup' && (
          <motion.div key="setup" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="glass" style={{ width: '100%', maxWidth: 600, padding: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 30 }}>
              <button onClick={() => setView('home')} className="btn btn-secondary" style={{ padding: 10 }}><ArrowLeft size={20} /></button>
              <h2>Infrastructure Setup</h2>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault()
              const formData = new FormData(e.target)
              const data = Object.fromEntries(formData)
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
                showNotify('Section added successfully!')
                e.target.reset()
              } catch (err) { showNotify('Setup failed', 'error') }
            }}>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="input-group"><label>Plant Name</label><input name="plant_name" required /></div>
                <div className="input-group"><label>Section ID/Name</label><input name="section" required /></div>
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="input-group"><label>Wall Height (m)</label><input type="number" step="0.01" name="pit_depth" required /></div>
                <div className="input-group"><label>Pit Width (m)</label><input type="number" step="0.01" name="width" required /></div>
              </div>
              <div className="input-group"><label>Section Total Length (m)</label><input type="number" step="0.01" name="length" required /></div>
              <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
                <div className="input-group">
                  <label>Assigned Material</label>
                  <select name="material" required>
                    <option value="10mm">10mm Aggregate</option>
                    <option value="20mm">20mm Aggregate</option>
                    <option value="coarse_sand">Coarse Sand</option>
                    <option value="fine_sand">Natural/Fine Sand</option>
                  </select>
                </div>
                <div className="input-group"><label>Density (kg/m³)</label><input type="number" name="density" defaultValue="1600" /></div>
              </div>
              <button type="submit" className="btn" style={{ width: '100%' }}><PlusCircle size={18} /> Add Section</button>
            </form>
          </motion.div>
        )}

        {view === 'monitor' && (
          <motion.div key="monitor" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="glass" style={{ width: '100%', maxWidth: 800, padding: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 30 }}>
              <button onClick={() => setView('home')} className="btn btn-secondary" style={{ padding: 10 }}><ArrowLeft size={20} /></button>
              <h2>Monitoring Dashboard</h2>
            </div>

            <div className="input-group">
              <label>Select Plant to Monitor</label>
              <select onChange={async (e) => {
                const name = e.target.value
                setSelectedPlant(name)
                const res = await axios.get(`${API_URL}/sections/${encodeURIComponent(name)}`)
                setSections(res.data)
              }}>
                <option value="">Choose Plant</option>
                {plants.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {sections.length > 0 && (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', marginTop: 30 }}>
                {sections.map(s => (
                  <div key={s.id} className="glass" style={{ padding: 20, textAlign: 'center', cursor: 'pointer', border: selectedSection?.id === s.id ? '2px solid var(--primary)' : '' }}
                    onClick={async () => {
                      setSelectedSection(s)
                      const res = await axios.get(`${API_URL}/stats/${s.id}`)
                      setHistory(res.data)
                    }}
                  >
                    <h3 style={{ marginBottom: 5 }}>{s.section}</h3>
                    <span style={{ fontSize: '0.7rem', background: 'var(--primary)', padding: '2px 8px', borderRadius: 10 }}>{s.material}</span>
                  </div>
                ))}
              </div>
            )}

            {selectedSection && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 40, padding: 30, background: 'rgba(255,255,255,0.02)', borderRadius: 20 }}>
                <h3 style={{ marginBottom: 20 }}>Monitoring: {selectedSection.section}</h3>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 30 }}>
                  <div><label>Material</label><span>{selectedSection.material}</span></div>
                  <div><label>Density</label><span>{selectedSection.density} kg/m³</span></div>
                </div>
                <button className="btn" style={{ width: '100%' }} onClick={() => setView('results')}>
                  <Camera size={20} /> Process CCTV Snapshot
                </button>

                <div style={{ marginTop: 40 }}>
                  <h4 style={{ marginBottom: 15 }}>Recent Measurements</h4>
                  {history.length === 0 ? <p style={{ color: 'var(--text-dim)' }}>No history found</p> : (
                    <div className="grid" style={{ gap: 10 }}>
                      {history.map(h => (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.9rem' }}>{new Date(h.timestamp).toLocaleString()}</span>
                          <strong style={{ color: 'var(--primary)' }}>{h.weight_ton} T</strong>
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
          <motion.div key="results" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="glass" style={{ width: '100%', maxWidth: 1000, padding: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 30 }}>
              <button onClick={() => setView('monitor')} className="btn btn-secondary" style={{ padding: 10 }}><ArrowLeft size={20} /></button>
              <h2>CCTV Fragment Analysis</h2>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label>Upload CCTV Image (Simulation)</label>
                <div style={{ border: '2px dashed var(--border)', borderRadius: 20, padding: 40, textAlign: 'center', background: 'rgba(255,255,255,0.02)' }}>
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
                        } catch (err) { showNotify('Analysis failed', 'error') }
                        finally { setLoading(false) }
                      }
                      reader.readAsDataURL(file)
                    }
                  }} style={{ display: 'none' }} id="cam-input" />
                  <label htmlFor="cam-input" style={{ cursor: 'pointer', display: 'block' }}>
                    <Camera size={40} style={{ color: 'var(--primary)', marginBottom: 15 }} />
                    <p>Click to select CCTV Snapshot</p>
                  </label>
                </div>
              </div>
              <div style={{ borderRadius: 20, overflow: 'hidden', background: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {results ? <img src={results.original} style={{ width: '100%' }} /> : loading ? <p>Processing...</p> : <p style={{ color: 'var(--text-dim)' }}>Awaiting Snapshot...</p>}
              </div>
            </div>

            {results && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 40 }}>
                <h3 style={{ marginBottom: 20 }}>Calculated Values</h3>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 30 }}>
                  <div className="glass" style={{ padding: 20, textAlign: 'center' }}>
                    <label>Area Coverage</label>
                    <h2 style={{ fontSize: '1.8rem' }}>{results.frontal_area} m²</h2>
                  </div>
                  <div className="glass" style={{ padding: 20, textAlign: 'center' }}>
                    <label>Calculated Volume</label>
                    <h2 style={{ fontSize: '1.8rem' }}>{results.volume} m³</h2>
                  </div>
                  <div className="glass" style={{ padding: 20, textAlign: 'center', borderColor: 'var(--primary)' }}>
                    <label>Stock Weight</label>
                    <h2 style={{ fontSize: '1.8rem' }}>{results.weight_ton} T</h2>
                  </div>
                </div>

                <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
                  <div>
                    <label>Vision Mask</label>
                    <div className="glass" style={{ overflow: 'hidden' }}><img src={`data:image/jpeg;base64,${results.mask}`} style={{ width: '100%' }} /></div>
                  </div>
                  <div>
                    <label>Detection Overlay (Gaussian)</label>
                    <div className="glass" style={{ overflow: 'hidden' }}><img src={`data:image/jpeg;base64,${results.blur}`} style={{ width: '100%', height: 'calc(100% - 30px)', objectFit: 'cover' }} /></div>
                  </div>
                </div>

                <button className="btn" style={{ width: '100%', marginTop: 30 }} onClick={async () => {
                  try {
                    await axios.post(`${API_URL}/user`, {
                      section_id: selectedSection.id,
                      volume: results.volume,
                      weight_ton: results.weight_ton
                    })
                    showNotify('Measurement logged successfully!')
                    setView('monitor')
                  } catch (err) { showNotify('Failed to save log', 'error') }
                }}>
                  <UploadCloud size={20} /> Log This Measurement
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
