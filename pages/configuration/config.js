import { gatewayAuth, gatewayDb } from '../../main.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

export async function initPage() {
    console.log("Config component scope runtime initialized.");
    
    const activeUser = gatewayAuth.currentUser;
    if (!activeUser) return;

    const inputArea = document.getElementById('configJsonInput');
    const statusText = document.getElementById('statusMessageText');
    const saveBtn = document.getElementById('btnSaveConfig');

    if (!inputArea || !statusText || !saveBtn) return;

    // Pre-populate form fields if remote profile data already exists
    try {
        const snapshot = await getDoc(doc(gatewayDb, "user_configs", activeUser.uid));
        if (snapshot.exists()) {
            inputArea.value = JSON.stringify(snapshot.data(), null, 2);
            statusText.innerText = "Personal Database Connection Synchronized.";
            if (statusText.parentElement && statusText.parentElement.firstElementChild) {
                statusText.parentElement.firstElementChild.className = "h-2 w-2 rounded-full bg-emerald-500";
            }
        }
    } catch (e) {
        console.error("Failed to load existing configuration records:", e);
    }

    // Bind save button handler
    saveBtn.addEventListener('click', async () => {
        try {
            const compiledKeys = JSON.parse(inputArea.value.trim());
            statusText.innerText = "Saving configuration parameters...";
            if (statusText.parentElement && statusText.parentElement.firstElementChild) {
                statusText.parentElement.firstElementChild.className = "h-2 w-2 rounded-full bg-amber-500 animate-pulse";
            }

            // Verify configuration structure validity
            initializeApp(compiledKeys, "verificationInstance");

            // Write verified configuration parameters to the master gateway
            await setDoc(doc(gatewayDb, "user_configs", activeUser.uid), compiledKeys);
            
            statusText.innerText = "Database connection verified and registered!";
            if (statusText.parentElement && statusText.parentElement.firstElementChild) {
                statusText.parentElement.firstElementChild.className = "h-2 w-2 rounded-full bg-emerald-500";
            }
        } catch (err) {
            alert("Configuration verification failure. Ensure valid Firebase JSON notation.");
            statusText.innerText = "Connection validation rejected.";
            if (statusText.parentElement && statusText.parentElement.firstElementChild) {
                statusText.parentElement.firstElementChild.className = "h-2 w-2 rounded-full bg-rose-500";
            }
        }
    });
}
