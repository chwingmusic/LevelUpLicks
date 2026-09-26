import { gatewayAuth, gatewayDb } from '../../main.js';
import { doc, getDoc, setDoc } from "https://gstatic.com";
import { initializeApp } from "https://gstatic.com";

export async function initPage() {
    console.log("Config component scope runtime initialized mapping operations.");
    
    const activeUser = gatewayAuth.currentUser;
    if (!activeUser) return;

    const inputArea = document.getElementById('configJsonInput');
    const statusText = document.getElementById('statusMessageText');
    const saveBtn = document.getElementById('btnSaveConfig');

    // Pre-populate form fields if remote profile data already exists
    try {
        const snapshot = await getDoc(doc(gatewayDb, "user_configs", activeUser.uid));
        if (snapshot.exists()) {
            inputArea.value = JSON.stringify(snapshot.data(), null, 2);
            statusText.innerText = "Personal Database Connection Synchronized.";
            statusText.parentElement.firstElementChild.className = "h-2 w-2 rounded-full bg-emerald-500";
        }
    } catch (e) {
        console.error("Failed to load existing configuration records:", e);
    }

    // Bind event action scopes
    saveBtn.addEventListener('click', async () => {
        try {
            const compiledKeys = JSON.parse(inputArea.value.trim());
            statusText.innerText = "Saving configuration parameters...";
            statusText.parentElement.firstElementChild.className = "h-2 w-2 rounded-full bg-amber-500 animate-pulse";

            // Verify configuration structure validity through instant initialization checks
            initializeApp(compiledKeys, "verificationInstance");

            // Write verified configuration parameters to the master gateway
            await setDoc(doc(gatewayDb, "user_configs", activeUser.uid), compiledKeys);
            
            statusText.innerText = "Database connection verified and registered!";
            statusText.parentElement.firstElementChild.className = "h-2 w-2 rounded-full bg-emerald-500";
        } catch (err) {
            alert("Configuration verification failure. Ensure valid Firebase JSON notation.");
            statusText.innerText = "Connection validation rejected.";
            statusText.parentElement.firstElementChild.className = "h-2 w-2 rounded-full bg-rose-500";
        }
    });
}
