// login.js - Cleaned up version
import { client } from './supabase.js';

// Helper function to show error messages
function showError(message) {
    alert(message);
}

// Helper function to validate inputs
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

// SIGN UP - Single clean handler
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
                data: {
                    full_name: name
                }
            }
        });

        if (error) {
            showError(error.message);
        } else {
            if (data.user?.identities?.length === 0) {
                showError('User already exists. Please log in instead.');
            } else {
                alert("Account created successfully! Please check your email to confirm your account.");
                // Optionally switch to login tab
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

// LOG IN - Single clean handler
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
            alert("Login successful!");
            window.location.href = "index.html";
        }
    } catch (err) {
        showError('Network error. Please try again.');
    }
});

// Check if user is already logged in - redirect to home
(async () => {
    try {
        const { data } = await client.auth.getSession();
        if (data.session) {
            window.location.href = "home.html";
        }
    } catch (err) {
        console.error('Session check failed:', err);
    }
})();
// Toggle password visibility for all eye icons
// Toggle password visibility for all eye icons
document.querySelectorAll('.eye-icon').forEach(icon => {
    icon.addEventListener('click', function(e) {
        e.preventDefault(); // Prevent any unexpected form submission
        const input = this.parentElement.querySelector('input');
        if (input.type === 'password') {
            input.type = 'text';
            this.classList.remove('fa-eye');
            this.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            this.classList.remove('fa-eye-slash');
            this.classList.add('fa-eye');
        }
    });
});