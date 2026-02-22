document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('reset-form');
    const messageEl = document.getElementById('message');

    if (!form) return;

    // Get token from URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
        showMessage('Invalid or missing reset token. Please request a new link.', 'error');
        form.style.display = 'none';
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const password = document.getElementById('password').value;
        const confirm = document.getElementById('confirm').value;

        if (password !== confirm) {
            showMessage('Passwords do not match', 'error');
            return;
        }

        if (password.length < 8) {
            showMessage('Password must be at least 8 characters', 'error');
            return;
        }

        showMessage('Resetting password...', 'info');

        try {
            const res = await fetch('/api/admin/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword: password })
            });

            const data = await res.json();

            if (res.ok) {
                showMessage('Password has been reset successfully! You can now log in.', 'success');
                form.reset();
                setTimeout(() => {
                    window.location.href = 'admin_login.html';
                }, 2500);
            } else {
                showMessage(data.error || 'Failed to reset password', 'error');
            }
        } catch (err) {
            console.error(err);
            showMessage('Network error. Please try again.', 'error');
        }
    });

    function showMessage(text, type = 'info') {
        messageEl.textContent = text;
        messageEl.style.color = type === 'success' ? 'var(--success-color)' :
                               type === 'error' ? 'var(--danger-color)' : 
                               'var(--primary-color)';
        messageEl.style.display = 'block';
    }
});