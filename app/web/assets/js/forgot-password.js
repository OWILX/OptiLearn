  // Supabase configuration (same as your login)
    const SUPABASE_URL = 'https://jxdllmwdyvhcsdvodnbb.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZGxsbXdkeXZoY3Nkdm9kbmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDg2OTgsImV4cCI6MjA5Mjg4NDY5OH0.KlkSqiB_KRT6aQdN-olzIo6sYLZQ0ECA9KBoUs6F44g';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // DOM elements
    const resetBtn = document.getElementById('reset-btn');
    const emailInput = document.getElementById('reset-email');
    const messageBox = document.getElementById('message-box');

    function showMessage(text, isError = false) {
        messageBox.textContent = text;
        messageBox.className = `message ${isError ? 'error' : 'success'}`;
        // Auto-hide after 5 seconds
        setTimeout(() => {
            messageBox.style.display = 'none';
            messageBox.className = 'message';
        }, 5000);
    }

    async function sendResetLink() {
        const email = emailInput.value.trim();
        if (!email) {
            showMessage('Please enter your email address.', true);
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/;
        if (!emailRegex.test(email)) {
            showMessage('Please enter a valid email address.', true);
            return;
        }

        // Disable button during request
        resetBtn.disabled = true;
        resetBtn.innerHTML = 'Sending... <i class="fa-solid fa-spinner fa-pulse"></i>';

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/update-password.html', // page where user sets new password
            });

            if (error) {
                if (error.message.includes('User not found')) {
                    showMessage('No account found with that email address.', true);
                } else {
                    showMessage(error.message, true);
                }
            } else {
                showMessage('✅ Password reset link sent! Check your email (including spam folder).');
                emailInput.value = ''; // clear for privacy
            }
        } catch (err) {
            console.error(err);
            showMessage('Network error. Please try again later.', true);
        } finally {
            resetBtn.disabled = false;
            resetBtn.innerHTML = 'Send Reset Link <i class="fa-solid fa-paper-plane"></i>';
        }
    }

    resetBtn.addEventListener('click', sendResetLink);
    emailInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendResetLink();
    });
