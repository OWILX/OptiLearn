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

// ========== VALIDATION HELPERS (with confirm password) ==========
function validateSignup(name, email, password, confirmPassword) {

    // Remove accidental spaces
    name = name.trim();
    email = email.trim();

    // ===== EMPTY FIELDS =====
    if (!name || !email || !password || !confirmPassword) {
        toast.show('Please fill in all fields', 'error');
        return false;
    }

    // ===== NAME LENGTH =====
    if (name.length < 2) {
        toast.show('Name is too short', 'error');
        return false;
    }

    // ===== EMAIL FORMAT =====
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
        toast.show('Please enter a valid email address', 'error');
        return false;
    }

    // ===== PASSWORD LENGTH =====
    if (password.length < 6) {
        toast.show('Password must be at least 6 characters', 'error');
        return false;
    }

    // ===== WEAK PASSWORD =====
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /\d/.test(password);

    if (!hasLetter || !hasNumber) {
        toast.show(
            'Password must contain letters and numbers',
            'error'
        );
        return false;
    }

    // ===== PASSWORD MATCH =====
    if (password !== confirmPassword) {
        toast.show('Passwords do not match', 'error');
        return false;
    }

    return true;
}
// ========== SIGN UP (with confirm password) ==========
document.getElementById("signup-btn").addEventListener("click", async (e) => {

    e.preventDefault();

    const name = document.getElementById("signup-name").value.trim();

    const email = document.getElementById("signup-email").value.trim();

    const password = document.getElementById("signup-password").value;

    const confirmPassword =
        document.getElementById("signup-confirm-password").value;

    if (!validateSignup(name, email, password, confirmPassword)) return;

    try {

        const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: 'https://github.io/app/web/login.html',
                data: {
                    full_name: name
                }
            }
        });

        console.log(data);
        console.log(error);

        // ===== HANDLE SUPABASE ERRORS =====
        if (error) {

            const msg = error.message.toLowerCase();

            if (msg.includes('already registered')) {

                toast.show(
                    'This email is already registered',
                    'error'
                );

            } else if (msg.includes('invalid email')) {

                toast.show(
                    'Invalid email address',
                    'error'
                );

            } else if (msg.includes('password')) {

                toast.show(
                    'Password is too weak',
                    'error'
                );

            } else {

                toast.show(error.message, 'error');

            }

            return;
        }

        // ===== DETECT EXISTING USER =====
        if (data.user?.identities?.length === 0) {

            toast.show(
                'This email has already been used',
                'error'
            );

            return;
        }

        // ===== SUCCESS =====
        toast.show(
            'Account created! Check your email to confirm.',
            'success',
            3000
        );

        // Clear fields
        document.getElementById("signup-name").value = '';
        document.getElementById("signup-email").value = '';
        document.getElementById("signup-password").value = '';
        document.getElementById("signup-confirm-password").value = '';

        // Switch back to login
        document.getElementById('auth-toggle').checked = false;

    } catch (err) {

        console.error(err);

        toast.show(
            'Network error. Please check your internet.',
            'error'
        );
    }
});

        document.getElementById("signup-name").value = '';
        document.getElementById("signup-email").value = '';
        document.getElementById("signup-password").value = '';
        document.getElementById("signup-confirm-password").value = '';

        document.getElementById('auth-toggle').checked = false;

    } catch (err) {
        console.error(err);
        toast.show('Network error. Please try again.', 'error');
    }
});
if (error) {
    console.error(error);
    toast.show(error.message, 'error');
}

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
/* (async () => {
    try {
        const { data } = await client.auth.getSession();
        if (data.session) {
            window.location.href = "index.html";
        }
    } catch (err) {
        console.error('Session check failed:', err);
    }
})(); */