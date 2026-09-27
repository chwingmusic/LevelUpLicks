import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithPopup, 
    signInWithRedirect, 
    getRedirectResult, 
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

// Open System-Wide Gateway Pipelines (Default App Instance)
export const gatewayApp = initializeApp(gatewayConfig);
export const gatewayAuth = getAuth(gatewayApp);
export const gatewayDb = getFirestore(gatewayApp);

// View mapping router config
const viewRoutes = {
    dashboard: { html: 'pages/dashboard/dashboard.html', js: 'pages/dashboard/dashboard.js' },
    practice: { html: 'pages/practice/practice.html', js: 'pages/practice/practice.js' },
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
// MOBILE AUTH GATEWAY & STATE OBSERVER FIX
// --------------------------------------------------------------------------
let isRedirectProcessing = true;

// 1. Process Mobile Redirect FIRST before allowing state decisions
getRedirectResult(gatewayAuth)
    .then((result) => {
        if (result?.user) {
            console.log("Mobile redirect login successful for:", result.user.email);
        }
    })
    .catch((error) => {
        console.error("Redirect auth error:", error);
    })
    .finally(() => {
        isRedirectProcessing = false;
    });

// 2. Global Auth State Observer with Mobile Redirect Guard
onAuthStateChanged(gatewayAuth, async (activeUser) => {
    // If mobile redirect result is still being parsed, wait briefly
    if (isRedirectProcessing) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }

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

// Helper to check for Mobile Devices
function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

// Login Button Listener
const btnLogin = document.getElementById('btnLogin');
if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        if (isMobileDevice()) {
            await signInWithRedirect(gatewayAuth, provider);
        } else {
            try {
                await signInWithPopup(gatewayAuth, provider);
            } catch (error) {
                console.warn("Popup blocked, falling back to redirect:", error);
                await signInWithRedirect(gatewayAuth, provider);
            }
        }
    });
}

// Logout Button Listener
const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        signOut(gatewayAuth).then(() => location.reload());
    });
}
