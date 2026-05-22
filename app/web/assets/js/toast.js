class ToastManager {
    constructor() {
        this.container = document.getElementById('toast-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    }

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - 'success', 'error', 'info', 'warning'
     * @param {number} duration - Time in milliseconds to show the toast (default: 3000)
     */
    show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        // Make entire toast clickable for dismissal
        toast.style.cursor = 'pointer';

        // Icon based on type
        let iconHtml = '';
        switch (type) {
            case 'success':
                iconHtml = '<i class="fa-regular fa-circle-check"></i>';
                break;
            case 'error':
                iconHtml = '<i class="fa-regular fa-circle-xmark"></i>';
                break;
            case 'warning':
                iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';
                break;
            default:
                iconHtml = '<i class="fa-regular fa-circle-info"></i>';
        }

        toast.innerHTML = `
            <div class="toast-icon">${iconHtml}</div>
            <div class="toast-content">${this.escapeHtml(message)}</div>
        `;

        this.container.appendChild(toast);

        // Auto dismiss after duration
        const timeoutId = setTimeout(() => {
            this.dismiss(toast);
        }, duration);

        // Store timeoutId on the toast for possible early dismissal
        toast._timeoutId = timeoutId;
        
        // Click anywhere on toast to dismiss
        toast.addEventListener('click', () => {
            this.dismiss(toast);
        });
    }

    dismiss(toast) {
        // Prevent multiple dismissals
        if (toast._isDismissing) return;
        toast._isDismissing = true;
        
        if (toast._timeoutId) {
            clearTimeout(toast._timeoutId);
        }
        
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => {
            if (toast.parentNode) {
                toast.remove();
            }
        });
    }

    // Helper to prevent XSS
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Singleton instance
export const toast = new ToastManager();

// Optional: attach to window for debugging (remove in production)
if (typeof window !== 'undefined') {
    window.toast = toast;
}