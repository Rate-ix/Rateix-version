document.addEventListener('DOMContentLoaded', () => {
    // 0. Force Play background video on mobile devices (bypasses battery saver & strict policies)
    const bgVideo = document.querySelector('.video-element');
    if (bgVideo) {
        bgVideo.muted = true;
        bgVideo.playsInline = true;
        bgVideo.setAttribute('muted', '');
        bgVideo.setAttribute('playsinline', '');
        const playPromise = bgVideo.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {
                const forcePlay = () => {
                    bgVideo.play();
                    document.removeEventListener('click', forcePlay);
                    document.removeEventListener('touchstart', forcePlay);
                };
                document.addEventListener('click', forcePlay);
                document.addEventListener('touchstart', forcePlay);
            });
        }
    }

    // 1. Navbar Scroll State Management
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // 2. Mobile Menu Navigation Control
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileNav = document.querySelector('.mobile-nav');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link, .mobile-waitlist-btn');

    const toggleMobileMenu = () => {
        mobileMenuBtn.classList.toggle('active');
        mobileNav.classList.toggle('active');
        document.body.classList.toggle('no-scroll');
    };

    mobileMenuBtn.addEventListener('click', toggleMobileMenu);

    mobileNavLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (mobileNav.classList.contains('active')) {
                toggleMobileMenu();
            }
        });
    });

    // 3. Scroll Entrance Animations (Intersection Observer)
    const animateElements = document.querySelectorAll('.fade-in, .animate-scroll');

    const observerOptions = {
        root: null,
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    animateElements.forEach(element => {
        observer.observe(element);
    });

    // 4. Live Simulated Operational Terminal Updates
    const vehicleId = document.querySelector('.vehicle-id');
    const vehicleStatus = document.querySelector('.vehicle-status');
    const deliveryTime = document.querySelector('.delivery-time');

    setInterval(() => {
        if (vehicleId && vehicleStatus) {
            const drivers = ['Tempo TS-04', 'Carrier DL-09', 'Chota Hathi MH-12', 'Mini Truck UP-16'];
            const destinations = ['West Chowk Godown', 'Gole Market Hub', 'Main Bazar Kirana', 'Noida Mandi'];
            const statuses = ['In Transit to', 'Dispatched for', 'Arrived at', 'Out for Delivery to'];

            const randIdx = Math.floor(Math.random() * drivers.length);
            vehicleId.textContent = drivers[randIdx];
            vehicleStatus.textContent = `${statuses[Math.floor(Math.random() * statuses.length)]} ${destinations[Math.floor(Math.random() * destinations.length)]}`;

            if (deliveryTime) {
                deliveryTime.textContent = `ETA ${Math.floor(Math.random() * 12) + 2} mins`;
            }
        }
    }, 5000);

    // 5. Interactive Stepper Controls
    const stepperItems = document.querySelectorAll('.stepper-item');
    const stepPreviews = document.querySelectorAll('.step-preview');
    const stepperTrackFill = document.querySelector('.stepper-track-fill');

    let activeStep = 1;
    let stepperInterval = null;

    const updateStepperUI = (step) => {
        stepperItems.forEach(item => item.classList.remove('active'));
        stepPreviews.forEach(preview => preview.classList.remove('active'));

        const currentItem = document.querySelector(`.stepper-item[data-step="${step}"]`);
        const currentPreview = document.querySelector(`.step-preview.preview-${step}`);

        if (currentItem) currentItem.classList.add('active');
        if (currentPreview) currentPreview.classList.add('active');

        if (stepperTrackFill) {
            const percentage = ((step - 1) / (stepperItems.length - 1)) * 100;
            stepperTrackFill.style.height = `${percentage}%`;
        }

        activeStep = step;
    };

    const startStepperAutoCycle = () => {
        stepperInterval = setInterval(() => {
            let nextStep = activeStep + 1;
            if (nextStep > stepperItems.length) nextStep = 1;
            updateStepperUI(nextStep);
        }, 5000);
    };

    if (stepperItems.length > 0) {
        if (stepperTrackFill) stepperTrackFill.style.height = '0%';
        startStepperAutoCycle();
    }

    stepperItems.forEach(item => {
        const handleInteraction = () => {
            if (stepperInterval) {
                clearInterval(stepperInterval);
                stepperInterval = null;
            }
            const selectedStep = parseInt(item.getAttribute('data-step'));
            updateStepperUI(selectedStep);
        };
        item.addEventListener('mouseenter', handleInteraction);
        item.addEventListener('click', handleInteraction);
    });

    // 6. Auth System — Supabase Connection
    const SUPABASE_URL = 'https://yaupttkahhphwcaitylp.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhdXB0dGthaGhwaHdjYWl0eWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2Njk4OTEsImV4cCI6MjA5NTI0NTg5MX0.UwqZLuPCZGYoqBUaPI7myJAxNKj3zaFGMkNgg64jkIo';

    // Initialize Supabase — window.supabase loaded from UMD CDN above
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase client ready');

    // --- DOM Selectors ---
    const authModal = document.getElementById('authModal');
    const authCloseBtn = document.getElementById('authCloseBtn');
    const dbRegisterForm = document.getElementById('dbRegisterForm');
    const dbLoginForm = document.getElementById('dbLoginForm');
    const switchToLogin = document.getElementById('switchToLogin');
    const switchToRegister = document.getElementById('switchToRegister');
    const unauthNavGroup = document.getElementById('unauthNavGroup');
    const authNavGroup = document.getElementById('authNavGroup');
    const unauthMobileGroup = document.getElementById('unauthMobileGroup');
    const authMobileGroup = document.getElementById('authMobileGroup');
    const navUserName = document.getElementById('navUserName');
    const navUserInitials = document.getElementById('navUserInitials');
    const mobileUserName = document.getElementById('mobileUserName');
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    const toast = document.getElementById('toast');
    const toastTitle = document.getElementById('toastTitle');
    const toastDesc = document.getElementById('toastDesc');

    // --- Modal Controller ---
    const openAuthModal = (mode = 'signup') => {
        const titleEl = document.getElementById('authModalTitle');
        const subEl = document.getElementById('authModalSubtitle');

        if (mode === 'login') {
            titleEl.textContent = 'Welcome Back to Retix';
            subEl.textContent = 'Enter your credentials to access your dashboard';
            if (dbRegisterForm) dbRegisterForm.style.display = 'none';
            if (dbLoginForm) { dbLoginForm.style.display = 'flex'; dbLoginForm.style.flexDirection = 'column'; dbLoginForm.style.gap = '14px'; }
        } else {
            titleEl.textContent = 'Create Your Retix Account';
            subEl.innerHTML = `<span style="display:inline-flex; align-items:center; gap:6px; justify-content:center;"><svg class="india-mini-flag" viewBox="0 0 3 2" width="16" height="11" style="border-radius:1px; box-shadow:0 1px 2px rgba(0,0,0,0.15); flex-shrink:0;"><rect width="3" height="2" fill="#059669"/><rect width="3" height="1.33" fill="#FFF"/><rect width="3" height="0.67" fill="#FF6B2B"/><circle cx="1.5" cy="1" r="0.2" fill="#000080"/></svg> Made in India — Join thousands of businesses</span>`;
            if (dbLoginForm) dbLoginForm.style.display = 'none';
            if (dbRegisterForm) { dbRegisterForm.style.display = 'flex'; dbRegisterForm.style.flexDirection = 'column'; dbRegisterForm.style.gap = '14px'; }
        }
        authModal.classList.add('active');
        document.body.classList.add('no-scroll');
    };

    const closeAuthModal = () => {
        authModal.classList.remove('active');
        document.body.classList.remove('no-scroll');
        if (dbRegisterForm) dbRegisterForm.reset();
        if (dbLoginForm) dbLoginForm.reset();
    };

    // Form switchers
    if (switchToLogin) switchToLogin.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('login'); });
    if (switchToRegister) switchToRegister.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('signup'); });

    // Modal open triggers
    document.querySelectorAll('#loginBtn, #mobileLoginBtn, #footerLoginTrigger').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('login'); });
    });
    document.querySelectorAll('#signupBtn, #mobileSignupBtn, #heroSignupBtn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('signup'); });
    });

    if (authCloseBtn) authCloseBtn.addEventListener('click', closeAuthModal);
    if (authModal) authModal.addEventListener('click', (e) => { if (e.target === authModal) closeAuthModal(); });

    // --- Legal Modal Controller ---
    const legalModal = document.getElementById('legalModal');
    const privacyLink = document.getElementById('privacyLink');
    const termsLink = document.getElementById('termsLink');
    const legalCloseBtn = document.getElementById('legalCloseBtn');
    const legalCloseBtnSecondary = document.getElementById('legalCloseBtnSecondary');
    const legalModalTitle = document.getElementById('legalModalTitle');
    const legalModalContent = document.getElementById('legalModalContent');

    const privacyContent = `
        <div style="margin-bottom: 8px;">
            <h4 style="font-weight: 700; color: var(--primary-dark); margin-bottom: 4px;">1. Information We Collect</h4>
            <p style="color: var(--primary-light); font-size: 0.85rem;">We collect details like your business name, active email, mobile number, and ledger transactions to serve your account correctly.</p>
        </div>
        <div style="margin-bottom: 8px;">
            <h4 style="font-weight: 700; color: var(--primary-dark); margin-bottom: 4px;">2. Security & Databases</h4>
            <p style="color: var(--primary-light); font-size: 0.85rem;">Your business records and Udhari data are stored securely inside our dedicated Supabase PostgreSQL servers with strict data-isolation rules (RLS).</p>
        </div>
        <div style="margin-bottom: 8px;">
            <h4 style="font-weight: 700; color: var(--primary-dark); margin-bottom: 4px;">3. Data Sharing & Protection</h4>
            <p style="color: var(--primary-light); font-size: 0.85rem;">We do not rent or sell your commercial details, transactions, or contacts to anyone. Data is purely utilized to compute your analytics panels.</p>
        </div>
    `;

    const termsContent = `
        <div style="margin-bottom: 8px;">
            <h4 style="font-weight: 700; color: var(--primary-dark); margin-bottom: 4px;">1. Service Description</h4>
            <p style="color: var(--primary-light); font-size: 0.85rem;">Retix provides online ledger (Khata), smart inventory tracker, and order monitoring systems to Kirana and distributor nodes.</p>
        </div>
        <div style="margin-bottom: 8px;">
            <h4 style="font-weight: 700; color: var(--primary-dark); margin-bottom: 4px;">2. Responsible Communication</h4>
            <p style="color: var(--primary-light); font-size: 0.85rem;">Our simulated WhatsApp ledger nudges must only be sent to legitimate retail agents or distributors. Misuse or spamming of notification features is strictly prohibited.</p>
        </div>
        <div style="margin-bottom: 8px;">
            <h4 style="font-weight: 700; color: var(--primary-dark); margin-bottom: 4px;">3. Limited Liability</h4>
            <p style="color: var(--primary-light); font-size: 0.85rem;">Retix is provided "as is" during this initial beta validation phase. We advise downloading copy snapshots of your records periodically.</p>
        </div>
    `;

    const openLegalModal = (type = 'privacy') => {
        if (type === 'privacy') {
            if (legalModalTitle) legalModalTitle.textContent = 'Privacy Policy';
            if (legalModalContent) legalModalContent.innerHTML = privacyContent;
        } else {
            if (legalModalTitle) legalModalTitle.textContent = 'Terms & Conditions';
            if (legalModalContent) legalModalContent.innerHTML = termsContent;
        }
        if (legalModal) {
            legalModal.classList.add('active');
            document.body.classList.add('no-scroll');
        }
    };

    const closeLegalModal = () => {
        if (legalModal) {
            legalModal.classList.remove('active');
            document.body.classList.remove('no-scroll');
        }
    };

    if (privacyLink) privacyLink.addEventListener('click', (e) => { e.preventDefault(); openLegalModal('privacy'); });
    if (termsLink) termsLink.addEventListener('click', (e) => { e.preventDefault(); openLegalModal('terms'); });
    if (legalCloseBtn) legalCloseBtn.addEventListener('click', closeLegalModal);
    if (legalCloseBtnSecondary) legalCloseBtnSecondary.addEventListener('click', closeLegalModal);
    if (legalModal) legalModal.addEventListener('click', (e) => { if (e.target === legalModal) closeLegalModal(); });

    // Registration Handler
    if (dbRegisterForm) {
        dbRegisterForm.addEventListener('submit', async (e) => {
            e.preventDefault();



            const name = document.getElementById('regName').value.trim();
            const shopName = document.getElementById('regShopName').value.trim();
            const gstin = document.getElementById('regGstin').value.trim().toUpperCase();
            const email = document.getElementById('regEmail').value.trim();
            const phone = document.getElementById('regPhone').value.trim();
            const businessType = document.getElementById('regBusinessType').value;
            const password = document.getElementById('regPassword').value;
            const shopAddress = document.getElementById('regShopAddress').value.trim();

            // Validations
            if (!name) {
                launchToast('Missing Name', 'Please enter your full name.', 'error');
                return;
            }
            if (!shopName) {
                launchToast('Missing Shop Name', 'Please enter your shop/business name.', 'error');
                return;
            }
            if (gstin && gstin.length !== 15) {
                launchToast('Invalid GSTIN', 'GSTIN must be exactly 15 characters.', 'error');
                return;
            }
            if (!email || !email.includes('@')) {
                launchToast('Invalid Email', 'Please enter a valid email address.', 'error');
                return;
            }
            if (phone.length !== 10 || isNaN(phone)) {
                launchToast('Invalid Phone', 'Please enter a valid 10-digit mobile number.', 'error');
                return;
            }
            if (password.length < 6) {
                launchToast('Weak Password', 'Password must be at least 6 characters long.', 'error');
                return;
            }
            if (!shopAddress) {
                launchToast('Missing Address', 'Please enter your shop/business address.', 'error');
                return;
            }

            // Show loading state on button
            const submitBtn = dbRegisterForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating Account...';

            try {
                // Step 1: Create auth user
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            full_name: name,
                            phone: phone,
                            shop_name: shopName,
                            gstin: gstin,
                            business_type: businessType,
                            shop_address: shopAddress
                        }
                    }
                });

                if (error) {
                    launchToast('Registration Failed', error.message, 'error');
                    return;
                }

                // Step 2: Save ALL details to profiles table (visible in Table Editor)
                if (data.user) {
                    const { error: profileError } = await supabase
                        .from('profiles')
                        .insert({
                            id: data.user.id,
                            full_name: name,
                            email: email,
                            phone: phone,
                            shop_name: shopName,
                            gstin: gstin,
                            business_type: businessType,
                            shop_address: shopAddress
                        });

                    if (profileError) {
                        console.warn('Profile save warning:', profileError.message);
                        // Don't block the user — auth was still created
                    }
                }

                // Success — redirect to dashboard
                if (data.user && !data.session) {
                    launchToast('Check Your Inbox! 📧', `Account created! Please click the confirmation link sent to ${email} to activate your account.`, 'success');
                    dbRegisterForm.reset();
                    setTimeout(() => { openAuthModal('login'); }, 4000);
                } else {
                    launchToast('Account Created! 🎉', `Welcome, ${name}! Taking you to your dashboard...`, 'success');
                    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
                }

            } catch (err) {
                launchToast('Unexpected Error', 'Something went wrong. Please try again.', 'error');
                console.error('Registration error:', err);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Account';
            }
        });
    }

    // Login Handler
    if (dbLoginForm) {
        dbLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const identifier = document.getElementById('loginIdentifier').value.trim();
            const password = document.getElementById('loginPassword').value;

            if (!identifier) {
                launchToast('Missing Email', 'Please enter your email address.', 'error');
                return;
            }
            if (!password) {
                launchToast('Missing Password', 'Please enter your password.', 'error');
                return;
            }

            // Show loading state on button
            const submitBtn = dbLoginForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Logging in...';

            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: identifier,
                    password: password
                });

                if (error) {
                    launchToast('Login Failed', error.message, 'error');
                    return;
                }

                const firstName = data.user?.user_metadata?.full_name?.split(' ')[0] || 'User';
                launchToast('Welcome Back! 👋', `Hello, ${firstName}! Taking you to your dashboard...`, 'success');
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);

            } catch (err) {
                launchToast('Unexpected Error', 'Something went wrong. Please try again.', 'error');
                console.error('Login error:', err);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Secure Login';
            }
        });
    }

    // Logout Handlers
    const handleLogout = async (e) => {
        e.preventDefault();
        await supabase.auth.signOut();
        await updateAuthUI();
        launchToast('Logged Out', 'You have been securely logged out.', 'success');
    };

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', handleLogout);

    // Forgot Password Handler
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', async (e) => {
            e.preventDefault();

            const emailInput = document.getElementById('loginIdentifier');
            const email = emailInput ? emailInput.value.trim() : '';

            if (!email || !email.includes('@')) {
                launchToast('Enter Email First', 'Please type your email address above, then click Forgot Password.', 'error');
                if (emailInput) emailInput.focus();
                return;
            }

            forgotPasswordLink.textContent = 'Sending...';

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.href
            });

            forgotPasswordLink.textContent = 'Forgot Password?';

            if (error) {
                launchToast('Reset Failed', error.message, 'error');
            } else {
                launchToast('Reset Email Sent! 📧', `A password reset link has been sent to ${email}. Check your inbox.`, 'success');
            }
        });
    }

    // Dynamic UI State Updater
    async function updateAuthUI() {
        if (!supabase) return;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session ? session.user : null;

            if (user) {
                // Securely redirect already logged in users to the premium dashboard
                window.location.replace('dashboard.html');
                return;
            } else {
                if (unauthNavGroup) unauthNavGroup.style.display = 'flex';
                if (unauthMobileGroup) unauthMobileGroup.style.display = 'flex';
                if (authNavGroup) authNavGroup.style.display = 'none';
                if (authMobileGroup) authMobileGroup.style.display = 'none';
            }
        } catch (err) {
            console.error('updateAuthUI error:', err);
        }
    }

    // Generalized notification toast engine
    function launchToast(title, description, type = 'success') {
        const toastIcon = document.querySelector('.toast-icon');

        if (toastTitle && toastDesc) {
            toastTitle.textContent = title;
            toastDesc.textContent = description;
        }

        if (type === 'error') {
            toast.style.borderLeftColor = 'var(--danger)';
            if (toastIcon) toastIcon.style.color = 'var(--danger)';
        } else {
            toast.style.borderLeftColor = 'var(--success)';
            if (toastIcon) toastIcon.style.color = 'var(--success)';
        }

        toast.classList.add('active');
        setTimeout(() => {
            toast.classList.remove('active');
        }, 5000);
    }

    // Initialize auth UI on every page load (persistent session)
    updateAuthUI();
});