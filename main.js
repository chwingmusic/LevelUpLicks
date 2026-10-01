// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithPopup, 
    signInWithCredential,
    GoogleAuthProvider, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const gatewayConfig = {
    apiKey: "AIzaSyAKVPuxFTzwn-KV4o4MqG893GozdWMejJY",
    authDomain: "leveluplicks.firebaseapp.com",
    projectId: "leveluplicks",
    storageBucket: "leveluplicks.firebasestorage.app",
    messagingSenderId: "878018571238",
    appId: "1:878018571238:web:e59e38a2791280f2070427",
    measurementId: "G-X3GP1C802L"
};

// Open System-Wide Gateway Pipelines
export const gatewayApp = initializeApp(gatewayConfig);
export const gatewayAuth = getAuth(gatewayApp);
export const gatewayDb = getFirestore(gatewayApp);

// View mapping router config
const viewRoutes = {
    dashboard: { html: 'pages/dashboard/dashboard.html', js: 'pages/dashboard/dashboard.js' },
    practice: { html: 'pages/practice/practice.html', js: 'pages/practice/practice.js' },
    songlist: { html: 'pages/songlist/songlist.html', js: 'pages/songlist/songlist.js' },
    configuration: { html: 'pages/configuration/config.html', js: 'pages/configuration/config.js' },
    tutorial: { html: 'pages/tutorial/tutorial.html', js: 'pages/tutorial/tutorial.js' }
};

export async function loadViewRouter(routeKey) {
    const route = viewRoutes[routeKey];
    if (!route) return;

    try {
        const networkResponse = await fetch(route.html);
        const codeMarkup = await networkResponse.text();
        
        const viewportOutlet = document.getElementById('view-router-outlet');
        viewportOutlet.innerHTML = codeMarkup;

        document.querySelectorAll('.nav-link').forEach(btn => {
            if (btn.getAttribute('data-page') === routeKey) {
                btn.classList.add('bg-amber-500/10', 'text-amber-400', 'border-l-2', 'border-amber-500', 'pl-3.5');
                btn.classList.remove('text-zinc-400');
            } else {
                btn.classList.remove('bg-amber-500/10', 'text-amber-400', 'border-l-2', 'border-amber-500', 'pl-3.5');
                btn.classList.add('text-zinc-400');
            }
        });

        if (route.js) {
            const pageControllerModule = await import(`./${route.js}?t=${Date.now()}`);
            if (pageControllerModule.initPage) pageControllerModule.initPage();
        }
    } catch (err) {
        document.getElementById('view-router-outlet').innerHTML = `<p class="text-rose-400 text-sm">Failed to resolve route: ${err.message}</p>`;
    }
}

// --------------------------------------------------------------------------
// AUTH STATE OBSERVER
// --------------------------------------------------------------------------
onAuthStateChanged(gatewayAuth, async (activeUser) => {
    const authOverlay = document.getElementById('authOverlay');

    if (activeUser) {
        if (authOverlay) authOverlay.classList.add('hidden');
        
        const profileName = document.getElementById('profileName');
        if (profileName) profileName.innerText = activeUser.displayName || activeUser.email;
        
        const userAvatar = document.getElementById('userAvatar');
        if (activeUser.photoURL && userAvatar) {
            userAvatar.innerHTML = `<img src="${activeUser.photoURL}" class="w-full h-full object-cover">`;
        }
        
        try {
            const snapshot = await getDoc(doc(gatewayDb, "user_configs", activeUser.uid));
            if (snapshot.exists()) {
                loadViewRouter('dashboard');
            } else {
                loadViewRouter('configuration');
            }
        } catch (e) {
            console.error("Config fetch error:", e);
            loadViewRouter('configuration');
        }
    } else {
        if (authOverlay) authOverlay.classList.remove('hidden');
    }
});

// Sidebar Navigation Action Listeners
document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', (e) => {
        loadViewRouter(e.currentTarget.getAttribute('data-page'));
    });
});

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

// --------------------------------------------------------------------------
// MOBILE-SAFE GOOGLE AUTH HANDLER (GIS CLIENT + FIREBASE CREDENTIAL)
// --------------------------------------------------------------------------
async function triggerMobileGoogleLogin() {
    if (typeof google === 'undefined' || !google.accounts) {
        console.warn("Google GIS SDK not ready, falling back to popup");
        const provider = new GoogleAuthProvider();
        return signInWithPopup(gatewayAuth, provider);
    }

    // Initialize GIS Client
    google.accounts.id.initialize({
        client_id: "878018571238-0u5pld3i270v5i3v5103.apps.googleusercontent.com", 
        callback: async (response) => {
            try {
                const credential = GoogleAuthProvider.credential(response.credential);
                await signInWithCredential(gatewayAuth, credential);
            } catch (err) {
                console.error("Credential Sign-in error:", err);
            }
        }
    });

    google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            const provider = new GoogleAuthProvider();
            signInWithPopup(gatewayAuth, provider);
        }
    });
}

function isInAppBrowser() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    return /FBAN|FBAV|Instagram|WhatsApp|Line|MicroMessenger|LinkedInApp/i.test(ua);
}

const btnLogin = document.getElementById('btnLogin');

if (btnLogin) {
    const handleLogin = async (e) => {
        e.preventDefault();
        
        if (btnLogin.dataset.processing === "true") return;
        btnLogin.dataset.processing = "true";

        const originalText = btnLogin.innerText;
        btnLogin.innerText = "Connecting...";
        btnLogin.style.opacity = "0.6";

        if (isInAppBrowser()) {
            alert("In-app browsers (like WhatsApp/Instagram) block Google login. Please tap the menu button (...) and select 'Open in Safari' or 'Open in Chrome'.");
            resetButton(originalText);
            return;
        }

        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        try {
            await signInWithPopup(gatewayAuth, provider);
        } catch (error) {
            console.error("Mobile login error:", error);
            
            if (error.code === 'auth/popup-blocked') {
                alert("Popup was blocked by your browser. Please allow popups for this site or open in standard Safari/Chrome.");
            } else if (error.code !== 'auth/popup-closed-by-user') {
                alert(`Login failed: ${error.message}`);
            }
        } finally {
            resetButton(originalText);
        }
    };

    function resetButton(text) {
        btnLogin.innerText = text;
        btnLogin.style.opacity = "1";
        btnLogin.dataset.processing = "false";
    }

    btnLogin.addEventListener('click', handleLogin);
}

// Logout Button Listener
const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        signOut(gatewayAuth).then(() => location.reload());
    });
}
