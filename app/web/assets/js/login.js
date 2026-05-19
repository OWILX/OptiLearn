import { client } from './supabase.js';
import { toast } from './toast.js';

// ========== EYE ICON TOGGLE ==========
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

// ========== VALIDATION HELPERS  ==========
function validateSignup(name, email, password, confirmPassword) {
    if (!name || !email || !password || !confirmPassword) {
        toast.show('Please fill in all fields', 'error');
        return false;
    }
    if (password.length < 6) {
        toast.show('Password must be at least 6 characters', 'error');
        return false;
    }
    if (password !== confirmPassword) {
        toast.show('Passwords do not match', 'error');
        return false;
    }
    return true;
}

// ========== SIGN UP () ==========
document.getElementById("signup-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    const name = document.getElementById("signup-name").value;
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;
    const confirmPassword = document.getElementById("signup-confirm-password").value;
    
    if (!validateSignup(name, email, password, confirmPassword)) return;
    
    try {
        const { data, error } = await client.auth.signUp({
            email: email,
            password: password,
            options: { data: { full_name: name } }
        });
        if (error) {
            toast.show(error.message, 'error');
        } else {
            if (data.user?.identities?.length === 0) {
                toast.show('User already exists. Please log in instead.', 'error');
            } else {
                toast.show('Account created successfully! Please check your email to confirm your account.', 'success', 6000);
                document.getElementById('auth-toggle').checked = false;
                // Clear all signup fields including confirm password
                document.getElementById("signup-name").value = '';
                document.getElementById("signup-email").value = '';
                document.getElementById("signup-password").value = '';
                document.getElementById("signup-confirm-password").value = '';
            }
        }
    } catch (err) {
        toast.show('Network error. Please try again.', 'error');
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
                toast.show('Please confirm your email address first. Check your inbox.', 'warning', 5000);
            } else {
                toast.show(error.message, 'error');
            }
        } else {
            window.location.href = "index.html";
        }
    } catch (err) {
        toast.show('Network error. Please try again.', 'error');
    }
});

// ========== GOOGLE OAUTH ==========
async function signInWithGoogle() {
    try {
        const redirectTo = `${window.location.origin}/index.html`;
        const { data, error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectTo,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });
        if (error) throw error;
    } catch (error) {
        console.error('Google OAuth error:', error);
        toast.show('Failed to sign in with Google. Please try again.', 'error');
    }
}

// Attach Google OAuth to both social buttons
document.querySelectorAll('.btn-social').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        signInWithGoogle();
    });
});

// ========== CHECK EXISTING SESSION ==========
/*(async () => {
    try {
        const { data } = await client.auth.getSession();
        if (data.session) {
            window.location.href = "index.html";
        }
    } catch (err) {
        console.error('Session check failed:', err);
    }
})();*/