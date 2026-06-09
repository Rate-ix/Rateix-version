document.addEventListener('DOMContentLoaded', () => {

    // ==========================================================================
    // 1. NAVBAR SCROLL STATE MANAGEMENT
    // ==========================================================================
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 60) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // ==========================================================================
    // 2. MOBILE MENU NAVIGATION
    // ==========================================================================
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileNav = document.querySelector('.mobile-nav');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

    if (mobileMenuBtn && mobileNav) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileNav.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
            
            const bars = mobileMenuBtn.querySelectorAll('.bar');
            if (mobileNav.classList.contains('active')) {
                bars[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                bars[1].style.opacity = '0';
                bars[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
            } else {
                bars[0].style.transform = 'none';
                bars[1].style.opacity = '1';
                bars[2].style.transform = 'none';
            }
        });

        mobileNavLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileNav.classList.remove('active');
                const bars = mobileMenuBtn.querySelectorAll('.bar');
                bars[0].style.transform = 'none';
                bars[1].style.opacity = '1';
                bars[2].style.transform = 'none';
            });
        });
    }

    // ==========================================================================
    // 3. SUPABASE AUTH SYSTEM & PORTAL CONTROL
    // ==========================================================================
    const SUPABASE_URL = 'https://yaupttkahhphwcaitylp.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhdXB0dGthaGhwaHd' + 
      'jYWl0eWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2Njk4OTEsImV4cCI6MjA5NTI0NTg5MX0.UwqZLuPCZGYoqBUaPI7myJAxNKj3zaFGMkNgg64jkIo';
    
    let supabase = null;
    try {
        if (window.supabase) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    storage: window.localStorage,
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true
                }
            });
            console.log('Supabase Client Initialized');
            
            // Auto-redirect if already logged in via cached session
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (session) {
                    window.location.href = 'dashboard.html';
                }
            });
        } else {
            console.warn('Supabase library missing. Operating in offline demo mode.');
        }
    } catch (e) {
        console.error('Failed to initialize Supabase client:', e);
    }

    const authModal = document.getElementById('authModal');
    const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
    
    const tabSignup = document.getElementById('tabSignup');
    const tabLogin = document.getElementById('tabLogin');
    const signupForm = document.getElementById('signupForm');
    const loginForm = document.getElementById('loginForm');
    const authStatus = document.getElementById('authStatusMessage');

    const openAuthModal = () => {
        if (authModal) {
            authModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    };

    const closeAuthModal = () => {
        if (authModal) {
            authModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    if (closeAuthModalBtn) {
        closeAuthModalBtn.addEventListener('click', closeAuthModal);
    }

    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if (e.target === authModal) {
                closeAuthModal();
            }
        });
    }

    const activateSignupTab = (e) => {
        if (e) e.preventDefault();
        openAuthModal();
        if (tabSignup && tabLogin && signupForm && loginForm) {
            tabSignup.classList.add('active');
            tabLogin.classList.remove('active');
            signupForm.classList.add('active');
            loginForm.classList.remove('active');
            if (authStatus) authStatus.className = 'auth-status-panel';
        }
    };

    const activateLoginTab = (e) => {
        if (e) e.preventDefault();
        openAuthModal();
        if (tabSignup && tabLogin && signupForm && loginForm) {
            tabLogin.classList.add('active');
            tabSignup.classList.remove('active');
            loginForm.classList.add('active');
            signupForm.classList.remove('active');
            if (authStatus) authStatus.className = 'auth-status-panel';
        }
    };

    if (tabSignup && tabLogin) {
        tabSignup.addEventListener('click', (e) => {
            e.preventDefault();
            if (tabSignup && tabLogin && signupForm && loginForm) {
                tabSignup.classList.add('active');
                tabLogin.classList.remove('active');
                signupForm.classList.add('active');
                loginForm.classList.remove('active');
            }
        });
        tabLogin.addEventListener('click', (e) => {
            e.preventDefault();
            if (tabSignup && tabLogin && signupForm && loginForm) {
                tabLogin.classList.add('active');
                tabSignup.classList.remove('active');
                loginForm.classList.add('active');
                signupForm.classList.remove('active');
            }
        });
    }

    // Connect Navbar & Hero buttons to modal open + tab switch actions
    const navLinkLogin = document.getElementById('navLinkLogin');
    const navLinkRegister = document.getElementById('navLinkRegister');
    const mobileLinkLogin = document.getElementById('mobileLinkLogin');
    const mobileLinkRegister = document.getElementById('mobileLinkRegister');
    const heroGetStartedBtn = document.getElementById('heroGetStartedBtn');

    if (navLinkLogin) navLinkLogin.addEventListener('click', activateLoginTab);
    if (mobileLinkLogin) mobileLinkLogin.addEventListener('click', activateLoginTab);
    if (navLinkRegister) navLinkRegister.addEventListener('click', activateSignupTab);
    if (mobileLinkRegister) mobileLinkRegister.addEventListener('click', activateSignupTab);
    if (heroGetStartedBtn) heroGetStartedBtn.addEventListener('click', activateSignupTab);

    const setStatusMessage = (text, type) => {
        if (!authStatus) return;
        authStatus.textContent = text;
        authStatus.className = `auth-status-panel ${type}`;
    };

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const storeName = document.getElementById('signupStoreName').value;
            const ownerName = document.getElementById('signupOwnerName').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            const phone = document.getElementById('signupPhone').value;
            const gstin = document.getElementById('signupGSTIN').value;
            const address = document.getElementById('signupAddress').value;
            const pinCode = document.getElementById('signupPinCode').value;

            const submitBtn = signupForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Registering Shop...';

            if (!supabase) {
                window.location.href = 'dashboard.html';
                return;
            }

            try {
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            shop_name: storeName,
                            full_name: ownerName,
                            phone: phone,
                            gstin: gstin,
                            shop_address: address,
                            pin_code: pinCode
                        }
                    }
                });

                if (error) {
                    setStatusMessage(`Failed: ${error.message}`, 'error');
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create Free Account';
                    return;
                }

                if (data.user) {
                    const { error: profileError } = await supabase
                        .from('profiles')
                        .insert({
                            id: data.user.id,
                            full_name: ownerName,
                            email: email,
                            phone: phone,
                            shop_name: storeName,
                            gstin: gstin,
                            business_type: 'retail',
                            shop_address: address
                        });
                    
                    if (profileError) {
                        console.warn('Profile DB save warning:', profileError.message);
                    }
                }

                window.location.href = 'dashboard.html';
                
            } catch (err) {
                setStatusMessage(`Network error: ${err.message}`, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Free Account';
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            const submitBtn = loginForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing In...';

            if (!supabase) {
                window.location.href = 'dashboard.html';
                return;
            }

            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) {
                    setStatusMessage(`Failed: ${error.message}`, 'error');
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Log In to Shop';
                    return;
                }

                window.location.href = 'dashboard.html';

            } catch (err) {
                setStatusMessage(`Network error: ${err.message}`, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Log In to Shop';
            }
        });
    }

    // ==========================================================================
    // 4. LEGAL POLICY TERMS MODALS
    // ==========================================================================
    const privacyBtn = document.getElementById('privacyPolicyBtn');
    const termsBtn = document.getElementById('termsOfServiceBtn');
    const modal = document.getElementById('legalModal');
    const modalContent = document.getElementById('legalModalContent');
    const closeBtn = document.getElementById('closeLegalModalBtn');

    const openLegalModal = (type) => {
        if (!modal || !modalContent) return;
        
        let title = '';
        let body = '';
        
        if (type === 'privacy') {
            title = 'Privacy Policy';
            body = `
                <h3>Privacy Policy</h3>
                <p>Welcome to Ratix. We keep your shop details and customer ledgers secure.</p>
                <h4>1. Information We Collect</h4>
                <p>We only collect your email, shop name, and contact details to manage your store account.</p>
                <h4>2. Security</h4>
                <p>Your ledger data is encrypted and backed up safely in cloud databases.</p>
            `;
        } else {
            title = 'Terms of Service';
            body = `
                <h3>Terms of Service</h3>
                <p>By using Ratix, you agree to these simple shop rules.</p>
                <h4>1. Account Rules</h4>
                <p>Ensure you record credit details accurately. We do not edit your data.</p>
                <h4>2. Messaging</h4>
                <p>Ensure WhatsApp reminders are only sent to your direct customers.</p>
            `;
        }

        modalContent.innerHTML = body;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    if (privacyBtn) privacyBtn.addEventListener('click', (e) => { e.preventDefault(); openLegalModal('privacy'); });
    if (termsBtn) termsBtn.addEventListener('click', (e) => { e.preventDefault(); openLegalModal('terms'); });
    if (closeBtn) closeBtn.addEventListener('click', () => {
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

});
