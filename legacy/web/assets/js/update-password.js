const SUPABASE_URL = 'https://jxdllmwdyvhcsdvodnbb.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZGxsbXdkeXZoY3Nkdm9kbmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDg2OTgsImV4cCI6MjA5Mjg4NDY5OH0.KlkSqiB_KRT6aQdN-olzIo6sYLZQ0ECA9KBoUs6F44g';
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    const updateBtn = document.getElementById('update-btn');
    const newPw = document.getElementById('new-password');
    const confirmPw = document.getElementById('confirm-password');
    const msgDiv = document.getElementById('msg');

    // ---------- Eye toggle logic ----------
    document.querySelectorAll('.toggle-password').forEach(icon => {
        icon.addEventListener('click', function () {
            const input = document.getElementById(this.dataset.target);
            if (!input) return;
            
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            
            // Swap eye icons correctly
            if (isPassword) {
                this.classList.remove('fa-eye');
                this.classList.add('fa-eye-slash');
            } else {
                this.classList.remove('fa-eye-slash');
                this.classList.add('fa-eye');
            }
        });
    });

    // ---------- Password update logic ----------
    async function updatePassword() {
        const password = newPw.value;
        const confirm = confirmPw.value;

        if (!password || !confirm) {
            msgDiv.textContent = 'Please fill in both fields.';
            msgDiv.className = 'message error';
            return;
        }
        if (password !== confirm) {
            msgDiv.textContent = 'Passwords do not match.';
            msgDiv.className = 'message error';
            return;
        }
        if (password.length < 6) {
            msgDiv.textContent = 'Password must be at least 6 characters.';
            msgDiv.className = 'message error';
            return;
        }

        updateBtn.disabled = true;
        updateBtn.innerHTML = 'Updating... <i class="fa-solid fa-spinner fa-pulse"></i>';

        const { error } = await supabaseClient.auth.updateUser({ password: password });
        if (error) {
            msgDiv.textContent = error.message;
            msgDiv.className = 'message error';
        } else {
            msgDiv.textContent = '✅ Password updated! Redirecting to login...';
            msgDiv.className = 'message success';
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        }
        updateBtn.disabled = false;
        updateBtn.innerHTML = 'Update Password <i class="fa-solid fa-check"></i>';
    }

    updateBtn.addEventListener('click', updatePassword);
    confirmPw.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') updatePassword();
    });