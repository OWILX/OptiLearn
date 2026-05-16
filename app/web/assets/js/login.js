  //   import { client } from './supabase.js';

// ========== EYE ICON TOGGLE ==========
document.querySelectorAll('.eye-icon').forEach(icon => {
    icon.addEventListener('click', () => {
        // ✅ Use 'icon' instead of 'this'
        const input = icon.parentElement.querySelector('input');

        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } /*else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');*/
        }
    });
});

// ========== VALIDATION HELPERS ==========
function showError(message) {
    alert(message);
}

function validateSignup(name, email, password) {
    if (!name || !email || !password) {
        showError('Please fill in all fields');
        return false;
    }
    if (password.length < 6) {
        showError('Password must be at least 6 characters');
        return false;
    }
    return true;
}

function validateLogin(email, password) {
    if (!email || !password) {
        showError('Please enter email and password');
        return false;
    }
    return true;
}

// ========== SIGN UP ==========
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
            options: {
                data: { full_name: name }
            }
        });

        if (error) {
            showError(error.message);
        } else {
            if (data.user?.identities?.length === 0) {
                showError('User already exists. Please log in instead.');
            } else {
                alert("Account created successfully! Please check your email to confirm your account.");
                // Switch to login tab
                document.getElementById('auth-toggle').checked = false;
                // Clear signup form
                document.getElementById("signup-name").value = '';
                document.getElementById("signup-email").value = '';
                document.getElementById("signup-password").value = '';
            }
        }
    } catch (err) {
        showError('Network error. Please try again.');
    }
});

// ========== LOGIN ==========
document.getElementById("login-btn").addEventListener("click", async (e) => {
    e.preventDefault();

    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    if (!validateLogin(email, password)) return;

    try {
        const { data, error } = await client.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            if (error.message.includes('Email not confirmed')) {
                showError('Please confirm your email address first. Check your inbox.');
            } else {
                showError(error.message);
            }
        } else {
            window.location.href = "index.html";
        }
    } catch (err) {
        showError('Network error. Please try again.');
    }
});

// ========== CHECK EXISTING SESSION ==========
/*(async () => {
    try {
        const { data } = await client.auth.getSession();
        if (data.session) {
            window.location.href = "home.html";
        }
    } catch (err) {
        console.error('Session check failed:', err);
    }
})();