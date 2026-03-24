// --- digiwallet.js ---
const DigiWallet = {
    _KEY: "_cms_digiwallet",
    
    // Updates the wallet with fresh data from Firebase (Used by index.html)
    sync: (userData) => {
        if (!userData) { 
            localStorage.removeItem(DigiWallet._KEY); 
            return; 
        }
        const walletData = {
            uid: userData.uid,
            name: userData.name || 'User',
            email: userData.email,
            plan: userData.plan || 'free',
            expiry: userData.expiry?.toDate ? userData.expiry.toDate().getTime() : (userData.expiry ? new Date(userData.expiry).getTime() : null),
            lastSync: Date.now()
        };
        localStorage.setItem(DigiWallet._KEY, JSON.stringify(walletData));
    },
    
    // Retrieves data from the wallet (Used by all tools)
    getUser: () => {
        const data = localStorage.getItem(DigiWallet._KEY);
        return data ? JSON.parse(data) : null;
    },
    
    // Validates if the user is currently premium (Used by all tools)
    isPremium: () => {
        const user = DigiWallet.getUser();
        if (!user || user.plan !== 'premium' || !user.expiry) return false;
        return Date.now() < user.expiry;
    },
    
    // Clears the wallet on logout (Used by index.html)
    clear: () => { 
        localStorage.removeItem(DigiWallet._KEY); 
    }
};
