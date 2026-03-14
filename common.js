// common.js - Shared Authentication & Premium Logic
const AUTH_KEY = "steno_user_data";

// Checks if the user is currently premium based on local storage
function isUserPremium() {
    const data = JSON.parse(localStorage.getItem(AUTH_KEY));
    if (!data || data.plan !== 'premium' || !data.expiry) return false;
    
    // Check if the expiry date has passed
    const expiryDate = new Date(data.expiry);
    return new Date() < expiryDate;
}

// Function to call whenever user data changes (login/snapshot update)
function syncAuthToStorage(userData) {
    if (!userData) {
        localStorage.removeItem(AUTH_KEY);
        return;
    }
    
    // Handle Firestore Timestamp object vs ISO string
    let expiryValue = userData.expiry;
    if (expiryValue && typeof expiryValue.toDate === 'function') {
        expiryValue = expiryValue.toDate().toISOString();
    }
    
    const dataToSave = {
        plan: userData.plan,
        expiry: expiryValue,
        name: userData.name
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(dataToSave));
}
