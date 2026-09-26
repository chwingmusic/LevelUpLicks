import { initializeApp } from "https://gstatic.com";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://gstatic.com";
import { getFirestore, doc, getDoc } from "https://gstatic.com";

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
export const gatewayApp = initializeApp(gatewayConfig, "gatewayInstance");
export const gatewayAuth = getAuth(gatewayApp);
export const gatewayDb = getFirestore(gatewayApp);

// Central view mapping routing paths
const viewRoutes = {
    dashboard: { html: 'pages/dashboard/dashboard.html', js: null },
    practice: { html: 'pages/practice/practice.html', js: null },
    configuration: { html: 'pages/configuration/config.html', js: 'pages/configuration/config.js' },
    tutorial: { html: 'pages/tutorial/tutorial.html', js: null }
};

export async function loadViewRouter(routeKey) {
    const route = viewRoutes[routeKey];
    if (!route) return;

    try {
        // Fetch raw HTML page view template asynchronously
        const networkResponse = await fetch(route.html);
        const codeMarkup = await networkResponse.text();
        
        // Inject page markup directly into the master view layout element frame
        const viewportOutlet = document.getElementById('view-router-outlet');
        viewportOutlet.innerHTML = codeMarkup;

        // Highlight Active Link inside Navigation Menus
        document.querySelectorAll('.nav-link').forEach(btn => {
            if (btn.getAttribute('data-page') === routeKey) {
                btn.classList.add('bg-amber-500/10', 'text-amber-400', 'border-l-2', 'border-amber-500', 'pl-3.5');
                btn.classList.remove('text-zinc-400');
            } else {
                btn.classList.remove('bg-amber-500/10', 'text-amber-400', 'border-l-2', 'border-amber-500', 'pl-3.5');
                btn.classList.add('text-zinc-400');
            }
        });

        // Initialize JavaScript file context logic if present
        if (route.js) {
            // Append cache-busting timestamp parameters ensuring fresh browser evaluations
            const pageControllerModule = await import(`./${route.js}?t=${Date.now()}`);
            if (pageControllerModule.initPage) pageControllerModule.initPage();
        }
    } catch (err) {
        document.getElementById('view-router-outlet').innerHTML = `<p class="text-rose-400 text-sm">Failed to resolve route: ${err.message}</p>`;
    }
}

// Global Auth Synchronization Pipeline Handlers
onAuthStateChanged(gatewayAuth, async (activeUser) => {
    const authOverlay = document.getElementById('authOverlay');
    if (activeUser) {
        authOverlay.classList.add('hidden');
        document.getElementById('profileName').innerText = activeUser.displayName || activeUser.email;
        if (activeUser.photoURL) document.getElementById('userAvatar').innerHTML = `<img src="${activeUser.photoURL}" class="w-full h-full object-cover">`;
        
        // Check for configuration record to determine default page routing destinations
        const snapshot = await getDoc(doc(gatewayDb, "user_configs", activeUser.uid));
        if (snapshot.exists()) {
            loadViewRouter('dashboard');
        } else {
            loadViewRouter('configuration');
        }
    } else {
        authOverlay.classList.remove('hidden');
    }
});

// Setup click action interception handlers
document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', (e) => {
        loadViewRouter(e.currentTarget.getAttribute('data-page'));
    });
});

document.getElementById('btnLogin').addEventListener('click', () => signInWithPopup(gatewayAuth, new GoogleAuthProvider()));
document.getElementById('btnLogout').addEventListener('click', () => signOut(gatewayAuth).then(() => location.reload()));
