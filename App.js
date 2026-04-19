import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ScrollView, Image, ActivityIndicator, Alert, Dimensions,
  SafeAreaView, Platform, StatusBar, Modal, Animated
} from 'react-native';
import axios from 'axios';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Settings, LayoutDashboard, ArrowLeft, PlusCircle,
  Camera, UploadCloud, LogOut, Mail, Lock,
  ChevronRight, Database, Factory, Layers,
  Boxes, Scale, Zap, Eye, BookOpen, Plus,
  CheckCircle, X, FlaskConical, Package
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

const { width, height } = Dimensions.get('window');

// ─── API CONFIG ────────────────────────────────────────────────────────────────
const DEFAULT_DEV_API_URL = 'http://127.0.0.1:8000/api';

const normalizeApiUrl = (value) => {
  if (!value) return null;

  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const getConfiguredApiUrl = () => {
  const extra = Constants.expoConfig?.extra ?? Constants.manifest2?.extra ?? {};
  return normalizeApiUrl(extra.apiBaseUrl || process.env.EXPO_PUBLIC_API_URL);
};

const getBaseUrl = () => {
  const configuredUrl = getConfiguredApiUrl();
  if (configuredUrl) return configuredUrl;
  return DEFAULT_DEV_API_URL;
};
const API_URL = getBaseUrl();
const SESSION_FILE_PATH = `${FileSystem.documentDirectory}construction-session.json`;

const formatApiError = (err) => {
  const backendError = err?.response?.data?.error;
  if (backendError) return backendError;
  const backendDetails = err?.response?.data?.details;
  if (backendDetails) return backendDetails;
  const responsePayload = err?.response?.data;
  if (typeof responsePayload === 'string' && responsePayload.trim()) return responsePayload;
  if (responsePayload && typeof responsePayload === 'object') return JSON.stringify(responsePayload);
  if (err?.message) return err.message;
  return 'Server error';
};

axios.interceptors.request.use(config => {
  config.headers['Bypass-Tunnel-Reminder'] = 'true';
  config.headers['User-Agent'] = 'VisionInventoryApp';
  return config;
});

// ─── DEFAULT MATERIAL LIBRARY (names only — density entered separately) ──────────
const DEFAULT_MATERIALS = [
  { name: 'Coarse Sand' },
  { name: '20mm Aggregate' },
  { name: '10mm Aggregate' },
  { name: 'Fine Sand' },
  { name: 'River Sand' },
  { name: 'Crusher Dust' },
  { name: 'Blue Metal' },
];

// ─── STAT CARD COMPONENT ───────────────────────────────────────────────────────
const StatCard = ({ label, value, unit, color, icon: Icon }) => (
  <View style={[styles.statCard, { borderBottomColor: color }]}>
    <View style={[styles.statIcon, { backgroundColor: color + '22' }]}>
      <Icon color={color} size={18} />
    </View>
    <Text style={styles.statValue}>{value}<Text style={styles.statUnit}> {unit}</Text></Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ─── SECTION ROW COMPONENT ────────────────────────────────────────────────────
const SectionRow = ({ s, onPress }) => (
  <TouchableOpacity style={styles.listCard} onPress={onPress} activeOpacity={0.8}>
    <View style={styles.sectionIcon}>
      <Layers color="#8b5cf6" size={20} />
    </View>
    <View style={{ flex: 1, marginLeft: 14 }}>
      <Text style={styles.cardTitle}>{s.section}</Text>
      <Text style={styles.cardSub}>{s.material} · {s.density} kg/L</Text>
    </View>
    <ChevronRight color="#475569" size={18} />
  </TouchableOpacity>
);

// ─── PLANT ROW COMPONENT ──────────────────────────────────────────────────────
const PlantRow = ({ name, count, onPress }) => (
  <TouchableOpacity style={styles.listCard} onPress={onPress} activeOpacity={0.8}>
    <View style={[styles.sectionIcon, { backgroundColor: 'rgba(79,70,229,0.15)' }]}>
      <Factory color="#4f46e5" size={20} />
    </View>
    <View style={{ flex: 1, marginLeft: 14 }}>
      <Text style={styles.cardTitle}>{name}</Text>
      <Text style={styles.cardSub}>Sections: {count}</Text>
    </View>
    <ChevronRight color="#475569" size={18} />
  </TouchableOpacity>
);

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── Navigation ──────────────────────────────────────────────────────────────
  const [view, setView] = useState('home');  // home, setup, selectPlant, selectSection, capture, results, materials, gateDetect
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [isSignup, setIsSignup] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false);

  // ── Auth ────────────────────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // ── Setup Form ──────────────────────────────────────────────────────────────
  const [plantName, setPlantName] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState(DEFAULT_MATERIALS[0]);
  const [pitDepth, setPitDepth] = useState('');
  const [pitWidth, setPitWidth] = useState('');
  const [sectionLength, setSectionLength] = useState('');

  // ── Material Picker ──────────────────────────────────────────────────────────
  const [materials, setMaterials] = useState(DEFAULT_MATERIALS);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [showCustomMaterialForm, setShowCustomMaterialForm] = useState(false);
  const [customMatName, setCustomMatName] = useState('');
  const [density, setDensity] = useState('1.6'); // standalone density field in kg/L
  const [gateImage, setGateImage] = useState(null);
  const [gateResults, setGateResults] = useState(null);

  // ── Monitor Data ─────────────────────────────────────────────────────────────
  const [plants, setPlants] = useState([]);
  const [plantSectionCounts, setPlantSectionCounts] = useState({});
  const [selectedPlant, setSelectedPlant] = useState('');
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [history, setHistory] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanDetail, setScanDetail] = useState(null); // for viewing a past scan

  // ── Animation ────────────────────────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const persistSession = async (nextUser, token) => {
    try {
      if (Platform.OS === 'web') {
        if (token && nextUser) {
          window.localStorage.setItem('construction_auth_token', token);
          window.localStorage.setItem('construction_auth_user', JSON.stringify(nextUser));
          return;
        }

        window.localStorage.removeItem('construction_auth_token');
        window.localStorage.removeItem('construction_auth_user');
        return;
      }

      if (token && nextUser) {
        await FileSystem.writeAsStringAsync(
          SESSION_FILE_PATH,
          JSON.stringify({ token, user: nextUser })
        );
        return;
      }

      const fileInfo = await FileSystem.getInfoAsync(SESSION_FILE_PATH);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(SESSION_FILE_PATH, { idempotent: true });
      }
    } catch (_error) {
      // Session persistence failure should not block app usage.
    }
  };

  const restoreSession = async () => {
    try {
      let restoredToken = null;
      let restoredUser = null;

      if (Platform.OS === 'web') {
        restoredToken = window.localStorage.getItem('construction_auth_token');
        const storedUser = window.localStorage.getItem('construction_auth_user');
        restoredUser = storedUser ? JSON.parse(storedUser) : null;
      } else {
        const fileInfo = await FileSystem.getInfoAsync(SESSION_FILE_PATH);
        if (!fileInfo.exists) {
          return;
        }

        const storedSession = await FileSystem.readAsStringAsync(SESSION_FILE_PATH);
        const parsedSession = JSON.parse(storedSession);
        restoredToken = parsedSession?.token || null;
        restoredUser = parsedSession?.user || null;
      }

      if (restoredToken && restoredUser) {
        axios.defaults.headers.common.Authorization = `Bearer ${restoredToken}`;
        setAuthToken(restoredToken);
        setUser(restoredUser);
      }
    } catch (_error) {
      await persistSession(null, null);
    }
  };

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    if (user && authToken) {
      fetchMaterials();
    }
  }, [view, user, authToken]);

  useEffect(() => {
    let isMounted = true;

    const bootstrapSession = async () => {
      await restoreSession();
      if (isMounted) {
        setIsSessionReady(true);
      }
    };

    bootstrapSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (authToken) {
      axios.defaults.headers.common.Authorization = `Bearer ${authToken}`;
      return;
    }

    delete axios.defaults.headers.common.Authorization;
  }, [authToken]);

  const trackActivity = async (eventType, description, metadata = {}, extra = {}) => {
    if (!user || !authToken) return;

    try {
      await axios.post(`${API_URL}/activity`, {
        event_type: eventType,
        description,
        metadata,
        ...extra,
      });
    } catch (_error) {
      // Audit should be best-effort and must not block the main UX.
    }
  };

  useEffect(() => {
    if (!user) return;

    trackActivity('ui.view_changed', `User opened ${view} view`, {
      view,
      plant_name: selectedPlant || null,
      section_id: selectedSection?.id || null,
      section_name: selectedSection?.section || null,
    });
  }, [user, view]);

  useEffect(() => {
    if (!user || !authToken) return undefined;

    const intervalId = setInterval(() => {
      axios.post(`${API_URL}/activity/heartbeat`, {
        view,
        plant_name: selectedPlant || null,
        section_id: selectedSection?.id || null,
        section_name: selectedSection?.section || null,
      }).catch(() => {});
    }, 60000);

    return () => clearInterval(intervalId);
  }, [user, authToken, view, selectedPlant, selectedSection]);

  const fetchMaterials = async () => {
    try {
      const res = await axios.get(`${API_URL}/materials`);
      if (res.data && res.data.length > 0) {
        setMaterials(res.data);
      }
    } catch (e) {
      console.log("Using default materials");
    }
  };

  // ── Guards ───────────────────────────────────────────────────────────────────
  const goToAction = (action) => {
    if (action === 'setup') { setView('setup'); }
    else if (action === 'gateDetect') { setView('gateDetect'); }
    else { fetchPlants(); setView('selectPlant'); }
  };

  const afterLogin = (loggedUser, token) => {
    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    }
    setAuthToken(token || null);
    setUser(loggedUser);
    persistSession(loggedUser, token || null);
    setView('home');
  };

  // ── API Calls ────────────────────────────────────────────────────────────────
  const fetchPlants = async () => {
    try {
      const res = await axios.get(`${API_URL}/plants`);
      const ps = res.data;
      setPlants(ps);
      // fetch section counts
      const counts = {};
      await Promise.all(ps.map(async (p) => {
        try {
          const sr = await axios.get(`${API_URL}/sections/${encodeURIComponent(p)}`);
          counts[p] = sr.data.length;
        } catch { counts[p] = 0; }
      }));
      setPlantSectionCounts(counts);
    } catch {
      Alert.alert('Error', 'Cannot fetch plants. Is the backend running?');
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please fill all fields');
    try {
      const res = await axios.post(`${API_URL}/login`, { email, password });
      afterLogin(res.data.user, res.data.token);
    } catch (err) {
      Alert.alert('Login Failed', `${formatApiError(err)}\n\nAPI: ${API_URL}`);
    }
  };

  const handleSignup = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please fill all fields');
    try {
      await axios.post(`${API_URL}/signup`, { email, password });
      Alert.alert('Success', 'Account created! Please sign in.');
      setIsSignup(false);
    } catch (err) {
      Alert.alert('Signup Failed', `${formatApiError(err)}\n\nAPI: ${API_URL}`);
    }
  };

  const handleSetupSubmit = async () => {
    if (!plantName || !sectionName || !pitDepth || !pitWidth || !sectionLength || !density)
      return Alert.alert('Error', 'Please fill all fields');
    try {
      await axios.post(`${API_URL}/contractor`, {
        plantName, section: sectionName,
        material: selectedMaterial.name,
        length: parseFloat(sectionLength),
        width: parseFloat(pitWidth),
        pitDepth: parseFloat(pitDepth),
        density: parseFloat(density),
      });
      Alert.alert('✅ Success', 'Section added successfully!');
      setView('home'); setPlantName(''); setSectionName(''); setPitDepth(''); setPitWidth(''); setSectionLength(''); setDensity('1.6');
    } catch { Alert.alert('Error', 'Setup failed. Check backend.'); }
  };

  const pickImage = async () => {
    let r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7, base64: true });
    if (!r.canceled) processImage(`data:image/jpeg;base64,${r.assets[0].base64}`);
  };

  const takePhoto = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return Alert.alert('Permission required', 'Camera access is needed.');
    let r = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7, base64: true });
    if (!r.canceled) processImage(`data:image/jpeg;base64,${r.assets[0].base64}`);
  };

  const pickDocument = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (!r.canceled) {
        setLoading(true);
        const b64 = await FileSystem.readAsStringAsync(r.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
        processImage(`data:image/jpeg;base64,${b64}`);
      }
    } catch { Alert.alert('Error', 'Failed to pick file'); } finally { setLoading(false); }
  };

  const processImage = async (base64) => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/process-image`, {
        image: base64,
        section_id: selectedSection.id,
        material: selectedSection.material,
        density: selectedSection.density,
        wall_height: selectedSection.pit_depth,
        pit_width: selectedSection.width,
        section_breadth: selectedSection.length,
      });
      await trackActivity('scan.image_processed', 'User processed an image for volumetric analysis', {
        section_id: selectedSection.id,
        material: selectedSection.material,
        frontal_area: res.data?.frontal_area,
        volume: res.data?.volume,
        weight_ton: res.data?.weight_ton,
      }, {
        entity_type: 'section',
        entity_id: selectedSection.id,
      });
      setResults({ ...res.data, original: base64 });
      setView('results');
    } catch { Alert.alert('Analysis Failed', 'Could not process image.'); }
    finally { setLoading(false); }
  };

  const saveLog = async () => {
    try {
      await axios.post(`${API_URL}/user`, {
        section_id: selectedSection.id,
        volume: results.volume,
        weight_ton: results.weight_ton,
        frontal_area: results.frontal_area,
        img_original: results.original || '',
        img_grayscale: results.grayscale || '',
        img_blur: results.blur || '',
        img_mask: results.mask || '',
      });
      Alert.alert('✅ Logged', 'Measurement saved successfully!');
      const res = await axios.get(`${API_URL}/stats/${selectedSection.id}`);
      setHistory(res.data);
      setView('capture'); setResults(null);
    } catch { Alert.alert('Error', 'Failed to save log'); }
  };

  const viewScanDetail = async (logId) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/scan/${logId}`);
      setScanDetail(res.data);
      setView('scanDetail');
    } catch { Alert.alert('Error', 'Could not load scan details'); }
    finally { setLoading(false); }
  };

  const addCustomMaterial = () => {
    if (!customMatName) return Alert.alert('Error', 'Enter a material name');
    const m = { name: customMatName.trim() };
    setMaterials([...materials, m]);
    setSelectedMaterial(m);
    setCustomMatName('');
    setShowCustomMaterialForm(false); setShowMaterialPicker(false);
    Alert.alert('✅ Added', `${m.name} added to your library!`);
  };

  const handleLogout = async () => {
    try {
      if (authToken) {
        await axios.post(`${API_URL}/logout`);
      }
    } catch (_error) {
      // Ignore logout network failure and clear local session.
    } finally {
      delete axios.defaults.headers.common.Authorization;
      await persistSession(null, null);
      setAuthToken(null);
      setUser(null);
      setSelectedPlant('');
      setSelectedSection(null);
      setResults(null);
      setHistory([]);
      setView('home');
    }
  };

  // ═══════════════════════════════════════════════════╗
  //  SCREEN RENDERERS                                  ║
  // ═══════════════════════════════════════════════════╝

  if (!isSessionReady) {
    return (
      <LinearGradient colors={['#0a0a1a', '#1a1040', '#0f172a']} style={styles.container}>
        <View style={styles.loaderCard}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={{ color: 'white', marginTop: 12, fontWeight: '600' }}>Restoring session...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!user) {
    return renderAuth();
  }

  // ── 1. LANDING ───────────────────────────────────────────────────────────────
  const renderLanding = () => (
    <LinearGradient colors={['#0a0a1a', '#1a1040', '#0f172a']} style={styles.container}>
      <SafeAreaView style={{ flex: 1, width: '100%' }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          {/* Logo Area */}
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <View style={styles.logoBadge}>
              {Eye ? <Eye color="#8b5cf6" size={36} /> : null}
            </View>
            <Text style={styles.brandName}>Vision Inventory</Text>
            <Text style={styles.brandTagline}>AI-powered raw material tracking</Text>
          </View>

          {/* Action Cards */}
          <TouchableOpacity style={styles.actionCard} onPress={() => goToAction('setup')} activeOpacity={0.85}>
            <LinearGradient colors={['rgba(79,70,229,0.3)', 'rgba(79,70,229,0.05)']} style={styles.actionCardGrad}>
              <View style={[styles.actionIconBox, { backgroundColor: 'rgba(79,70,229,0.25)' }]}>
                {Settings ? <Settings color="#818cf8" size={30} /> : null}
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.actionTitle}>Setup Infrastructure</Text>
                <Text style={styles.actionSub}>Configure plants, materials & sections</Text>
              </View>
              {ChevronRight ? <ChevronRight color="#475569" size={22} /> : null}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => goToAction('monitor')} activeOpacity={0.85}>
            <LinearGradient colors={['rgba(139,92,246,0.3)', 'rgba(139,92,246,0.05)']} style={styles.actionCardGrad}>
              <View style={[styles.actionIconBox, { backgroundColor: 'rgba(139,92,246,0.25)' }]}>
                {LayoutDashboard ? <LayoutDashboard color="#a78bfa" size={30} /> : null}
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.actionTitle}>Live Monitoring</Text>
                <Text style={styles.actionSub}>View real-time inventory dashboard</Text>
              </View>
              {ChevronRight ? <ChevronRight color="#475569" size={22} /> : null}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => setView('materials')} activeOpacity={0.85}>
            <LinearGradient colors={['rgba(16,185,129,0.2)', 'rgba(16,185,129,0.03)']} style={styles.actionCardGrad}>
              <View style={[styles.actionIconBox, { backgroundColor: 'rgba(16,185,129,0.2)' }]}>
                {BookOpen ? <BookOpen color="#34d399" size={30} /> : null}
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.actionTitle}>Material Library</Text>
                <Text style={styles.actionSub}>Manage material types & densities</Text>
              </View>
              {ChevronRight ? <ChevronRight color="#475569" size={22} /> : null}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => goToAction('gateDetect')} activeOpacity={0.85}>
            <LinearGradient colors={['rgba(236,72,153,0.2)', 'rgba(236,72,153,0.03)']} style={styles.actionCardGrad}>
              <View style={[styles.actionIconBox, { backgroundColor: 'rgba(236,72,153,0.2)' }]}>
                {Package ? <Package color="#f472b6" size={30} /> : null}
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.actionTitle}>Gate Material Detect</Text>
                <Text style={styles.actionSub}>Inspect truck materials via AI</Text>
              </View>
              {ChevronRight ? <ChevronRight color="#475569" size={22} /> : null}
            </LinearGradient>
          </TouchableOpacity>

          {user && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingHorizontal: 4 }}>
              <View>
                <Text style={{ color: '#64748b', fontSize: 11 }}>SIGNED IN AS</Text>
                <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '600' }}>
                  {typeof user === 'object' ? (user?.email || 'Authorized User') : String(user)}
                </Text>
              </View>
              <TouchableOpacity onPress={handleLogout} style={styles.logoutChip}>
                {LogOut ? <LogOut color="#94a3b8" size={14} /> : null}
                <Text style={{ color: '#94a3b8', fontSize: 12, marginLeft: 6 }}>Sign out</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );

  // ── 2. AUTH ──────────────────────────────────────────────────────────────────
  function renderAuth() {
    return (
    <View style={[styles.container, { backgroundColor: '#1a1a2e', padding: 20, justifyContent: 'center' }]}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
          <View style={styles.glassCard}>
            <Text style={styles.title}>{isSignup ? 'Create Account' : 'Welcome Back'}</Text>
            <Text style={styles.subtitle}>Plant Management System</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputWrapper}>
                <TextInput style={styles.input} placeholder="name@company.com" placeholderTextColor="#374151" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor="#374151" value={password} onChangeText={setPassword} secureTextEntry />
              </View>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={isSignup ? handleSignup : handleLogin}>
              <Text style={styles.buttonText}>{isSignup ? 'Register' : 'Sign In'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIsSignup(!isSignup)} style={{ marginTop: 20 }}>
              <Text style={styles.toggleText}>
                {isSignup ? 'Have an account? ' : "Don't have an account? "}
                <Text style={{ color: '#8b5cf6', fontWeight: 'bold' }}>{isSignup ? 'Sign In' : 'Create one'}</Text>
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.1)', fontSize: 10, marginTop: 20 }}>v1.0.5-dev | Auth</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
    );
  }

  // ── 3. SETUP ─────────────────────────────────────────────────────────────────
  const renderSetup = () => (
    <LinearGradient colors={['#0a0a1a', '#1a1040', '#0f172a']} style={styles.container}>
      <SafeAreaView style={{ flex: 1, width: '100%' }}>
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => setView('home')} style={styles.backBtn}>
              <ArrowLeft color="white" size={20} />
            </TouchableOpacity>
            <View>
              <Text style={styles.screenTitle}>Infrastructure Setup</Text>
              <Text style={styles.screenSub}>Add a new section to a plant</Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formSection}>Plant & Section</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Plant Name</Text>
              <TextInput style={styles.inputSimple} value={plantName} onChangeText={setPlantName} placeholder="e.g. Katraj Unit 1" placeholderTextColor="#374151" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Section Name</Text>
              <TextInput style={styles.inputSimple} value={sectionName} onChangeText={setSectionName} placeholder="e.g. Pit A1" placeholderTextColor="#374151" />
            </View>

            <Text style={[styles.formSection, { marginTop: 10 }]}>Dimensions</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Wall Height (m)</Text>
                <TextInput style={styles.inputSimple} value={pitDepth} onChangeText={setPitDepth} keyboardType="numeric" placeholder="0.00" placeholderTextColor="#374151" />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Pit Width (m)</Text>
                <TextInput style={styles.inputSimple} value={pitWidth} onChangeText={setPitWidth} keyboardType="numeric" placeholder="0.00" placeholderTextColor="#374151" />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Section Length (m)</Text>
              <TextInput style={styles.inputSimple} value={sectionLength} onChangeText={setSectionLength} keyboardType="numeric" placeholder="0.00" placeholderTextColor="#374151" />
            </View>

            <Text style={[styles.formSection, { marginTop: 10 }]}>Material & Density</Text>
            {/* Material Name Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Assigned Material</Text>
              <TouchableOpacity style={styles.materialSelector} onPress={() => setShowMaterialPicker(true)}>
                <View style={[styles.sectionIcon, { backgroundColor: 'rgba(16,185,129,0.2)' }]}>
                  <FlaskConical color="#34d399" size={18} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: 'white', fontWeight: '600', fontSize: 15 }}>{selectedMaterial.name}</Text>
                  <Text style={{ color: '#64748b', fontSize: 12 }}>Tap to change material</Text>
                </View>
                <ChevronRight color="#475569" size={18} />
              </TouchableOpacity>
            </View>
            {/* Density — separate editable field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Density (kg/L)</Text>
              <TextInput
                style={styles.inputSimple}
                value={density}
                onChangeText={setDensity}
                keyboardType="numeric"
                placeholder="e.g. 1.6"
                placeholderTextColor="#374151"
              />
            </View>
          </View>

          <TouchableOpacity style={[styles.primaryButton, { marginTop: 24 }]} onPress={handleSetupSubmit}>
            <PlusCircle color="white" size={20} />
            <Text style={styles.buttonText}>Add Section</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      {/* Material Picker Modal */}
      <Modal visible={showMaterialPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Material</Text>
              <TouchableOpacity onPress={() => { setShowMaterialPicker(false); setShowCustomMaterialForm(false); }}>
                <X color="#64748b" size={22} />
              </TouchableOpacity>
            </View>

            {!showCustomMaterialForm ? (
              <>
                <ScrollView style={{ maxHeight: 340 }}>
                  {materials.map((m, i) => (
                    <TouchableOpacity key={i} style={styles.materialOption} onPress={() => {
                      setSelectedMaterial(m);
                      setShowMaterialPicker(false);
                    }}>
                      <View style={[styles.sectionIcon, { backgroundColor: 'rgba(16,185,129,0.12)', marginRight: 14 }]}>
                        <FlaskConical color="#34d399" size={16} />
                      </View>
                      <Text style={{ color: 'white', fontSize: 15, fontWeight: '600', flex: 1 }}>{m.name}</Text>
                      {selectedMaterial.name === m.name && <CheckCircle color="#8b5cf6" size={20} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity style={styles.addCustomBtn} onPress={() => setShowCustomMaterialForm(true)}>
                  <Plus color="#8b5cf6" size={18} />
                  <Text style={{ color: '#8b5cf6', fontWeight: '600', marginLeft: 8, fontSize: 15 }}>Add Custom Material</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={{ padding: 8 }}>
                <Text style={[styles.label, { marginBottom: 12 }]}>New Material Name</Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Material Name</Text>
                  <TextInput style={styles.inputSimple} value={customMatName} onChangeText={setCustomMatName} placeholder="e.g. Crusher Dust" placeholderTextColor="#374151" />
                </View>
                <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 16 }}>💡 Density is set separately per section — no need to add it here.</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity style={[styles.outlineButton, { flex: 1 }]} onPress={() => setShowCustomMaterialForm(false)}>
                    <Text style={{ color: '#64748b', fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.primaryButton, { flex: 2, marginTop: 0 }]} onPress={addCustomMaterial}>
                    <Text style={styles.buttonText}>Add to Library</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );

  // ── 4. SELECT PLANT ──────────────────────────────────────────────────────────
  const renderSelectPlant = () => (
    <LinearGradient colors={['#0a0a1a', '#1a1040', '#0f172a']} style={styles.container}>
      <SafeAreaView style={{ flex: 1, width: '100%' }}>
        <View style={{ padding: 24, flex: 1 }}>
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => setView('home')} style={styles.backBtn}>
              <ArrowLeft color="white" size={20} />
            </TouchableOpacity>
            <View>
              <Text style={styles.screenTitle}>Select Plant</Text>
              <Text style={styles.screenSub}>Choose a plant to monitor</Text>
            </View>
          </View>

          <ScrollView>
            {plants.length === 0
              ? <View style={styles.emptyState}><Factory color="#334155" size={48} /><Text style={styles.emptyText}>No plants added yet</Text></View>
              : plants.map(p => (
                <PlantRow key={p} name={p} count={plantSectionCounts[p] || 0} onPress={async () => {
                  setSelectedPlant(p);
                  const res = await axios.get(`${API_URL}/sections/${encodeURIComponent(p)}`);
                  setSections(res.data);
                  setView('selectSection');
                }} />
              ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );

  // ── 5. SELECT SECTION ────────────────────────────────────────────────────────
  const renderSelectSection = () => (
    <LinearGradient colors={['#0a0a1a', '#1a1040', '#0f172a']} style={styles.container}>
      <SafeAreaView style={{ flex: 1, width: '100%' }}>
        <View style={{ padding: 24, flex: 1 }}>
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => setView('selectPlant')} style={styles.backBtn}>
              <ArrowLeft color="white" size={20} />
            </TouchableOpacity>
            <View>
              <Text style={styles.screenTitle}>{selectedPlant}</Text>
              <Text style={styles.screenSub}>Select section to inspect</Text>
            </View>
          </View>

          <ScrollView>
            {sections.map(s => (
              <SectionRow key={s.id} s={s} onPress={async () => {
                setSelectedSection(s);
                const res = await axios.get(`${API_URL}/stats/${s.id}`);
                setHistory(res.data);
                setView('capture');
              }} />
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );

  // ── 6. CAPTURE SCREEN ────────────────────────────────────────────────────────
  const renderCapture = () => {
    const lastScan = history.length > 0 ? history[0] : null;
    const totalWeight = history.reduce((a, h) => a + parseFloat(h.weight_ton || 0), 0);

    return (
      <LinearGradient colors={['#0a0a1a', '#1a1040', '#0f172a']} style={styles.container}>
        <SafeAreaView style={{ flex: 1, width: '100%' }}>
          <ScrollView contentContainerStyle={{ padding: 24 }}>
            <View style={styles.screenHeader}>
              <TouchableOpacity onPress={() => setView('selectSection')} style={styles.backBtn}>
                <ArrowLeft color="white" size={20} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.screenTitle}>{selectedSection?.section}</Text>
                <Text style={styles.screenSub}>{selectedPlant}</Text>
              </View>
            </View>

            {/* Section Info Card */}
            <View style={styles.infoCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={styles.infoLabel}>MATERIAL</Text>
                  <Text style={styles.infoValue}>{selectedSection?.material}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.infoLabel}>DENSITY</Text>
                  <Text style={styles.infoValue}>{selectedSection?.density} kg/L</Text>
                </View>
              </View>
            </View>

            {/* Stats Row */}
            <View style={{ flexDirection: 'row', gap: 12, marginVertical: 20 }}>
              <StatCard label="Last Scan" value={lastScan ? lastScan.weight_ton : '—'} unit={lastScan ? 'T' : ''} color="#8b5cf6" icon={Scale} />
              <StatCard label="Total Readings" value={history.length} unit="scans" color="#4f46e5" icon={Zap} />
              <StatCard label="Total Weight" value={totalWeight.toFixed(1)} unit="T" color="#059669" icon={Boxes} />
            </View>

            {/* Capture Button */}
            <TouchableOpacity style={styles.captureButton} onPress={() => {
              if (Platform.OS === 'web') { pickImage(); return; }
              Alert.alert('📸 Capture Snapshot', 'Choose image source', [
                { text: '📷 Live Camera', onPress: takePhoto },
                { text: '🖼️ Gallery', onPress: pickImage },
                { text: '☁️ Files / Drive', onPress: pickDocument },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}>
              <LinearGradient colors={['#6d28d9', '#8b5cf6']} style={styles.captureInner}>
                <Camera color="white" size={28} />
                <Text style={styles.captureText}>Capture Snapshot</Text>
                <Text style={styles.captureSub}>Tap to analyze inventory</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* History */}
            {history.length > 0 && (
              <View style={{ marginTop: 28 }}>
                <Text style={styles.sectionLabel}>Recent Measurements</Text>
                {history.slice(0, 8).map(h => (
                  <TouchableOpacity key={h.id} style={styles.historyRow} onPress={() => viewScanDetail(h.id)} activeOpacity={0.7}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#94a3b8', fontSize: 13 }}>{new Date(h.timestamp).toLocaleDateString()}</Text>
                      <Text style={{ color: '#64748b', fontSize: 11 }}>{new Date(h.timestamp).toLocaleTimeString()}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', marginRight: 10 }}>
                      <Text style={{ color: '#8b5cf6', fontWeight: 'bold', fontSize: 16 }}>{h.weight_ton} <Text style={{ fontSize: 11 }}>T</Text></Text>
                      <Text style={{ color: '#4b5563', fontSize: 11 }}>{h.volume} m³</Text>
                    </View>
                    <ChevronRight color="#334155" size={16} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>

        {loading && (
          <View style={styles.loaderOverlay}>
            <View style={styles.loaderCard}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={{ color: 'white', marginTop: 16, fontWeight: '600', fontSize: 16 }}>Analyzing Vision...</Text>
              <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>AI is processing your snapshot</Text>
            </View>
          </View>
        )}
      </LinearGradient>
    );
  };

  // ── 7. RESULTS ────────────────────────────────────────────────────────────────
  const renderResults = () => (
    <LinearGradient colors={['#0a0a1a', '#1a1040', '#0f172a']} style={styles.container}>
      <SafeAreaView style={{ flex: 1, width: '100%' }}>
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => setView('capture')} style={styles.backBtn}>
              <ArrowLeft color="white" size={20} />
            </TouchableOpacity>
            <View>
              <Text style={styles.screenTitle}>Analysis Results</Text>
              <Text style={styles.screenSub}>{selectedSection?.section} · {selectedPlant}</Text>
            </View>
          </View>

          {/* Big Stats */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
            <View style={[styles.bigStat, { borderLeftColor: '#4f46e5' }]}>
              <Text style={styles.bigStatVal}>{results?.frontal_area || '—'}</Text>
              <Text style={styles.bigStatUnit}>m²</Text>
              <Text style={styles.bigStatLabel}>Frontal Area</Text>
            </View>
            <View style={[styles.bigStat, { borderLeftColor: '#7c3aed' }]}>
              <Text style={styles.bigStatVal}>{results?.volume || '—'}</Text>
              <Text style={styles.bigStatUnit}>m³</Text>
              <Text style={styles.bigStatLabel}>Volume</Text>
            </View>
            <View style={[styles.bigStat, { borderLeftColor: '#059669' }]}>
              <Text style={styles.bigStatVal}>{results?.weight_ton || '—'}</Text>
              <Text style={styles.bigStatUnit}>T</Text>
              <Text style={styles.bigStatLabel}>Weight</Text>
            </View>
          </View>

          {/* Vision Images */}
          <View style={styles.imageBlock}>
            <Text style={styles.sectionLabel}>Vision Analysis</Text>
            {results?.mask && (
              <View style={styles.imageBox}>
                <Image source={{ uri: `data:image/jpeg;base64,${results.mask}` }} style={styles.analysisImg} />
                <View style={styles.imageBadge}><Text style={{ color: '#94a3b8', fontSize: 12 }}>Segmentation Mask</Text></View>
              </View>
            )}
            {results?.blur && (
              <View style={[styles.imageBox, { marginTop: 12 }]}>
                <Image source={{ uri: `data:image/jpeg;base64,${results.blur}` }} style={styles.analysisImg} />
                <View style={styles.imageBadge}><Text style={{ color: '#94a3b8', fontSize: 12 }}>Detection Overlay</Text></View>
              </View>
            )}
          </View>

          <TouchableOpacity style={[styles.primaryButton, { marginTop: 24 }]} onPress={saveLog}>
            <UploadCloud color="white" size={20} />
            <Text style={styles.buttonText}>Log This Measurement</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.outlineButton, { marginTop: 12 }]} onPress={() => { setResults(null); setView('capture'); }}>
            <Text style={{ color: '#64748b', fontWeight: '600' }}>Retake Snapshot</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );

  // ── 8. SCAN DETAIL (Past Scan Images) ───────────────────────────────────────
  const renderScanDetail = () => (
    <LinearGradient colors={['#0a0a1a', '#1a1040', '#0f172a']} style={styles.container}>
      <SafeAreaView style={{ flex: 1, width: '100%' }}>
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => setView('capture')} style={styles.backBtn}>
              <ArrowLeft color="white" size={20} />
            </TouchableOpacity>
            <View>
              <Text style={styles.screenTitle}>Scan Detail</Text>
              <Text style={styles.screenSub}>{scanDetail && new Date(scanDetail.timestamp).toLocaleString()}</Text>
            </View>
          </View>

          {/* Stats */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
            <View style={[styles.bigStat, { borderLeftColor: '#4f46e5' }]}>
              <Text style={styles.bigStatVal}>{scanDetail?.frontal_area || '—'}</Text>
              <Text style={styles.bigStatUnit}>m²</Text>
              <Text style={styles.bigStatLabel}>Area</Text>
            </View>
            <View style={[styles.bigStat, { borderLeftColor: '#7c3aed' }]}>
              <Text style={styles.bigStatVal}>{scanDetail?.volume || '—'}</Text>
              <Text style={styles.bigStatUnit}>m³</Text>
              <Text style={styles.bigStatLabel}>Volume</Text>
            </View>
            <View style={[styles.bigStat, { borderLeftColor: '#059669' }]}>
              <Text style={styles.bigStatVal}>{scanDetail?.weight_ton || '—'}</Text>
              <Text style={styles.bigStatUnit}>T</Text>
              <Text style={styles.bigStatLabel}>Weight</Text>
            </View>
          </View>

          {/* All Processing Images */}
          <Text style={styles.sectionLabel}>Preprocessing Pipeline</Text>

          {[
            { key: 'img_original', label: '1️⃣ Original Image' },
            { key: 'img_grayscale', label: '2️⃣ Grayscale' },
            { key: 'img_blur', label: '3️⃣ Gaussian Blur' },
            { key: 'img_mask', label: '4️⃣ Segmentation Mask (GrabCut)' },
          ].map(({ key, label }) => (
            scanDetail?.[key] ? (
              <View key={key} style={[styles.imageBox, { marginBottom: 16 }]}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${scanDetail[key]}` }}
                  style={[styles.analysisImg, { height: 220 }]}
                />
                <View style={styles.imageBadge}>
                  <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '600' }}>{label}</Text>
                </View>
              </View>
            ) : null
          ))}
        </ScrollView>
      </SafeAreaView>
      {loading && (
        <View style={styles.loaderOverlay}>
          <View style={styles.loaderCard}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={{ color: 'white', marginTop: 12, fontWeight: '600' }}>Loading scan...</Text>
          </View>
        </View>
      )}
    </LinearGradient>
  );

  // ── 9. MATERIAL LIBRARY ──────────────────────────────────────────────────────
  const renderMaterials = () => (
    <LinearGradient colors={['#0a0a1a', '#1a1040', '#0f172a']} style={styles.container}>
      <SafeAreaView style={{ flex: 1, width: '100%' }}>
        <View style={{ flex: 1, padding: 24 }}>
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => setView('home')} style={styles.backBtn}>
              <ArrowLeft color="white" size={20} />
            </TouchableOpacity>
            <View>
              <Text style={styles.screenTitle}>Material Library</Text>
              <Text style={styles.screenSub}>{materials.length} materials configured</Text>
            </View>
          </View>

          <ScrollView style={{ flex: 1 }}>
            {materials.map((m, i) => (
              <View key={i} style={styles.matRow}>
                <View style={[styles.sectionIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                  <Package color="#34d399" size={18} />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ color: 'white', fontSize: 15, fontWeight: '600' }}>{m.name}</Text>
                  <Text style={{ color: '#64748b', fontSize: 13 }}>Density set per section</Text>
                </View>
                {i >= DEFAULT_MATERIALS.length && (
                  <View style={styles.customBadge}><Text style={{ color: '#8b5cf6', fontSize: 10, fontWeight: '700' }}>CUSTOM</Text></View>
                )}
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={[styles.primaryButton, { marginTop: 16 }]} onPress={() => setShowMaterialPicker(true)}>
            <Plus color="white" size={20} />
            <Text style={styles.buttonText}>Add Custom Material</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Reuse material modal from setup */}
      <Modal visible={showMaterialPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Custom Material</Text>
              <TouchableOpacity onPress={() => { setShowMaterialPicker(false); setShowCustomMaterialForm(false); }}>
                <X color="#64748b" size={22} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 8 }}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Material Name</Text>
                <TextInput style={styles.inputSimple} value={customMatName} onChangeText={setCustomMatName} placeholder="e.g. Crusher Dust" placeholderTextColor="#374151" />
              </View>
              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 16 }}>💡 Density is set separately per section — no need here.</Text>
              <TouchableOpacity style={[styles.primaryButton, { marginTop: 8 }]} onPress={addCustomMaterial}>
                <Text style={styles.buttonText}>Save to Library</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );

  // ── 10. GATE MATERIAL DETECTION ───────────────────────────────────────────────


  const processGateImage = async (base64) => {
    setLoading(true);
    setGateImage(`data:image/jpeg;base64,${base64}`);
    setGateResults(null);
    try {
      const res = await axios.post(`${API_URL}/detect-gate-material`, { image: base64 });
      await trackActivity('gate.material_detected', 'User ran gate material detection', {
        detections: res.data?.detections || [],
        detection_count: Array.isArray(res.data?.detections) ? res.data.detections.length : 0,
      }, {
        entity_type: 'gate_scan',
      });
      setGateResults(res.data);
    } catch (err) { Alert.alert('Error', err.response?.data?.error || 'Detection failed.'); }
    finally { setLoading(false); }
  };

  const pickGateImage = async () => {
    let r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7, base64: true });
    if (!r.canceled) processGateImage(r.assets[0].base64);
  };

  const takeGatePhoto = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return Alert.alert('Permission required', 'Camera access is needed.');
    let r = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7, base64: true });
    if (!r.canceled) processGateImage(r.assets[0].base64);
  };

  const pickGateDocument = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (!r.canceled) {
        setLoading(true);
        const b64 = await FileSystem.readAsStringAsync(r.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
        processGateImage(b64);
      }
    } catch { Alert.alert('Error', 'Failed to pick file'); } finally { setLoading(false); }
  };

  const renderGateDetect = () => (
    <LinearGradient colors={['#0a0a1a', '#1a1040', '#0f172a']} style={styles.container}>
      <SafeAreaView style={{ flex: 1, width: '100%' }}>
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => { setView('home'); setGateImage(null); setGateResults(null); }} style={styles.backBtn}>
              <ArrowLeft color="white" size={20} />
            </TouchableOpacity>
            <View>
              <Text style={styles.screenTitle}>Gate Inspection</Text>
              <Text style={styles.screenSub}>AI Truck Material Detection</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.captureButton} onPress={() => {
            if (Platform.OS === 'web') { pickGateImage(); return; }
            Alert.alert('📸 Capture Snapshot', 'Choose truck image source', [
              { text: '📷 Live Camera', onPress: takeGatePhoto },
              { text: '🖼️ Gallery', onPress: pickGateImage },
              { text: '☁️ Files / Drive', onPress: pickGateDocument },
              { text: 'Cancel', style: 'cancel' },
            ]);
          }}>
            <LinearGradient colors={['#db2777', '#f472b6']} style={styles.captureInner}>
              <Camera color="white" size={28} />
              <Text style={styles.captureText}>Capture Incoming Truck</Text>
              <Text style={styles.captureSub}>Tap to run YOLO model</Text>
            </LinearGradient>
          </TouchableOpacity>

          {gateImage && !gateResults && !loading && (
            <View style={[styles.imageBox, { marginTop: 20 }]}>
              <Image source={{ uri: gateImage }} style={styles.analysisImg} />
            </View>
          )}

          {gateResults && (
            <View style={{ marginTop: 24 }}>
              <Text style={styles.sectionLabel}>YOLO Detections</Text>
              <View style={[styles.imageBox, { marginBottom: 20 }]}>
                <Image source={{ uri: `data:image/jpeg;base64,${gateResults.image_with_bboxes}` }} style={styles.analysisImg} />
                <View style={[styles.imageBadge, { backgroundColor: '#db2777' }]}>
                  <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>AI Overlay</Text>
                </View>
              </View>

              {gateResults.detections && gateResults.detections.length > 0 ? (
                gateResults.detections.map((det, idx) => (
                  <View key={idx} style={[styles.listCard, { marginBottom: 10 }]}>
                    <View style={[styles.sectionIcon, { backgroundColor: 'rgba(236,72,153,0.15)' }]}>
                      <Package color="#db2777" size={20} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={styles.cardTitle}>{det.class.toUpperCase()}</Text>
                      <Text style={styles.cardSub}>Confidence: {det.confidence}%</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No materials detected in this image.</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
      {loading && (
        <View style={styles.loaderOverlay}>
          <View style={styles.loaderCard}>
            <ActivityIndicator size="large" color="#db2777" />
            <Text style={{ color: 'white', marginTop: 16, fontWeight: '600', fontSize: 16 }}>Scanning Material...</Text>
            <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>YOLO logic active</Text>
          </View>
        </View>
      )}
    </LinearGradient>
  );

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
        <StatusBar barStyle="light-content" />
        {renderAuth()}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a1a' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={{ flex: 1 }}>
        {view === 'home' && renderLanding()}
        {view === 'setup' && renderSetup()}
        {view === 'selectPlant' && renderSelectPlant()}
        {view === 'selectSection' && renderSelectSection()}
        {view === 'capture' && renderCapture()}
        {view === 'results' && renderResults()}
        {view === 'scanDetail' && renderScanDetail()}
        {view === 'materials' && renderMaterials()}
        {view === 'gateDetect' && renderGateDetect()}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },

  // Landing
  logoBadge: { width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(139,92,246,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  brandName: { color: 'white', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  brandTagline: { color: '#475569', fontSize: 13, marginTop: 4, marginBottom: 8 },

  actionCard: { marginBottom: 14, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  actionCardGrad: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  actionIconBox: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { color: 'white', fontSize: 16, fontWeight: '700' },
  actionSub: { color: '#64748b', fontSize: 12, marginTop: 3 },

  logoutChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },

  // Auth
  glassCard: { width: width * 0.88, padding: 30, backgroundColor: 'rgba(15,23,42,0.85)', borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  iconContainer: { width: 70, height: 70, borderRadius: 22, backgroundColor: 'rgba(139,92,246,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: '#64748b', fontSize: 13, marginBottom: 28 },
  toggleText: { color: '#64748b', fontSize: 13 },

  // Screen Headers
  screenHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 28, gap: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  screenTitle: { color: 'white', fontSize: 22, fontWeight: '800' },
  screenSub: { color: '#64748b', fontSize: 12, marginTop: 2 },

  // Form
  formCard: { backgroundColor: 'rgba(15,23,42,0.7)', borderRadius: 22, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  formSection: { color: '#475569', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14 },
  inputGroup: { width: '100%', marginBottom: 18 },
  label: { color: '#475569', fontSize: 10, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14 },
  input: { flex: 1, height: 50, color: 'white', fontSize: 15 },
  inputSimple: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 14, height: 52, color: 'white', paddingHorizontal: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', fontSize: 15 },

  // Buttons
  primaryButton: { height: 54, backgroundColor: '#7c3aed', borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, gap: 10 },
  outlineButton: { height: 50, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginTop: 0 },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },

  // Material Selector
  materialSelector: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },

  // List
  listCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.8)', padding: 16, borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  sectionIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.15)', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: 'white', fontSize: 16, fontWeight: '700' },
  cardSub: { color: '#64748b', fontSize: 12, marginTop: 3 },

  // Capture
  infoCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  infoLabel: { color: '#475569', fontSize: 9, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  infoValue: { color: 'white', fontSize: 15, fontWeight: '700', marginTop: 4 },

  statCard: { flex: 1, backgroundColor: 'rgba(15,23,42,0.8)', borderRadius: 16, padding: 14, borderBottomWidth: 2, alignItems: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { color: 'white', fontSize: 18, fontWeight: '800' },
  statUnit: { color: '#64748b', fontSize: 11, fontWeight: '400' },
  statLabel: { color: '#64748b', fontSize: 10, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },

  captureButton: { borderRadius: 22, overflow: 'hidden', marginTop: 8 },
  captureInner: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36, gap: 8 },
  captureText: { color: 'white', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  captureSub: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },

  sectionLabel: { color: '#475569', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 },

  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },

  // Results
  bigStat: { flex: 1, backgroundColor: 'rgba(15,23,42,0.8)', borderRadius: 16, padding: 14, borderLeftWidth: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  bigStatVal: { color: 'white', fontSize: 22, fontWeight: '800' },
  bigStatUnit: { color: '#64748b', fontSize: 12 },
  bigStatLabel: { color: '#64748b', fontSize: 10, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },

  imageBlock: { marginTop: 8 },
  imageBox: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  analysisImg: { width: '100%', height: 200, resizeMode: 'cover' },
  imageBadge: { padding: 10, alignItems: 'center' },

  // Material Library
  matRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.7)', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  customBadge: { backgroundColor: 'rgba(139,92,246,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#0f172a', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: 'white', fontSize: 18, fontWeight: '800' },
  materialOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  addCustomBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', marginTop: 8 },

  // Empty State
  emptyState: { alignItems: 'center', padding: 60, gap: 14 },
  emptyText: { color: '#334155', fontSize: 16 },

  loaderOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  loaderCard: { backgroundColor: '#0f172a', borderRadius: 24, padding: 36, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
});
