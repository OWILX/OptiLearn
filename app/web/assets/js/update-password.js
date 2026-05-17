// Supabase configuration
const SUPABASE_URL = 'https://jxdllmwdyvhcsdvodnbb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZGxsbXdkeXZoY3Nkdm9kbmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDg2OTgsImV4cCI6MjA5Mjg4NDY5OH0.KlkSqiB_KRT6aQdN-olzIo6sYLZQ0ECA9KBoUs6F44g';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const updateBtn = document.getElementById('update-btn');
const newPw = document.getElementById('new-password');
const confirmPw = document.getElementById('confirm-password');
const msgDiv = document.getElementById('msg');
const loadingOverlay = document.getElementById('loading-overlay');
const mainContent = document.getElementById('main-content');

// Check for session on load
async function checkSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
        window.location.href = 'forgot-password.html?error=session_expired';
    } else {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';
    }
}

function toggleVisibility(id, el) {
    const input = document.getElementById(id);
    if (input.type === 'password') {
        input.type = 'text';
        el.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        el.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

async function updatePassword() {
    const password = newPw.value;
    const confirm = confirmPw.value;
    
    if (!password || !confirm) {
        msgDiv.textContent = 'Please fill in both fields.';
        msgDiv.className = 'message error';
        msgDiv.style.display = 'block';
        return;
    }
    if (password !== confirm) {
        msgDiv.textContent = 'Passwords do not match.';
        msgDiv.className = 'message error';
        msgDiv.style.display = 'block';
        return;
    }
    if (password.length < 6) {
        msgDiv.textContent = 'Password must be at least 6 characters.';
        msgDiv.className = 'message error';
        msgDiv.style.display = 'block';
        return;
    }

    updateBtn.disabled = true;
    updateBtn.innerHTML = 'Updating... <i class="fa-solid fa-spinner fa-pulse"></i>';
    msgDiv.style.display = 'none';

    const { error } = await supabase.auth.updateUser({ password: password });
    
    if (error) {
        msgDiv.textContent = error.message;
        msgDiv.className = 'message error';
        msgDiv.style.display = 'block';
        updateBtn.disabled = false;
        updateBtn.innerHTML = 'Update Password';
    } else {
        msgDiv.textContent = '✅ Password updated! Redirecting to login...';
        msgDiv.className = 'message success';
        msgDiv.style.display = 'block';
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2500);
    }
}

if (updateBtn) {
    updateBtn.addEventListener('click', updatePassword);
}

// Global visibility toggle function for HTML onclick
window.toggleVisibility = toggleVisibility;

// Initialize session check
checkSession();
