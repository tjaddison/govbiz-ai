// Clear all authentication data
console.log('🧹 Clearing all authentication data...');

// Clear localStorage
localStorage.clear();
console.log('✅ localStorage cleared');

// Clear sessionStorage
sessionStorage.clear();
console.log('✅ sessionStorage cleared');

// Clear cookies
document.cookie.split(";").forEach(function(c) {
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
});
console.log('✅ Cookies cleared');

console.log('🎉 All authentication data cleared!');
console.log('📍 Please refresh the page and log in again to get fresh tokens.');

// Show current storage state
console.log('\n📋 Current localStorage contents:', localStorage.length === 0 ? 'Empty' : Object.keys(localStorage));
console.log('📋 Current sessionStorage contents:', sessionStorage.length === 0 ? 'Empty' : Object.keys(sessionStorage));