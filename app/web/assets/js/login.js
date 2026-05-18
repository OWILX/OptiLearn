
import { client } from './supabase.js';
import { toast } from './toast.js';

// ========== EYE ICON TOGGLE  ==========
document.querySelectorAll('.eye-icon').forEach(icon => {
    icon.addEventListener('click', () => {
        const input = icon.parentElement.querySelector('input');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });
});

// ========== VALIDATION HELPERS ==========
function toast.show(message) {
    toast.show(message);
}

function validateSignup(name, email, password) {
    if (!name || !email || !password) {
        toast.show('Please fill in all fields');
        return false;
    }
    if (password.length < 6) {
        toast.show('Password must be at least 6 characters');
        return false;
    }
    return true;
}

function validateLogin(email, password) {
    if (!email || !password) {
        toast.show('Please enter email and password');
        return false;
    }
    return true;
}

// ========== SIGN UP  ==========
document.getElementById("signup-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    const name = document.getElementById("signup-name").value;
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;
    if (!validateSignup(name, email, password)) return;
    try {
        const { data, error } = await client.auth.signUp({
            email: email,
            password: password,
            options: { data: { full_name: name } }
        });
        if (error) {
            toast.show(error.message);
        } else {
            if (data.user?.identities?.length === 0) {
                toast.show('User already exists. Please log in instead.');
            } else {
                toast.show("Account created successfully! Please check your email to confirm your account.");
                document.getElementById('auth-toggle').checked = false;
                document.getElementById("signup-name").value = '';
                document.getElementById("signup-email").value = '';
                document.getElementById("signup-password").value = '';
            }
        }
    } catch (err) {
        toast.show('Network error. Please try again.');
    }
});

// ========== LOGIN ==========
document.getElementById("login-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    if (!validateLogin(email, password)) return;
    try {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) {
            if (error.message.includes('Email not confirmed')) {
                toast.show('Please confirm your email address first. Check your inbox.');
            } else {
                toast.show(error.message);
            }
        } else {
            window.location.href = "index.html";
        }
    } catch (err) {
        toast.show('Network error. Please try again.');
    }
});

// ========== GOOGLE OAUTH  ==========
async function signInWithGoogle() {
    try {
        // Redirect to index.html after successful authentication
        const redirectTo = `${window.location.origin}/index.html`;
        const { data, error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectTo,
                queryParams: {
                    access_type: 'offline',   // optional: request refresh token
                    prompt: 'consent'
                }
            }
        });
        if (error) throw error;
        // Supabase automatically redirects to Google; no further action needed
    } catch (error) {
        console.error('Google OAuth error:', error);
        toast.show('Failed to sign in with Google. Please try again.');
    }
}

// Attach Google OAuth to both social buttons (Login & Signup containers)
document.querySelectorAll('.btn-social').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        signInWithGoogle();
    });
});

// ========== CHECK EXISTING SESSION – UPDATED ==========
// Redirect already authenticated users away from login page
(async () => {
    try {
        const { data } = await client.auth.getSession();
        if (data.session) {
            window.location.href = "index.html";
        }
    } catch (err) {
        console.error('Session check failed:', err);
    }
})();