import { client } from './supabase.js';
import { toast } from './toast.js';

// ========== CONFIGURABLE REDIRECTS ==========
const REDIRECT_AFTER_LOGIN = '/OptiLearn/app/web/index.html';        // Change to your desired page
const REDIRECT_AFTER_SIGNUP = '/OptiLearn/app/web/login.html';       // Where user lands after email confirmation
const REDIRECT_AFTER_GOOGLE = '/OptiLearn/app/web/index.html';       // Must be added in Supabase Console → Authentication → URL Configuration

toast.show(window.location.pathname,'success')
toast.show(window.location.origin, 'success')
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

// ========== CHECK IF EMAIL IS ALREADY REGISTERED ==========
async function isEmailRegistered(email) {
    try {
        // This uses signInWithOtp with shouldCreateUser: false
        // It will error with 'User not found' if email is available
        const { error } = await client.auth.signInWithOtp({
            email: email.trim(),
            options: {
                shouldCreateUser: false   // Do NOT send email if user doesn't exist
            }
        });
        // If error message indicates user not found, email is free
        if (error && error.message.toLowerCase().includes('user not found')) {
            return false;
        }
        // If no error or other error (e.g., rate limit), assume exists or uncertain
        // For signup UX, we'll rely on the signUp error anyway, but this helps early validation
        return !(error && error.message.toLowerCase().includes('user not found'));
    } catch (err) {
        console.error('Check email error:', err);
        return false; // assume available on network error
    }
}

// ========== VALIDATION ==========
function validateSignup(name, email, password, confirmPassword) {
    name = name.trim();
    email = email.trim();

    if (!name || !email || !password || !confirmPassword) {
        toast.show('Please fill in all fields', 'error');
        return false;
    }
    if (name.length < 2) {
        toast.show('Name is too short', 'error');
        return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        toast.show('Please enter a valid email address', 'error');
        return false;
    }
    if (password.length < 6) {
        toast.show('Password must be at least 6 characters', 'error');
        return false;
    }
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /\d/.test(password);
    if (!hasLetter || !hasNumber) {
        toast.show('Password must contain letters and numbers', 'error');
        return false;
    }
    if (password !== confirmPassword) {
        toast.show('Passwords do not match', 'error');
        return false;
    }
    return true;
}

function validateLogin(email, password) {
    email = email.trim();
    if (!email || !password) {
        toast.show('Please enter email and password', 'error');
        return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        toast.show('Please enter a valid email address', 'error');
        return false;
    }
    if (password.length < 6) {
        toast.show('Password must be at least 6 characters', 'error');
        return false;
    }
    return true;
}

// ========== SIGN UP ==========
document.getElementById("signup-btn").addEventListener("click", async (e) => {
    e.preventDefault();

    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const confirmPassword = document.getElementById("signup-confirm-password").value;

    if (!validateSignup(name, email, password, confirmPassword)) return;

    // Optional: early check for existing user to improve UX
    const alreadyExists = await isEmailRegistered(email);
    if (alreadyExists) {
        toast.show('This email is already registered. Please log in.', 'warning');
        // Optionally switch to login tab
        document.getElementById('auth-toggle').checked = false;
        return;
    }

    try {
        const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin + REDIRECT_AFTER_SIGNUP,
                data: { full_name: name }
            }
        });

        if (error) {
            // Improved error messages for existing user
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes('already registered') || errorMsg.includes('user already registered')) {
                toast.show('This email is already registered', 'error');
            } else if (errorMsg.includes('invalid email')) {
                toast.show('Invalid email address', 'error');
            } else if (errorMsg.includes('password')) {
                toast.show('Password is too weak. Use at least 6 characters with letters and numbers.', 'error');
            } else {
                toast.show(error.message, 'error');
            }
            return;
        }

        // If user already exists but somehow no error (identities check)
        if (data.user?.identities?.length === 0) {
            toast.show('This email is already registered', 'error');
            return;
        }

        toast.show('Account created! Check your email to confirm.', 'success', 5000);

        // Clear fields
        document.getElementById("signup-name").value = '';
        document.getElementById("signup-email").value = '';
        document.getElementById("signup-password").value = '';
        document.getElementById("signup-confirm-password").value = '';

        // Switch to login tab
        document.getElementById('auth-toggle').checked = false;

    } catch (err) {
        console.error(err);
        toast.show('Network error. Please check your internet.', 'error');
    }
});

// ========== LOGIN ==========
document.getElementById("login-btn").addEventListener("click", async (e) => {
    e.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    if (!validateLogin(email, password)) return;

    try {
        const { data, error } = await client.auth.signInWithPassword({ email, password });

        if (error) {
            if (error.message.toLowerCase().includes('email not confirmed')) {
                toast.show('Please confirm your email address first. Check your inbox.', 'warning', 5000);
            } else if (error.message.toLowerCase().includes('invalid login credentials')) {
                toast.show('Invalid email or password', 'error');
            } else {
                toast.show(error.message, 'error');
            }
            return;
        }

        window.location.href = REDIRECT_AFTER_LOGIN;

    } catch (err) {
        console.error(err);
        toast.show('Network error. Please try again.', 'error');
    }
});

// ========== GOOGLE OAUTH ==========
async function signInWithGoogle() {
    try {
        const { error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + REDIRECT_AFTER_GOOGLE,
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

document.querySelectorAll('.btn-social').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        signInWithGoogle();
    });
});

// ========== HANDLE EMAIL CONFIRMATION & OAUTH REDIRECTS ==========
// If user lands on this page after email confirmation, show a message.
// Also handle OAuth redirect result (if needed).
/*(async () => {
    // Check if this is a redirect after email confirmation
    const urlParams = new URLSearchParams(window.location.search);
    const confirmed = urlParams.get('confirmed');
    if (confirmed === 'true') {
        toast.show('Email confirmed! You can now log in.', 'success', 4000);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check for OAuth redirect session (already handled by Supabase automatically,
    // but we can listen for auth state change to redirect if on login page)
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && window.location.pathname.includes('login.html')) {
            window.location.href = REDIRECT_AFTER_LOGIN;
        }
    });
})();
*/
// Optional: auto-redirect if already logged in (uncomment if desired)
/*
(async () => {
    const { data } = await client.auth.getSession();
    if (data.session && window.location.pathname.includes('login.html')) {
        window.location.href = REDIRECT_AFTER_LOGIN;
    }
})();
*/