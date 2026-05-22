
    import { client } from './assets/js/supabase.js';

if (session) {
    console.log('User is logged in:', session.user.email);

    // --- Update the welcome message with the real name ---
    const userName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Student';
    document.querySelector('.welcome-title').innerHTML = `Welcome back, ${userName}! `;

    // Optional: Update the avatar image if you stored one in metadata
    // if (session.user.user_metadata?.avatar_url) {
    //   document.querySelector('.avatar').src = session.user.user_metadata.avatar_url;
    // }
} else {
    window.location.href = 'login.html';
}

    document.addEventListener('DOMContentLoaded', () => {
        // 1. Quick Action Cards
        const studyCard = document.querySelector('.action-card.purple');
        const sepCard = document.querySelector('.action-card.blue');
        const pastQuestionsCard = document.querySelector('.action-card.teal');
        
        if (studyCard) {
            studyCard.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'study.html';
            });
        }
        if (sepCard) {
            sepCard.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'exam.html';
            });
        }
        if (pastQuestionsCard) {
            pastQuestionsCard.addEventListener('click', (e) => {
                e.preventDefault();
                alert('📖 Past questions library coming soon.');
            });
        }

        // 2. Start Mock Exam Button
        const startExamBtn = document.querySelector('.btn-start-exam');
        if (startExamBtn) {
            startExamBtn.addEventListener('click', () => {
                window.location.href = 'exam.html';
            });
        }

        // 3. Bottom Navigation Items
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                // Remove active class from all, then add to clicked
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                const page = item.querySelector('span')?.innerText || 'page';
                alert(`📱 Navigating to ${page} (demo)`);
                // Later: actual routing
            });
        });

        // Center floating button
        const floatingBtn = document.querySelector('.floating-btn');
        if (floatingBtn) {
            floatingBtn.addEventListener('click', (e) => {
                e.preventDefault();
                alert('➕ Start a quick practice session!');
            });
        }

        // 4. Header icons (menu, notification)
        const menuBtn = document.querySelector('.menu-btn');
        if (menuBtn) {
            menuBtn.addEventListener('click', () => {
                alert('📋 Side menu coming soon.');
            });
        }
        const notificationBtn = document.querySelector('.notification');
        if (notificationBtn) {
            notificationBtn.addEventListener('click', () => {
                alert('🔔 No new notifications.');
            });
        }

        // 5. "View all" link in QOTD section
        const viewAllLink = document.querySelector('.section-title .view-all');
        if (viewAllLink) {
            viewAllLink.addEventListener('click', (e) => {
                e.preventDefault();
                alert('📋 View all questions (coming soon).');
            });
        }
    })
