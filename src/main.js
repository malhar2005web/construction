import './style.css'

const app = document.querySelector('#app')
const API_URL = 'http://localhost:5000/api'

const state = {
  view: 'home',
  plants: [],
  selectedPlantSections: [],
  selectedSectionData: null,
  currentUserData: null,
  results: null,
  history: []
}

async function fetchPlants() {
  try {
    const res = await fetch(`${API_URL}/plants`)
    state.plants = await res.json()
  } catch (err) {
    console.error('Error fetching plants:', err)
  }
}

async function fetchSections(plantName) {
  try {
    const res = await fetch(`${API_URL}/sections/${encodeURIComponent(plantName)}`)
    state.selectedPlantSections = await res.json()
  } catch (err) {
    console.error('Error fetching sections:', err)
  }
}

async function fetchHistory(sectionId) {
  try {
    const res = await fetch(`${API_URL}/stats/${sectionId}`)
    state.history = await res.json()
  } catch (err) {
    console.error('Error fetching history:', err)
  }
}

function render() {
  if (state.view === 'home') {
    app.innerHTML = `
      <div class="container fade-in">
        <h1>Plant Management System</h1>
        <p>CCTV Vision-Based Inventory Monitoring</p>
        <div class="role-selector">
          <div class="glass-card role-card" id="btn-contractor">
            <i data-lucide="settings"></i>
            <div>
              <h2>Setup Portal</h2>
              <p>Configure plants, sections & materials</p>
            </div>
          </div>
          <div class="glass-card role-card" id="btn-user">
            <i data-lucide="layout-dashboard"></i>
            <div>
              <h2>Monitoring Dashboard</h2>
              <p>View live volumes & CCTV analysis</p>
            </div>
          </div>
        </div>
      </div>
    `
  } else if (state.view === 'contractor') {
    app.innerHTML = `
      <div class="container fade-in">
        <div class="glass-card">
          <div class="form-title">
            <button id="btn-back"><i data-lucide="arrow-left"></i></button>
            <h2>Infrastructure Setup</h2>
          </div>
          <form id="contractor-form">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                <label>Plant Name</label>
                <input type="text" id="plant-name" placeholder="e.g. Unit 1" required>
                </div>
                <div class="form-group">
                <label>Section ID/Name</label>
                <input type="text" id="section" placeholder="e.g. Pit A1" required>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                <label>Wall Height (m)</label>
                <input type="number" id="pit-depth" placeholder="0.00" step="0.01" required>
                </div>
                <div class="form-group">
                <label>Pit Width (m)</label>
                <input type="number" id="width" placeholder="0.00" step="0.01" required>
                </div>
            </div>

            <div class="form-group">
                <label>Section Total Length (m)</label>
                <input type="number" id="length" placeholder="0.00" step="0.01" required>
            </div>

            <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 1rem;">
                <div class="form-group">
                <label>Assigned Material</label>
                <select id="material" required>
                    <option value="" disabled selected>Select</option>
                    <option value="10mm">10mm Aggregate</option>
                    <option value="20mm">20mm Aggregate</option>
                    <option value="coarse_sand">Coarse Sand</option>
                    <option value="fine_sand">Natural/Fine Sand</option>
                </select>
                </div>
                <div class="form-group">
                <label>Default Density (kg/m³)</label>
                <input type="number" id="density" placeholder="1600" required>
                </div>
            </div>
            
            <button type="submit" class="btn">
              <i data-lucide="plus-circle"></i> Add Section
            </button>
          </form>
        </div>
      </div>
    `
  } else if (state.view === 'user') {
    app.innerHTML = `
      <div class="container fade-in">
        <div class="glass-card" style="max-width: 800px;">
          <div class="form-title">
            <button id="btn-back"><i data-lucide="arrow-left"></i></button>
            <h2>Monitoring Dashboard</h2>
          </div>
          
          <div class="form-group">
            <label>Select Plant to Monitor</label>
            <select id="user-plant" required>
                <option value="" disabled selected>Choose Plant</option>
                ${state.plants.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
          </div>

          <div id="sections-grid" class="grid-3 hidden" style="margin-top: 2rem;">
            <!-- Sections populated here -->
          </div>

          <div id="monitoring-action" class="hidden" style="margin-top: 2rem; padding: 2rem; border: 1px solid var(--border); border-radius: 12px; background: rgba(255,255,255,0.02);">
             <h3 id="monitored-section-name">Section Details</h3>
             <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                <div><strong>Material:</strong> <span id="mon-material">-</span></div>
                <div><strong>Density:</strong> <span id="mon-density">-</span></div>
             </div>
             <button id="btn-process-cctv" class="btn" style="width: 100%;">
                <i data-lucide="camera"></i> Process CCTV Snapshot
             </button>

             <div id="history-section" style="margin-top: 2rem;">
                <h4>Recent Measurements</h4>
                <div id="history-list" style="font-size: 0.9rem;">
                  <!-- History log -->
                </div>
             </div>
          </div>
        </div>
      </div>
    `
  } else if (state.view === 'results') {
    app.innerHTML = `
      <div class="container fade-in" style="max-width: 1000px;">
        <div class="glass-card" style="max-width: 1000px; width: 100%;">
          <div class="form-title">
            <button id="btn-back-user"><i data-lucide="arrow-left"></i></button>
            <h2>CCTV Fragment Analysis</h2>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            <div class="form-group">
               <label>Upload CCTV Image (Simulation)</label>
               <input type="file" id="image-upload" accept="image/*" style="padding: 2rem; border: 2px dashed var(--border); background: rgba(255,255,255,0.02); text-align: center;">
            </div>
            <div id="file-preview" style="display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); border-radius: 12px; overflow: hidden; min-height: 200px;">
              <p style="color: rgba(255,255,255,0.4);">Awaiting Snapshot...</p>
            </div>
          </div>

          <div id="processing-results" class="${state.results ? '' : 'hidden'}" style="margin-top: 3rem;">
            <h3>Calculated Values</h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 2rem;">
               <div class="glass-card" style="padding: 1.5rem; text-align: center;">
                 <span style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Area Coverage</span>
                 <h2 style="margin: 0;">${state.results?.frontal_area || '0.00'} m²</h2>
               </div>
               <div class="glass-card" style="padding: 1.5rem; text-align: center;">
                 <span style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Calculated Volume</span>
                 <h2 style="margin: 0;">${state.results?.volume || '0.00'} m³</h2>
               </div>
               <div class="glass-card" style="padding: 1.5rem; text-align: center; border-color: var(--primary);">
                 <span style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Stock Weight</span>
                 <h2 style="margin: 0;">${state.results?.weight_ton || '0.00'} T</h2>
               </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
               <div class="form-group">
                 <label>Vision Mask</label>
                 <div class="glass-card" style="padding: 0; overflow: hidden;"><img ${state.results?.mask ? `src="data:image/jpeg;base64,${state.results.mask}"` : ''} style="width: 100%;"></div>
               </div>
               <div class="form-group" style="grid-column: span 2;">
                 <label>Detection Overlay (Gaussian)</label>
                 <div class="glass-card" style="padding: 0; overflow: hidden;"><img ${state.results?.blur ? `src="data:image/jpeg;base64,${state.results.blur}"` : ''} style="width: 100%; height: 150px; object-fit: cover;"></div>
               </div>
            </div>

            <button id="btn-final-save" class="btn" style="width: 100%; margin-top: 2rem;">
               <i data-lucide="upload-cloud"></i> Log This Measurement
            </button>
          </div>
        </div>
      </div>
    `
  }

  lucide.createIcons()
  setupEventListeners()
}

function setupEventListeners() {
  const btnContractor = document.querySelector('#btn-contractor')
  const btnUser = document.querySelector('#btn-user')
  const btnBack = document.querySelector('#btn-back')
  const btnBackUser = document.querySelector('#btn-back-user')
  const contractorForm = document.querySelector('#contractor-form')

  const userPlantSelect = document.querySelector('#user-plant')
  const imageUpload = document.querySelector('#image-upload')
  const btnFinalSave = document.querySelector('#btn-final-save')
  const btnProcessCctv = document.querySelector('#btn-process-cctv')

  if (btnContractor) {
    btnContractor.onclick = () => {
      gsap.to('.container', {
        opacity: 0, y: -20, duration: 0.3, onComplete: () => {
          state.view = 'contractor'
          render()
        }
      })
    }
  }

  if (btnUser) {
    btnUser.onclick = async () => {
      await fetchPlants()
      gsap.to('.container', {
        opacity: 0, y: -20, duration: 0.3, onComplete: () => {
          state.view = 'user'
          render()
        }
      })
    }
  }

  if (btnBack) {
    btnBack.onclick = () => {
      gsap.to('.container', {
        opacity: 0, y: 20, duration: 0.3, onComplete: () => {
          state.view = 'home'
          render()
        }
      })
    }
  }

  if (btnBackUser) {
    btnBackUser.onclick = () => {
      state.results = null
      state.view = 'user'
      render()
    }
  }

  if (userPlantSelect) {
    userPlantSelect.onchange = async (e) => {
      const plantName = e.target.value
      await fetchSections(plantName)
      const grid = document.querySelector('#sections-grid')
      grid.classList.remove('hidden')
      grid.innerHTML = state.selectedPlantSections.map(s => `
        <div class="glass-card section-thumb" data-id="${s.id}" style="cursor: pointer; padding: 1rem; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
           <h4 style="margin: 0 0 0.5rem 0;">${s.section}</h4>
           <span style="font-size: 0.8rem; background: var(--primary); padding: 2px 8px; border-radius: 10px;">${s.material}</span>
        </div>
      `).join('')

      document.querySelectorAll('.section-thumb').forEach(div => {
        div.onclick = async () => {
          const id = div.dataset.id
          state.selectedSectionData = state.selectedPlantSections.find(s => s.id == id)
          document.querySelector('#monitoring-action').classList.remove('hidden')
          document.querySelector('#monitored-section-name').innerText = `Monitoring: ${state.selectedSectionData.section}`
          document.querySelector('#mon-material').innerText = state.selectedSectionData.material
          document.querySelector('#mon-density').innerText = `${state.selectedSectionData.density} kg/m³`

          await fetchHistory(id)
          const historyList = document.querySelector('#history-list')
          if (state.history.length === 0) {
            historyList.innerHTML = '<p style="color: grey;">No history found</p>'
          } else {
            historyList.innerHTML = state.history.map(h => `
                    <div style="display:flex; justify-content:space-between; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <span>${new Date(h.timestamp).toLocaleString()}</span>
                        <strong>${h.weight_ton} T</strong>
                    </div>
                 `).join('')
          }
        }
      })
    }
  }

  if (btnProcessCctv) {
    btnProcessCctv.onclick = () => {
      gsap.to('.container', {
        opacity: 0, x: -50, duration: 0.3, onComplete: () => {
          state.view = 'results'
          render()
        }
      })
    }
  }

  if (imageUpload) {
    imageUpload.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = async (event) => {
          const base64Image = event.target.result
          document.querySelector('#file-preview').innerHTML = `<img src="${base64Image}" style="width: 100%;">`

          showNotification('Analyzing snapshot...')
          try {
            const res = await fetch(`${API_URL}/process-image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                image: base64Image,
                material: state.selectedSectionData.material,
                density: state.selectedSectionData.density,
                wall_height: state.selectedSectionData.pit_depth,
                pit_width: state.selectedSectionData.width,
                section_breadth: state.selectedSectionData.length
              })
            })
            if (res.ok) {
              state.results = await res.json()
              showNotification('CCTV Analysis Ready!')
              render()
            }
          } catch (err) {
            showNotification('Image Analysis failed', 'error')
          }
        }
        reader.readAsDataURL(file)
      }
    }
  }

  if (btnFinalSave) {
    btnFinalSave.onclick = async () => {
      try {
        const res = await fetch(`${API_URL}/user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            section_id: state.selectedSectionData.id,
            volume: state.results.volume,
            weight_ton: state.results.weight_ton
          })
        })
        if (res.ok) {
          showNotification('Weight log stored successfully!')
          state.view = 'user'
          state.results = null
          render()
        }
      } catch (err) {
        showNotification('Database entry failed', 'error')
      }
    }
  }

  if (contractorForm) {
    contractorForm.onsubmit = async (e) => {
      e.preventDefault()
      const data = {
        plantName: document.querySelector('#plant-name').value,
        section: document.querySelector('#section').value,
        material: document.querySelector('#material').value,
        length: parseFloat(document.querySelector('#length').value),
        width: parseFloat(document.querySelector('#width').value),
        pitDepth: parseFloat(document.querySelector('#pit-depth').value),
        density: parseFloat(document.querySelector('#density').value),
      }

      try {
        const res = await fetch(`${API_URL}/contractor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        if (res.ok) {
          showNotification('Section added successfully!')
          contractorForm.reset()
        }
      } catch (err) {
        showNotification('Setup failed', 'error')
      }
    }
  }
}

function showNotification(msg, type = 'info') {
  const notify = document.createElement('div')
  notify.className = 'glass-card fade-in'
  notify.style.position = 'fixed'
  notify.style.bottom = '20px'
  notify.style.right = '20px'
  notify.style.padding = '1rem 2rem'
  notify.style.zIndex = '1000'
  notify.style.maxWidth = '300px'
  notify.style.borderLeft = `4px solid ${type === 'error' ? 'var(--accent)' : 'var(--primary)'}`
  notify.innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><i data-lucide="${type === 'error' ? 'alert-circle' : 'info'}"></i> ${msg}</div>`
  document.body.appendChild(notify)
  lucide.createIcons()

  setTimeout(() => {
    gsap.to(notify, { opacity: 0, y: 20, duration: 0.5, onComplete: () => notify.remove() })
  }, 3000)
}

render()
