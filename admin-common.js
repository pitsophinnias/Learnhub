// admin-common.js - Shared functionality for all admin pages
document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu functionality
    const menuToggle = document.getElementById('menuToggle');
    const navMenu = document.getElementById('navMenu');
    const menuOverlay = document.getElementById('menuOverlay');
    const body = document.body;

    if (!menuToggle || !navMenu) return;

    function closeMenu() {
        navMenu.classList.remove('active');
        if (menuOverlay) menuOverlay.classList.remove('active');
        body.classList.remove('menu-open');
    }

    function openMenu() {
        navMenu.classList.add('active');
        if (menuOverlay) menuOverlay.classList.add('active');
        body.classList.add('menu-open');
    }

    menuToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        if (navMenu.classList.contains('active')) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    if (menuOverlay) {
        menuOverlay.addEventListener('click', function(e) {
            e.preventDefault();
            closeMenu();
        });
    }

    // Close menu when clicking on a link (for mobile)
    const menuLinks = navMenu.querySelectorAll('a');
    menuLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // Allow the link to work normally
            if (window.innerWidth <= 768) {
                // Small delay to allow the click to register before closing
                setTimeout(closeMenu, 100);
            }
        });
    });

    // Close menu on window resize if opened in mobile view
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768 && navMenu.classList.contains('active')) {
            closeMenu();
        }
    });

    // Highlight active page in navigation
    const currentPage = window.location.pathname.split('/').pop() || 'admin.html';
    menuLinks.forEach(link => {
        const linkPage = link.getAttribute('href');
        if (linkPage === currentPage) {
            link.classList.add('active');
        }
    });
});