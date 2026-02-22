document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('forgot-form');
    const messageEl = document.getElementById('message');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        if (!username) {
            showMessage('Please enter your username', 'error');
            return;
        }

        showMessage('Sending reset link...', 'info');

        try {
            const res = await fetch('/api/admin/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });

            const data = await res.json();

            if (res.ok) {
                showMessage('Reset link sent! Check your email (including spam folder).', 'success');
                form.reset();
            } else {
                showMessage(data.error || 'Something went wrong. Try again.', 'error');
            }
        } catch (err) {
            console.error(err);
            showMessage('Network error. Please check your connection.', 'error');
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