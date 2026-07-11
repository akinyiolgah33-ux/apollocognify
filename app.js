document.addEventListener('DOMContentLoaded', () => {
    const ASSETS = {
        avatar: 'apollo_avatar.png',
        character: 'apollo_character.png',
        logo: 'cognify_logo.png'
    };

    function assetUrl(filename) {
        try {
            return new URL(filename, window.location.href).href;
        } catch {
            return filename;
        }
    }

    function bindImage(el, file, { alt } = {}) {
        if (!el || !file) return;
        el.src = assetUrl(file);
        if (alt) el.alt = alt;
    }

    function bindBrandImages() {
        bindImage(document.getElementById('cognify-logo'), ASSETS.logo, { alt: 'Cognify logo' });
        document.querySelectorAll('[data-asset]').forEach((el) => {
            const key = el.getAttribute('data-asset');
            if (ASSETS[key]) bindImage(el, ASSETS[key]);
        });
    }

    // --- Outer Scope Variables ---
    let quill;
    let apolloTalkInterval = null;
    let uploadedFiles = [];
    let calendarEvents = {};
    let todos = [];
    let flashcards = [];

    // --- Phase 1: Navigation & Transitions ---
    const navLinks = document.querySelectorAll('.nav-links li');
    const pages = document.querySelectorAll('.page');

    // Robust delegation: attach one handler to the UL so dynamic changes still work
    const navListEl = document.querySelector('.nav-links');
    if (navListEl) {
        navListEl.addEventListener('click', (ev) => {
            const li = ev.target.closest('li');
            if (!li || !navListEl.contains(li)) return;
            const targetId = li.getAttribute('data-target');
            console.debug('nav click:', {clicked: ev.target, li, targetId});
            if (targetId) {
                // switch page and update active state
                try { switchPage(targetId); } catch (e) { console.error('switchPage error', e); }
                document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
                li.classList.add('active');
            }
        });
    }

    // Fallback: ensure static li elements still have click handlers (older code paths)
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const targetId = link.getAttribute('data-target');
            console.debug('nav li click fallback:', {link, targetId});
            if (targetId) {
                switchPage(targetId);
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            }
        });
    });

    // debugging helpers: expose a manual switch call and some state info
    window._cognifyDebug = {
        pagesCount: pages.length,
        navCount: navLinks.length,
        testSwitch: (id) => { try { switchPage(id); console.log('switched to', id); } catch(e){ console.error(e); } }
    };

    function switchPage(targetId) {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.classList.add('page-anim-active');
            setTimeout(() => {
                pages.forEach(p => p.classList.remove('active'));
                const targetPage = document.getElementById(targetId);
                if (targetPage) {
                    targetPage.classList.add('active');
                }
                setTimeout(() => mainContent.classList.remove('page-anim-active'), 420);
            }, 140);
        } else {
            pages.forEach(p => p.classList.remove('active'));
            const targetPage = document.getElementById(targetId);
            if (targetPage) targetPage.classList.add('active');
        }
    }

    // --- Phase 2: Secure Profile Management ---
    const accountSelect = document.getElementById('account-select');
    const addProfileBtn = document.getElementById('add-profile-btn');
    const deleteProfileBtn = document.getElementById('delete-profile-btn');
    const outfitSelect = document.getElementById('apollo-outfit');
    const voiceLangSelect = document.getElementById('apollo-voice-lang');
    const notificationToggle = document.getElementById('notification-toggle');

    let profiles = JSON.parse(localStorage.getItem('cognify_profiles')) || ['Default'];
    let profileData = JSON.parse(localStorage.getItem('cognify_profile_meta')) || { 'Default': { pin: null } };
    let activeProfile = localStorage.getItem('cognify_active_profile') || 'Default';

    function renderProfiles() {
        accountSelect.innerHTML = '';
        profiles.forEach(prof => {
            const opt = document.createElement('option');
            opt.value = prof;
            opt.textContent = prof;
            if (prof === activeProfile) opt.selected = true;
            accountSelect.appendChild(opt);
        });
        localStorage.setItem('cognify_profiles', JSON.stringify(profiles));
        localStorage.setItem('cognify_profile_meta', JSON.stringify(profileData));
    }

    const getKey = (key) => `cognify_${activeProfile}_${key}`;

    accountSelect.addEventListener('change', async (e) => {
        const nextProfile = e.target.value;
        const meta = profileData[nextProfile];

        if (meta && meta.pin) {
            const entry = prompt(`Enter PIN for ${nextProfile}:`);
            if (entry !== meta.pin) {
                alert('Incorrect PIN.');
                accountSelect.value = activeProfile;
                return;
            }
        }

        activeProfile = nextProfile;
        localStorage.setItem('cognify_active_profile', activeProfile);
        loadProfileData();
    });

    addProfileBtn.addEventListener('click', () => {
        const name = prompt('Enter profile name:');
        if (name && !profiles.includes(name)) {
            const pin = prompt('Set a PIN (optional, leave blank for none):');
            profiles.push(name);
            profileData[name] = { pin: pin || null };
            activeProfile = name;
            localStorage.setItem('cognify_active_profile', activeProfile);
            renderProfiles();
            loadProfileData();
        }
    });

    document.getElementById('rename-profile-btn').addEventListener('click', () => {
        const newName = prompt('Enter new name for current profile:', activeProfile);
        if (newName && newName.trim() !== '' && !profiles.includes(newName)) {
            const oldName = activeProfile;

            // Migrate all localStorage keys prefix safely to avoid data loss
            const keysToMigrate = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(`cognify_${oldName}_`)) {
                    keysToMigrate.push(key);
                }
            }
            keysToMigrate.forEach(oldKey => {
                const value = localStorage.getItem(oldKey);
                const newKey = oldKey.replace(`cognify_${oldName}_`, `cognify_${newName}_`);
                localStorage.setItem(newKey, value);
                localStorage.removeItem(oldKey);
            });

            profiles[profiles.indexOf(oldName)] = newName;
            profileData[newName] = profileData[oldName];
            delete profileData[oldName];
            activeProfile = newName;
            localStorage.setItem('cognify_active_profile', activeProfile);
            renderProfiles();
            loadProfileData();
        }
    });

    deleteProfileBtn.addEventListener('click', () => {
        if (profiles.length <= 1) return alert('Cannot delete the last profile.');
        if (confirm(`Delete "${activeProfile}" and all its data?`)) {
            const deletedProfile = activeProfile;

            // Clear all database entries from localStorage for the deleted profile
            const keysToDelete = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(`cognify_${deletedProfile}_`)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(k => localStorage.removeItem(k));

            profiles = profiles.filter(p => p !== deletedProfile);
            delete profileData[deletedProfile];
            activeProfile = profiles[0];
            localStorage.setItem('cognify_active_profile', activeProfile);
            renderProfiles();
            loadProfileData();
        }
    });

    // --- Phase 2.5: Theme Management (full-screen live image themes) ---
    const THEME_CATALOG = {
        'dark-live': { label: 'Live Dark', image: 'Themes/theme-circuit.png', description: 'Deep tech network connection' }
    };
    const THEME_IDS = Object.keys(THEME_CATALOG);
    const LEGACY_THEME_MAP = {
        theme1: 'dark-live', theme2: 'dark-live', theme3: 'dark-live', theme4: 'dark-live', theme5: 'dark-live',
        dark: 'dark-live', light: 'dark-live', tron: 'dark-live', hexgold: 'dark-live', redmatrix: 'dark-live',
        tealshards: 'dark-live', aurora: 'dark-live', circuit: 'dark-live', cube: 'dark-live',
        casino: 'dark-live', neonpodium: 'dark-live', blocks: 'dark-live', shards: 'dark-live', vortex: 'dark-live', grid: 'dark-live', 'neon-tech': 'dark-live',
        'light-live': 'dark-live', 'cyber-corridor': 'dark-live', 'glowing-hexagons': 'dark-live', 'synthwave-landscape': 'dark-live'
    };

    const themeSelector = document.getElementById('theme-selector');
    const themeCardList = document.getElementById('theme-card-list');
    const root = document.documentElement;
    const themeImageCache = {};

    function renderThemeCards() {
        if (!themeCardList) return;
        themeCardList.innerHTML = '';
        THEME_IDS.forEach((id) => {
            const meta = THEME_CATALOG[id];
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'theme-card';
            card.dataset.theme = id;
            card.innerHTML = `
                <span class="theme-card-swatch" style="background-image:url(${assetUrl(meta.image)})"></span>
                <span class="theme-card-meta"><strong>${meta.label}</strong><small>${meta.description}</small></span>
            `;
            card.addEventListener('click', () => setTheme(id));
            themeCardList.appendChild(card);
        });
    }

    function normalizeTheme(theme) {
        if (THEME_IDS.includes(theme)) return theme;
        return LEGACY_THEME_MAP[theme] || 'dark-live';
    }

    if (themeSelector) themeSelector.addEventListener('change', (e) => setTheme(e.target.value));

    const THEME_ICONS = {
        'dark-live':  { send: 'ph-circuit-board',     stop: 'ph-x-circle',     del: 'ph-trash-simple',  voice: 'ph-microphone',   close: 'ph-x' }
    };
    const _DEFAULT_ICONS = { send: 'ph-paper-plane-right', stop: 'ph-stop-circle', del: 'ph-trash', voice: 'ph-microphone', close: 'ph-x' };

    function updateChatButtonIcons(themeId) {
        const icons = THEME_ICONS[themeId] || _DEFAULT_ICONS;
        // Map button id -> icon key
        const BTN_MAP = {
            'apollo-chat-send-btn':   icons.send,
            'apollo-chat-quit-btn':   icons.stop,
            'apollo-chat-delete-btn': icons.del,
            'apollo-voice-chat-btn':  icons.voice,
            // floating quick chat
            'apollo-send-btn':        icons.send,
            'apollo-quick-delete':    icons.del,
            'apollo-clear-btn':       icons.close,
            'apollo-voice-btn':       icons.voice,
            // full chat box
            'apollo-full-send':       icons.send,
            'apollo-full-clear':      icons.del,
            'apollo-full-close':      icons.close,
        };
        // All icon prefixes used by the app
        const ALL_PH = ['ph-paper-plane-right','ph-paper-plane-tilt','ph-stop-circle','ph-x-circle','ph-prohibit',
                        'ph-prohibit-inset','ph-power','ph-x-square','ph-trash','ph-trash-simple','ph-eraser',
                        'ph-recycle','ph-backspace','ph-microphone','ph-microphone-slash','ph-hammer','ph-lightning',
                        'ph-terminal-window','ph-diamonds-four','ph-circuit-board','ph-sun','ph-door-open',
                        'ph-arrows-in-simple','ph-x'];
        Object.entries(BTN_MAP).forEach(([btnId, iconClass]) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            const ico = btn.querySelector('i');
            if (!ico) return;
            // Remove all known ph-* classes
            ALL_PH.forEach(c => ico.classList.remove(c));
            ico.classList.add(iconClass);
        });
    }

    function setTheme(theme) {
        const id = normalizeTheme(theme);
        root.setAttribute('data-theme', id);
        localStorage.setItem(getKey('theme'), id);
        if (themeSelector && themeSelector.value !== id) themeSelector.value = id;

        if (themeCardList) {
            themeCardList.querySelectorAll('.theme-card').forEach((card) => {
                card.classList.toggle('active', card.dataset.theme === id);
            });
        }

        startLiveTheme(id);

        const preview = document.getElementById('theme-preview');
        const previewLabel = document.getElementById('theme-preview-label');
        const meta = THEME_CATALOG[id];
        if (preview && meta) {
            preview.style.background = '';
            preview.style.backgroundImage = `url(${assetUrl(meta.image)})`;
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';
        }
        if (previewLabel && meta) {
            previewLabel.textContent = `${meta.label} — ${meta.description}`;
        }
        updateApolloFilters();
        updateChatButtonIcons(id);
    }

    let liveThemeRAF = null;
    let liveThemeResizeBound = false;
    let activeLiveThemeId = null;
    let liveThemeCleanup = null;

    function bindLiveThemeResize() {
        if (liveThemeResizeBound) return;
        liveThemeResizeBound = true;
        window.addEventListener('resize', () => {
            const cv = document.getElementById('live-theme-canvas');
            if (cv && cv.style.display !== 'none') {
                cv.width = window.innerWidth;
                cv.height = window.innerHeight;
            }
        });
    }

    function drawImageCover(ctx, img, w, h, panX, panY, zoom = 1) {
        const viewRatio = w / h;
        const imgRatio = img.width / img.height;
        let sx, sy, sw, sh;
        if (imgRatio > viewRatio) {
            sh = img.height / zoom;
            sw = sh * viewRatio;
            sy = (img.height - sh) / 2;
            const maxPan = Math.max(0, img.width - sw);
            sx = Math.min(maxPan, Math.max(0, maxPan * 0.5 + panX));
        } else {
            sw = img.width / zoom;
            sh = sw / viewRatio;
            sx = (img.width - sw) / 2;
            const maxPan = Math.max(0, img.height - sh);
            sy = Math.min(maxPan, Math.max(0, maxPan * 0.5 + panY));
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    }

    function loadThemeImage(themeId) {
        if (themeImageCache[themeId]) return themeImageCache[themeId];
        const meta = THEME_CATALOG[themeId];
        if (!meta) return null;
        const img = new Image();
        img.src = assetUrl(meta.image);
        themeImageCache[themeId] = img;
        return img;
    }
    function stopLiveTheme() {
        if (liveThemeRAF) { cancelAnimationFrame(liveThemeRAF); liveThemeRAF = null; }
        activeLiveThemeId = null;
        const c = document.getElementById('live-theme-canvas');
        if (c) { c.style.display = 'none'; }
        if (typeof liveThemeCleanup === 'function') {
            liveThemeCleanup();
            liveThemeCleanup = null;
        }
    }

    renderThemeCards();

    function startLiveTheme(theme) {
        const id = normalizeTheme(theme);
        const meta = THEME_CATALOG[id];
        if (!meta) return;

        stopLiveTheme();
        activeLiveThemeId = id;

        const cv = document.getElementById('live-theme-canvas');
        if (!cv) return;
        bindLiveThemeResize();
        cv.style.display = 'block';
        cv.width = window.innerWidth;
        cv.height = window.innerHeight;

        const ctx = cv.getContext('2d');
        const img = loadThemeImage(id);
        let t = 0;

        // Initialize particles for Live Dark
        let particles = [];
        const initParticles = (w, h) => {
            particles = [];
            for (let i = 0; i < 40; i++) {
                particles.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    vx: (Math.random() - 0.5) * 0.45,
                    vy: (Math.random() - 0.5) * 0.45,
                    r: Math.random() * 2 + 1
                });
            }
        };

        let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, targetX: window.innerWidth / 2, targetY: window.innerHeight / 2 };
        const handleMouseMove = (e) => {
            mouse.targetX = e.clientX;
            mouse.targetY = e.clientY;
        };
        window.addEventListener('mousemove', handleMouseMove);
        liveThemeCleanup = () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };

        function imgFrame() {
            if (activeLiveThemeId !== id) return;
            t += 0.006;
            const w = cv.width;
            const h = cv.height;
            ctx.clearRect(0, 0, w, h);

            // Smooth cursor movement interpolation
            mouse.x += (mouse.targetX - mouse.x) * 0.08;
            mouse.y += (mouse.targetY - mouse.y) * 0.08;

            if (img.complete && img.naturalWidth > 0) {
                const viewRatio = w / h;
                const imgRatio = img.width / img.height;
                let maxPanX = 0;
                let maxPanY = 0;
                if (imgRatio > viewRatio) {
                    maxPanX = Math.max(0, img.width - img.height * viewRatio);
                } else {
                    maxPanY = Math.max(0, img.height - img.width / viewRatio);
                }
                const panX = Math.sin(t * 0.1) * maxPanX * 0.45;
                const panY = Math.cos(t * 0.08) * maxPanY * 0.45;
                const zoom = 1.04 + Math.sin(t * 0.14) * 0.04;
                try {
                    drawImageCover(ctx, img, w, h, panX, panY, zoom);
                } catch {
                    ctx.fillStyle = id === 'light-live' ? '#f8fafc' : '#07090f';
                    ctx.fillRect(0, 0, w, h);
                }
            } else {
                ctx.fillStyle = id === 'light-live' ? '#f8fafc' : '#07090f';
                ctx.fillRect(0, 0, w, h);
            }

            // Draw Live Dark Particle Network Overlay
            if (id === 'dark-live') {
                if (particles.length === 0) initParticles(w, h);
                ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
                particles.forEach(p => {
                    p.x += p.vx;
                    p.y += p.vy;
                    if (p.x < 0) p.x = w;
                    if (p.x > w) p.x = 0;
                    if (p.y < 0) p.y = h;
                    if (p.y > h) p.y = 0;

                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    ctx.fill();
                });

                // Connect close nodes
                for (let i = 0; i < particles.length; i++) {
                    for (let j = i + 1; j < particles.length; j++) {
                        const dx = particles[i].x - particles[j].x;
                        const dy = particles[i].y - particles[j].y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 130) {
                            ctx.beginPath();
                            ctx.moveTo(particles[i].x, particles[i].y);
                            ctx.lineTo(particles[j].x, particles[j].y);
                            ctx.strokeStyle = `rgba(99, 102, 241, ${0.16 * (1 - dist / 130)})`;
                            ctx.lineWidth = 0.8;
                            ctx.stroke();
                        }
                    }
                }
            }



            const grd = ctx.createLinearGradient(0, 0, w, h);
            grd.addColorStop(0, 'rgba(255,255,255,0.015)');
            grd.addColorStop(0.5, 'rgba(255,255,255,0.03)');
            grd.addColorStop(1, 'transparent');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, w, h);

            liveThemeRAF = requestAnimationFrame(imgFrame);
        }
        imgFrame();
    }

    THEME_IDS.forEach((id) => loadThemeImage(id));

    // --- Phase 3: Apollo AI (Voice & Avatar) ---
    // NOTE: Voice recognition + send handlers for apollo-chat-input are fully managed
    // inside initApolloPageChat() — do NOT duplicate them here.
    const apolloInput = document.getElementById('apollo-chat-input');
    const apolloChat  = document.getElementById('apollo-chat-history');

    async function sendApolloMessage() {
        const text = apolloInput.value.trim();
        if (!text) return;

        appendMessage('user', text);
        apolloInput.value = '';

        const loadingId = 'msg-' + Date.now();
        appendMessage('ai', `<i class="ph ph-spinner ph-spin"></i> Apollo is consulting the archives...`, loadingId);
        if(window.setApolloExpression) window.setApolloExpression('think');

        try {
            const lang = voiceLangSelect.value || 'en-US';
            const subDomain = lang.startsWith('sw') ? 'sw' : 'en';

            const searchRes = await fetch(`https://${subDomain}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(text)}&utf8=&format=json&origin=*`);
            const searchData = await searchRes.json();

            if (searchData.query?.search?.length > 0) {
                const title = searchData.query.search[0].title;
                const extractRes = await fetch(`https://${subDomain}.wikipedia.org/w/api.php?action=query&prop=extracts&exlimit=1&titles=${encodeURIComponent(title)}&explaintext=1&format=json&origin=*`);
                const extractData = await extractRes.json();
                const wikiPages = extractData.query.pages;
                const pageId = Object.keys(wikiPages)[0];
                const fullText = wikiPages[pageId].extract || "";

                const deepAnswer = fullText.slice(0, 1500) + (fullText.length > 1500 ? "..." : "");

                const loadingEl = document.getElementById(loadingId);
                if (loadingEl) {
                    loadingEl.innerHTML = `<b>${title}</b>: ${deepAnswer}<br><br><a href="https://${subDomain}.wikipedia.org/wiki/${encodeURIComponent(title)}" target="_blank" style="color:var(--primary-color)">[Consult Full Archive]</a>`;
                }

                if(window.setApolloExpression) window.setApolloExpression('idle');
                apolloSpeak(deepAnswer);
                addStudyReference(title, `https://${subDomain}.wikipedia.org/wiki/${encodeURIComponent(title)}`);
            } else {
                const failText = "No direct records found. I'll continue monitoring the grid for updates.";
                const loadingEl = document.getElementById(loadingId);
                if (loadingEl) loadingEl.textContent = failText;
                if(window.setApolloExpression) window.setApolloExpression('idle');
                apolloSpeak(failText);
            }
        } catch (e) {
            const errText = "Knowledge link unstable. Please retry.";
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.textContent = errText;
            if(window.setApolloExpression) window.setApolloExpression('idle');
            apolloSpeak(errText);
        }

        saveAiHistory();
    }

    function apolloSpeak(text) {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            const voices = speechSynthesis.getVoices();
            const lang = voiceLangSelect.value || 'en-US';

            const preferredVoice = voices.find(v => v.lang === lang && (v.name.includes('Male') || v.name.includes('Boy') || v.name.includes('George') || v.name.includes('Brian') || v.name.includes('Ryan'))) ||
                                  voices.find(v => v.lang.startsWith('en-GB') && v.name.includes('Male')) ||
                                  voices.find(v => v.lang.startsWith('en-GB') && v.name.includes('Google')) ||
                                  voices.find(v => v.lang.startsWith('en-GB')) ||
                                  voices.find(v => v.name.includes('Male')) ||
                                  voices[0];

            if (preferredVoice) utterance.voice = preferredVoice;
            utterance.lang = lang;
            utterance.rate = 1.0;
            utterance.pitch = 0.95;

            utterance.onstart = () => { if(window.setApolloExpression) window.setApolloExpression('talk'); };
            utterance.onend = () => { if(window.setApolloExpression) window.setApolloExpression('idle'); };

            speechSynthesis.speak(utterance);
        }
    }

    if ('speechSynthesis' in window) {
        speechSynthesis.getVoices();
        speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
    }

    function appendMessage(role, content, id = null) {
        const div = document.createElement('div');
        div.className = 'ai-message';
        if (role === 'user') {
            div.style.background = 'rgba(255,255,255,0.05)';
            div.style.borderLeftColor = 'var(--text-muted)';
        }
        if (id) div.id = id;
        div.innerHTML = content;
        apolloChat.appendChild(div);
        apolloChat.scrollTop = apolloChat.scrollHeight;
    }

    function saveAiHistory() {
        localStorage.setItem(getKey('ai_history'), apolloChat.innerHTML);
    }

    // NOTE: apolloSendBtn / apolloInput event handlers are fully managed inside initApolloPageChat().
    // NOTE: apollo-clear-btn (Exit) is fully managed inside initFloatingChat().
    // Do NOT add duplicate listeners here.

    bindBrandImages();

    // Cognify logo — uses cognify_logo.png (2D fallback + optional textured canvas)
    function initBrainLogo() {
        const canvas = document.getElementById('brain-logo-canvas');
        const fallback = document.getElementById('cognify-logo');
        bindImage(fallback, ASSETS.logo, { alt: 'Cognify logo' });

        if (!canvas || typeof THREE === 'undefined') return;

        const loader = new THREE.TextureLoader();
        loader.load(
            assetUrl(ASSETS.logo),
            (texture) => {
                texture.anisotropy = 4;
                const scene = new THREE.Scene();
                const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
                camera.position.z = 2.4;
                const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
                const size = 44;
                renderer.setSize(size, size);
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

                const mesh = new THREE.Mesh(
                    new THREE.PlaneGeometry(1.5, 1.5),
                    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
                );
                scene.add(mesh);
                if (fallback) fallback.style.display = 'none';
                canvas.style.display = 'block';

                (function animateLogo() {
                    requestAnimationFrame(animateLogo);
                    mesh.rotation.y += 0.006;
                    mesh.rotation.z = Math.sin(Date.now() * 0.001) * 0.04;
                    renderer.render(scene, camera);
                })();
            },
            undefined,
            () => {
                if (fallback) fallback.style.display = 'block';
                canvas.style.display = 'none';
            }
        );
    }
    initBrainLogo();

    function getApolloThemeFilter() {
        return 'none';
    }

    function buildApolloSidebarAvatar() {
        const img = document.createElement('img');
        img.src = assetUrl(ASSETS.avatar);
        img.alt = 'Apollo avatar';
        img.className = 'apollo-char-img apollo-avatar-img';
        img.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center 18%;
            display: block;
            filter: ${getApolloThemeFilter()};
            transition: filter 0.5s ease, transform 0.4s ease;
            transform-origin: center center;
        `;
        return img;
    }

    function updateApolloFilters() {
        document.querySelectorAll('.apollo-char-img, .apollo-avatar-img').forEach(img => {
            img.style.filter = getApolloThemeFilter();
        });
    }

    // Apollo - Avatar permanently in logo area with moustache + expressions
    function initApollo3D() {
        if (!document.getElementById('apollo-anim-styles')) {
            const s = document.createElement('style'); s.id = 'apollo-anim-styles';
            s.textContent = `
                #apollo-logo-avatar {
                    width: 62px; height: 62px;
                    border-radius: 50%;
                    overflow: hidden;
                    border: 2.5px solid var(--primary-color);
                    box-shadow: 0 0 16px var(--primary-color),
                                0 0 36px color-mix(in srgb, var(--primary-color) 35%, transparent);
                    cursor: pointer;
                    transition: box-shadow 0.4s ease, border-color 0.4s ease, transform 0.25s ease;
                    display: flex; align-items: flex-start; justify-content: center;
                    background: transparent;
                    position: relative;
                }
                #apollo-logo-avatar:hover {
                    box-shadow: 0 0 26px var(--primary-color),
                                0 0 52px color-mix(in srgb, var(--primary-color) 55%, transparent);
                    transform: scale(1.08);
                }
                @keyframes apolloIdleBob {
                    0%, 100% { transform: translateY(0px); }
                    50%       { transform: translateY(-3px); }
                }
                .apollo-char-img.idle-anim  { animation: apolloIdleBob 3s ease-in-out infinite; }

                @keyframes apolloThinkTilt {
                    0%, 100% { transform: rotate(-4deg) translateY(-1px); }
                    50%       { transform: rotate(4deg)  translateY(1px); }
                }
                .apollo-char-img.think-anim { animation: apolloThinkTilt 1.4s ease-in-out infinite; }

                @keyframes apolloTalkBob {
                    0%, 100% { transform: translateY(0px) scale(1); }
                    25%       { transform: translateY(-2px) scale(1.03); }
                    75%       { transform: translateY(2px)  scale(0.97); }
                }
                .apollo-char-img.talk-anim  { animation: apolloTalkBob 0.45s ease-in-out infinite; }

                /* Speech bubble - appears below the logo row */
                .apollo-bubble {
                    position: fixed;
                    top: 94px; left: 14px;
                    z-index: 9999;
                    background: rgba(10,10,18,0.93);
                    color: var(--text-main);
                    padding: 7px 14px;
                    border-radius: 14px;
                    font-size: 13px;
                    font-weight: 600;
                    opacity: 0;
                    transition: opacity 0.25s;
                    pointer-events: none;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
                    border: 1.5px solid var(--primary-color);
                    white-space: nowrap;
                    max-width: 230px;
                }
                .apollo-bubble.visible { opacity: 1; }
                .apollo-bubble::before {
                    content: '';
                    position: absolute;
                    top: -8px; left: 22px;
                    border-width: 0 6px 8px 6px;
                    border-style: solid;
                    border-color: transparent transparent var(--primary-color) transparent;
                }
                .apollo-bubble::after {
                    content: '';
                    position: absolute;
                    top: -5px; left: 23px;
                    border-width: 0 5px 6px 5px;
                    border-style: solid;
                    border-color: transparent transparent rgba(10,10,18,0.93) transparent;
                }

                /* Moustache & face SVG transitions */
                #apollo-face-svg ellipse,
                #apollo-face-svg circle,
                #apollo-face-svg path {
                    transition: all 0.35s cubic-bezier(0.4,0,0.2,1);
                }
                @keyframes moustacheTwitch {
                    0%, 100% { transform: scaleX(1) rotate(0deg); }
                    30%       { transform: scaleX(1.04) rotate(-1.5deg); }
                    70%       { transform: scaleX(0.96) rotate(1.5deg); }
                }
                #apollo-moustache-g.twitching {
                    animation: moustacheTwitch 0.75s ease-in-out infinite;
                    transform-origin: 30px 42px;
                }
            `;
            document.head.appendChild(s);
        }

        // Remove any old floating wrap if it still exists
        const oldWrap = document.getElementById('apollo-roam-wrap');
        if (oldWrap) oldWrap.remove();
        const oldBg = document.getElementById('apollo-bg-container');
        if (oldBg) oldBg.innerHTML = '';

        const logoAvatar = document.getElementById('apollo-logo-avatar');
        if (!logoAvatar) return;
        logoAvatar.innerHTML = '';

        // ── Character image ──────────────────────────────────────────
        const img = buildApolloSidebarAvatar();
        img.classList.add('idle-anim');
        logoAvatar.appendChild(img);

        // ── Handlebar moustache + facial expression SVG overlay ──────
        const faceSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        faceSVG.id = 'apollo-face-svg';
        faceSVG.setAttribute('viewBox', '0 0 60 60');
        faceSVG.style.cssText = [
            'position:absolute', 'inset:0', 'width:100%', 'height:100%',
            'pointer-events:none', 'z-index:10', 'overflow:visible'
        ].join(';');
        faceSVG.innerHTML = `
            <!-- ░░ HANDLEBAR MOUSTACHE — almost visible, theme-coloured ░░ -->
            <g id="apollo-moustache-g" opacity="0.30">
                <!-- left curl -->
                <path d="M13 43 C15 38, 21 36, 27.5 39.5 C29 40.2, 30 40.5, 30 40.5"
                    stroke="var(--primary-color)" stroke-width="2.3"
                    fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                <!-- right curl -->
                <path d="M47 43 C45 38, 39 36, 32.5 39.5 C31 40.2, 30 40.5, 30 40.5"
                    stroke="var(--primary-color)" stroke-width="2.3"
                    fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                <!-- left wing-tip -->
                <path d="M13 43 C10.5 44.5, 10 47, 12.5 48"
                    stroke="var(--primary-color)" stroke-width="1.8"
                    fill="none" stroke-linecap="round"/>
                <!-- right wing-tip -->
                <path d="M47 43 C49.5 44.5, 50 47, 47.5 48"
                    stroke="var(--primary-color)" stroke-width="1.8"
                    fill="none" stroke-linecap="round"/>
                <!-- centre knot / philtrum highlight -->
                <circle cx="30" cy="40.5" r="1.1"
                    fill="var(--primary-color)" opacity="0.6"/>
            </g>

            <!-- ░░ EYES ░░ -->
            <g id="apollo-eyes-g">
                <!-- whites -->
                <ellipse id="apollo-eye-l" cx="20" cy="24" rx="2.9" ry="3.3"
                    fill="rgba(255,255,255,0.58)"/>
                <ellipse id="apollo-eye-r" cx="40" cy="24" rx="2.9" ry="3.3"
                    fill="rgba(255,255,255,0.58)"/>
                <!-- pupils -->
                <circle id="apollo-pupil-l" cx="20" cy="25.2" r="1.7"
                    fill="rgba(15,15,35,0.88)"/>
                <circle id="apollo-pupil-r" cx="40" cy="25.2" r="1.7"
                    fill="rgba(15,15,35,0.88)"/>
                <!-- eye-shine sparks -->
                <circle cx="21.4" cy="23.2" r="0.75" fill="rgba(255,255,255,0.95)"/>
                <circle cx="41.4" cy="23.2" r="0.75" fill="rgba(255,255,255,0.95)"/>
                <!-- theme-coloured iris ring -->
                <ellipse id="apollo-iris-l" cx="20" cy="24.5" rx="2.1" ry="2.4"
                    fill="none" stroke="var(--primary-color)" stroke-width="0.7" opacity="0.55"/>
                <ellipse id="apollo-iris-r" cx="40" cy="24.5" rx="2.1" ry="2.4"
                    fill="none" stroke="var(--primary-color)" stroke-width="0.7" opacity="0.55"/>
            </g>

            <!-- ░░ MOUTH / EXPRESSION ░░ -->
            <g id="apollo-mouth-g" opacity="0.55">
                <path id="apollo-mouth-path"
                    d="M23 51 Q30 55.5 37 51"
                    stroke="rgba(255,255,255,0.65)" stroke-width="1.9"
                    fill="none" stroke-linecap="round"/>
            </g>
            <!-- ░░ NECK & SHOULDERS ░░ -->
            <g id="apollo-neck-g" opacity="0.9">
                <path d="M14 56 C16 60, 22 64, 30 64 C38 64, 44 60, 46 56 L46 64 L14 64 Z" fill="rgba(10,10,18,0.9)" stroke="var(--border-color)" stroke-width="0.4" />
                <path d="M12 64 L48 64 L48 68 C48 70, 46 72, 30 72 C14 72, 12 70, 12 68 Z" fill="rgba(30,30,36,0.95)" opacity="0.95" />
            </g>
        `;
        logoAvatar.appendChild(faceSVG);

        // ── Speech bubble ────────────────────────────────────────────
        let bubble = document.getElementById('apollo-expr-bubble');
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.id   = 'apollo-expr-bubble';
            bubble.className = 'apollo-bubble';
            bubble.innerText = '🤔';
            document.body.appendChild(bubble);
        }

        // ── Expression controller ────────────────────────────────────
        window.setApolloExpression = function(expr) {
            const imgs       = document.querySelectorAll('.apollo-char-img');
            const eyeL       = document.getElementById('apollo-eye-l');
            const eyeR       = document.getElementById('apollo-eye-r');
            const pupilL     = document.getElementById('apollo-pupil-l');
            const pupilR     = document.getElementById('apollo-pupil-r');
            const irisL      = document.getElementById('apollo-iris-l');
            const irisR      = document.getElementById('apollo-iris-r');
            const mouth      = document.getElementById('apollo-mouth-path');
            const moutheG    = document.getElementById('apollo-mouth-g');
            const moustacheG = document.getElementById('apollo-moustache-g');
            if (expr === 'think') {
                bubble.innerHTML = '🤔 Computing...';
                bubble.classList.add('visible');
                imgs.forEach(i => { i.classList.remove('idle-anim','talk-anim'); i.classList.add('think-anim'); });
                if (eyeL)   { eyeL.setAttribute('ry','1.3'); eyeL.setAttribute('cy','24'); }
                if (eyeR)   { eyeR.setAttribute('ry','1.3'); eyeR.setAttribute('cy','24'); }
                if (pupilL) { pupilL.setAttribute('cy','24.4'); pupilL.setAttribute('r','1.3'); }
                if (pupilR) { pupilR.setAttribute('cy','24.4'); pupilR.setAttribute('r','1.3'); }
                if (irisL)  { irisL.setAttribute('ry','1'); }
                if (irisR)  { irisR.setAttribute('ry','1'); }
                if (mouth)  mouth.setAttribute('d', 'M24 52 Q30 51.5 36 52');
                if (moutheG) moutheG.setAttribute('opacity','0.45');
                if (moustacheG) { moustacheG.setAttribute('opacity','0.48'); moustacheG.classList.add('twitching'); }

            } else if (expr === 'talk') {
                bubble.innerHTML = '💬 Speaking...';
                bubble.classList.add('visible');
                imgs.forEach(i => { i.classList.remove('idle-anim','think-anim'); i.classList.add('talk-anim'); });
                if (eyeL)   { eyeL.setAttribute('ry','4.0'); eyeL.setAttribute('cy','23.5'); }
                if (eyeR)   { eyeR.setAttribute('ry','4.0'); eyeR.setAttribute('cy','23.5'); }
                if (pupilL) { pupilL.setAttribute('cy','25'); pupilL.setAttribute('r','1.9'); }
                if (pupilR) { pupilR.setAttribute('cy','25'); pupilR.setAttribute('r','1.9'); }
                if (irisL)  { irisL.setAttribute('ry','3'); }
                if (irisR)  { irisR.setAttribute('ry','3'); }
                if (mouth)  mouth.setAttribute('d', 'M19 50 Q30 58 41 50');
                if (moutheG) moutheG.setAttribute('opacity','0.65');
                if (moustacheG) { moustacheG.setAttribute('opacity','0.22'); moustacheG.classList.remove('twitching'); }

                // start lip-sync oscillation if not already running
                if (!apolloTalkInterval) {
                    const base = Date.now();
                    apolloTalkInterval = setInterval(() => {
                        const s = (Math.sin((Date.now() - base) / 80) + 1) * 0.5; // 0..1
                        if (mouth) {
                            // make mouth path open/close using Q control point
                            const open = 50 + Math.floor(s * 10);
                            const close = 19 - Math.floor(s * 2);
                            mouth.setAttribute('d', `M${close} ${open-1} Q30 ${open+6} 41 ${open-1}`);
                        }
                    }, 60);
                }

            } else if (expr === 'blink') {
                // quick blink
                imgs.forEach(i => i.classList.remove('idle-anim','think-anim','talk-anim'));
                if (eyeL) { eyeL.setAttribute('ry','0.6'); }
                if (eyeR) { eyeR.setAttribute('ry','0.6'); }
                setTimeout(() => window.setApolloExpression('idle'), 180);

            } else if (expr === 'happy') {
                bubble.innerHTML = '😊 Hi there!';
                bubble.classList.add('visible');
                imgs.forEach(i => { i.classList.remove('think-anim'); i.classList.add('idle-anim'); });
                if (eyeL) { eyeL.setAttribute('ry','3.8'); eyeL.setAttribute('cy','23.8'); }
                if (eyeR) { eyeR.setAttribute('ry','3.8'); eyeR.setAttribute('cy','23.8'); }
                if (mouth) mouth.setAttribute('d', 'M20 50 Q30 56 40 50');
                if (moustacheG) moustacheG.setAttribute('opacity','0.28');
                setTimeout(() => { bubble.classList.remove('visible'); window.setApolloExpression('idle'); }, 1200);

            } else if (expr === 'surprised') {
                bubble.innerHTML = '😮 Oh!';
                bubble.classList.add('visible');
                imgs.forEach(i => i.classList.remove('idle-anim','talk-anim','think-anim'));
                if (eyeL) { eyeL.setAttribute('ry','5.2'); eyeL.setAttribute('cy','23.3'); }
                if (eyeR) { eyeR.setAttribute('ry','5.2'); eyeR.setAttribute('cy','23.3'); }
                if (mouth) mouth.setAttribute('d', 'M27 49 Q30 62 33 49');
                setTimeout(() => window.setApolloExpression('idle'), 900);

            } else {
                // IDLE: relaxed eyes + gentle smile
                bubble.classList.remove('visible');
                imgs.forEach(i => { i.classList.remove('think-anim','talk-anim'); i.classList.add('idle-anim'); });
                if (eyeL)   { eyeL.setAttribute('ry','3.3'); eyeL.setAttribute('cy','24'); }
                if (eyeR)   { eyeR.setAttribute('ry','3.3'); eyeR.setAttribute('cy','24'); }
                if (pupilL) { pupilL.setAttribute('cy','25.2'); pupilL.setAttribute('r','1.7'); }
                if (pupilR) { pupilR.setAttribute('cy','25.2'); pupilR.setAttribute('r','1.7'); }
                if (irisL)  { irisL.setAttribute('ry','2.4'); }
                if (irisR)  { irisR.setAttribute('ry','2.4'); }
                if (mouth)  mouth.setAttribute('d', 'M23 51 Q30 55.5 37 51');
                if (moutheG) moutheG.setAttribute('opacity','0.55');
                if (moustacheG) { moustacheG.setAttribute('opacity','0.30'); moustacheG.classList.remove('twitching'); }
                // stop lip-sync if running
                if (apolloTalkInterval) { clearInterval(apolloTalkInterval); apolloTalkInterval = null; if (mouth) mouth.setAttribute('d', 'M23 51 Q30 55.5 37 51'); }
            }
        };
    }
    initApollo3D();
    bindBrandImages();
    updateApolloFilters();

    // Make Apollo more human: auto-blink + micro-expressions on hover/click
    (function humanizeApollo(){
        // periodic random blink
        setInterval(() => {
            if (typeof window.setApolloExpression === 'function') {
                window.setApolloExpression('blink');
            }
        }, 4000 + Math.floor(Math.random() * 5000));

        // hover + click micro-expressions
        const logoAvatar = document.getElementById('apollo-logo-avatar');
        if (logoAvatar) {
            logoAvatar.addEventListener('mouseenter', () => { if (typeof window.setApolloExpression === 'function') window.setApolloExpression('happy'); });
            logoAvatar.addEventListener('mouseleave', () => { if (typeof window.setApolloExpression === 'function') window.setApolloExpression('idle'); });
            logoAvatar.addEventListener('click', () => { if (typeof window.setApolloExpression === 'function') window.setApolloExpression('think'); });
        }
    })();

    // 3D Wandering Apollo
    function initWanderingApollo() {
        const container = document.getElementById('apollo-bg-container');
        if (!container || typeof THREE === 'undefined') return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 10;
        camera.position.y = 2;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        container.appendChild(renderer.domElement);

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        const apollo = new THREE.Group();

        // Glowing Material
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x8b5cf6),
            emissive: new THREE.Color(0x4c1d95),
            emissiveIntensity: 0.5,
            roughness: 0.2,
            metalness: 0.8
        });

        // Body (using CylinderGeometry instead of CapsuleGeometry for compatibility)
        const bodyGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.8, 8, 4);
        const body = new THREE.Mesh(bodyGeo, material);
        apollo.add(body);

        // Head
        const headGeo = new THREE.SphereGeometry(0.6, 32, 32);
        const head = new THREE.Mesh(headGeo, material);
        head.position.y = 1.8;
        apollo.add(head);

        // Arms (using CylinderGeometry instead of CapsuleGeometry for compatibility)
        const armGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.0, 6, 2);
        const armL = new THREE.Mesh(armGeo, material);
        armL.position.set(-1.2, 0.5, 0);
        const armR = new THREE.Mesh(armGeo, material);
        armR.position.set(1.2, 0.5, 0);
        apollo.add(armL);
        apollo.add(armR);

        scene.add(apollo);

        // Lights
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(5, 5, 5);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0x404040, 2));

        let time = 0;
        function animateWander() {
            requestAnimationFrame(animateWander);
            time += 0.01;

            // Wander around the screen
            apollo.position.x = Math.sin(time * 0.5) * 8;
            apollo.position.z = Math.cos(time * 0.3) * 4 - 2;
            apollo.position.y = Math.sin(time * 2) * 0.2; // Hover effect

            // Look direction
            apollo.rotation.y = Math.atan2(Math.cos(time * 0.5), -Math.sin(time * 0.3));

            // Arm swing
            armL.rotation.x = Math.sin(time * 2) * 0.5;
            armR.rotation.x = -Math.sin(time * 2) * 0.5;

            // Update color based on theme
            const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();
            if (primary && primary.startsWith('#')) {
                material.color.set(primary);
                material.emissive.set(primary);
            }

            renderer.render(scene, camera);
        }
        animateWander();
    }
    initWanderingApollo();

    // Insert small UI CSS tweaks for 3D transitions if not present
    if (!document.getElementById('ui-ux-enhancements')) {
        const s = document.createElement('style'); s.id = 'ui-ux-enhancements';
        s.textContent = `
            .main-content.page-anim-active { transform: perspective(1200px) translateZ(-40px) rotateY(-6deg); transition: transform 420ms cubic-bezier(.2,.9,.2,1); transform-origin: left center; }
            #extras-modal { opacity: 0; transition: opacity 260ms ease, transform 260ms ease; }
            #extras-modal[style*="display: flex"] { opacity: 1; }
            #extras-modal .card { transform: translateY(8px) scale(0.985); transition: transform 260ms ease; }
            #extras-modal[style*="display: flex"] .card { transform: translateY(0) scale(1); }
        `;
        document.head.appendChild(s);
    }

    // --- Phase 4: Smart Study Tools ---

    // Universal Search
    const universalSearchInput = document.getElementById('universal-search-input');
    universalSearchInput.addEventListener('input', () => {
        const query = universalSearchInput.value.toLowerCase();
        if (query.length < 2) return;

        const results = [];
        todos.forEach(t => t.text.toLowerCase().includes(query) && results.push(`Todo: ${t.text}`));
        flashcards.forEach(f => (f.front + f.back).toLowerCase().includes(query) && results.push(`Flashcard: ${f.front}`));

        if (results.length > 0) {
            universalSearchInput.title = "Found: " + results.join(', ');
        }
    });

    // Offline-aware Dictionary (supports en-US / en-GB dialects)
    let offlineDict = {};
    const dialectSelect = document.getElementById('dialect-select') || document.getElementById('dashboard-dialect-select') || null;
    const extrasModal = document.getElementById('extras-modal') || null;
    const extrasBtn = document.getElementById('extras-btn') || null;
    const extrasClose = document.getElementById('extras-close') || null;
    const dictInput = document.getElementById('dashboard-dict-search') || document.getElementById('extras-dict-search') || document.getElementById('dictionary-search');
    const dictResult = document.getElementById('dashboard-dict-result') || document.getElementById('extras-dict-result') || document.getElementById('dictionary-result');
    const offlineOnlyCheckbox = document.getElementById('dashboard-dict-offline-only') || document.getElementById('dict-offline-only');
    const dictStatus = document.getElementById('dashboard-dict-status') || document.getElementById('dict-status');

    async function loadOfflineDict() {
        try {
            const res = await fetch('offline-dictionary.json');
            if (res.ok) {
                offlineDict = await res.json();
                if (dictStatus) dictStatus.textContent = 'Offline dictionary loaded';
                localStorage.setItem(getKey('offline_dict_loaded'), '1');
            }
        } catch (e) {
            offlineDict = {};
            if (dictStatus) dictStatus.textContent = 'Offline dictionary unavailable';
        }
    }

    function findOfflineEntry(word) {
        if (!word) return null;
        const helpers = window.CognifyDictionaryUtils;
        if (helpers && typeof helpers.findOfflineEntry === 'function') {
            return helpers.findOfflineEntry(offlineDict, word);
        }
        const w = word.toLowerCase();
        if (offlineDict[w]) return offlineDict[w];
        return Object.values(offlineDict).find(e => (e.word && e.word.toLowerCase() === w) || (e.us_spelling && e.us_spelling.toLowerCase() === w) || (e.uk_spelling && e.uk_spelling.toLowerCase() === w));
    }

    function renderOfflineEntry(entry, dialect) {
        const helpers = window.CognifyDictionaryUtils;
        if (helpers && typeof helpers.renderOfflineEntry === 'function') {
            const lookup = findOfflineEntry(dictInput?.value || '');
            return helpers.renderOfflineEntry(entry, dialect, lookup?.word || '');
        }
        if (!entry) return `<div style="color:var(--text-muted)">No offline entry available.</div>`;
        const spelling = (dialect && entry[ dialect.startsWith('en-GB') ? 'uk_spelling' : 'us_spelling' ]) || entry.word || '';
        const phon = (dialect && entry[ dialect.startsWith('en-GB') ? 'uk_pron' : 'us_pron' ]) || entry.pronunciation || '';
        const defs = (entry.definitions || []).slice(0,4).map(d => `<div style="margin-top:0.4rem"><strong style="color:var(--neon-accent);font-size:0.82rem">${d.partOfSpeech || ''}</strong><div style="margin-top:0.2rem">${d.definition}${d.example?`<div style=\"color:var(--text-muted);font-size:0.85rem;margin-top:0.25rem\">"${d.example}"</div>`:''}</div></div>`).join('');
        let variants = '';
        if (entry.us_spelling && entry.uk_spelling && entry.us_spelling !== entry.uk_spelling) {
            variants = `<div style="margin-top:0.6rem;font-size:0.85rem;color:var(--text-muted)">Variants: US: <b>${entry.us_spelling}</b> · UK: <b>${entry.uk_spelling}</b></div>`;
        }
        return `<div><b style="color:var(--primary-color);font-size:1rem">${spelling}</b> <span style="color:var(--text-muted);font-size:0.85rem">${phon}</span>${defs}${variants}</div>`;
    }

    async function lookupWord(word) {
        if (!word || !dictResult) return;
        dictResult.innerHTML = `<i>🔍 Looking up "${word}"...</i>`;
        const dialect = (dialectSelect && dialectSelect.value) || localStorage.getItem(getKey('dict_dialect')) || 'en-US';
        if (dialectSelect) localStorage.setItem(getKey('dict_dialect'), dialect);
        const preferOffline = offlineOnlyCheckbox ? offlineOnlyCheckbox.checked : false;

        // 1) Try offline dictionary first
        const off = findOfflineEntry(word);
        if (off) {
            const entry = off.entry || off;
            dictResult.innerHTML = renderOfflineEntry(entry, dialect);
            return;
        }

        // 2) If offline-only requested, show not found
        if (preferOffline) {
            dictResult.innerHTML = `<span style="color:#ef4444">No offline definition for "${word}".</span>`;
            return;
        }

        // 3) Fallback to existing online APIs (dictionaryapi.dev then Wiktionary)
        try {
            const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
            if (res.ok) {
                const data = await res.json();
                if (data[0]?.meanings?.length) {
                    const meanings = data[0].meanings.slice(0,3).map(m=>
                        `<div style="margin-top:0.5rem"><span style="color:var(--neon-accent);font-size:0.8rem;font-style:italic">${m.partOfSpeech}</span><br>${m.definitions[0].definition}${m.definitions[0].example?`<br><span style="color:var(--text-muted);font-size:0.85rem">"${m.definitions[0].example}"</span>`:''}</div>`
                    ).join('');
                    const phonetic = data[0].phonetic || '';
                    dictResult.innerHTML = `<b style="color:var(--primary-color);font-size:1rem">${data[0].word}</b> <span style="color:var(--text-muted);font-size:0.85rem">${phonetic}</span>${meanings}`;
                    return;
                }
            }
        } catch(_) {}

        try {
            const lang = (voiceLangSelect?.value || 'en-US').split('-')[0];
            const wiki = ['en','fr','de','es','pt','it','nl','pl','ru','ar','zh','ja','ko','sw'].includes(lang) ? lang : 'en';
            const res = await fetch(`https://${wiki}.wiktionary.org/w/api.php?action=query&prop=extracts&exlimit=1&titles=${encodeURIComponent(word)}&explaintext=1&format=json&origin=*`);
            const data = await res.json();
            const pages = data.query?.pages;
            const page = pages ? pages[Object.keys(pages)[0]] : null;
            if (page?.extract) {
                const lines = page.extract.split('\n').filter(l=>l.trim() && !l.startsWith('=='));
                dictResult.innerHTML = `<b style="color:var(--primary-color)">${word}</b><br><span style="font-size:0.9rem;color:var(--text-main)">${lines.slice(0,4).join(' ')}</span><br><a href="https://${wiki}.wiktionary.org/wiki/${encodeURIComponent(word)}" target="_blank" style="color:var(--neon-accent);font-size:0.8rem">→ Full Wiktionary entry</a>`;
                return;
            }
        } catch(_) {}

        dictResult.innerHTML = `<span style="color:#ef4444">No definition found for "${word}".</span>`;
    }

    if (dictInput) {
        dictInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && dictInput.value.trim()) lookupWord(dictInput.value.trim()); });
        dictInput.addEventListener('input', () => {
            if (dictInput.value.trim().length > 1) {
                clearTimeout(dictInput._t);
                dictInput._t = setTimeout(() => lookupWord(dictInput.value.trim()), 450);
            }
        });
    }

    // extras modal open/close
    if (extrasBtn && extrasModal) {
        extrasBtn.addEventListener('click', () => {
            extrasModal.style.display = 'flex';
            // restore dialect
            const saved = localStorage.getItem(getKey('dict_dialect'));
            if (dialectSelect && saved) dialectSelect.value = saved;
        });
    }
    // Auto-save dialect selection on change so updates happen without prompt
    if (dialectSelect) {
        dialectSelect.addEventListener('change', (e) => {
            const v = e.target.value;
            localStorage.setItem(getKey('dict_dialect'), v);
            if (dictStatus) dictStatus.textContent = `Dialect saved: ${v}`;
        });
    }
    if (extrasClose && extrasModal) extrasClose.addEventListener('click', () => extrasModal.style.display = 'none');
    if (extrasModal) {
        extrasModal.addEventListener('click', (e) => { if (e.target === extrasModal) extrasModal.style.display = 'none'; });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') extrasModal.style.display = 'none'; });
    }

    // Kick off offline dictionary load
    loadOfflineDict();

    // If HTML didn't include the extras modal/button, create them dynamically
    function createExtrasUI() {
        if (!document.getElementById('extras-btn')) {
            const headerTop = document.querySelector('.header-top');
            if (headerTop) {
                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex'; wrapper.style.alignItems = 'center'; wrapper.style.gap = '0.6rem';
                const left = headerTop.querySelector('div');
                const search = headerTop.querySelector('.universal-search');
                if (search) wrapper.appendChild(search);
                const btn = document.createElement('button');
                btn.id = 'extras-btn'; btn.title = 'Extras'; btn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-main);cursor:pointer;';
                btn.innerHTML = '<i class="ph ph-dots-three"></i>';
                wrapper.appendChild(btn);
                // replace original children
                headerTop.innerHTML = '';
                headerTop.appendChild(left || document.createElement('div'));
                headerTop.appendChild(wrapper);
            }
        }

        if (!document.getElementById('extras-modal')) {
            const modal = document.createElement('div');
            modal.id = 'extras-modal'; modal.className = 'modal glass';
            modal.style.cssText = 'display:none; position: fixed; inset: 0; z-index: 1200; background: rgba(0,0,0,0.7); backdrop-filter: blur(6px); align-items: center; justify-content: center;';
            modal.innerHTML = `
                <div class="card glass" style="width: 92%; max-width: 720px; padding: 1.25rem; border-radius: 18px; border: 1px solid var(--border-color);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                        <h2 style="margin:0;display:flex;align-items:center;gap:0.6rem;"><i class="ph ph-sparkle"></i> Extras</h2>
                        <div style="display:flex;gap:0.5rem;align-items:center;">
                            <label style="font-size:0.85rem;color:var(--text-muted);">Dialect</label>
                            <select id="dialect-select" style="padding:0.4rem;border-radius:8px;background:var(--bg-main);color:var(--text-main);border:1px solid var(--border-color);">
                                <option value="en-US">American English (US)</option>
                                <option value="en-GB">British English (UK)</option>
                            </select>
                            <button id="extras-close" style="background:none;border:none;color:var(--text-muted);font-size:1.1rem;cursor:pointer;"><i class="ph ph-x"></i></button>
                        </div>
                    </div>
                    <div style="display:flex;gap:1rem;">
                        <div style="flex:1;min-width:260px;">
                            <label style="font-size:0.9rem;color:var(--text-muted);">Offline Dictionary</label>
                            <input id="extras-dict-search" type="text" placeholder="Look up a word..." style="width:100%;padding:0.8rem;border-radius:10px;border:1px solid var(--border-color);background:rgba(0,0,0,0.06);color:var(--text-main);margin-top:0.5rem;">
                            <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.5rem;">
                                <label style="font-size:0.85rem;color:var(--text-muted);">Offline only</label>
                                <input id="dict-offline-only" type="checkbox" title="Prefer offline data when available">
                                <div id="dict-status" style="margin-left:auto;color:var(--text-muted);font-size:0.85rem;">Loading dict...</div>
                            </div>
                        </div>
                        <div style="flex:1;min-width:300px;">
                            <div id="extras-dict-result" style="min-height:88px;padding:0.6rem;border-radius:10px;border:1px solid var(--border-color);background:rgba(0,0,0,0.03);color:var(--text-main);overflow:auto;font-size:0.95rem;"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // refresh references
        if (!dialectSelect) window.dialectSelect = document.getElementById('dialect-select');
        if (!extrasBtn) window.extrasBtn = document.getElementById('extras-btn');
        if (!extrasModal) window.extrasModal = document.getElementById('extras-modal');
        if (!extrasClose) window.extrasClose = document.getElementById('extras-close');
        if (!dictStatus) window.dictStatus = document.getElementById('dict-status');

        // attach handlers if they weren't attached earlier
        const btn = document.getElementById('extras-btn');
        const modalEl = document.getElementById('extras-modal');
        const closeBtn = document.getElementById('extras-close');
        if (btn && modalEl) btn.addEventListener('click', () => modalEl.style.display = 'flex');
        if (closeBtn && modalEl) closeBtn.addEventListener('click', () => modalEl.style.display = 'none');
        if (modalEl) modalEl.addEventListener('click', (e) => { if (e.target === modalEl) modalEl.style.display = 'none'; });
    }

    createExtrasUI();

    // Calendar — month grid, week numbers, international & national holidays
    let calendarYear = new Date().getFullYear();
    let calendarMonth = new Date().getMonth();
    let selectedPlannerDay = new Date().getDate();
    let holidayFilter = 'all';

    // Restore persisted calendar month/year/day if available for this profile
    try {
        const savedMonth = localStorage.getItem(getKey('planner_month'));
        const savedYear = localStorage.getItem(getKey('planner_year'));
        const savedDay = localStorage.getItem(getKey('planner_day'));
        if (savedMonth !== null && savedYear !== null) {
            const m = parseInt(savedMonth, 10);
            const y = parseInt(savedYear, 10);
            if (!Number.isNaN(m) && !Number.isNaN(y)) { calendarMonth = m; calendarYear = y; }
        }
        if (savedDay !== null) {
            const sd = parseInt(savedDay, 10);
            if (!Number.isNaN(sd)) selectedPlannerDay = sd;
        }
        // Clamp selected day to valid range for restored month/year
        const maxDay = new Date(calendarYear, calendarMonth + 1, 0).getDate();
        if (selectedPlannerDay > maxDay) selectedPlannerDay = maxDay;
    } catch (e) { /* ignore */ }

    function saveEvents() {
        localStorage.setItem(getKey('events'), JSON.stringify(calendarEvents));
    }

    function formatTime12Hr(timeStr) {
        if (!timeStr) return "09:00 AM";
        const [hr, min] = timeStr.split(':');
        const h = parseInt(hr);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayHr = h % 12 || 12;
        return `${displayHr}:${min} ${ampm}`;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Build a unique key for events: "YYYY-MM-DD"
    function eventKey(year, month, day) {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function updatePlannerTitle() {
        const el = document.getElementById('plan-calendar-title');
        if (!el || selectedPlannerDay == null) return;
        const d = new Date(calendarYear, calendarMonth, selectedPlannerDay);
        el.textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }

    function renderDayHolidays() {
        const el = document.getElementById('planner-day-holidays');
        if (!el || selectedPlannerDay == null || !window.HolidayCalendar) {
            if (el) el.innerHTML = '';
            return;
        }
        const list = HolidayCalendar.getHolidaysForDay(calendarYear, calendarMonth, selectedPlannerDay, holidayFilter);
        if (!list.length) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = `<span style="font-weight:600;color:var(--text-main);">Holidays: </span>${list.map((h) => {
            const name = escapeHtml(h.name);
            return `<span class="cal-pill ${h.type === 'national' ? 'holiday-national' : 'holiday-intl'}" style="display:inline-block;margin:2px 4px 2px 0;">${name}</span>`;
        }).join('')}`;
    }

    function selectPlannerDay(year, month0, day) {
        calendarYear = year;
        calendarMonth = month0;
        selectedPlannerDay = day;
        try { localStorage.setItem(getKey('planner_day'), String(selectedPlannerDay)); localStorage.setItem(getKey('planner_month'), String(calendarMonth)); localStorage.setItem(getKey('planner_year'), String(calendarYear)); } catch (e) {}
        updatePlannerTitle();
        renderDayHolidays();
        renderDailyTasks();
        renderCalendar();
        const plannerWeekView = document.getElementById('planner-week-view');
        if (plannerWeekView && plannerWeekView.style.display !== 'none') {
            renderWeeklyTasks();
        }
    }

    // Robust replacement for renderCalendar to avoid mixed-up dates and ensure week numbers are correct.
    // Helper: compute ISO week number from a Date instance
    // Prefer shared DateUtils when available (UMD module), otherwise fallback to local impl.
    const getISOWeekNumberFromDate = (typeof DateUtils !== 'undefined' && DateUtils.getISOWeekNumberFromDate)
        ? DateUtils.getISOWeekNumberFromDate
        : function(d) {
            const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
            const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
            return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
        };

    // Replace previous renderCalendar with more explicit generation
    function renderCalendar() {
        const calendarWidget = document.getElementById('calendar-widget');
        if (!calendarWidget) return;

        const today = new Date();
        // Ensure selectedPlannerDay aligns to calendar month/year if it was left over
        if (selectedPlannerDay == null || typeof selectedPlannerDay !== 'number') {
            selectedPlannerDay = new Date().getDate();
            calendarYear = new Date().getFullYear();
            calendarMonth = new Date().getMonth();
        }

        const firstOfMonth = new Date(calendarYear, calendarMonth, 1);
        const monthName = firstOfMonth.toLocaleString(undefined, { month: 'long' });
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

        // Grid start is the Sunday at or before the 1st of month
        const gridStart = new Date(firstOfMonth);
        gridStart.setDate(gridStart.getDate() - gridStart.getDay());

        let html = `<div class="cal-nav"><h4>${monthName} ${calendarYear}</h4><div class="cal-nav-btns"><button type="button" id="cal-prev-btn" aria-label="Previous month"><i class="ph ph-caret-left"></i></button><button type="button" id="cal-next-btn" aria-label="Next month"><i class="ph ph-caret-right"></i></button></div></div><div class="cal-grid-wrap"><div class="cal-grid"><div class="cal-week-label">Wk</div>`;
        dayNames.forEach(d => html += `<div class="cal-dow">${d}</div>`);

        const cursor = new Date(gridStart);
        for (let row=0; row<6; row++) {
            const isoWeek = getISOWeekNumberFromDate(cursor);
            html += `<div class="cal-week-num" title="Week ${isoWeek}">${isoWeek}</div>`;
            for (let col=0; col<7; col++) {
                const y = cursor.getFullYear();
                const m = cursor.getMonth();
                const d = cursor.getDate();
                const inCurrentMonth = (m === calendarMonth && y === calendarYear);
                const isToday = (y===today.getFullYear() && m===today.getMonth() && d===today.getDate());
                const isSelected = inCurrentMonth && d === selectedPlannerDay;

                const key = eventKey(y,m,d);
                const tasks = calendarEvents[key] || [];
                const holidays = window.HolidayCalendar ? HolidayCalendar.getHolidaysForDay(y,m,d,holidayFilter) : [];

                const titlePieces = [];
                if (holidays.length) titlePieces.push(...holidays.map((h) => `${h.name} (${h.type})`));
                if (tasks.length) titlePieces.push(...tasks.slice(0, 2).map((t) => typeof t === 'string' ? t : t.text));
                const cellTitle = escapeHtml(titlePieces.join(' • '));

                let pills = '';
                holidays.slice(0,2).forEach((h) => {
                    const name = escapeHtml(h.name);
                    const type = h.type === 'national' ? 'holiday-national' : 'holiday-intl';
                    pills += `<div class="cal-pill ${type}" title="${name}">${name}</div>`;
                });
                if (holidays.length>2) pills += `<div class="cal-pill holiday-intl">+${holidays.length-2} more</div>`;
                tasks.slice(0,2).forEach((t) => {
                    const txt = typeof t === 'string' ? t : t.text;
                    const safeTxt = escapeHtml(txt);
                    const done = typeof t === 'object' && t.completed;
                    pills += `<div class="cal-pill task-pill ${done ? 'task-done' : ''}" title="${safeTxt}">${done ? '✓ ' : ''}${safeTxt}</div>`;
                });
                if (tasks.length>2) pills += `<div class="cal-pill task-pill">+${tasks.length-2} tasks</div>`;

                // small colored dots for quick month-grid highlighting
                const hasTasks = tasks.length > 0;
                const hasNational = holidays.some(h => h.type === 'national');
                const hasIntl = holidays.some(h => h.type !== 'national');
                let dots = '';
                if (hasTasks) dots += `<span class="cal-dot task-dot" title="Tasks"></span>`;
                if (hasNational) dots += `<span class="cal-dot holiday-national-dot" title="National holiday"></span>`;
                if (hasIntl) dots += `<span class="cal-dot holiday-intl-dot" title="International holiday"></span>`;

                const classes = ['cal-cell'];
                if (!inCurrentMonth) classes.push('other-month');
                if (isToday) classes.push('today');
                if (isSelected) classes.push('selected');

                html += `<div class="${classes.join(' ')}" data-y="${y}" data-m="${m}" data-d="${d}"${cellTitle ? ` title="${cellTitle}"` : ''}><span class="cal-day-num">${d}</span><span class="cal-dots">${dots}</span>${pills}</div>`;
                cursor.setDate(cursor.getDate()+1);
            }
        }
        html += '</div></div>';
        calendarWidget.innerHTML = html;

        // Attach handlers
        calendarWidget.querySelectorAll('.cal-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                const y = parseInt(cell.dataset.y,10);
                const m = parseInt(cell.dataset.m,10);
                const d = parseInt(cell.dataset.d,10);
                selectPlannerDay(y,m,d);
            });
        });

        const prevBtn = document.getElementById('cal-prev-btn');
        const nextBtn = document.getElementById('cal-next-btn');
        if (prevBtn) prevBtn.onclick = () => {
            calendarMonth--; if (calendarMonth<0) { calendarMonth=11; calendarYear--; }
            try { localStorage.setItem(getKey('planner_month'), String(calendarMonth)); localStorage.setItem(getKey('planner_year'), String(calendarYear)); } catch (e) {}
            renderCalendar();
        };
        if (nextBtn) nextBtn.onclick = () => {
            calendarMonth++; if (calendarMonth>11) { calendarMonth=0; calendarYear++; }
            try { localStorage.setItem(getKey('planner_month'), String(calendarMonth)); localStorage.setItem(getKey('planner_year'), String(calendarYear)); } catch (e) {}
            renderCalendar();
        };
    }

    // Auto-refresh today's highlight shortly after midnight to keep "today" accurate
    setInterval(() => {
        const now = new Date();
        if (now.getDate() !== new Date().getDate()) {
            // day rolled over; refresh calendar state
            calendarYear = now.getFullYear();
            calendarMonth = now.getMonth();
            selectedPlannerDay = now.getDate();
            renderCalendar();
        }
    }, 60 * 60 * 1000); // check hourly

    // Modal Study Planner Rendering
    function renderDailyTasks() {
        const listContainer = document.getElementById('planner-day-tasks-list');
        if (!listContainer || selectedPlannerDay == null) return;
        listContainer.innerHTML = '';

        const key = eventKey(calendarYear, calendarMonth, selectedPlannerDay);
        const dayEvents = calendarEvents[key] || [];
        dayEvents.sort((a, b) => (a.time || '09:00').localeCompare(b.time || '09:00'));

        if (dayEvents.length === 0) {
            listContainer.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.9rem;">No study tasks scheduled for this day.</div>`;
            return;
        }

        dayEvents.forEach((evt) => {
            const row = document.createElement('div');
            row.className = 'planner-task-row' + (evt.completed ? ' done' : '');

            row.innerHTML = `
                <span style="font-size:0.75rem; font-weight:bold; color:var(--neon-accent); background:rgba(45,212,191,0.08); padding:0.25rem 0.5rem; border-radius:6px; min-width:75px; text-align:center;">${formatTime12Hr(evt.time)}</span>
                <span style="flex:1; font-size:0.95rem; ${evt.completed ? 'text-decoration:line-through; color:var(--text-muted);' : 'color:var(--text-main);'}">${evt.text}</span>
                <button class="planner-chk-btn" style="background:none; border:none; color:${evt.completed ? 'var(--primary-color)' : 'var(--text-muted)'}; cursor:pointer; font-size:1.3rem; display:flex; align-items:center; justify-content:center;"><i class="ph ${evt.completed ? 'ph-check-circle-fill' : 'ph-circle'}"></i></button>
                <button class="planner-del-btn" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center;"><i class="ph ph-trash"></i></button>
            `;

            // Toggle completed state
            row.querySelector('.planner-chk-btn').onclick = () => {
                evt.completed = !evt.completed;
                saveEvents();
                renderCalendar();
                renderDailyTasks();
            };

            // Delete task item
            row.querySelector('.planner-del-btn').onclick = () => {
                calendarEvents[key] = calendarEvents[key].filter(e => e !== evt);
                saveEvents();
                renderCalendar();
                renderDailyTasks();
            };

            listContainer.appendChild(row);
        });
    }

    function renderWeeklyTasks() {
        const grid = document.getElementById('planner-week-grid');
        if (!grid || selectedPlannerDay == null) return;
        grid.innerHTML = '';

        const weekStart = window.HolidayCalendar
            ? HolidayCalendar.getWeekStartDate(calendarYear, calendarMonth, selectedPlannerDay)
            : (() => {
                const d = new Date(calendarYear, calendarMonth, selectedPlannerDay);
                d.setDate(d.getDate() - d.getDay());
                return d;
            })();

        const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(weekStart);
            dayDate.setDate(weekStart.getDate() + i);
            const y = dayDate.getFullYear();
            const m = dayDate.getMonth();
            const d = dayDate.getDate();
            const isActive = y === calendarYear && m === calendarMonth && d === selectedPlannerDay;

            const col = document.createElement('div');
            col.className = 'planner-week-col' + (isActive ? ' active' : '');

            const key = eventKey(y, m, d);
            const evts = calendarEvents[key] || [];
            const holidays = window.HolidayCalendar
                ? HolidayCalendar.getHolidaysForDay(y, m, d, holidayFilter)
                : [];

            const evtDots = evts.map((e) => {
                const txt = typeof e === 'string' ? e : e.text;
                const safeTxt = escapeHtml(txt);
                const done = typeof e === 'object' && e.completed;
                return `<div class="cal-pill task-pill ${done ? 'task-done' : ''}" title="${safeTxt}">${done ? '✓ ' : ''}${safeTxt}</div>`;
            }).join('');

            const holDots = holidays.slice(0, 2).map((h) => {
                const name = escapeHtml(h.name);
                return `<div class="cal-pill ${h.type === 'national' ? 'holiday-national' : 'holiday-intl'}" title="${name}">${name}</div>`;
            }).join('');

            col.innerHTML = `
                <h5>${dayLabels[i]} · ${dayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</h5>
                <div style="display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;">
                    ${holDots}
                    ${evts.length === 0 && !holDots ? '<span style="font-size:0.7rem;color:var(--text-muted);">No tasks</span>' : evtDots}
                </div>
            `;

            col.onclick = () => {
                selectPlannerDay(y, m, d);
                document.getElementById('planner-btn-day')?.click();
            };

            grid.appendChild(col);
        }
    }

    window.showDayDetail = (day) => {
        selectPlannerDay(calendarYear, calendarMonth, day);
    };

    // Close Modal study planner
    const closePlannerBtn = document.getElementById('close-planner-modal-btn');
    const closeCalendarDayBtn = document.getElementById('calendar-day-modal-close');
    const closeDayModal = () => {
        const modal = document.getElementById('calendar-day-modal');
        if (modal) modal.style.display = 'none';
    };
    if (closePlannerBtn) {
        closePlannerBtn.onclick = closeDayModal;
    }
    if (closeCalendarDayBtn) {
        closeCalendarDayBtn.onclick = closeDayModal;
    }

    // Add study planner task
    const plannerAddBtn = document.getElementById('planner-add-task-btn');
    const plannerInput = document.getElementById('planner-task-text');
    const plannerTime = document.getElementById('planner-task-time');

    if (plannerAddBtn) {
        const addNewPlannerTask = () => {
            const text = plannerInput.value.trim();
            if (text) {
                if (selectedPlannerDay == null) {
                    const t = new Date();
                    selectPlannerDay(t.getFullYear(), t.getMonth(), t.getDate());
                }
                const key = eventKey(calendarYear, calendarMonth, selectedPlannerDay);
                if (!calendarEvents[key]) calendarEvents[key] = [];
                calendarEvents[key].push({
                    id: Date.now(),
                    text: text,
                    time: plannerTime.value,
                    completed: false,
                    recurring: document.getElementById('planner-task-recurring')?.checked || false
                });
                plannerInput.value = '';
                saveEvents();
                renderCalendar();
                renderDailyTasks();
                plannerInput.focus();
            }
        };

        // Ensure input is editable and focusable
        try { plannerInput.removeAttribute('disabled'); } catch (e) {}
        plannerInput.readOnly = false;
        plannerInput.tabIndex = 0;

        plannerAddBtn.addEventListener('click', addNewPlannerTask);
        plannerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNewPlannerTask(); } });

        // Clicking the day panel should focus the input for quick entry
        const dayPanelEl = document.getElementById('planner-day-view');
        if (dayPanelEl) dayPanelEl.addEventListener('click', () => plannerInput.focus());
    }

    // Tab buttons day vs week planner
    const tabBtnDay = document.getElementById('planner-btn-day');
    const tabBtnWeek = document.getElementById('planner-btn-week');
    const viewDay = document.getElementById('planner-day-view');
    const viewWeek = document.getElementById('planner-week-view');

    if (tabBtnDay && tabBtnWeek) {
        const setPlannerTab = (mode) => {
            tabBtnDay.classList.toggle('active-tab', mode === 'day');
            tabBtnWeek.classList.toggle('active-tab', mode === 'week');
            viewDay.style.display = mode === 'day' ? 'block' : 'none';
            viewWeek.style.display = mode === 'week' ? 'block' : 'none';
            if (mode === 'day') renderDailyTasks();
            else renderWeeklyTasks();
        };
        tabBtnDay.onclick = () => setPlannerTab('day');
        tabBtnWeek.onclick = () => setPlannerTab('week');
        setPlannerTab('day');
    }

    const holidayFilterEl = document.getElementById('holiday-filter');
    if (holidayFilterEl) {
        holidayFilterEl.value = holidayFilter;
        holidayFilterEl.onchange = () => {
            holidayFilter = holidayFilterEl.value;
            renderCalendar();
            renderDayHolidays();
            if (document.getElementById('planner-week-view')?.style.display !== 'none') {
                renderWeeklyTasks();
            }
        };
    }

    const calTodayBtn = document.getElementById('cal-today-btn');
    if (calTodayBtn) {
        calTodayBtn.onclick = () => {
            const t = new Date();
            selectPlannerDay(t.getFullYear(), t.getMonth(), t.getDate());
        };
    }

    updatePlannerTitle();
    renderDayHolidays();

    // --- State Persistence & Initialization ---
    const mainGoalInput = document.getElementById('main-goal');
    const dailyObjInput = document.getElementById('daily-objective');
    const todoList = document.getElementById('todo-list');
    const flashcardsContainer = document.getElementById('flashcards-container');

    // Initialize Supercharged Rich Text Quill Editor safely
    if (document.getElementById('editor-container')) {
        quill = new Quill('#editor-container', {
            theme: 'snow',
            placeholder: 'Type your study notes, goals, or copy flashcard outputs here...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                    [{ 'font': [] }],
                    [{ 'size': ['small', false, 'large', 'huge'] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'script': 'sub'}, { 'script': 'super' }],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
                    [{ 'direction': 'rtl' }, { 'align': [] }],
                    ['link', 'image', 'video', 'formula'],
                    ['blockquote', 'code-block'],
                    ['clean']
                ]
            }
        });
        quill.on('text-change', () => {
            localStorage.setItem(getKey('notes'), quill.root.innerHTML);
        });

        // Intercept Image Uploads to use Firebase Storage
        const toolbar = quill.getModule('toolbar');
        toolbar.addHandler('image', () => {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/*');
            input.click();

            input.onchange = async () => {
                const file = input.files[0];
                if (file) {
                    try {
                        if (window.fbUploadImage) {
                            // Show temporary loading state
                            const range = quill.getSelection(true);
                            quill.insertText(range.index, 'Uploading image...', 'user');
                            
                            const url = await window.fbUploadImage(file);
                            
                            quill.deleteText(range.index, 19); // Remove loading text
                            quill.insertEmbed(range.index, 'image', url);
                            quill.setSelection(range.index + 1);
                        } else {
                            // Fallback to base64 if Firebase isn't initialized
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                const range = quill.getSelection(true);
                                quill.insertEmbed(range.index, 'image', e.target.result);
                            };
                            reader.readAsDataURL(file);
                        }
                    } catch (e) {
                        console.error("Image upload failed", e);
                        alert("Failed to upload image. Are you logged in?");
                    }
                }
            };
        });
    }

    // --- Inactive/Dead Features Implementations ---

    // 1. Pomodoro Timer implementation
    let pomodoroInterval = null;
    let isFocusPhase = true;
    let timerTimeLeft = 25 * 60;
    let pomodoroCyclesCompleted = 0;

    const timerTimeEl = document.getElementById('timer-time');
    const timerStatusEl = document.getElementById('timer-status');
    const timerCyclesEl = document.getElementById('timer-cycles');
    const timerStartBtn = document.getElementById('timer-start');
    const timerResetBtn = document.getElementById('timer-reset');
    const timerSkipBtn = document.getElementById('timer-skip');
    const focusTimeInput = document.getElementById('focus-time-input');
    const breakTimeInput = document.getElementById('break-time-input');
    const pomodoroRing = document.getElementById('pomodoro-ring-progress');
    const POMO_RADIUS = 52;
    const POMO_CIRC = 2 * Math.PI * POMO_RADIUS;

    if (pomodoroRing) {
        pomodoroRing.setAttribute('stroke-dasharray', `${POMO_CIRC}`);
        pomodoroRing.setAttribute('stroke-dashoffset', '0');
    }

    function getPomodoroPhaseTotal() {
        if (isFocusPhase) return Math.max(1, parseInt(focusTimeInput?.value || 25, 10) * 60);
        if (timerStatusEl?.textContent === 'Long Break') return 15 * 60;
        return Math.max(1, parseInt(breakTimeInput?.value || 5, 10) * 60);
    }

    function updatePomodoroRing() {
        if (!pomodoroRing) return;
        const total = getPomodoroPhaseTotal();
        const pct = Math.max(0, Math.min(1, timerTimeLeft / total));
        pomodoroRing.setAttribute('stroke-dashoffset', `${POMO_CIRC * (1 - pct)}`);
    }

    function updateTimerDisplay() {
        const m = Math.floor(timerTimeLeft / 60);
        const s = timerTimeLeft % 60;
        if (timerTimeEl) {
            timerTimeEl.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        updatePomodoroRing();
    }

    function advancePomodoroPhase() {
        const notifEnabled = localStorage.getItem(getKey('notifications_enabled')) !== 'false';
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.35);
        } catch (e) { /* ignore */ }

        if (isFocusPhase) {
            pomodoroCyclesCompleted++;
            if (timerCyclesEl) timerCyclesEl.textContent = `Cycles: ${pomodoroCyclesCompleted}`;
            if (pomodoroCyclesCompleted > 0 && pomodoroCyclesCompleted % 4 === 0) {
                timerTimeLeft = 15 * 60;
                if (timerStatusEl) timerStatusEl.textContent = 'Long Break';
                if (notifEnabled && Notification.permission === 'granted') {
                    new Notification('Long break', { body: '15 minutes to recharge.' });
                }
            } else {
                timerTimeLeft = parseInt(breakTimeInput?.value || 5, 10) * 60;
                if (timerStatusEl) timerStatusEl.textContent = 'Short Break';
                if (notifEnabled && Notification.permission === 'granted') {
                    new Notification('Break time', { body: 'Step away for a few minutes.' });
                }
            }
            isFocusPhase = false;
        } else {
            isFocusPhase = true;
            timerTimeLeft = parseInt(focusTimeInput?.value || 25, 10) * 60;
            if (timerStatusEl) timerStatusEl.textContent = 'Focus';
            if (notifEnabled && Notification.permission === 'granted') {
                new Notification('Focus time', { body: 'Back to work.' });
            }
        }
        updateTimerDisplay();
    }

    function toggleTimer() {
        if (pomodoroInterval) {
            clearInterval(pomodoroInterval);
            pomodoroInterval = null;
            timerStartBtn.innerHTML = '<i class="ph ph-play"></i> Start';
            timerStartBtn.style.background = 'var(--primary-color)';
        } else {
            timerStartBtn.innerHTML = '<i class="ph ph-pause"></i> Pause';
            timerStartBtn.style.background = '#ef4444';

            pomodoroInterval = setInterval(() => {
                timerTimeLeft--;
                updateTimerDisplay();

                if (timerTimeLeft <= 0) {
                    clearInterval(pomodoroInterval);
                    pomodoroInterval = null;
                    if (timerStartBtn) {
                        timerStartBtn.innerHTML = 'Start';
                        timerStartBtn.style.background = 'var(--primary-color)';
                    }
                    advancePomodoroPhase();
                }
            }, 1000);
        }
    }

    if (timerStartBtn) {
        timerStartBtn.addEventListener('click', toggleTimer);
        if (timerSkipBtn) {
            timerSkipBtn.addEventListener('click', () => {
                if (pomodoroInterval) {
                    clearInterval(pomodoroInterval);
                    pomodoroInterval = null;
                    timerStartBtn.innerHTML = 'Start';
                    timerStartBtn.style.background = 'var(--primary-color)';
                }
                timerTimeLeft = 0;
                advancePomodoroPhase();
            });
        }
        timerResetBtn.addEventListener('click', () => {
            if (pomodoroInterval) {
                clearInterval(pomodoroInterval);
                pomodoroInterval = null;
            }
            isFocusPhase = true;
            timerTimeLeft = focusTimeInput.value * 60;
            if (timerStatusEl) timerStatusEl.textContent = 'Focus';
            timerStartBtn.innerHTML = 'Start';
            timerStartBtn.style.background = 'var(--primary-color)';
            if (timerCyclesEl) timerCyclesEl.textContent = 'Cycles: 0';
            pomodoroCyclesCompleted = 0;
            updateTimerDisplay();
        });
        updateTimerDisplay();

        focusTimeInput.addEventListener('change', () => {
            if (!pomodoroInterval && isFocusPhase) {
                timerTimeLeft = focusTimeInput.value * 60;
                updateTimerDisplay();
            }
        });

        breakTimeInput.addEventListener('change', () => {
            if (!pomodoroInterval && !isFocusPhase) {
                timerTimeLeft = breakTimeInput.value * 60;
                updateTimerDisplay();
            }
        });
    }

    // Ambient Focus Synthesizer (Web Audio API)
    let ambientCtx = null;
    let ambientNode = null;
    let ambientGain = null;
    let isAmbientPlaying = false;

    const ambientToggleBtn = document.getElementById('ambient-toggle');
    const ambientTypeSelect = document.getElementById('ambient-type');
    const ambientVolumeSlider = document.getElementById('ambient-volume');

    function createNoiseNode(type) {
        const bufferSize = ambientCtx.sampleRate * 2;
        const buffer = ambientCtx.createBuffer(1, bufferSize, ambientCtx.sampleRate);
        const output = buffer.getChannelData(0);

        if (type === 'brown') {
            let lastOut = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                output[i] = (lastOut + (0.02 * white)) / 1.02;
                lastOut = output[i];
                output[i] *= 3.5;
            }
        } else { // Pink Noise
            let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                output[i] *= 0.11;
                b6 = white * 0.115926;
            }
        }

        const noise = ambientCtx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        return noise;
    }

    function toggleAmbientAudio() {
        if (!ambientCtx) ambientCtx = new (window.AudioContext || window.webkitAudioContext)();

        if (isAmbientPlaying) {
            if (ambientNode) ambientNode.stop();
            isAmbientPlaying = false;
            ambientToggleBtn.innerHTML = '<i class="ph ph-play" style="font-size: 1.5rem;"></i>';
            ambientToggleBtn.style.background = 'var(--primary-color)';
        } else {
            ambientGain = ambientCtx.createGain();
            ambientGain.gain.value = ambientVolumeSlider.value;
            ambientGain.connect(ambientCtx.destination);

            ambientNode = createNoiseNode(ambientTypeSelect.value);
            ambientNode.connect(ambientGain);
            ambientNode.start(0);

            isAmbientPlaying = true;
            ambientToggleBtn.innerHTML = '<i class="ph ph-pause" style="font-size: 1.5rem;"></i>';
            ambientToggleBtn.style.background = '#ef4444';
        }
    }

    if (ambientToggleBtn) {
        ambientToggleBtn.addEventListener('click', toggleAmbientAudio);

        ambientTypeSelect.addEventListener('change', () => {
            if (isAmbientPlaying) {
                toggleAmbientAudio();
                toggleAmbientAudio();
            }
        });

        ambientVolumeSlider.addEventListener('input', (e) => {
            if (ambientGain) ambientGain.gain.value = e.target.value;
        });
    }

    // 2. Resource Uploader & Notepad Drag-Drop
    const dropZone = document.getElementById('upload-drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const filesGrid = document.getElementById('uploaded-files-grid');

    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--neon-accent)';
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = 'var(--border-color)';
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--border-color)';
            handleFiles(e.dataTransfer.files);
        });
    }

    function handleFiles(filesList) {
        Array.from(filesList).forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const resource = {
                    id: 'res-' + Date.now() + Math.random().toString(36).substr(2, 5),
                    name: file.name,
                    type: file.type,
                    data: event.target.result
                };
                uploadedFiles.push(resource);
                saveUploadedFiles();
                renderUploadedFiles();
            };
            if (file.type.startsWith('image/')) {
                reader.readAsDataURL(file);
            } else {
                reader.readAsText(file);
            }
        });
    }

    function saveUploadedFiles() {
        localStorage.setItem(getKey('resources'), JSON.stringify(uploadedFiles));
    }

    function renderUploadedFiles() {
        if (!filesGrid) return;
        filesGrid.innerHTML = '';
        uploadedFiles.forEach(file => {
            const card = document.createElement('div');
            card.className = 'glass';
            card.style.cssText = 'padding: 0.5rem; border-radius: 12px; display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8rem; overflow: hidden;';

            if (file.type.startsWith('image/')) {
                card.innerHTML = `
                    <img src="${file.data}" style="width: 100%; height: 60px; object-fit: cover; border-radius: 8px;">
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">${file.name}</div>
                    <div style="display: flex; gap: 0.25rem;">
                        <button onclick="insertResourceToNotes('${file.id}')" title="Insert to notepad" style="flex: 1; padding: 0.25rem; border-radius: 6px; border: none; background: var(--primary-color); color: white; cursor: pointer; font-size: 0.9rem;"><i class="ph ph-textbox"></i></button>
                        <button onclick="deleteResource('${file.id}')" title="Delete" style="padding: 0.25rem; border-radius: 6px; border: none; background: #ef4444; color: white; cursor: pointer; font-size: 0.9rem;"><i class="ph ph-trash"></i></button>
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <div style="height: 60px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); border-radius: 8px; font-size: 1.5rem; color: var(--primary-color);"><i class="ph ph-file-text"></i></div>
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">${file.name}</div>
                    <div style="display: flex; gap: 0.25rem;">
                        <button onclick="insertResourceToNotes('${file.id}')" title="Insert text content" style="flex: 1; padding: 0.25rem; border-radius: 6px; border: none; background: var(--primary-color); color: white; cursor: pointer; font-size: 0.9rem;"><i class="ph ph-textbox"></i></button>
                        <button onclick="deleteResource('${file.id}')" title="Delete" style="padding: 0.25rem; border-radius: 6px; border: none; background: #ef4444; color: white; cursor: pointer; font-size: 0.9rem;"><i class="ph ph-trash"></i></button>
                    </div>
                `;
            }
            filesGrid.appendChild(card);
        });
    }

    window.insertResourceToNotes = (id) => {
        const file = uploadedFiles.find(f => f.id === id);
        if (file && quill) {
            if (file.type.startsWith('image/')) {
                const range = quill.getSelection() || { index: quill.getLength() };
                quill.insertEmbed(range.index, 'image', file.data);
            } else {
                const range = quill.getSelection() || { index: quill.getLength() };
                quill.insertText(range.index, `\n--- [Resource: ${file.name}] ---\n${file.data}\n`);
            }
        }
    };

    window.deleteResource = (id) => {
        uploadedFiles = uploadedFiles.filter(f => f.id !== id);
        saveUploadedFiles();
        renderUploadedFiles();
    };

    // 3. Auto Summary Tool logic
    const generateSummaryBtn = document.querySelector('.summary-card .generate-btn');
    const summaryOutputEl = document.querySelector('.summary-card .summary-output');

    if (generateSummaryBtn) {
        generateSummaryBtn.addEventListener('click', () => {
            const text = quill ? quill.getText().trim() : '';
            if (!text || text.length < 15) {
                summaryOutputEl.innerHTML = '<span style="color:#ef4444; font-size:0.85rem;">Write at least 15 characters of notes in the Notepad first before generating a summary!</span>';
                return;
            }

            summaryOutputEl.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Reading content & extracting concepts...';

            setTimeout(() => {
                const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);
                const paragraphCount = text.split('\n').filter(p => p.trim().length > 0).length;

                const bulletPoints = sentences.slice(0, 4);

                let summaryHtml = `
                    <div style="background: rgba(45, 212, 191, 0.08); border: 1px solid var(--neon-accent); border-radius: 12px; padding: 0.8rem; font-size: 0.85rem; line-height: 1.4; color: var(--text-main);">
                        <h4 style="color: var(--neon-accent); margin-bottom: 0.4rem; display:flex; align-items:center; gap:0.25rem;"><i class="ph ph-magic-wand"></i> Key Takeaways</h4>
                        <ul style="list-style: disc; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.35rem;">
                            ${bulletPoints.map(bp => `<li>${bp}.</li>`).join('')}
                        </ul>
                        <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-muted); text-align: right;">
                            Analyzed ${paragraphCount} block(s) • ${sentences.length} sentence(s)
                        </div>
                    </div>
                `;
                summaryOutputEl.innerHTML = summaryHtml;
            }, 1200);
        });
    }

    // 4. Dynamic Settings page listeners
    outfitSelect.addEventListener('change', (e) => {
        localStorage.setItem(getKey('apollo_outfit'), e.target.value);
    });

    voiceLangSelect.addEventListener('change', (e) => {
        localStorage.setItem(getKey('apollo_voice_lang'), e.target.value);
    });

    notificationToggle.addEventListener('change', (e) => {
        localStorage.setItem(getKey('notifications_enabled'), e.target.checked ? 'true' : 'false');
        if (e.target.checked && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    });

    // 5. Interactive Visual Mind Map Builder
    let mindMapNodes = [];

    function saveMindMap() {
        localStorage.setItem(getKey('mind_map_nodes'), JSON.stringify(mindMapNodes));
    }

    function drawMapConnections() {
        const svg = document.getElementById('map-svg');
        const centerNode = document.getElementById('node-center');
        const canvas = document.getElementById('concept-map-area');
        if (!svg || !centerNode || !canvas) return;
        svg.innerHTML = '';

        const centerRect = centerNode.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();

        const cx = centerRect.left - canvasRect.left + centerRect.width / 2;
        const cy = centerRect.top - canvasRect.top + centerRect.height / 2;

        const subNodes = canvas.querySelectorAll('.concept-node:not(.core)');
        subNodes.forEach(node => {
            const rect = node.getBoundingClientRect();
            const nx = rect.left - canvasRect.left + rect.width / 2;
            const ny = rect.top - canvasRect.top + rect.height / 2;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', cx);
            line.setAttribute('y1', cy);
            line.setAttribute('x2', nx);
            line.setAttribute('y2', ny);
            line.setAttribute('stroke', 'var(--primary-color)');
            line.setAttribute('stroke-width', '3.5');
            line.setAttribute('stroke-dasharray', '8,8');
            line.setAttribute('opacity', '0.85');

            // Dynamic energy wave pulse
            const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
            animate.setAttribute('attributeName', 'stroke-dashoffset');
            animate.setAttribute('values', '100;0');
            animate.setAttribute('dur', '4s');
            animate.setAttribute('repeatCount', 'indefinite');
            line.appendChild(animate);

            svg.appendChild(line);
        });
    }

    function renderMindMap() {
        const canvas = document.getElementById('concept-map-area');
        if (!canvas) return;

        canvas.querySelectorAll('.concept-node:not(.core)').forEach((e) => e.remove());

        mindMapNodes.forEach(nodeData => {
            const nodeDiv = document.createElement('div');
            nodeDiv.className = 'concept-node';
            nodeDiv.id = `node-${nodeData.id}`;
            nodeDiv.style.left = nodeData.x + '%';
            nodeDiv.style.top = nodeData.y + '%';

            const span = document.createElement('span');
            span.textContent = nodeData.text;
            nodeDiv.appendChild(span);

            const delBtn = document.createElement('button');
            delBtn.innerHTML = '&times;';
            delBtn.style.cssText = 'background:none; border:none; color:#ef4444; margin-left:8px; font-weight:bold; cursor:pointer; font-size:1.15rem; display:inline-flex; align-items:center; justify-content:center;';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                mindMapNodes = mindMapNodes.filter(n => n.id !== nodeData.id);
                saveMindMap();
                renderMindMap();
            };
            nodeDiv.appendChild(delBtn);

            // Rename on double click
            nodeDiv.ondblclick = (e) => {
                e.stopPropagation();
                const newName = prompt('Enter new node name:', nodeData.text);
                if (newName && newName.trim() !== '') {
                    nodeData.text = newName;
                    saveMindMap();
                    renderMindMap();
                }
            };

            // Premium dragging system
            let isDragging = false;
            let startX, startY;

            nodeDiv.onmousedown = (e) => {
                if (e.target.tagName === 'BUTTON') return;
                e.stopPropagation();
                isDragging = true;
                nodeDiv.style.transition = 'none';
                const rect = canvas.getBoundingClientRect();
                startX = e.clientX - nodeDiv.offsetLeft;
                startY = e.clientY - nodeDiv.offsetTop;

                const onMouseMove = (moveEvent) => {
                    if (!isDragging) return;
                    let newLeft = moveEvent.clientX - startX;
                    let newTop = moveEvent.clientY - startY;

                    const leftPercent = Math.max(5, Math.min(95, (newLeft / rect.width) * 100));
                    const topPercent = Math.max(5, Math.min(95, (newTop / rect.height) * 100));

                    nodeDiv.style.left = leftPercent + '%';
                    nodeDiv.style.top = topPercent + '%';

                    nodeData.x = leftPercent;
                    nodeData.y = topPercent;

                    drawMapConnections();
                };

                const onMouseUp = () => {
                    isDragging = false;
                    nodeDiv.style.transition = '';
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    saveMindMap();
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };

            canvas.appendChild(nodeDiv);
        });

        setTimeout(drawMapConnections, 40);
    }

    function addConceptNode(text, xPct, yPct) {
        const label = (text || '').trim();
        if (!label) return;
        mindMapNodes.push({
            id: Date.now(),
            text: label,
            x: xPct != null ? xPct : 20 + Math.random() * 60,
            y: yPct != null ? yPct : 15 + Math.random() * 70
        });
        saveMindMap();
        renderMindMap();
    }

    function makeNodeDraggable(nodeEl, nodeData, canvas) {
        nodeEl.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            e.stopPropagation();
            const rect = canvas.getBoundingClientRect();
            const onMouseMove = (moveEvent) => {
                const leftPercent = Math.max(5, Math.min(95, ((moveEvent.clientX - rect.left) / rect.width) * 100));
                const topPercent = Math.max(5, Math.min(95, ((moveEvent.clientY - rect.top) / rect.height) * 100));
                nodeEl.style.left = `${leftPercent}%`;
                nodeEl.style.top = `${topPercent}%`;
                nodeData.x = leftPercent;
                nodeData.y = topPercent;
                drawMapConnections();
            };
            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                saveMindMap();
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
    }

    const centerNode = document.getElementById('node-center');
    const conceptCanvas = document.getElementById('concept-map-area');
    const mapNodeInput = document.getElementById('map-node-input');

    if (centerNode && conceptCanvas) {
        let coreData = { x: 50, y: 50 };
        centerNode.ondblclick = (e) => {
            e.stopPropagation();
            const newCenter = prompt('Core topic name:', centerNode.textContent);
            if (newCenter && newCenter.trim()) {
                centerNode.textContent = newCenter.trim();
                localStorage.setItem(getKey('map_center'), newCenter.trim());
                drawMapConnections();
            }
        };
        makeNodeDraggable(centerNode, coreData, conceptCanvas);

        conceptCanvas.onclick = (e) => {
            if (e.target.closest('.concept-node') || e.target.closest('button')) return;
            const rect = conceptCanvas.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            const fromInput = mapNodeInput?.value?.trim();
            if (fromInput) {
                addConceptNode(fromInput, x, y);
                mapNodeInput.value = '';
            } else {
                const name = prompt('Label for this idea:');
                if (name && name.trim()) addConceptNode(name.trim(), x, y);
            }
        };
    }

    const addMapNodeBtn = document.getElementById('add-map-node-btn');
    const clearMapBtn = document.getElementById('clear-map-btn');

    if (addMapNodeBtn) {
        addMapNodeBtn.onclick = () => addConceptNode(mapNodeInput?.value || '');
        if (mapNodeInput) {
            mapNodeInput.onkeydown = (e) => {
                if (e.key === 'Enter') addConceptNode(mapNodeInput.value);
            };
        }
    }

    if (clearMapBtn) {
        clearMapBtn.onclick = () => {
            if (confirm('Clear all custom mind map nodes?')) {
                mindMapNodes = [];
                saveMindMap();
                renderMindMap();
            }
        };
    }

    window.addEventListener('resize', () => {
        setTimeout(drawMapConnections, 100);
    });

    function loadProfileData() {
        calendarEvents = JSON.parse(localStorage.getItem(getKey('events'))) || {};
        todos = JSON.parse(localStorage.getItem(getKey('todos'))) || [];
        flashcards = JSON.parse(localStorage.getItem(getKey('flashcards'))) || [];
        uploadedFiles = JSON.parse(localStorage.getItem(getKey('resources'))) || [];

        mainGoalInput.value = localStorage.getItem(getKey('main_goal')) || '';
        dailyObjInput.value = localStorage.getItem(getKey('daily_obj')) || '';

        const savedTheme = normalizeTheme(localStorage.getItem(getKey('theme')) || 'dark-live');
        themeSelector.value = savedTheme;
        setTheme(savedTheme);

        if (quill) {
            quill.root.innerHTML = localStorage.getItem(getKey('notes')) || '';
        }

        const defaultMsg = '<div class="ai-message">Hello! I\'m Apollo. How can I help you today?</div>';
        const savedHistory = localStorage.getItem(getKey('ai_history'));
        apolloChat.innerHTML = savedHistory || defaultMsg;
        if (!savedHistory) {
            localStorage.setItem(getKey('ai_history'), defaultMsg);
        }

        // Load Floating Quick Chat History
        const quickMessages = document.getElementById('apollo-quick-messages');
        if (quickMessages) {
            const savedQuickHistory = localStorage.getItem(getKey('ai_quick_history'));
            quickMessages.innerHTML = savedQuickHistory || defaultMsg;
            if (!savedQuickHistory) {
                localStorage.setItem(getKey('ai_quick_history'), defaultMsg);
            }
        }

        // Load Settings Toggles & Values
        const savedOutfit = localStorage.getItem(getKey('apollo_outfit')) || 'trendy';
        outfitSelect.value = savedOutfit;

        const savedVoiceLang = localStorage.getItem(getKey('apollo_voice_lang')) || 'en-US';
        voiceLangSelect.value = savedVoiceLang;

        const savedNotif = localStorage.getItem(getKey('notifications_enabled')) !== 'false';
        notificationToggle.checked = savedNotif;

        if (savedNotif && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        renderCalendar();
        updatePlannerTitle();
        renderDayHolidays();
        renderDailyTasks();
        renderTodos();
        renderFlashcards();
        renderUploadedFiles();
        generateAiQuestions();

        // Load center concept text
        const savedCenter = localStorage.getItem(getKey('map_center'));
        if (centerNode) {
            centerNode.textContent = savedCenter || 'Core Topic';
        }

        // Load custom mind map nodes
        mindMapNodes = JSON.parse(localStorage.getItem(getKey('mind_map_nodes'))) || [
            { id: 1, text: 'Brainstorming', x: 25, y: 30 },
            { id: 2, text: 'Core Research', x: 75, y: 35 },
            { id: 3, text: 'Exam Prep', x: 45, y: 75 }
        ];
        renderMindMap();
    }

    function generateAiQuestions() {
        const notes = quill?.getText() || "";
        if (notes.length > 50) {
            appendMessage('ai', `<b>Apollo Tip:</b> I noticed you're studying. Would you like me to quiz you on your recent notes?`);
        }
    }

    function addStudyReference(title, url) {
        let refs = JSON.parse(localStorage.getItem(getKey('references'))) || [];
        if (!refs.find(r => r.url === url)) {
            refs.push({ title, url, date: new Date().toLocaleDateString() });
            localStorage.setItem(getKey('references'), JSON.stringify(refs));
        }
    }

    mainGoalInput.addEventListener('input', () => localStorage.setItem(getKey('main_goal'), mainGoalInput.value));
    dailyObjInput.addEventListener('input', () => localStorage.setItem(getKey('daily_obj'), dailyObjInput.value));

    // Theme & Initial Render
    renderProfiles();
    loadProfileData();

    // To-do logic
    window.addTodo = () => {
        const input = document.getElementById('new-todo-input');
        if (input.value) {
            todos.push({ text: input.value, completed: false });
            input.value = '';
            renderTodos();
        }
    };
    function renderTodos() {
        todoList.innerHTML = '';
        todos.forEach((todo, index) => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            li.style.gap = '0.5rem';
            li.innerHTML = `
                <input type="checkbox" ${todo.completed ? 'checked' : ''} onchange="toggleTodo(${index})">
                <span style="${todo.completed ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${todo.text}</span>
            `;
            todoList.appendChild(li);
        });
        localStorage.setItem(getKey('todos'), JSON.stringify(todos));
    }

    window.toggleTodo = (index) => {
        todos[index].completed = !todos[index].completed;
        renderTodos();
    };

    // Premium 3D Flashcard Flip Rendering
    function renderFlashcards() {
        if (!flashcardsContainer) return;
        flashcardsContainer.innerHTML = '';
        flashcards.forEach((fc, index) => {
            const card = document.createElement('div');
            card.className = 'flashcard';

            const inner = document.createElement('div');
            inner.className = 'flashcard-inner';

            const front = document.createElement('div');
            front.className = 'flashcard-front glass';
            front.innerHTML = `<div><b>Q:</b><br>${fc.front}</div>`;

            const back = document.createElement('div');
            back.className = 'flashcard-back glass';
            back.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;height:100%;justify-content:space-between;gap:0.5rem;width:100%;">
                    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;"><b>A:</b><br>${fc.back}</div>
                    <div style="display:flex;gap:4px;width:100%;" class="srs-buttons">
                        <button class="srs-btn" data-rating="1" style="flex:1;font-size:0.7rem;padding:4px;background:rgba(239,68,68,0.8);color:white;border:none;border-radius:6px;cursor:pointer;">Hard</button>
                        <button class="srs-btn" data-rating="2" style="flex:1;font-size:0.7rem;padding:4px;background:rgba(245,158,11,0.8);color:white;border:none;border-radius:6px;cursor:pointer;">Good</button>
                        <button class="srs-btn" data-rating="3" style="flex:1;font-size:0.7rem;padding:4px;background:rgba(16,185,129,0.8);color:white;border:none;border-radius:6px;cursor:pointer;">Easy</button>
                    </div>
                </div>
            `;

            inner.appendChild(front);
            inner.appendChild(back);
            card.appendChild(inner);

            card.addEventListener('click', (e) => {
                if(e.target.classList.contains('srs-btn')) {
                    const rating = parseInt(e.target.getAttribute('data-rating'));
                    fc.interval = rating === 1 ? 1 : (rating === 2 ? (fc.interval || 1) * 2 : (fc.interval || 1) * 3);
                    const now = new Date(); now.setDate(now.getDate() + fc.interval);
                    fc.nextReview = now.toISOString();

                    card.style.transform = 'scale(0.8)';
                    card.style.opacity = '0';
                    setTimeout(() => renderFlashcards(), 300);
                    e.stopPropagation();
                    return;
                }
                card.classList.toggle('flipped');
            });

            flashcardsContainer.appendChild(card);
        });
        localStorage.setItem(getKey('flashcards'), JSON.stringify(flashcards));
    }

    document.getElementById('add-fc-btn')?.addEventListener('click', () => {
        const front = document.getElementById('fc-front');
        const back = document.getElementById('fc-back');
        if (front?.value && back?.value) {
            flashcards.push({ front: front.value, back: back.value });
            front.value = '';
            back.value = '';
            renderFlashcards();
        }
    });

    document.getElementById('add-todo-btn')?.addEventListener('click', window.addTodo);
    document.getElementById('new-todo-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') window.addTodo();
    });

    // Card Minimizing Fix (Re-attach to all cards)
    function initCardCollapse() {
        document.querySelectorAll('.card').forEach(card => {
            if (card.querySelector('.collapse-btn')) return;
            const h2 = card.querySelector('h2');
            if (h2) {
                const btn = document.createElement('button');
                btn.className = 'collapse-btn';
                btn.innerHTML = '<i class="ph ph-caret-up"></i>';
                const actions = h2.querySelector('.h2-actions') || h2;
                actions.appendChild(btn);
                btn.onclick = (e) => {
                    e.stopPropagation();
                    card.classList.toggle('minimized');
                };
            }
        });
    }
    initCardCollapse();

    function initPasstimeGames() {
        const stage = document.getElementById('passtime-game-stage');
        const gameModal = document.getElementById('game-modal');
        const gameContainer = document.getElementById('game-container');
        const hint = document.getElementById('game-hint');
        const playSnake = document.getElementById('play-snake-btn');
        const playStick = document.getElementById('play-stickman-btn');
        const closeGameBtn = document.getElementById('close-game-btn');

        // --- Global exitToDashboard helper (used by exit-page-btn onClick) ---
        window.exitToDashboard = function () {
            const dashLink = document.querySelector('.nav-links li[data-target="dashboard"]');
            if (dashLink) {
                dashLink.click();
            } else {
                switchPage('dashboard');
                document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
                const dl = document.querySelector('.nav-links li');
                if (dl) dl.classList.add('active');
            }
        };

        // --- High score helpers (profile-aware) ---
        const gameStatsApi = window.CognifyGameStats;

        function getSnakeHS() { return parseInt(localStorage.getItem(getKey('snake_hs')) || '0', 10); }
        function getSnakeSessions() { return parseInt(localStorage.getItem(getKey('snake_sessions')) || '0', 10); }
        function getStickmanWins() { return parseInt(localStorage.getItem(getKey('stickman_wins')) || '0', 10); }
        function getStickmanSessions() { return parseInt(localStorage.getItem(getKey('stickman_sessions')) || '0', 10); }

        function renderGameStats() {
            const stats = gameStatsApi?.readGameStats ? gameStatsApi.readGameStats(localStorage, getKey('')) : {
                snakeBest: getSnakeHS(),
                snakeSessions: getSnakeSessions(),
                stickmanWins: getStickmanWins(),
                stickmanSessions: getStickmanSessions()
            };

            const snakeHsEl = document.getElementById('snake-highscore');
            const snakeStatsEl = document.getElementById('snake-hs-display');
            const snakeSessionsEl = document.getElementById('snake-sessions-display');
            const stickHsEl = document.getElementById('stickman-highscore');
            const stickStatsEl = document.getElementById('stickman-hs-display');
            const stickSessionsEl = document.getElementById('stickman-sessions-display');

            if (snakeHsEl) snakeHsEl.textContent = stats.snakeBest;
            if (snakeStatsEl) snakeStatsEl.textContent = stats.snakeBest;
            if (snakeSessionsEl) snakeSessionsEl.textContent = stats.snakeSessions;
            if (stickHsEl) stickHsEl.textContent = stats.stickmanWins;
            if (stickStatsEl) stickStatsEl.textContent = stats.stickmanWins;
            if (stickSessionsEl) stickSessionsEl.textContent = stats.stickmanSessions;
        }

        function saveSnakeHS(len) {
            const best = gameStatsApi?.updateBestScore ? gameStatsApi.updateBestScore(localStorage, getKey(''), 'snake', len) : Math.max(getSnakeHS(), len);
            if (best >= len) {
                localStorage.setItem(getKey('snake_hs'), String(best));
                renderGameStats();
            }
        }
        function saveStickmanWin() {
            const wins = gameStatsApi?.updateBestScore ? gameStatsApi.updateBestScore(localStorage, getKey(''), 'stickman', getStickmanWins() + 1) : getStickmanWins() + 1;
            localStorage.setItem(getKey('stickman_wins'), String(wins));
            renderGameStats();
        }

        function trackGameStart(type) {
            if (gameStatsApi?.bumpGameSession) {
                gameStatsApi.bumpGameSession(localStorage, getKey(''), type);
                renderGameStats();
            }
        }

        // Initialise displays from saved values
        renderGameStats();

        // Expose score hooks for games.js to call
        window._onSnakeLengthUpdate = saveSnakeHS;
        window._onStickmanWin = saveStickmanWin;

        // --- Virtual button → keyboard event dispatcher ---
        function dispatchKey(code, eventType) {
            const keyMap = {
                ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
                ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
                Space: ' ', KeyX: 'x', KeyR: 'r'
            };
            const event = new KeyboardEvent(eventType, {
                code, key: keyMap[code] || code,
                bubbles: true, cancelable: true
            });
            window.dispatchEvent(event);
        }

        function wireVirtualButtons(idPrefix) {
            const pairs = [
                ['up',    'ArrowUp'],
                ['down',  'ArrowDown'],
                ['left',  'ArrowLeft'],
                ['right', 'ArrowRight'],
                ['jump',  'Space'],
                ['punch', 'KeyX'],
            ];
            pairs.forEach(([suffix, code]) => {
                const btn = document.getElementById(idPrefix + suffix);
                if (!btn) return;
                btn.addEventListener('pointerdown',  e => { e.preventDefault(); dispatchKey(code, 'keydown'); });
                btn.addEventListener('pointerup',    e => { e.preventDefault(); dispatchKey(code, 'keyup'); });
                btn.addEventListener('touchstart',   e => { e.preventDefault(); dispatchKey(code, 'keydown'); }, { passive: false });
                btn.addEventListener('touchend',     e => { e.preventDefault(); dispatchKey(code, 'keyup'); },   { passive: false });
            });
        }

        // Wire both the fullscreen modal controls and the inline stage controls
        wireVirtualButtons('ctl-');
        wireVirtualButtons('ictrl-');

        // --- Show/hide per-game controls ---
        function setInlineControlsFor(type) {
            const wrap     = document.getElementById('inline-game-controls');
            const ictrlJump  = document.getElementById('ictrl-jump');
            const ictrlPunch = document.getElementById('ictrl-punch');
            if (!wrap) return;
            wrap.style.display = 'flex';
            const snakeMode = type === 'snake';
            if (ictrlJump)  ictrlJump.style.display  = snakeMode ? 'none' : '';
            if (ictrlPunch) ictrlPunch.style.display = snakeMode ? 'none' : '';
        }

        function setFullscreenControlsFor(type) {
            const ctlJump  = document.getElementById('ctl-jump');
            const ctlPunch = document.getElementById('ctl-punch');
            const snakeMode = type === 'snake';
            if (ctlJump)  ctlJump.style.display  = snakeMode ? 'none' : '';
            if (ctlPunch) ctlPunch.style.display = snakeMode ? 'none' : '';
        }

        const runInline = (type) => {
            if (typeof start3DGame !== 'function' || !stage) return;
            trackGameStart(type);
            start3DGame(type, stage, { inline: true });
            setInlineControlsFor(type);
            if (hint) hint.textContent = type === 'snake'
                ? `Snake — Use arrows or on-screen buttons. Best length: ${getSnakeHS()}`
                : `Stickman — Arrows: move · Space / X: punch · R: restart. Wins: ${getStickmanWins()}`;
        };

        const runFullscreen = (type) => {
            if (typeof start3DGame !== 'function') return;
            trackGameStart(type);
            start3DGame(type, gameContainer, { inline: false });
            setFullscreenControlsFor(type);
            if (gameModal) gameModal.style.display = 'flex';
        };

        if (playSnake) playSnake.onclick = () => runInline('snake');
        if (playStick) playStick.onclick = () => runInline('stickman');

        document.querySelectorAll('.play-snake-fullscreen').forEach(btn => {
            btn.onclick = () => runFullscreen('snake');
        });
        document.querySelectorAll('.play-stickman-fullscreen').forEach(btn => {
            btn.onclick = () => runFullscreen('stickman');
        });

        if (closeGameBtn) {
            closeGameBtn.onclick = () => {
                if (typeof closeGame === 'function') closeGame();
            };
        }

        if (hint && !hint.textContent.trim()) {
            hint.textContent = 'Snake: arrow keys to steer. Stickman Arena: arrows to move, Space/X to punch, R to restart.';
        }

        if (stage && !stage.innerHTML.trim()) {
            stage.innerHTML = '<div class="game-stage-placeholder">Choose a game to start here in the panel, or open it fullscreen.</div>';
        }
    }

    // --- Phase 5: Advanced Cognify Module Implementations ---

    function initStudySubtabs() {
        const btns = document.querySelectorAll('.studyroom-tab-btn');
        const subpages = document.querySelectorAll('.studyroom-subpage');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                const subtarget = btn.getAttribute('data-subtarget');
                subpages.forEach(p => p.style.display = 'none');
                btns.forEach(b => b.classList.remove('active-tab'));
                
                const targetEl = document.getElementById(subtarget);
                if (targetEl) targetEl.style.display = 'block';
                btn.classList.add('active-tab');
            });
        });
    }

    function initWordNotepad() {
        const editor = document.getElementById('word-editor-textarea');
        const btnBold = document.getElementById('word-btn-bold');
        const btnItalic = document.getElementById('word-btn-italic');
        const btnUnderline = document.getElementById('word-btn-underline');
        const btnStrike = document.getElementById('word-btn-strike');
        const btnLeft = document.getElementById('word-btn-left');
        const btnCenter = document.getElementById('word-btn-center');
        const btnRight = document.getElementById('word-btn-right');
        const btnUl = document.getElementById('word-btn-ul');
        const btnOl = document.getElementById('word-btn-ol');
        const btnClear = document.getElementById('word-btn-clear');
        const btnExport = document.getElementById('word-btn-export');
        const selectFont = document.getElementById('word-font-select');
        const selectSize = document.getElementById('word-size-select');
        const inputFontColor = document.getElementById('word-font-color');
        const inputBgColor = document.getElementById('word-bg-color');
        const charCountEl = document.getElementById('word-char-count');
        const wordCountEl = document.getElementById('word-word-count');

        if (!editor) return;

        const cmd = (name, val = null) => {
            document.execCommand(name, false, val);
            editor.focus();
            updateCounts();
        };

        if (btnBold) btnBold.onclick = () => cmd('bold');
        if (btnItalic) btnItalic.onclick = () => cmd('italic');
        if (btnUnderline) btnUnderline.onclick = () => cmd('underline');
        if (btnStrike) btnStrike.onclick = () => cmd('strikeThrough');
        if (btnLeft) btnLeft.onclick = () => cmd('justifyLeft');
        if (btnCenter) btnCenter.onclick = () => cmd('justifyCenter');
        if (btnRight) btnRight.onclick = () => cmd('justifyRight');
        if (btnUl) btnUl.onclick = () => cmd('insertUnorderedList');
        if (btnOl) btnOl.onclick = () => cmd('insertOrderedList');
        if (btnClear) btnClear.onclick = () => cmd('removeFormat');

        if (selectFont) {
            selectFont.onchange = (e) => cmd('fontName', e.target.value);
        }
        if (selectSize) {
            selectSize.onchange = (e) => cmd('fontSize', e.target.value);
        }
        if (inputFontColor) {
            inputFontColor.oninput = (e) => cmd('foreColor', e.target.value);
        }
        if (inputBgColor) {
            inputBgColor.oninput = (e) => cmd('hiliteColor', e.target.value);
        }

        function updateCounts() {
            const txt = editor.innerText || '';
            const chars = txt.length;
            const words = txt.trim() === '' ? 0 : txt.trim().split(/\s+/).length;
            if (charCountEl) charCountEl.textContent = `Characters: ${chars}`;
            if (wordCountEl) wordCountEl.textContent = `Words: ${words}`;
            localStorage.setItem(getKey('word_notes'), editor.innerHTML);
        }

        editor.addEventListener('input', updateCounts);

        if (btnExport) {
            btnExport.onclick = () => {
                const blob = new Blob([editor.innerText], { type: 'text/plain;charset=utf-8' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `${activeProfile}_notes.txt`;
                link.click();
            };
        }

        window.loadWordNotes = () => {
            const saved = localStorage.getItem(getKey('word_notes'));
            if (saved) {
                editor.innerHTML = saved;
            } else {
                editor.innerHTML = `<h2 style="text-align:center; font-family:'Outfit',sans-serif; margin-bottom:1.5rem; color:#0f172a; font-size:24px;">Untitled Study Document</h2><p>Start composing your coursework notes here. Highlight terms or structure your paragraphs using the word ribbon toolbar above.</p>`;
            }
            updateCounts();
        };

        window.loadWordNotes();
    }

    function initPdfAnnotator() {
        const dropZone = document.getElementById('pdf-drag-drop-zone');
        const fileInput = document.getElementById('pdf-file-input');
        const toolbar = document.getElementById('pdf-annotate-toolbar');
        const pagesList = document.getElementById('pdf-pages-list');
        const loadingMsg = document.getElementById('pdf-viewer-loading');
        const placeholder = document.getElementById('pdf-viewer-placeholder');
        const colorInput = document.getElementById('pdf-anno-color');
        const sizeInput = document.getElementById('pdf-anno-brush-size');
        const btnSave = document.getElementById('pdf-action-download-overlay');
        const btnClear = document.getElementById('pdf-tool-action-clear');

        let activeTool = 'pan';
        let brushColor = '#ff0000';
        let brushSize = 3;

        if (!dropZone) return;

        const toolBtns = document.querySelectorAll('.pdf-tool-selector');
        toolBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                toolBtns.forEach(b => b.classList.remove('active-tab'));
                btn.classList.add('active-tab');
                activeTool = btn.id.replace('pdf-tool-select-', '');
            });
        });

        if (colorInput) colorInput.oninput = (e) => { brushColor = e.target.value; };
        if (sizeInput) sizeInput.oninput = (e) => { brushSize = parseInt(e.target.value); };

        dropZone.onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
            if (e.target.files.length > 0) loadPdfFile(e.target.files[0]);
        };

        dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary-color)'; };
        dropZone.ondragleave = () => { dropZone.style.borderColor = 'var(--border-color)'; };
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--border-color)';
            if (e.dataTransfer.files.length > 0) loadPdfFile(e.dataTransfer.files[0]);
        };

        function loadPdfFile(file) {
            if (loadingMsg) loadingMsg.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
            pagesList.innerHTML = '';

            const reader = new FileReader();
            reader.onload = function(evt) {
                const typedarray = new Uint8Array(evt.target.result);
                pdfjsLib.getDocument(typedarray).promise.then(pdf => {
                    if (loadingMsg) loadingMsg.style.display = 'none';
                    if (toolbar) toolbar.style.display = 'flex';
                    
                    for (let pNum = 1; pNum <= pdf.numPages; pNum++) {
                        renderPdfPage(pdf, pNum);
                    }
                }).catch(err => {
                    if (loadingMsg) loadingMsg.style.display = 'none';
                    alert('Error loading PDF: ' + err.message);
                });
            };
            reader.readAsArrayBuffer(file);
        }

        function renderPdfPage(pdf, pageNum) {
            pdf.getPage(pageNum).then(page => {
                const scale = 1.25;
                const viewport = page.getViewport({ scale: scale });

                const wrapper = document.createElement('div');
                wrapper.className = 'pdf-page-wrapper';
                wrapper.style.position = 'relative';
                wrapper.style.width = viewport.width + 'px';
                wrapper.style.height = viewport.height + 'px';
                wrapper.style.marginBottom = '2rem';

                const pdfCanvas = document.createElement('canvas');
                pdfCanvas.className = 'pdf-page-canvas';
                pdfCanvas.width = viewport.width;
                pdfCanvas.height = viewport.height;
                const pdfCtx = pdfCanvas.getContext('2d');

                const annoCanvas = document.createElement('canvas');
                annoCanvas.className = 'pdf-annotation-layer';
                annoCanvas.width = viewport.width;
                annoCanvas.height = viewport.height;
                const annoCtx = annoCanvas.getContext('2d');

                wrapper.appendChild(pdfCanvas);
                wrapper.appendChild(annoCanvas);
                pagesList.appendChild(wrapper);

                const renderContext = {
                    canvasContext: pdfCtx,
                    viewport: viewport
                };
                page.render(renderContext);

                setupDrawingEvents(annoCanvas, annoCtx);
            });
        }

        function setupDrawingEvents(canvas, ctx) {
            let isDrawing = false;
            let lastX = 0;
            let lastY = 0;

            canvas.addEventListener('mousedown', (e) => {
                if (activeTool === 'pan') return;
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                if (activeTool === 'text') {
                    const text = prompt('Enter text annotation:');
                    if (text) {
                        ctx.font = `${brushSize + 12}px Arial`;
                        ctx.fillStyle = brushColor;
                        ctx.fillText(text, x, y);
                    }
                    return;
                }

                isDrawing = true;
                lastX = x;
                lastY = y;
            });

            canvas.addEventListener('mousemove', (e) => {
                if (!isDrawing || activeTool === 'pan') return;
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                ctx.beginPath();
                ctx.moveTo(lastX, lastY);
                ctx.lineTo(x, y);

                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                if (activeTool === 'pen') {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.globalAlpha = 1.0;
                    ctx.strokeStyle = brushColor;
                    ctx.lineWidth = brushSize;
                    ctx.stroke();
                } else if (activeTool === 'highlighter') {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.globalAlpha = 0.4;
                    ctx.strokeStyle = brushColor;
                    ctx.lineWidth = brushSize * 3.5;
                    ctx.stroke();
                } else if (activeTool === 'eraser') {
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.globalAlpha = 1.0;
                    ctx.lineWidth = brushSize * 4;
                    ctx.stroke();
                }

                lastX = x;
                lastY = y;
            });

            canvas.addEventListener('mouseup', () => { isDrawing = false; });
            canvas.addEventListener('mouseleave', () => { isDrawing = false; });
        }

        if (btnClear) {
            btnClear.onclick = () => {
                if (confirm('Clear all page drawings?')) {
                    const layers = pagesList.querySelectorAll('.pdf-annotation-layer');
                    layers.forEach(layer => {
                        const ctx = layer.getContext('2d');
                        ctx.clearRect(0, 0, layer.width, layer.height);
                    });
                }
            };
        }

        if (btnSave) {
            btnSave.onclick = () => {
                const wrappers = pagesList.querySelectorAll('.pdf-page-wrapper');
                if (wrappers.length === 0) return alert('No PDF loaded.');
                
                const first = wrappers[0];
                const pdfCv = first.querySelector('.pdf-page-canvas');
                const annoCv = first.querySelector('.pdf-annotation-layer');
                
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = pdfCv.width;
                tempCanvas.height = pdfCv.height;
                const tempCtx = tempCanvas.getContext('2d');
                
                tempCtx.drawImage(pdfCv, 0, 0);
                tempCtx.drawImage(annoCv, 0, 0);
                
                const link = document.createElement('a');
                link.download = `annotated_pdf_sheet.jpg`;
                link.href = tempCanvas.toDataURL('image/jpeg', 0.95);
                link.click();
            };
        }
    }

    function initFlashcardsDeckSystem() {
        const select = document.getElementById('fc-deck-selector');
        const btnNew = document.getElementById('fc-deck-new-btn');
        const btnDel = document.getElementById('fc-deck-del-btn');
        const dropImport = document.getElementById('fc-deck-drop-import');
        const importInput = document.getElementById('fc-file-import-input');
        const inputFront = document.getElementById('fc-input-front');
        const inputBack = document.getElementById('fc-input-back');
        const btnAddCard = document.getElementById('fc-add-card-submit');
        const statsEl = document.getElementById('fc-deck-progress-stats');
        const cardRotator = document.getElementById('study-card-rotator');
        const cardFront = document.getElementById('fc-study-front-txt');
        const cardBack = document.getElementById('fc-study-back-txt');
        const srsPanel = document.getElementById('fc-srs-rating-container');
        const listPanel = document.getElementById('fc-submode-list');
        const quizPanel = document.getElementById('fc-submode-quiz');
        const listCardsView = document.getElementById('fc-deck-cards-list-view');

        const tabQuiz = document.getElementById('fc-toggle-mode-quiz');
        const tabList = document.getElementById('fc-toggle-mode-list');

        let decks = JSON.parse(localStorage.getItem(getKey('fc_decks'))) || {
            'Default Deck': [
                { front: 'What is the powerhouse of the cell?', back: 'Mitochondria', rating: 0, nextReview: null },
                { front: 'Define a closure in Javascript.', back: 'A function bundled with lexical references to its surrounding state.', rating: 0, nextReview: null }
            ]
        };
        let activeDeckName = localStorage.getItem(getKey('fc_active_deck')) || 'Default Deck';
        let currentCardIndex = 0;

        function saveDecks() {
            localStorage.setItem(getKey('fc_decks'), JSON.stringify(decks));
            localStorage.setItem(getKey('fc_active_deck'), activeDeckName);
        }

        function renderSelectOptions() {
            if (!select) return;
            select.innerHTML = '';
            Object.keys(decks).forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                if (name === activeDeckName) opt.selected = true;
                select.appendChild(opt);
            });
        }

        if (select) {
            select.onchange = (e) => {
                activeDeckName = e.target.value;
                currentCardIndex = 0;
                saveDecks();
                loadActiveDeck();
            };
        }

        if (btnNew) {
            btnNew.onclick = () => {
                const name = prompt('Enter new deck name:');
                if (name && !decks[name]) {
                    decks[name] = [];
                    activeDeckName = name;
                    saveDecks();
                    renderSelectOptions();
                    loadActiveDeck();
                }
            };
        }

        if (btnDel) {
            btnDel.onclick = () => {
                if (Object.keys(decks).length <= 1) return alert('Cannot delete the last deck.');
                if (confirm(`Delete deck "${activeDeckName}"?`)) {
                    delete decks[activeDeckName];
                    activeDeckName = Object.keys(decks)[0];
                    currentCardIndex = 0;
                    saveDecks();
                    renderSelectOptions();
                    loadActiveDeck();
                }
            };
        }

        if (btnAddCard) {
            btnAddCard.onclick = () => {
                const f = inputFront.value.trim();
                const b = inputBack.value.trim();
                if (f && b) {
                    if (!decks[activeDeckName]) decks[activeDeckName] = [];
                    decks[activeDeckName].push({ front: f, back: b, rating: 0, nextReview: null });
                    inputFront.value = '';
                    inputBack.value = '';
                    saveDecks();
                    loadActiveDeck();
                }
            };
        }

        if (cardRotator) {
            cardRotator.onclick = () => {
                cardRotator.classList.toggle('flipped');
                const isFlipped = cardRotator.classList.contains('flipped');
                if (isFlipped && decks[activeDeckName]?.length > 0) {
                    if (srsPanel) srsPanel.style.display = 'flex';
                } else {
                    if (srsPanel) srsPanel.style.display = 'none';
                }
            };
        }

        const srsBtns = document.querySelectorAll('.srs-action-btn');
        srsBtns.forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const rate = btn.getAttribute('data-rate');
                const deck = decks[activeDeckName];
                if (!deck || deck.length === 0) return;

                const card = deck[currentCardIndex];
                if (rate === 'again') {
                    card.rating = 1;
                } else if (rate === 'good') {
                    card.rating = 2;
                } else {
                    card.rating = 3;
                }
                
                cardRotator.classList.remove('flipped');
                if (srsPanel) srsPanel.style.display = 'none';

                setTimeout(() => {
                    currentCardIndex = (currentCardIndex + 1) % deck.length;
                    saveDecks();
                    renderStudyCard();
                }, 200);
            };
        });

        function renderStudyCard() {
            const deck = decks[activeDeckName] || [];
            if (statsEl) {
                statsEl.textContent = `Cards Studied: ${deck.length > 0 ? currentCardIndex : 0} / ${deck.length}`;
            }
            if (deck.length === 0) {
                if (cardFront) cardFront.textContent = 'Active deck is empty. Add cards to begin.';
                if (cardBack) cardBack.textContent = 'Active deck is empty. Add cards to begin.';
                if (srsPanel) srsPanel.style.display = 'none';
                return;
            }
            const card = deck[currentCardIndex];
            if (cardFront) cardFront.textContent = card.front;
            if (cardBack) cardBack.textContent = card.back;
        }

        function renderCardsList() {
            if (!listCardsView) return;
            listCardsView.innerHTML = '';
            const deck = decks[activeDeckName] || [];
            if (deck.length === 0) {
                listCardsView.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:2rem;">No cards in this deck.</div>';
                return;
            }
            deck.forEach((c, idx) => {
                const item = document.createElement('div');
                item.className = 'glass';
                item.style.cssText = 'padding: 0.75rem; border-radius:10px; display:flex; justify-content:space-between; align-items:center; font-size:0.88rem; margin-bottom: 0.5rem;';
                item.innerHTML = `
                    <div style="flex:1; overflow:hidden; text-overflow:ellipsis;">
                        <strong>Q:</strong> ${c.front} <br> <strong>A:</strong> ${c.back}
                    </div>
                    <button class="upload-btn" style="background:#ef4444; color:white; padding:0.35rem 0.5rem; font-size:0.75rem; border-radius:6px; margin-left:1rem;">Delete</button>
                `;
                item.querySelector('button').onclick = () => {
                    deck.splice(idx, 1);
                    saveDecks();
                    loadActiveDeck();
                };
                listCardsView.appendChild(item);
            });
        }

        function loadActiveDeck() {
            renderStudyCard();
            renderCardsList();
        }

        if (tabQuiz && tabList) {
            tabQuiz.onclick = () => {
                tabQuiz.classList.add('active-tab');
                tabList.classList.remove('active-tab');
                if (quizPanel) quizPanel.style.display = 'flex';
                if (listPanel) listPanel.style.display = 'none';
            };
            tabList.onclick = () => {
                tabList.classList.add('active-tab');
                tabQuiz.classList.remove('active-tab');
                if (quizPanel) quizPanel.style.display = 'none';
                if (listPanel) listPanel.style.display = 'block';
                renderCardsList();
            };
        }

        if (dropImport) {
            dropImport.onclick = () => importInput.click();
            importInput.onchange = (e) => {
                if (e.target.files.length > 0) importDeckFile(e.target.files[0]);
            };
            dropImport.ondragover = (e) => { e.preventDefault(); dropImport.style.borderColor = 'var(--primary-color)'; };
            dropImport.ondragleave = () => { dropImport.style.borderColor = 'var(--border-color)'; };
            dropImport.ondrop = (e) => {
                e.preventDefault();
                dropImport.style.borderColor = 'var(--border-color)';
                if (e.dataTransfer.files.length > 0) importDeckFile(e.dataTransfer.files[0]);
            };
        }

        function importDeckFile(file) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const text = evt.target.result;
                    const deckName = file.name.split('.')[0] || 'Imported Deck';
                    if (file.name.endsWith('.json')) {
                        const imported = JSON.parse(text);
                        if (Array.isArray(imported)) {
                            decks[deckName] = imported.map(item => ({
                                front: item.front || item.q || '',
                                back: item.back || item.a || '',
                                rating: 0,
                                nextReview: null
                            }));
                        } else {
                            throw new Error('JSON is not an array');
                        }
                    } else {
                        const rows = text.split('\n');
                        const cards = [];
                        rows.forEach(row => {
                            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                            if (cols.length >= 2) {
                                cards.push({
                                    front: cols[0].replace(/"/g, '').trim(),
                                    back: cols[1].replace(/"/g, '').trim(),
                                    rating: 0,
                                    nextReview: null
                                });
                            }
                        });
                        decks[deckName] = cards;
                    }
                    activeDeckName = deckName;
                    currentCardIndex = 0;
                    saveDecks();
                    renderSelectOptions();
                    loadActiveDeck();
                    alert(`Imported deck "${deckName}" successfully!`);
                } catch(err) {
                    alert('Error importing deck: ' + err.message);
                }
            };
            reader.readAsText(file);
        }

        window.addFlashcardToActiveDeck = (front, back) => {
            if (!decks[activeDeckName]) decks[activeDeckName] = [];
            decks[activeDeckName].push({ front, back, rating: 0, nextReview: null });
            saveDecks();
            loadActiveDeck();
            alert(`Added study card to deck "${activeDeckName}"!`);
        };

        renderSelectOptions();
        loadActiveDeck();
    }

    function initApolloPageChat() {
        const history = document.getElementById('apollo-chat-history');
        const input = document.getElementById('apollo-chat-input');
        const btnSend = document.getElementById('apollo-chat-send-btn');
        const btnVoice = document.getElementById('apollo-voice-chat-btn');
        const btnQuit = document.getElementById('apollo-chat-quit-btn');
        const thinkingPanel = document.getElementById('apollo-thinking-panel');
        const thinkingTimer = document.getElementById('apollo-thinking-timer');
        const thinkingSteps = document.getElementById('apollo-thinking-steps');
        const referencesPanel = document.getElementById('apollo-web-references');
        const cardsPanel = document.getElementById('apollo-study-cards');

        if (!history || !input) return;

        // Tracks the active AbortController so the Stop button can cancel a running query
        let activeAbortController = null;
        let activeTimerInterval = null;
        let activeStepTimeouts = [];
        let lastUserMessageEl = null;   // the DOM node of the last user bubble
        let lastUserText = '';          // the question text, restored to input on Stop

        function setQueryInProgress(inProgress) {
            if (btnQuit) {
                btnQuit.disabled = !inProgress;
                btnQuit.style.opacity = inProgress ? '1' : '0.45';
                btnQuit.style.cursor = inProgress ? 'pointer' : 'not-allowed';
            }
            if (btnSend) btnSend.disabled = inProgress;
            if (input) {
                input.disabled = inProgress;
                if (!inProgress) input.focus();
            }
        }

        // Safety: always ensure the input starts enabled on load
        setQueryInProgress(false);

        function abortCurrentQuery() {
            if (activeAbortController) {
                activeAbortController.abort();
                activeAbortController = null;
            }
            if (activeTimerInterval) {
                clearInterval(activeTimerInterval);
                activeTimerInterval = null;
            }
            activeStepTimeouts.forEach(t => clearTimeout(t));
            activeStepTimeouts = [];
            if (thinkingPanel) thinkingPanel.style.display = 'none';
            if (window.setApolloExpression) window.setApolloExpression('idle');
            // Remove the user's question bubble and restore text to input
            if (lastUserMessageEl && lastUserMessageEl.parentNode) {
                lastUserMessageEl.parentNode.removeChild(lastUserMessageEl);
            }
            if (lastUserText) {
                input.value = lastUserText;
            }
            lastUserMessageEl = null;
            lastUserText = '';
            setQueryInProgress(false);
            input.focus();
        }

        if (btnQuit) {
            btnQuit.addEventListener('click', abortCurrentQuery);
        }

        if ('webkitSpeechRecognition' in window) {
            const recognition = new webkitSpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;

            btnVoice.addEventListener('click', () => {
                recognition.lang = voiceLangSelect?.value || 'en-US';
                recognition.start();
                btnVoice.style.color = 'var(--neon-accent)';
            });

            recognition.onresult = (event) => {
                input.value = event.results[0][0].transcript;
                btnVoice.style.color = 'var(--text-muted)';
                sendMainMessage();
            };

            recognition.onerror = () => { btnVoice.style.color = 'var(--text-muted)'; };
        }

        // Use addEventListener for robust handling and listen for keydown (Enter)
        if (btnSend) btnSend.addEventListener('click', sendMainMessage);
        if (input) input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMainMessage();
            }
        });

        async function sendMainMessage() {
            const text = input.value.trim();
            if (!text) return;

            lastUserText = text;                             // save for restore on Stop
            lastUserMessageEl = appendMainMessage('user', text);
            input.value = '';
            setQueryInProgress(true);

            // Create a fresh AbortController for this query
            activeAbortController = new AbortController();
            const signal = activeAbortController.signal;

            if (thinkingPanel) thinkingPanel.style.display = 'block';
            let duration = 0.0;
            if (thinkingTimer) thinkingTimer.textContent = '0.0s';
            if (thinkingSteps) thinkingSteps.innerHTML = '<li>Deconstructing query concepts...</li>';

            activeTimerInterval = setInterval(() => {
                duration += 0.1;
                if (thinkingTimer) thinkingTimer.textContent = `${duration.toFixed(1)}s`;
            }, 100);
            const timerInterval = activeTimerInterval;

            const steps = [
                'Analyzing query for key study topics...',
                `Triggering google search index crawl: "${text}"`,
                'Reading matching authority nodes...',
                'Reading 4 web references...',
                'Synthesizing deep academic response with citations...'
            ];
            activeStepTimeouts = [];
            steps.forEach((step, idx) => {
                const t = setTimeout(() => {
                    if (thinkingSteps) {
                        const li = document.createElement('li');
                        li.textContent = step;
                        thinkingSteps.appendChild(li);
                        thinkingSteps.scrollTop = thinkingSteps.scrollHeight;
                    }
                }, (idx + 1) * 600);
                activeStepTimeouts.push(t);
            });

            if (window.setApolloExpression) window.setApolloExpression('think');

            const apiMode = localStorage.getItem('cognify_api_mode') || 'simulated';
            const geminiKey = localStorage.getItem('cognify_gemini_key') || '';

            if (apiMode === 'live-gemini' && geminiKey) {
                try {
                    const systemPrompt = `You are Apollo, an advanced AI study assistant inside the Cognify study app. You are scholarly, enthusiastic, and deeply knowledgeable. Format your answers for a student audience using clear HTML structure with <h3>, <p>, <ul>, <li>, <strong>, <em> tags. Include:
1. A direct, concise answer
2. Key concepts explained clearly with examples
3. A study tip or mnemonic if helpful
4. One suggested follow-up question to deepen understanding
Use <strong> for key terms. Keep responses focused and educationally rich.`;

                    const reqBody = {
                        contents: [
                            {
                                role: 'user',
                                parts: [{ text: `${systemPrompt}\n\nStudent question: ${text}` }]
                            }
                        ],
                        generationConfig: {
                            temperature: 0.7,
                            topK: 40,
                            topP: 0.95,
                            maxOutputTokens: 2048
                        }
                    };

                    const geminiRes = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(reqBody),
                            signal
                        }
                    );

                    clearInterval(timerInterval);
                    activeTimerInterval = null;
                    if (thinkingPanel) thinkingPanel.style.display = 'none';

                    if (!geminiRes.ok) {
                        const errData = await geminiRes.json().catch(() => ({}));
                        const errMsg = errData?.error?.message || `API error ${geminiRes.status}`;
                        appendMainMessage('ai', `<div style="color:#ef4444;"><strong>⚠ Gemini API Error:</strong> ${errMsg}<br><small>Check your API key in Settings → Backup &amp; API Configuration.</small></div>`);
                        if (window.setApolloExpression) window.setApolloExpression('idle');
                        setQueryInProgress(false);
                        activeAbortController = null;
                        return;
                    }

                    const geminiData = await geminiRes.json();
                    const candidate = geminiData?.candidates?.[0];
                    const rawText = candidate?.content?.parts?.[0]?.text || '';

                    if (!rawText) {
                        appendMainMessage('ai', '<span style="color:#ef4444;">Apollo received an empty response from Gemini. Please try again.</span>');
                        if (window.setApolloExpression) window.setApolloExpression('idle');
                        setQueryInProgress(false);
                        activeAbortController = null;
                        return;
                    }

                    let formattedText = rawText
                        .replace(/^### (.+)$/gm, '<h3 style="color:var(--primary-color);margin-top:1rem;margin-bottom:0.4rem;">$1</h3>')
                        .replace(/^## (.+)$/gm, '<h3 style="color:var(--primary-color);margin-top:1rem;margin-bottom:0.4rem;">$1</h3>')
                        .replace(/^# (.+)$/gm, '<h2 style="color:var(--primary-color);margin-bottom:0.5rem;">$1</h2>')
                        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.+?)\*/g, '<em>$1</em>')
                        .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-size:0.88em;font-family:monospace;">$1</code>')
                        .replace(/^[\-\*] (.+)$/gm, '<li style="margin:0.25rem 0;">$1</li>')
                        .replace(/(<li[^>]*>[\s\S]*?<\/li>)+/g, '<ul style="margin:0.5rem 0 0.5rem 1.25rem;line-height:1.7;">$&</ul>')
                        .replace(/\n\n/g, '</p><p style="margin-top:0.65rem;">')
                        .replace(/\n(?!<)/g, '<br>');

                    const thinkingDetailsHtml = `
                        <details class="thinking-details" open>
                            <summary>Apollo Thinking · Gemini 2.0 Flash · ${duration.toFixed(1)}s</summary>
                            <ul>
                                <li>Query: "${text}"</li>
                                <li>Model: gemini-2.0-flash</li>
                                <li>Finish reason: ${candidate?.finishReason || 'STOP'}</li>
                            </ul>
                        </details>
                    `;

                    const finalResponse = `
                        ${thinkingDetailsHtml}
                        <div style="margin-top:0.75rem; line-height:1.65;"><p style="margin:0;">${formattedText}</p></div>
                        <div style="margin-top:0.85rem; font-size:0.8rem; border-top:1px solid var(--border-color); padding-top:0.5rem; color:var(--text-muted); display:flex; align-items:center; gap:0.4rem;">
                            <i class="ph-sparkle" style="color:var(--neon-accent);font-size:1rem;"></i>
                            Powered by <strong style="color:var(--neon-accent);">Gemini 2.0 Flash</strong> · Apollo AI Assistant
                        </div>
                    `;

                    appendMainMessage('ai', finalResponse);
                    if (window.setApolloExpression) window.setApolloExpression('idle');
                    apolloSpeak(rawText.replace(/[#*`\-]/g, '').slice(0, 220));

                    const firstSentence = rawText.replace(/[#*`\[\]]/g, '').split(/[.!?]/)[0].trim();
                    updateFlashcardExtractor(`What is: ${text}?`, firstSentence + '.');

                    addStudyReference(`Gemini AI: ${text}`, 'https://ai.google.dev');
                    updateReferencesPanel();
                } catch (err) {
                    // Handle fetch errors, including aborts
                    if (err.name === 'AbortError') {
                        // Abort was triggered by the user; UI already updated by abortCurrentQuery
                        // Ensure UI state is reset just in case
                        if (window.setApolloExpression) window.setApolloExpression('idle');
                    } else {
                        // Other errors (network, API, etc.)
                        appendMainMessage('ai', `<div style="color:#ef4444;"><strong>⚠ Connection Error:</strong> ${err.message}<br><small>Make sure your API key is valid and you have internet access.</small></div>`);
                        if (window.setApolloExpression) window.setApolloExpression('idle');
                    }
                } finally {
                    // Common cleanup for both success and error paths
                    clearInterval(timerInterval);
                    activeTimerInterval = null;
                    if (thinkingPanel) thinkingPanel.style.display = 'none';
                    setQueryInProgress(false);
                    activeAbortController = null;
                }
            } else {
                try {
                    const lang = voiceLangSelect?.value || 'en-US';
                    const subDomain = lang.startsWith('sw') ? 'sw' : 'en';

                    const searchRes = await fetch(`https://${subDomain}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(text)}&utf8=&format=json&origin=*`, { signal });
                    const searchData = await searchRes.json();
                    
                    clearInterval(timerInterval);
                    if (thinkingPanel) thinkingPanel.style.display = 'none';

                    if (searchData.query?.search?.length > 0) {
                        const topResult = searchData.query.search[0];
                        const title = topResult.title;
                        const extractRes = await fetch(`https://${subDomain}.wikipedia.org/w/api.php?action=query&prop=extracts&exlimit=1&titles=${encodeURIComponent(title)}&explaintext=1&format=json&origin=*`, { signal });
                        const extractData = await extractRes.json();
                        const wikiPages = extractData.query.pages;
                        const pageId = Object.keys(wikiPages)[0];
                        const fullText = wikiPages[pageId].extract || "";

                        const deepAnswer = fullText.slice(0, 1600) + (fullText.length > 1600 ? "..." : "");
                        const linkUrl = `https://${subDomain}.wikipedia.org/wiki/${encodeURIComponent(title)}`;

                        const thinkingDetailsHtml = `
                            <details class="thinking-details" open>
                                <summary>Deep Thinking Details (took ${duration.toFixed(1)}s)</summary>
                                <ul>
                                    <li>Parsed query string: "${text}"</li>
                                    <li>Connected to online indices.</li>
                                    <li>Crawled source: Wikipedia entry for "${title}"</li>
                                    <li>Compiled answer matrix.</li>
                                </ul>
                            </details>
                        `;

                        const finalResponse = `
                            ${thinkingDetailsHtml}
                            <h3 style="color:var(--primary-color); margin-top:0.75rem;">${title} Summary</h3>
                            <p>${deepAnswer}</p>
                            <div style="margin-top:0.75rem; font-size:0.85rem; border-top:1px solid var(--border-color); padding-top:0.5rem;">
                                <strong>Citations:</strong> <a href="${linkUrl}" target="_blank" class="citation-link">[1] Wikipedia: ${title}</a>
                            </div>
                            <div style="margin-top:0.5rem;font-size:0.78rem;padding:0.45rem 0.75rem;background:rgba(99,102,241,0.08);border-radius:8px;border:1px solid rgba(99,102,241,0.2);color:var(--text-muted);">
                                <i class="ph-lightbulb" style="color:var(--neon-accent);"></i> <strong>Upgrade tip:</strong> Add your <strong>Gemini API key</strong> in <em>Settings → API Configuration</em> for real AI-powered answers.
                            </div>
                        `;

                        appendMainMessage('ai', finalResponse);
                        if (window.setApolloExpression) window.setApolloExpression('idle');
                        apolloSpeak(deepAnswer.slice(0, 200));

                        addStudyReference(title, linkUrl);
                        updateReferencesPanel();

                        const cardFront = `What is ${title}?`;
                        const cardBack = deepAnswer.split('.')[0] + '.';
                        updateFlashcardExtractor(cardFront, cardBack);

                    } else {
                        const failText = "No web records matching your query could be crawled. Please rephrase or try another subject.";
                        appendMainMessage('ai', failText);
                        if (window.setApolloExpression) window.setApolloExpression('idle');
                    }
                    setQueryInProgress(false);
                    activeAbortController = null;
                } catch (err) {
                    clearInterval(timerInterval);
                    activeTimerInterval = null;
                    if (thinkingPanel) thinkingPanel.style.display = 'none';
                    if (err.name === 'AbortError') {
                        setQueryInProgress(false);
                        return;
                    }
                    appendMainMessage('ai', "Web connection timed out. Please retry.");
                    if (window.setApolloExpression) window.setApolloExpression('idle');
                    setQueryInProgress(false);
                    activeAbortController = null;
                }
            }
        }

        function appendMainMessage(role, content) {
            const div = document.createElement('div');
            div.className = 'ai-message';
            if (role === 'user') {
                div.style.background = 'rgba(255,255,255,0.05)';
                div.style.borderLeftColor = 'var(--text-muted)';
            }
            div.innerHTML = content;
            history.appendChild(div);
            history.scrollTop = history.scrollHeight;
            return div;   // caller can hold a reference to remove it later
        }

        function updateReferencesPanel() {
            if (!referencesPanel) return;
            const refs = JSON.parse(localStorage.getItem(getKey('references'))) || [];
            if (refs.length === 0) {
                referencesPanel.innerHTML = 'No web sources referenced yet.';
                return;
            }
            referencesPanel.innerHTML = refs.slice(-4).map((r, idx) => `
                <div class="glass" style="padding:0.5rem 0.75rem; border-radius:8px; font-size:0.8rem; margin-bottom: 0.5rem;">
                    <a href="${r.url}" target="_blank" class="citation-link" style="margin:0; font-weight:600;">[${idx+1}] ${r.title}</a>
                    <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">Crawled: ${r.date}</div>
                </div>
            `).join('');
        }

        function updateFlashcardExtractor(front, back) {
            if (!cardsPanel) return;
            cardsPanel.innerHTML = `
                <div class="glass" style="padding:0.75rem; border-radius:10px; display:flex; flex-direction:column; gap:0.5rem; font-size:0.85rem;">
                    <div><strong>Q:</strong> ${front}</div>
                    <div><strong>A:</strong> ${back}</div>
                    <button class="upload-btn" id="fc-add-extracted-btn" style="padding:0.4rem; font-size:0.75rem; background:var(--primary-color); color:white; border-radius:6px; margin-top:4px;"><i class="ph-plus"></i> Add to Deck</button>
                </div>
            `;
            const btn = document.getElementById('fc-add-extracted-btn');
            if (btn) {
                btn.onclick = () => {
                    if (typeof window.addFlashcardToActiveDeck === 'function') {
                        window.addFlashcardToActiveDeck(front, back);
                    }
                };
            }
        }

        updateReferencesPanel();

        // Wire up main page delete history button with confirmation
        const btnDelete = document.getElementById('apollo-chat-delete-btn');
        if (btnDelete) {
            btnDelete.onclick = () => {
                if (confirm("Are you sure you want to delete the main chat history?")) {
                    const defaultMsg = '<div class="ai-message">Hello! I\'m Apollo, your advanced study partner. Ask me any question, and I\'ll consult the web, show my deep thinking, and give you structured references.</div>';
                    history.innerHTML = defaultMsg;
                    localStorage.setItem(getKey('ai_history'), defaultMsg);
                    
                    // Clear references and study cards as well
                    localStorage.removeItem(getKey('references'));
                    updateReferencesPanel();
                    if (cardsPanel) {
                        cardsPanel.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted);">No cards extracted yet.</div>';
                    }
                }
            };
        }
    }

    function initFloatingChat() {
        const quickMessages = document.getElementById('apollo-quick-messages');
        const quickInput = document.getElementById('apollo-input');
        const quickSendBtn = document.getElementById('apollo-send-btn');
        const quickVoiceBtn = document.getElementById('apollo-voice-btn');
        const quickClearBtn = document.getElementById('apollo-clear-btn'); // Exit button
        const quickDeleteBtn = document.getElementById('apollo-quick-delete'); // Delete history button
        
        const fullChatBox = document.getElementById('apollo-full-chat-box');
        const fullInput = document.getElementById('apollo-full-input');
        const fullSendBtn = document.getElementById('apollo-full-send');
        const fullClearBtn = document.getElementById('apollo-full-clear'); // Delete history button
        const fullCloseBtn = document.getElementById('apollo-full-close'); // Close & Hide button

        if (!quickMessages) return;

        let activeAbortController = null;

        function showFloatingChat() {
            if (fullChatBox) fullChatBox.style.display = 'block';
            quickMessages.style.display = 'flex';
        }

        function hideAndClearFloatingChat() {
            if (fullChatBox) fullChatBox.style.display = 'none';
            quickMessages.style.display = 'none';
            if (quickInput) quickInput.value = '';
            if (fullInput) fullInput.value = '';
            if (activeAbortController) {
                activeAbortController.abort();
                activeAbortController = null;
            }
        }

        function setQueryInProgress(inProgress) {
            if (quickInput) quickInput.disabled = inProgress;
            if (fullInput) fullInput.disabled = inProgress;
            if (quickSendBtn) quickSendBtn.disabled = inProgress;
            if (fullSendBtn) fullSendBtn.disabled = inProgress;
        }

        // Exit / close triggers
        if (quickClearBtn) {
            quickClearBtn.onclick = hideAndClearFloatingChat;
        }
        if (fullCloseBtn) {
            fullCloseBtn.onclick = hideAndClearFloatingChat;
        }

        // Show chat box on click/focus
        if (quickInput) {
            quickInput.onfocus = showFloatingChat;
            quickInput.onclick = showFloatingChat;
            quickInput.onkeypress = (e) => {
                showFloatingChat();
                if (e.key === 'Enter') {
                    sendFloatingMessage(quickInput.value.trim());
                }
            };
        }
        if (fullInput) {
            fullInput.onkeypress = (e) => {
                if (e.key === 'Enter') {
                    sendFloatingMessage(fullInput.value.trim());
                }
            };
        }

        // Delete History triggers with confirmation
        function deleteFloatingHistory() {
            if (confirm("Are you sure you want to delete your quick chat history?")) {
                const defaultMsg = '<div class="ai-message">Hello! I\'m Apollo. How can I help you today?</div>';
                quickMessages.innerHTML = defaultMsg;
                localStorage.setItem(getKey('ai_quick_history'), defaultMsg);
            }
        }
        if (quickDeleteBtn) {
            quickDeleteBtn.onclick = deleteFloatingHistory;
        }
        if (fullClearBtn) {
            fullClearBtn.onclick = deleteFloatingHistory;
        }

        // Send buttons click
        if (quickSendBtn) {
            quickSendBtn.onclick = () => {
                if (quickInput) sendFloatingMessage(quickInput.value.trim());
            };
        }
        if (fullSendBtn) {
            fullSendBtn.onclick = () => {
                if (fullInput) sendFloatingMessage(fullInput.value.trim());
            };
        }

        // Voice handling
        if ('webkitSpeechRecognition' in window && quickVoiceBtn) {
            const recognition = new webkitSpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;

            quickVoiceBtn.onclick = () => {
                showFloatingChat();
                recognition.lang = voiceLangSelect?.value || 'en-US';
                recognition.start();
                quickVoiceBtn.style.color = 'var(--neon-accent)';
            };

            recognition.onresult = (event) => {
                const text = event.results[0][0].transcript;
                if (quickInput) quickInput.value = text;
                if (fullInput) fullInput.value = text;
                quickVoiceBtn.style.color = 'var(--text-muted)';
                sendFloatingMessage(text);
            };

            recognition.onerror = () => {
                quickVoiceBtn.style.color = 'var(--text-muted)';
            };
        }

        function appendFloatingMessage(role, content) {
            const div = document.createElement('div');
            div.className = 'ai-message';
            if (role === 'user') {
                div.style.background = 'rgba(255,255,255,0.05)';
                div.style.borderLeftColor = 'var(--text-muted)';
            }
            div.innerHTML = content;
            quickMessages.appendChild(div);
            quickMessages.scrollTop = quickMessages.scrollHeight;
            return div;
        }

        async function sendFloatingMessage(text) {
            if (!text) return;

            appendFloatingMessage('user', text);
            if (quickInput) quickInput.value = '';
            if (fullInput) fullInput.value = '';

            const loadingId = 'floating-msg-' + Date.now();
            const loadingEl = appendFloatingMessage('ai', `<i class="ph ph-spinner ph-spin"></i> Apollo is thinking...`);
            loadingEl.id = loadingId;

            setQueryInProgress(true);
            activeAbortController = new AbortController();
            const signal = activeAbortController.signal;

            if (window.setApolloExpression) window.setApolloExpression('think');

            const apiMode = localStorage.getItem('cognify_api_mode') || 'simulated';
            const geminiKey = localStorage.getItem('cognify_gemini_key') || '';

            if (apiMode === 'live-gemini' && geminiKey) {
                try {
                    const systemPrompt = `You are Apollo, an advanced AI study assistant inside the Cognify study app. Format your answers for a student audience using clear HTML structure with <h3>, <p>, <ul>, <li>, <strong>, <em> tags. Keep responses focused and educationally rich.`;
                    const reqBody = {
                        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nStudent question: ${text}` }] }],
                        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
                    };

                    const geminiRes = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(reqBody),
                            signal
                        }
                    );

                    if (!geminiRes.ok) {
                        const errData = await geminiRes.json().catch(() => ({}));
                        const errMsg = errData?.error?.message || `API error ${geminiRes.status}`;
                        loadingEl.innerHTML = `<div style="color:#ef4444;"><strong>⚠ Gemini API Error:</strong> ${errMsg}</div>`;
                        if (window.setApolloExpression) window.setApolloExpression('idle');
                        setQueryInProgress(false);
                        activeAbortController = null;
                        return;
                    }

                    const geminiData = await geminiRes.json();
                    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

                    if (!rawText) {
                        loadingEl.innerHTML = '<span style="color:#ef4444;">Apollo received an empty response.</span>';
                        if (window.setApolloExpression) window.setApolloExpression('idle');
                    } else {
                        loadingEl.innerHTML = rawText;
                        if (window.setApolloExpression) window.setApolloExpression('idle');
                        apolloSpeak(rawText.slice(0, 150));
                    }
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    loadingEl.innerHTML = '<span style="color:#ef4444;">Connection error. Please try again.</span>';
                    if (window.setApolloExpression) window.setApolloExpression('idle');
                }
            } else {
                try {
                    const lang = voiceLangSelect?.value || 'en-US';
                    const subDomain = lang.startsWith('sw') ? 'sw' : 'en';

                    const searchRes = await fetch(`https://${subDomain}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(text)}&utf8=&format=json&origin=*`, { signal });
                    const searchData = await searchRes.json();

                    if (searchData.query?.search?.length > 0) {
                        const title = searchData.query.search[0].title;
                        const extractRes = await fetch(`https://${subDomain}.wikipedia.org/w/api.php?action=query&prop=extracts&exlimit=1&titles=${encodeURIComponent(title)}&explaintext=1&format=json&origin=*`, { signal });
                        const extractData = await extractRes.json();
                        const wikiPages = extractData.query.pages;
                        const pageId = Object.keys(wikiPages)[0];
                        const fullText = wikiPages[pageId].extract || "";
                        const deepAnswer = fullText.slice(0, 800) + (fullText.length > 800 ? "..." : "");

                        loadingEl.innerHTML = `<h3>${title}</h3><p>${deepAnswer}</p><div style="margin-top:0.5rem; font-size:0.8rem; border-top:1px solid var(--border-color); padding-top:0.25rem;"><a href="https://${subDomain}.wikipedia.org/wiki/${encodeURIComponent(title)}" target="_blank" style="color:var(--primary-color);">[Read Wikipedia Source]</a></div>`;
                        if (window.setApolloExpression) window.setApolloExpression('idle');
                        apolloSpeak(deepAnswer.slice(0, 150));
                    } else {
                        loadingEl.innerHTML = "No direct records found. I'll continue monitoring the grid for updates.";
                        if (window.setApolloExpression) window.setApolloExpression('idle');
                    }
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    loadingEl.innerHTML = "Web connection timed out. Please retry.";
                    if (window.setApolloExpression) window.setApolloExpression('idle');
                }
            }

            setQueryInProgress(false);
            activeAbortController = null;
            localStorage.setItem(getKey('ai_quick_history'), quickMessages.innerHTML);
        }
    }

    function initPlannerViewSwitcher() {
        const btnMonth = document.getElementById('planner-btn-month');
        const btnWeek = document.getElementById('planner-btn-week');
        const btnDay = document.getElementById('planner-btn-day');

        const calWidget = document.getElementById('calendar-widget');
        const calLegend = document.querySelector('.cal-legend');
        const weekView = document.getElementById('planner-week-view');
        const dayView = document.getElementById('planner-day-view');

        const tabBtns = [btnMonth, btnWeek, btnDay];

        function switchPlannerTab(activeBtn, showEls, hideEls) {
            tabBtns.forEach(btn => {
                if (btn) btn.classList.remove('active-tab');
            });
            if (activeBtn) activeBtn.classList.add('active-tab');

            showEls.forEach(el => { if (el) el.style.display = 'block'; });
            hideEls.forEach(el => { if (el) el.style.display = 'none'; });

            if (activeBtn === btnMonth) renderCalendar();
            if (activeBtn === btnWeek) renderWeeklyTasks();
            if (activeBtn === btnDay) renderDailyTasks();

            // Persist selected view per profile
            try { localStorage.setItem(getKey('planner_view'), activeBtn === btnMonth ? 'month' : activeBtn === btnWeek ? 'week' : 'day'); } catch (e) { /* ignore */ }
        }

        if (btnMonth) {
            btnMonth.onclick = () => switchPlannerTab(btnMonth, [calWidget, calLegend], [weekView, dayView]);
        }
        if (btnWeek) {
            btnWeek.onclick = () => switchPlannerTab(btnWeek, [weekView], [calWidget, calLegend, dayView]);
        }
        if (btnDay) {
            btnDay.onclick = () => switchPlannerTab(btnDay, [dayView], [calWidget, calLegend, weekView]);
        }

        // Restore saved view or default to Month
        const savedView = localStorage.getItem(getKey('planner_view')) || 'month';
        if (savedView === 'week' && btnWeek) btnWeek.click();
        else if (savedView === 'day' && btnDay) btnDay.click();
        else if (btnMonth) btnMonth.click();
    }

    function initSettingsPanel() {
        const card = document.querySelector('#settings .dashboard-grid');
        if (!card) return;

        const configCard = document.createElement('div');
        configCard.className = 'card glass';
        configCard.style.padding = '1.5rem';
        configCard.style.gridColumn = 'span 2';
        configCard.innerHTML = `
            <h3 style="margin-top:0; display:flex; align-items:center; gap:0.6rem;"><i class="ph-robot" style="color:var(--primary-color);"></i> Apollo AI &amp; API Configuration</h3>

            <!-- Gemini API status banner -->
            <div id="gemini-status-banner" style="display:none; padding:0.75rem 1rem; border-radius:12px; margin-bottom:1rem; border:1px solid; display:flex; align-items:center; gap:0.65rem; font-size:0.88rem; font-weight:600;"></div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-top:0.75rem;">
                <div>
                    <label style="display:block; font-size:0.88rem; font-weight:600; color:var(--text-main); margin-bottom:0.5rem;">Apollo AI Mode</label>
                    <select id="apollo-api-mode" class="plan-select" style="width:100%; margin-bottom:1rem; padding:0.75rem; border-radius:10px;">
                        <option value="simulated">🔍 Wikipedia Mode (No key needed)</option>
                        <option value="live-gemini">✨ Live Gemini AI (Recommended)</option>
                    </select>

                    <label style="display:block; font-size:0.88rem; font-weight:600; color:var(--text-main); margin-bottom:0.35rem;">
                        Gemini API Key
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" style="font-size:0.75rem; color:var(--neon-accent); margin-left:0.5rem; font-weight:500;">Get free key →</a>
                    </label>
                    <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.85rem;">
                        <input type="password" id="apollo-gemini-key" placeholder="AIza..." style="flex:1; padding:0.75rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-color);">
                        <button id="gemini-toggle-show" class="upload-btn" style="padding:0.65rem; border-radius:10px; white-space:nowrap;" title="Show/hide key"><i class="ph-eye"></i></button>
                    </div>

                    <div style="display:flex; gap:0.5rem;">
                        <button id="gemini-save-btn" class="upload-btn" style="flex:1; background:var(--primary-color); color:white; font-weight:700;">
                            <i class="ph-floppy-disk"></i> Save &amp; Activate
                        </button>
                        <button id="gemini-test-btn" class="upload-btn" style="flex:1;" title="Test your Gemini API key">
                            <i class="ph-flask"></i> Test Key
                        </button>
                    </div>
                    <div id="gemini-test-result" style="margin-top:0.6rem; font-size:0.82rem; min-height:18px; color:var(--text-muted);"></div>
                </div>
                <div>
                    <label style="display:block; font-size:0.88rem; font-weight:600; color:var(--text-main); margin-bottom:0.5rem;">Backup &amp; Restore</label>
                    <div style="display:flex; gap:0.5rem; margin-bottom:0.85rem; flex-wrap:wrap;">
                        <button id="settings-export-btn" class="upload-btn" style="flex:1; min-width:140px;"><i class="ph-download-simple"></i> Export Data</button>
                        <button id="settings-import-btn" class="upload-btn" style="flex:1; min-width:140px; background:var(--primary-color); color:white;"><i class="ph-upload-simple"></i> Import Data</button>
                        <input type="file" id="settings-import-file" style="display:none;" accept=".json">
                    </div>
                    <label style="display:block; font-size:0.88rem; font-weight:600; color:var(--text-main); margin-bottom:0.5rem;">Desktop Notifications</label>
                    <button id="settings-test-notif" class="upload-btn" style="width:100%; margin-bottom:0.85rem;"><i class="ph-bell-ringing"></i> Test Notification</button>

                    <div style="background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.2); border-radius:12px; padding:1rem;">
                        <div style="font-size:0.82rem; font-weight:700; color:var(--primary-color); margin-bottom:0.4rem;"><i class="ph-info"></i> About Gemini AI Mode</div>
                        <div style="font-size:0.78rem; color:var(--text-muted); line-height:1.55;">
                            When <strong>Gemini AI</strong> mode is active, Apollo uses Google's <strong>Gemini 2.5 Flash</strong> model for real AI-powered study answers. Get a free API key at <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--neon-accent);">Google AI Studio</a>. Your key is stored locally only.
                        </div>
                    </div>
                </div>
            </div>
        `;
        card.appendChild(configCard);

        const exportBtn = document.getElementById('settings-export-btn');
        const importBtn = document.getElementById('settings-import-btn');
        const importFile = document.getElementById('settings-import-file');
        const testNotifBtn = document.getElementById('settings-test-notif');
        const apiMode = document.getElementById('apollo-api-mode');
        const geminiKey = document.getElementById('apollo-gemini-key');

        if (exportBtn) {
            exportBtn.onclick = () => {
                const db = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('cognify_')) {
                        db[key] = localStorage.getItem(key);
                    }
                }
                const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `cognify_backup_${Date.now()}.json`;
                link.click();
            };
        }

        if (importBtn && importFile) {
            importBtn.onclick = () => importFile.click();
            importFile.onchange = (e) => {
                if (e.target.files.length === 0) return;
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = function(evt) {
                    try {
                        const db = JSON.parse(evt.target.result);
                        Object.keys(db).forEach(key => {
                            localStorage.setItem(key, db[key]);
                        });
                        alert('Database imported successfully! Reloading...');
                        window.location.reload();
                    } catch(err) {
                        alert('Error importing backup: ' + err.message);
                    }
                };
                reader.readAsText(file);
            };
        }

        if (testNotifBtn) {
            testNotifBtn.onclick = () => {
                if ('Notification' in window) {
                    if (Notification.permission === 'granted') {
                        new Notification('Cognify Active Reminder', {
                            body: 'This is a test study reminder alert from Cognify setting panel!',
                            icon: 'apollo_avatar.png'
                        });
                    } else {
                        Notification.requestPermission().then(permission => {
                            if (permission === 'granted') {
                                new Notification('Cognify Active Reminder', {
                                    body: 'Notifications approved! Test reminder triggered.',
                                    icon: 'apollo_avatar.png'
                                });
                            } else {
                                alert('Notification permission blocked.');
                            }
                        });
                    }
                }
            };
        }

        if (apiMode && geminiKey) {
            apiMode.value = localStorage.getItem('cognify_api_mode') || 'simulated';
            geminiKey.value = localStorage.getItem('cognify_gemini_key') || '';

            apiMode.onchange = () => localStorage.setItem('cognify_api_mode', apiMode.value);
            geminiKey.oninput = () => localStorage.setItem('cognify_gemini_key', geminiKey.value);
        }
    }

    function initReminderSystem() {
        let remindedIds = new Set();
        setInterval(() => {
            const notifEnabled = localStorage.getItem(getKey('notifications_enabled')) !== 'false';
            if (!notifEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;

            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const day = now.getDate();
            const key = eventKey(year, month, day);

            const dayEvents = calendarEvents[key] || [];
            if (dayEvents.length === 0) return;

            const currentHrs = String(now.getHours()).padStart(2, '0');
            const currentMins = String(now.getMinutes()).padStart(2, '0');
            const currentTimeStr = `${currentHrs}:${currentMins}`;

            dayEvents.forEach(evt => {
                if (evt.time === currentTimeStr && !evt.completed && !remindedIds.has(evt.id)) {
                    remindedIds.add(evt.id);
                    new Notification('Cognify Study Reminder', {
                        body: `Time for your scheduled task: "${evt.text}"`,
                        icon: 'apollo_avatar.png'
                    });

                    try {
                        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                        const osc = audioCtx.createOscillator();
                        const gain = audioCtx.createGain();
                        osc.connect(gain);
                        gain.connect(audioCtx.destination);
                        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime);
                        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                        osc.start();
                        osc.stop(audioCtx.currentTime + 0.45);
                    } catch (e) {}
                }
            });
        }, 15000);
    }

    // Call advanced initializers
    initStudySubtabs();
    initWordNotepad();
    initPdfAnnotator();
    initFlashcardsDeckSystem();
    initApolloPageChat();
    initFloatingChat();
    // Apply theme-adaptive icons now that all buttons exist
    updateChatButtonIcons(root.getAttribute('data-theme') || 'dark-live');
    initPlannerViewSwitcher();
    initSettingsPanel();
    initReminderSystem();

    if (typeof initPasstimeGames === 'function') {
        initPasstimeGames();
    }

    // ==========================================================================
    // COGNIFY FULL-STACK SYNC & AUTH ENGINE
    // ==========================================================================
    const API_URL = 'http://localhost:3000'; 
    let authToken = localStorage.getItem('cognify_auth_token') || null;
    let syncUser = JSON.parse(localStorage.getItem('cognify_sync_user')) || null;
    let isOnline = localStorage.getItem('cognify_sync_online') !== 'false';
    let activeConflict = null;
    let conflictQueue = [];

    // Pending changes cache (grouped by profile)
    function getPendingChangesKey() {
        return getKey('pending_changes');
    }

    function getPendingChanges() {
        try {
            const data = localStorage.getItem(getPendingChangesKey());
            return data ? JSON.parse(data) : {
                notes: { created: [], updated: [], deleted: [] },
                events: { created: [], updated: [], deleted: [] },
                flashcards: { created: [], updated: [], deleted: [] }
            };
        } catch (e) {
            return {
                notes: { created: [], updated: [], deleted: [] },
                events: { created: [], updated: [], deleted: [] },
                flashcards: { created: [], updated: [], deleted: [] }
            };
        }
    }

    function savePendingChanges(changes) {
        localStorage.setItem(getPendingChangesKey(), JSON.stringify(changes));
        updateSyncUI();
    }

    // Helper: log changes for offline sync
    function logChange(entity, type, item) {
        const changes = getPendingChanges();
        
        if (type === 'deleted') {
            // item is a client_id string
            // Remove from created/updated queues if present
            changes[entity].created = changes[entity].created.filter(x => x.client_id !== item);
            changes[entity].updated = changes[entity].updated.filter(x => x.client_id !== item);
            
            if (!changes[entity].deleted.includes(item)) {
                changes[entity].deleted.push(item);
            }
        } else {
            // item is an object
            const cId = item.client_id;
            
            if (type === 'created') {
                changes[entity].created = changes[entity].created.filter(x => x.client_id !== cId);
                changes[entity].created.push(item);
            } else if (type === 'updated') {
                // If it was already in created queue, keep it there and update content
                const createdIdx = changes[entity].created.findIndex(x => x.client_id === cId);
                if (createdIdx !== -1) {
                    changes[entity].created[createdIdx] = item;
                } else {
                    changes[entity].updated = changes[entity].updated.filter(x => x.client_id !== cId);
                    changes[entity].updated.push(item);
                }
            }
        }
        
        savePendingChanges(changes);
        if (isOnline && authToken) {
            triggerAutoSync();
        }
    }

    // Intercept localStorage writes to automatically capture changes
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
        originalSetItem.apply(this, arguments);
        
        if (typeof getKey === 'function' && activeProfile) {
            // Intercept Notes (Notepad) save
            if (key === getKey('notes')) {
                const noteTitle = document.getElementById('word-editor-textarea')?.querySelector('h2')?.textContent || 'Untitled Study Document';
                const noteItem = {
                    client_id: 'notepad_document',
                    title: noteTitle,
                    content: value,
                    tags: '',
                    version: parseInt(localStorage.getItem(getKey('notes_version'))) || 1,
                    updated_at: new Date().toISOString()
                };
                logChange('notes', 'updated', noteItem);
            }
            
            // Intercept Calendar Events save
            if (key === getKey('events')) {
                try {
                    const currentEvents = JSON.parse(value || '{}');
                    const baseEvents = JSON.parse(localStorage.getItem(getKey('sync_events_base')) || '{}');
                    
                    // Assign client_id and version metadata to new events in-place
                    let updatedLocal = false;
                    Object.keys(currentEvents).forEach(dateStr => {
                        const evList = currentEvents[dateStr] || [];
                        evList.forEach((ev, idx) => {
                            if (!ev.client_id) {
                                ev.client_id = 'event_' + Math.random().toString(36).substr(2, 9);
                                ev.version = 1;
                                ev.created_at = new Date().toISOString();
                                ev.updated_at = new Date().toISOString();
                                currentEvents[dateStr][idx] = ev;
                                updatedLocal = true;
                            }
                        });
                    });
                    if (updatedLocal) {
                        originalSetItem.call(localStorage, getKey('events'), JSON.stringify(currentEvents));
                    }
                    
                    // Find created/updated events
                    Object.keys(currentEvents).forEach(dateStr => {
                        const evList = currentEvents[dateStr] || [];
                        evList.forEach(ev => {
                            let baseEv = null;
                            Object.keys(baseEvents).forEach(d => {
                                const found = (baseEvents[d] || []).find(b => b.client_id === ev.client_id);
                                if (found) baseEv = found;
                            });
                            
                            if (!baseEv) {
                                logChange('events', 'created', ev);
                            } else {
                                const isDifferent = baseEv.title !== ev.title || 
                                                    baseEv.description !== ev.description || 
                                                    baseEv.event_date !== ev.event_date || 
                                                    baseEv.linked_note_id !== ev.linked_note_id;
                                if (isDifferent) {
                                    logChange('events', 'updated', ev);
                                }
                            }
                        });
                    });
                    
                    // Find deleted events
                    Object.keys(baseEvents).forEach(dateStr => {
                        const evList = baseEvents[dateStr] || [];
                        evList.forEach(baseEv => {
                            let found = false;
                            Object.keys(currentEvents).forEach(d => {
                                if ((currentEvents[d] || []).find(e => e.client_id === baseEv.client_id)) {
                                    found = true;
                                }
                            });
                            if (!found) {
                                logChange('events', 'deleted', baseEv.client_id);
                            }
                        });
                    });
                } catch (e) {
                    console.error('Failed to parse events for diff sync:', e);
                }
            }
            
            // Intercept fc_decks (Flashcards) save
            if (key === getKey('fc_decks')) {
                try {
                    const currentDecks = JSON.parse(value || '{}');
                    const baseDecks = JSON.parse(localStorage.getItem(getKey('sync_decks_base')) || '{}');
                    
                    let updatedLocal = false;
                    Object.keys(currentDecks).forEach(deckName => {
                        const cards = currentDecks[deckName] || [];
                        cards.forEach((card, idx) => {
                            if (!card.client_id) {
                                card.client_id = 'card_' + Math.random().toString(36).substr(2, 9);
                                card.version = 1;
                                card.created_at = new Date().toISOString();
                                card.updated_at = new Date().toISOString();
                                currentDecks[deckName][idx] = card;
                                updatedLocal = true;
                            }
                        });
                    });
                    if (updatedLocal) {
                        originalSetItem.call(localStorage, getKey('fc_decks'), JSON.stringify(currentDecks));
                    }
                    
                    // Find created/updated cards
                    Object.keys(currentDecks).forEach(deckName => {
                        const cards = currentDecks[deckName] || [];
                        cards.forEach(card => {
                            let baseCard = null;
                            Object.keys(baseDecks).forEach(dn => {
                                const found = (baseDecks[dn] || []).find(b => b.client_id === card.client_id);
                                if (found) baseCard = found;
                            });
                            
                            const flatCard = {
                                client_id: card.client_id,
                                question: card.front,
                                answer: card.back,
                                next_review: card.nextReview || new Date().toISOString().split('T')[0],
                                interval_days: card.interval || 1,
                                ease_factor: card.ease || 2.5,
                                deck_name: deckName,
                                version: card.version || 1,
                                created_at: card.created_at || new Date().toISOString(),
                                updated_at: card.updated_at || new Date().toISOString()
                            };
                            
                            if (!baseCard) {
                                logChange('flashcards', 'created', flatCard);
                            } else {
                                const isDifferent = baseCard.front !== card.front || 
                                                    baseCard.back !== card.back || 
                                                    baseCard.nextReview !== card.nextReview || 
                                                    baseCard.interval !== card.interval || 
                                                    baseCard.ease !== card.ease;
                                if (isDifferent) {
                                    logChange('flashcards', 'updated', flatCard);
                                }
                            }
                        });
                    });
                    
                    // Find deleted cards
                    Object.keys(baseDecks).forEach(deckName => {
                        const cards = baseDecks[deckName] || [];
                        cards.forEach(baseCard => {
                            let found = false;
                            Object.keys(currentDecks).forEach(dn => {
                                if ((currentDecks[dn] || []).find(c => c.client_id === baseCard.client_id)) {
                                    found = true;
                                }
                            });
                            if (!found) {
                                logChange('flashcards', 'deleted', baseCard.client_id);
                            }
                        });
                    });
                } catch (e) {
                    console.error('Failed to parse decks for diff sync:', e);
                }
            }
        }
    };

    // UI Updates
    function updateSyncUI() {
        const unauthPanel = document.getElementById('sync-auth-unauthenticated');
        const authPanel = document.getElementById('sync-auth-authenticated');
        const userEl = document.getElementById('sync-active-user');
        const emailEl = document.getElementById('sync-active-email');
        const timeEl = document.getElementById('sync-last-time');
        const pendingEl = document.getElementById('sync-pending-count');
        const statusMsg = document.getElementById('sync-status-msg');
        const onlineToggle = document.getElementById('sync-online-toggle');
        
        if (!unauthPanel || !authPanel) return;
        
        if (onlineToggle) {
            onlineToggle.checked = isOnline;
        }

        const changes = getPendingChanges();
        const pendingCount = changes.notes.created.length + changes.notes.updated.length + changes.notes.deleted.length +
                             changes.events.created.length + changes.events.updated.length + changes.events.deleted.length +
                             changes.flashcards.created.length + changes.flashcards.updated.length + changes.flashcards.deleted.length;

        if (pendingEl) {
            pendingEl.textContent = pendingCount;
            pendingEl.style.color = pendingCount > 0 ? 'var(--neon-accent)' : 'var(--text-muted)';
        }

        const lastSync = localStorage.getItem(getKey('last_sync_time')) || 'Never';
        if (timeEl) timeEl.textContent = lastSync;

        if (authToken && syncUser) {
            unauthPanel.style.display = 'none';
            authPanel.style.display = 'flex';
            if (userEl) userEl.textContent = syncUser.username;
            if (emailEl) emailEl.textContent = syncUser.email;
            
            if (statusMsg) {
                if (isOnline) {
                    statusMsg.textContent = pendingCount > 0 ? 'Unsynced changes pending. Syncing automatically...' : 'All data synchronized with cloud.';
                    statusMsg.style.color = pendingCount > 0 ? 'var(--neon-accent)' : 'var(--text-muted)';
                } else {
                    statusMsg.textContent = 'Offline mode enabled. Changes saved locally.';
                    statusMsg.style.color = 'var(--text-muted)';
                }
            }
        } else {
            unauthPanel.style.display = 'grid';
            authPanel.style.display = 'none';
            if (statusMsg) {
                statusMsg.textContent = 'Operating in offline mode. Log in to sync to cloud.';
                statusMsg.style.color = 'var(--text-muted)';
            }
        }
    }

    // Toast helper
    function showToast(message, type = 'info', timeout = 4500) {
        try {
            const container = document.getElementById('cognify-toast-container');
            if (!container) return;
            const el = document.createElement('div');
            el.style.pointerEvents = 'auto';
            el.style.padding = '0.6rem 0.85rem';
            el.style.borderRadius = '10px';
            el.style.minWidth = '180px';
            el.style.maxWidth = '320px';
            el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.5)';
            el.style.fontSize = '0.9rem';
            el.style.color = '#fff';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.gap = '0.6rem';
            el.style.opacity = '0';
            el.style.transition = 'opacity 220ms ease, transform 220ms ease';
            el.style.transform = 'translateY(6px)';
            if (type === 'success') el.style.background = 'linear-gradient(90deg,#10b981,#059669)';
            else if (type === 'error') el.style.background = 'linear-gradient(90deg,#ef4444,#dc2626)';
            else if (type === 'warning') el.style.background = 'linear-gradient(90deg,#f59e0b,#d97706)';
            else el.style.background = 'linear-gradient(90deg,#374151,#111827)';

            el.textContent = message;
            container.appendChild(el);
            requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });

            const remove = () => {
                el.style.opacity = '0'; el.style.transform = 'translateY(6px)';
                setTimeout(() => { try { container.removeChild(el); } catch (e) {} }, 240);
            };

            const timer = setTimeout(remove, timeout);
            el.addEventListener('click', () => { clearTimeout(timer); remove(); });
        } catch (e) { console.error('Toast failed', e); }
    }

    // Retry logging for diagnostics
    function logSyncRetry(attempt, err) {
        try {
            const key = 'cognify_sync_retry_log';
            const logs = JSON.parse(localStorage.getItem(key) || '[]');
            logs.push({ t: new Date().toISOString(), attempt, msg: String(err && err.message ? err.message : err) });
            // keep last 50 entries
            if (logs.length > 50) logs.splice(0, logs.length - 50);
            localStorage.setItem(key, JSON.stringify(logs));
        } catch (e) {}
    }

    // Debounced automatic syncing
    let autoSyncTimeout = null;
    function triggerAutoSync() {
        if (!isOnline || !authToken) return;
        if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
        autoSyncTimeout = setTimeout(() => {
            syncNow(true);
        }, 3000); // Wait 3 seconds of inactivity
    }

    // SPACED REPETITION / Leitner DB Sync Helper
    // Intercept SM2 quiz reviews in app.js
    // We can redefine window.scoreCard or bind an event to review flashcards
    // When review complete, app.js saves decks. The SetItem interceptor automatically handles and logs it.
    
    // Core Sync Routine
    async function syncNow(isSilent = false, attempt = 0) {
        const MAX_RETRIES = 3;
        const RETRY_BASE_MS = 1000;

        if (!authToken) {
            if (!isSilent) alert('Please log in or register to sync your notes to the cloud.');
            return;
        }

        const statusMsg = document.getElementById('sync-status-msg');
        const retryBtn = document.getElementById('sync-retry-btn');
        if (retryBtn) retryBtn.style.display = 'none';
        if (statusMsg) statusMsg.textContent = 'Syncing data...';
        
        const lastSyncTimestamp = localStorage.getItem(getKey('last_sync_timestamp')) || '1970-01-01T00:00:00.000Z';
        const changes = getPendingChanges();
        
        try {
            const response = await fetch(`${API_URL}/api/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    last_sync_timestamp: lastSyncTimestamp,
                    changes
                })
            });
            
            if (!response.ok) {
                // Handle authentication errors specially
                if (response.status === 401 || response.status === 403) {
                    console.warn('Sync failed: authentication error', response.status);
                    // Clear local auth and prompt re-login
                    localStorage.removeItem('cognify_auth_token');
                    localStorage.removeItem('cognify_sync_user');
                    authToken = null;
                    syncUser = null;
                    updateSyncUI();
                    if (statusMsg) {
                        statusMsg.textContent = 'Authentication required. Please sign in again.';
                        statusMsg.style.color = '#ef4444';
                    }
                    if (!isSilent) alert('Session expired or unauthorised. Please sign in again.');
                    // log + toast
                    try { logSyncRetry(0, new Error('Authentication error ' + response.status)); } catch (e) {}
                    showToast('Session expired. Please sign in again.', 'error');
                    return;
                }
                throw new Error('Sync endpoint returned error status ' + response.status);
            }
            
            const data = await response.json();
            
            // Note: Firebase prototype uses simple last-write-wins (merge: true)
            // so we skip the conflict resolution modal in this version.
            
            finalizeSync(data.sync_timestamp || new Date().toISOString(), data.server_changes, data.server_active_ids || null);
            
        } catch (err) {
            console.error('Data synchronization failed:', err);

            // Check if this is a network error (backend not reachable) vs a server error
            const isNetworkError = err instanceof TypeError || err.message === 'Failed to fetch' || err.name === 'TypeError';

            if (isNetworkError && isSilent) {
                // Backend unreachable during an auto/silent sync — quietly fall back to offline mode
                if (statusMsg) {
                    statusMsg.textContent = 'Offline mode. Changes saved locally.';
                    statusMsg.style.color = 'var(--text-muted)';
                }
                if (retryBtn) retryBtn.style.display = 'none';
                return;
            }

            // Show retry UI for retryable errors
            if (attempt < MAX_RETRIES - 1) {
                const nextAttempt = attempt + 1;
                const backoff = RETRY_BASE_MS * Math.pow(2, attempt);
                if (statusMsg) {
                    statusMsg.textContent = `Sync failed — retrying (${nextAttempt}/${MAX_RETRIES})...`;
                    statusMsg.style.color = '#f59e0b';
                }
                try { logSyncRetry(nextAttempt, err); } catch (e) {}
                showToast(`Sync failed — retrying (${nextAttempt}/${MAX_RETRIES})...`, 'warning');
                // show retry button as an option while auto-retrying
                if (retryBtn) {
                    retryBtn.style.display = 'inline-block';
                    retryBtn.onclick = () => { retryBtn.style.display = 'none'; syncNow(false, 0); };
                }
                setTimeout(() => syncNow(false, nextAttempt), backoff);
            } else {
                // All retries exhausted
                if (isNetworkError) {
                    // Backend unavailable — show softer offline message
                    if (statusMsg) {
                        statusMsg.textContent = 'Backend unavailable. Working offline.';
                        statusMsg.style.color = 'var(--text-muted)';
                    }
                    if (retryBtn) {
                        retryBtn.style.display = 'inline-block';
                        retryBtn.onclick = () => { retryBtn.style.display = 'none'; syncNow(false, 0); };
                    }
                } else {
                    if (statusMsg) {
                        statusMsg.textContent = 'Sync failed. Unstable connection.';
                        statusMsg.style.color = '#ef4444';
                    }
                    try { logSyncRetry(attempt, err); } catch (e) {}
                    showToast('Sync failed. Unstable connection.', 'error');
                    if (retryBtn) {
                        retryBtn.style.display = 'inline-block';
                        retryBtn.onclick = () => { retryBtn.style.display = 'none'; syncNow(false, 0); };
                    }
                }
            }
        }
    }

    function finalizeSync(serverTime, serverChanges, activeIds) {
        // Apply Server Changes locally (Online Syncing)
        // 1. Apply Server Notes
        if (serverChanges.notes && serverChanges.notes.updated.length > 0) {
            // Find Notepad Document
            const notepadNote = serverChanges.notes.updated.find(n => n.client_id === 'notepad_document');
            if (notepadNote) {
                originalSetItem.call(localStorage, getKey('notes'), notepadNote.content);
                originalSetItem.call(localStorage, getKey('notes_version'), notepadNote.version);
                if (quill) {
                    quill.root.innerHTML = notepadNote.content;
                }
            }
        }
        
        // 2. Apply Server Events
        if (serverChanges.events) {
            let localEvents = JSON.parse(localStorage.getItem(getKey('events')) || '{}');
            let baseEvents = JSON.parse(localStorage.getItem(getKey('sync_events_base')) || '{}');
            
            // Delete removed events
            if (activeIds && activeIds.events) {
                const activeSet = new Set(activeIds.events);
                Object.keys(localEvents).forEach(dateStr => {
                    localEvents[dateStr] = localEvents[dateStr].filter(e => activeSet.has(e.client_id));
                    if (localEvents[dateStr].length === 0) delete localEvents[dateStr];
                });
            }
            
            // Update / Add new events
            serverChanges.events.updated.forEach(ev => {
                const dateStr = ev.event_date;
                if (!localEvents[dateStr]) localEvents[dateStr] = [];
                
                // Remove older version if present
                localEvents[dateStr] = localEvents[dateStr].filter(e => e.client_id !== ev.client_id);
                localEvents[dateStr].push(ev);
            });
            
            originalSetItem.call(localStorage, getKey('events'), JSON.stringify(localEvents));
            calendarEvents = localEvents; // Sync global memory variable
        }
        
        // 3. Apply Server Flashcards
        if (serverChanges.flashcards) {
            let localDecks = JSON.parse(localStorage.getItem(getKey('fc_decks')) || '{}');
            
            // Delete removed cards
            if (activeIds && activeIds.flashcards) {
                const activeSet = new Set(activeIds.flashcards);
                Object.keys(localDecks).forEach(deckName => {
                    localDecks[deckName] = localDecks[deckName].filter(c => activeSet.has(c.client_id));
                });
            }
            
            // Update / Add new cards
            serverChanges.flashcards.updated.forEach(fc => {
                const deckName = fc.deck_name || 'Default Deck';
                if (!localDecks[deckName]) localDecks[deckName] = [];
                
                // Remove older
                localDecks[deckName] = localDecks[deckName].filter(c => c.client_id !== fc.client_id);
                localDecks[deckName].push({
                    client_id: fc.client_id,
                    front: fc.question,
                    back: fc.answer,
                    rating: 0,
                    nextReview: fc.next_review,
                    interval: fc.interval_days,
                    ease: fc.ease_factor,
                    version: fc.version,
                    created_at: fc.created_at,
                    updated_at: fc.updated_at
                });
            });
            
            originalSetItem.call(localStorage, getKey('fc_decks'), JSON.stringify(localDecks));
        }

        // Reset sync bases to match server synchronized state
        originalSetItem.call(localStorage, getKey('sync_notes_base'), localStorage.getItem(getKey('notes')) || '');
        originalSetItem.call(localStorage, getKey('sync_events_base'), localStorage.getItem(getKey('events')) || '{}');
        originalSetItem.call(localStorage, getKey('sync_decks_base'), localStorage.getItem(getKey('fc_decks')) || '{}');

        // Clear Pending Change Queue
        const clearedChanges = {
            notes: { created: [], updated: [], deleted: [] },
            events: { created: [], updated: [], deleted: [] },
            flashcards: { created: [], updated: [], deleted: [] }
        };
        originalSetItem.call(localStorage, getPendingChangesKey(), JSON.stringify(clearedChanges));

        // Save last sync timestamps
        const prettyTime = new Date(serverTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date(serverTime).toLocaleDateString();
        localStorage.setItem(getKey('last_sync_time'), prettyTime);
        localStorage.setItem(getKey('last_sync_timestamp'), serverTime);

        // Refresh active views
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderDailyTasks === 'function') renderDailyTasks();
        if (typeof loadProfileData === 'function') loadProfileData();

        updateSyncUI();
        try { showToast('Sync completed', 'success'); } catch (e) {}
    }

    // 3-Way Merge Conflict Resolution Modal loop
    const conflictModal = document.getElementById('sync-conflict-modal');
    const localCard = document.getElementById('conflict-local-card');
    const serverCard = document.getElementById('conflict-server-card');
    const resolveBtn = document.getElementById('conflict-resolve-btn');
    let selectedWinner = 'local'; // Default winner is local

    if (localCard && serverCard && resolveBtn && conflictModal) {
        localCard.addEventListener('click', () => {
            selectedWinner = 'local';
            localCard.style.borderColor = 'var(--primary-color)';
            localCard.style.borderWidth = '2px';
            serverCard.style.borderColor = 'var(--border-color)';
            serverCard.style.borderWidth = '1px';
        });

        serverCard.addEventListener('click', () => {
            selectedWinner = 'server';
            serverCard.style.borderColor = 'var(--primary-color)';
            serverCard.style.borderWidth = '2px';
            localCard.style.borderColor = 'var(--border-color)';
            localCard.style.borderWidth = '1px';
        });
    }

    function processNextConflict(serverTime, serverChanges, activeIds) {
        if (conflictQueue.length === 0) {
            conflictModal.style.display = 'none';
            finalizeSync(serverTime, serverChanges, activeIds);
            return;
        }

        activeConflict = conflictQueue.shift();
        conflictModal.style.display = 'flex';
        
        const typeEl = document.getElementById('conflict-item-type');
        const localTitle = document.getElementById('conflict-local-title');
        const localBody = document.getElementById('conflict-local-body');
        const serverTitle = document.getElementById('conflict-server-title');
        const serverBody = document.getElementById('conflict-server-body');

        // Reset borders
        selectedWinner = 'local';
        localCard.style.borderColor = 'var(--primary-color)';
        localCard.style.borderWidth = '2px';
        serverCard.style.borderColor = 'var(--border-color)';
        serverCard.style.borderWidth = '1px';

        if (activeConflict.entity === 'notes') {
            if (typeEl) typeEl.textContent = 'Notepad Note';
            if (localTitle) localTitle.textContent = activeConflict.local.title || 'Untitled note';
            if (localBody) localBody.textContent = activeConflict.local.content.replace(/<[^>]*>/g, '').substring(0, 300) + '...';
            if (serverTitle) serverTitle.textContent = activeConflict.server.title || 'Untitled note';
            if (serverBody) serverBody.textContent = activeConflict.server.content.replace(/<[^>]*>/g, '').substring(0, 300) + '...';
        } else if (activeConflict.entity === 'events') {
            if (typeEl) typeEl.textContent = 'Calendar Event';
            if (localTitle) localTitle.textContent = activeConflict.local.title;
            if (localBody) localBody.textContent = `Date: ${activeConflict.local.event_date}\nDescription: ${activeConflict.local.description || 'None'}`;
            if (serverTitle) serverTitle.textContent = activeConflict.server.title;
            if (serverBody) serverBody.textContent = `Date: ${activeConflict.server.event_date}\nDescription: ${activeConflict.server.description || 'None'}`;
        } else if (activeConflict.entity === 'flashcards') {
            if (typeEl) typeEl.textContent = 'Study Flashcard';
            if (localTitle) localTitle.textContent = `Q: ${activeConflict.local.question}`;
            if (localBody) localBody.textContent = `A: ${activeConflict.local.answer}\nInterval: ${activeConflict.local.interval_days} days`;
            if (serverTitle) serverTitle.textContent = `Q: ${activeConflict.server.question}`;
            if (serverBody) serverBody.textContent = `A: ${activeConflict.server.answer}\nInterval: ${activeConflict.server.interval_days} days`;
        }

        // Action resolve
        const resolveHandler = () => {
            resolveBtn.removeEventListener('click', resolveHandler);
            
            const entity = activeConflict.entity;
            const changes = getPendingChanges();
            
            if (selectedWinner === 'local') {
                // Apply local version: bump version to match server version + 1 so it overwrites on next sync
                const nextVer = (activeConflict.server.version || 1) + 1;
                activeConflict.local.version = nextVer;
                
                // Find and update item in pending changes list
                const idx = changes[entity].updated.findIndex(x => x.client_id === activeConflict.local.client_id);
                if (idx !== -1) {
                    changes[entity].updated[idx].version = nextVer;
                } else {
                    changes[entity].updated.push(activeConflict.local);
                }
                savePendingChanges(changes);
            } else {
                // Apply server version: overwrite local storage immediately
                if (entity === 'notes') {
                    originalSetItem.call(localStorage, getKey('notes'), activeConflict.server.content);
                    originalSetItem.call(localStorage, getKey('notes_version'), activeConflict.server.version);
                    if (quill) {
                        quill.root.innerHTML = activeConflict.server.content;
                    }
                } else if (entity === 'events') {
                    const localEvents = JSON.parse(localStorage.getItem(getKey('events')) || '{}');
                    const dateStr = activeConflict.server.event_date;
                    if (!localEvents[dateStr]) localEvents[dateStr] = [];
                    localEvents[dateStr] = localEvents[dateStr].filter(e => e.client_id !== activeConflict.server.client_id);
                    localEvents[dateStr].push(activeConflict.server);
                    originalSetItem.call(localStorage, getKey('events'), JSON.stringify(localEvents));
                } else if (entity === 'flashcards') {
                    const localDecks = JSON.parse(localStorage.getItem(getKey('fc_decks')) || '{}');
                    const deckName = activeConflict.server.deck_name || 'Default Deck';
                    if (!localDecks[deckName]) localDecks[deckName] = [];
                    localDecks[deckName] = localDecks[deckName].filter(c => c.client_id !== activeConflict.server.client_id);
                    localDecks[deckName].push({
                        client_id: activeConflict.server.client_id,
                        front: activeConflict.server.question,
                        back: activeConflict.server.answer,
                        rating: 0,
                        nextReview: activeConflict.server.next_review,
                        interval: activeConflict.server.interval_days,
                        ease: activeConflict.server.ease_factor,
                        version: activeConflict.server.version,
                        created_at: activeConflict.server.created_at,
                        updated_at: activeConflict.server.updated_at
                    });
                    originalSetItem.call(localStorage, getKey('fc_decks'), JSON.stringify(localDecks));
                }
                
                // Clear from updated queue so it is not sent again
                changes[entity].updated = changes[entity].updated.filter(x => x.client_id !== activeConflict.local.client_id);
                savePendingChanges(changes);
            }

            // Recurse to next conflict
            setTimeout(() => {
                processNextConflict(serverTime, serverChanges, activeIds);
            }, 100);
        };
        
        resolveBtn.addEventListener('click', resolveHandler);
    }

    // Authentication Actions
    const loginUsernameInput = document.getElementById('sync-login-username');
    const loginPasswordInput = document.getElementById('sync-login-password');
    const loginErrorEl = document.getElementById('sync-login-error');
    const loginBtn = document.getElementById('sync-login-btn');
    
    const regUsernameInput = document.getElementById('sync-reg-username');
    const regEmailInput = document.getElementById('sync-reg-email');
    const regPasswordInput = document.getElementById('sync-reg-password');
    const regErrorEl = document.getElementById('sync-reg-error');
    const regBtn = document.getElementById('sync-reg-btn');

    // Provide a simple local fallback auth if firebase functions are unavailable
    (function ensureAuthFallback() {
        if (typeof window.fbRegister === 'function' && typeof window.fbLogin === 'function') return;

        const USERS_KEY = 'cognify_local_users_v1';
        const loadUsers = () => JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
        const saveUsers = (u) => localStorage.setItem(USERS_KEY, JSON.stringify(u));

        const toB64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
        const fromB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
        const randSalt = () => {
            const s = new Uint8Array(16);
            if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(s);
            else for (let i = 0; i < s.length; i++) s[i] = Math.floor(Math.random() * 256);
            return s;
        };

        async function derive(password, salt) {
            const enc = new TextEncoder();
            const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), { name: 'PBKDF2' }, false, ['deriveBits']);
            const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
            return toB64(new Uint8Array(bits));
        }

        function constTimeEq(a, b) {
            if (!a || !b || a.length !== b.length) return false;
            let r = 0;
            for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
            return r === 0;
        }

        window.fbRegister = async function(username, email, password) {
            const users = loadUsers();
            const key = String(email).toLowerCase();
            if (users[key]) throw new Error('Account already exists for this email.');
            const salt = randSalt();
            const hash = await derive(password, salt.buffer || salt);
            users[key] = {
                username: username || email.split('@')[0],
                email: key,
                salt: toB64(salt),
                hash: hash,
                createdAt: new Date().toISOString()
            };
            saveUsers(users);
            window.__CognifyLocalAuth = true;
            return { token: 'local:' + Date.now(), user: { uid: 'local_' + Date.now(), email: key, username: users[key].username } };
        };

        window.fbLogin = async function(email, password) {
            const users = loadUsers();
            const key = String(email).toLowerCase();
            const entry = users[key];
            if (!entry) throw new Error('No account found for this email.');
            const salt = fromB64(entry.salt || '');
            const hash = await derive(password, salt.buffer || salt);
            if (!constTimeEq(hash, entry.hash)) throw new Error('Invalid credentials.');
            window.__CognifyLocalAuth = true;
            return { token: 'local:' + Date.now(), user: { uid: 'local_' + Date.now(), email: key, username: entry.username } };
        };

        // expose a flag so UI can show that local auth is used
        window.__CognifyLocalAuth = true;
    })();

    // Also expose explicit local-only register/login helpers (used when remote backend fails)
    (function exposeLocalHelpers() {
        const USERS_KEY = 'cognify_local_users_v1';
        const loadUsers = () => JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
        const saveUsers = (u) => localStorage.setItem(USERS_KEY, JSON.stringify(u));

        const toB64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
        const fromB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
        const randSalt = () => {
            const s = new Uint8Array(16);
            if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(s);
            else for (let i = 0; i < s.length; i++) s[i] = Math.floor(Math.random() * 256);
            return s;
        };

        async function derive(password, salt) {
            const enc = new TextEncoder();
            const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), { name: 'PBKDF2' }, false, ['deriveBits']);
            const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
            return toB64(new Uint8Array(bits));
        }

        function constTimeEq(a, b) {
            if (!a || !b || a.length !== b.length) return false;
            let r = 0;
            for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
            return r === 0;
        }

        window.fbRegisterLocal = async function(username, email, password) {
            const users = loadUsers();
            const key = String(email).toLowerCase();
            if (users[key]) throw new Error('Account already exists for this email.');
            const salt = randSalt();
            const hash = await derive(password, salt.buffer || salt);
            users[key] = {
                username: username || email.split('@')[0],
                email: key,
                salt: toB64(salt),
                hash: hash,
                createdAt: new Date().toISOString()
            };
            saveUsers(users);
            window.__CognifyLocalAuth = true;
            return { token: 'local:' + Date.now(), user: { uid: 'local_' + Date.now(), email: key, username: users[key].username } };
        };

        window.fbLoginLocal = async function(email, password) {
            const users = loadUsers();
            const key = String(email).toLowerCase();
            const entry = users[key];
            if (!entry) throw new Error('No account found for this email.');
            const salt = fromB64(entry.salt || '');
            const hash = await derive(password, salt.buffer || salt);
            if (!constTimeEq(hash, entry.hash)) throw new Error('Invalid credentials.');
            window.__CognifyLocalAuth = true;
            return { token: 'local:' + Date.now(), user: { uid: 'local_' + Date.now(), email: key, username: entry.username } };
        };
    })();

    // Local notifications storage helpers
    function saveLocalNotification(userId, message) {
        try {
            const KEY = 'cognify_local_notifications_v1';
            const list = JSON.parse(localStorage.getItem(KEY) || '[]');
            const id = 'local_notif_' + Date.now() + '_' + Math.floor(Math.random()*1000);
            list.unshift({ id, user_id: userId, message, is_read: false, created_at: new Date().toISOString() });
            localStorage.setItem(KEY, JSON.stringify(list));
        } catch (e) { console.error('saveLocalNotification failed', e); }
    }

    function getLocalNotificationsForUser(userId) {
        try {
            const KEY = 'cognify_local_notifications_v1';
            const list = JSON.parse(localStorage.getItem(KEY) || '[]');
            return list.filter(n => n.user_id === userId);
        } catch (e) { return []; }
    }

    // Fetch notifications (server-first, fallback to local notifications for local users)
    async function fetchAndShowNotifications() {
        try {
            if (!authToken) return;
            // Try server
            const res = await fetch(`${API_URL}/api/notifications`, { headers: { 'Authorization': `Bearer ${authToken}` } });
            if (res.ok) {
                const data = await res.json();
                if (data && data.notifications && data.notifications.length) {
                    // show the newest
                    const newest = data.notifications[0];
                    try { showToast(newest.message, 'info'); } catch (e) {}
                    return;
                }
            }
        } catch (e) {
            // ignore server errors and fall through to local
        }

        // If auth is local token, show local notifications
        try {
            if (syncUser && syncUser.uid && String(syncUser.uid).startsWith('local_')) {
                const localNotifs = getLocalNotificationsForUser(syncUser.email || syncUser.uid);
                if (localNotifs && localNotifs.length) {
                    showToast(localNotifs[0].message, 'info');
                }
            }
        } catch (e) {}
    }

    // If local auth fallback is active, show the banner we added to the page
    try {
        if (window.__CognifyLocalAuth) {
            const b = document.getElementById('local-auth-banner');
            if (b) b.style.display = 'block';
        }
    } catch (e) { /* ignore in non-browser contexts */ }
    
    const logoutBtn = document.getElementById('sync-logout-btn');
    const syncNowBtn = document.getElementById('sync-now-btn');
    const onlineToggle = document.getElementById('sync-online-toggle');

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const usernameOrEmail = loginUsernameInput.value.trim();
            const password = loginPasswordInput.value.trim();
            if (loginErrorEl) loginErrorEl.textContent = '';
            
            if (!usernameOrEmail || !password) {
                if (loginErrorEl) loginErrorEl.textContent = 'Fill in all fields!';
                return;
            }
            
            loginBtn.disabled = true;
            try {
                let data;
                try {
                    if (typeof window.fbLogin === 'function') {
                        data = await window.fbLogin(usernameOrEmail, password);
                    } else {
                        throw new Error('Sync service not available');
                    }
                } catch (e) {
                    // fallback to local-only login
                    if (typeof window.fbLoginLocal === 'function') {
                        data = await window.fbLoginLocal(usernameOrEmail, password);
                        showToast('Logged in locally (offline mode)', 'info');
                    } else {
                        throw e;
                    }
                }
                
                authToken = data.token;
                syncUser = data.user;
                localStorage.setItem('cognify_auth_token', authToken);
                localStorage.setItem('cognify_sync_user', JSON.stringify(syncUser));
                
                // Reset sync timestamps on new login to force full merge
                localStorage.removeItem(getKey('last_sync_timestamp'));
                
                updateSyncUI();
                syncNow(); // Perform initial sync immediately
                try { 
                    if (String(authToken || '').startsWith('local:')) {
                        saveLocalNotification(syncUser.email || syncUser.uid, 'Welcome to Cognify! Your account has been created.');
                        try { if (Notification.permission === 'granted') new Notification('Welcome to Cognify!', { body: 'Your account is ready (local mode).' }); } catch(e){}
                    }
                } catch (e) {}
                try { fetchAndShowNotifications(); } catch (e) {}
            } catch (e) {
                if (loginErrorEl) loginErrorEl.textContent = e.message || 'Server connection failed.';
            } finally {
                loginBtn.disabled = false;
            }
        });
    }

    if (regBtn) {
        regBtn.addEventListener('click', async () => {
            const username = regUsernameInput.value.trim();
            const email = regEmailInput.value.trim();
            const password = regPasswordInput.value.trim();
            if (regErrorEl) regErrorEl.textContent = '';
            
            if (!username || !email || !password) {
                if (regErrorEl) regErrorEl.textContent = 'Fill in all fields!';
                return;
            }
            
            regBtn.disabled = true;
            try {
                let data;
                try {
                    if (typeof window.fbRegister === 'function') {
                        data = await window.fbRegister(username, email, password);
                    } else {
                        throw new Error('Sync service not available');
                    }
                } catch (e) {
                    if (typeof window.fbRegisterLocal === 'function') {
                        data = await window.fbRegisterLocal(username, email, password);
                        showToast('Account created locally (offline mode)', 'info');
                    } else {
                        throw e;
                    }
                }
                
                authToken = data.token;
                syncUser = data.user;
                localStorage.setItem('cognify_auth_token', authToken);
                localStorage.setItem('cognify_sync_user', JSON.stringify(syncUser));
                
                // Reset sync timestamps
                localStorage.removeItem(getKey('last_sync_timestamp'));
                
                updateSyncUI();
                syncNow(); // Perform initial sync
                try { 
                    if (String(authToken || '').startsWith('local:')) {
                        saveLocalNotification(syncUser.email || syncUser.uid, 'Welcome to Cognify! Your account has been created.');
                        try { if (Notification.permission === 'granted') new Notification('Welcome to Cognify!', { body: 'Your account is ready (local mode).' }); } catch(e){}
                    }
                } catch (e) {}
                try { fetchAndShowNotifications(); } catch (e) {}
            } catch (e) {
                if (regErrorEl) regErrorEl.textContent = e.message || 'Registration failed.';
            } finally {
                regBtn.disabled = false;
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (window.fbLogout) {
                try { await window.fbLogout(); } catch (e) {}
            }
            authToken = null;
            syncUser = null;
            localStorage.removeItem('cognify_auth_token');
            localStorage.removeItem('cognify_sync_user');
            localStorage.removeItem(getKey('last_sync_timestamp'));
            localStorage.removeItem(getKey('last_sync_time'));
            updateSyncUI();
        });
    }

    if (syncNowBtn) {
        syncNowBtn.addEventListener('click', () => {
            syncNow();
        });
    }

    if (onlineToggle) {
        onlineToggle.addEventListener('change', (e) => {
            isOnline = e.target.checked;
            localStorage.setItem('cognify_sync_online', isOnline);
            updateSyncUI();
            if (isOnline) {
                syncNow();
            }
        });
    }

    // AI INTEGRATION: Connect Summary and Flashcard Extractors
    const oldSummaryBtn = document.querySelector('.summary-card .generate-btn');
    if (oldSummaryBtn) {
        const newSummaryBtn = oldSummaryBtn.cloneNode(true);
        oldSummaryBtn.parentNode.replaceChild(newSummaryBtn, oldSummaryBtn);
        
        newSummaryBtn.addEventListener('click', async () => {
            const text = quill ? quill.getText().trim() : '';
            const summaryOutputEl = document.querySelector('.summary-card .summary-output');
            if (!summaryOutputEl) return;
            
            if (!text || text.length < 15) {
                summaryOutputEl.innerHTML = '<span style="color:#ef4444; font-size:0.85rem;">Write at least 15 characters of notes in the Notepad first before generating a summary!</span>';
                return;
            }
            
            summaryOutputEl.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Consulting AI Summarizer...';
            
            try {
                // Call Node API endpoint (which acts as a proxy to Python service)
                const res = await fetch(`${API_URL}/api/ai/summarize`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': authToken ? `Bearer ${authToken}` : ''
                    },
                    body: JSON.stringify({ text })
                });
                
                const data = await res.json();
                
                // Now extract flashcards as well (Linked pipeline!)
                summaryOutputEl.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Summarizing complete. Generating study cards...';
                
                const fcRes = await fetch(`${API_URL}/api/ai/extract-flashcards`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': authToken ? `Bearer ${authToken}` : ''
                    },
                    body: JSON.stringify({ text })
                });
                
                const fcData = await fcRes.json();
                
                let flashcardsHtml = '';
                if (fcData.flashcards && fcData.flashcards.length > 0) {
                    flashcardsHtml = `
                        <div style="margin-top: 1rem; border-top: 1px dashed var(--border-color); padding-top: 0.8rem;">
                            <h5 style="margin:0 0 0.5rem 0; color:var(--primary-color); display:flex; align-items:center; gap:0.25rem;"><i class="ph ph-cards"></i> Extracted Flashcards</h5>
                            <div style="display:flex; flex-direction:column; gap:0.5rem; max-height:160px; overflow-y:auto; padding-right:4px;">
                                ${fcData.flashcards.map((fc, i) => `
                                    <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:0.5rem; display:flex; flex-direction:column; gap:2px; font-size:0.78rem;">
                                        <strong>Q: ${fc.question}</strong>
                                        <span style="color:var(--text-muted);">A: ${fc.answer}</span>
                                        <button type="button" class="flashcard-pill-btn" onclick="saveExtractedCard('${fc.question.replace(/'/g, "\\'")}', '${fc.answer.replace(/'/g, "\\'")}', this)" style="margin-top:4px; align-self:flex-end;">Save Card</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }

                summaryOutputEl.innerHTML = `
                    <div style="background: rgba(45, 212, 191, 0.08); border: 1px solid var(--neon-accent); border-radius: 12px; padding: 0.8rem; font-size: 0.85rem; line-height: 1.4; color: var(--text-main);">
                        <h4 style="color: var(--neon-accent); margin-bottom: 0.4rem; display:flex; align-items:center; gap:0.25rem;"><i class="ph ph-magic-wand"></i> Key Takeaways</h4>
                        <p style="margin: 0; color: var(--text-main); font-size: 0.82rem; font-style: normal; line-height: 1.55;">
                            ${data.summary}
                        </p>
                        ${flashcardsHtml}
                    </div>
                `;
            } catch (e) {
                console.error('Failed to run AI summarizer pipeline:', e);
                summaryOutputEl.innerHTML = '<span style="color:#ef4444; font-size:0.85rem;">Pipeline offline. Write more text or check connections.</span>';
            }
        });
    }

    // Global save card handler for extracted cards
    window.saveExtractedCard = function(question, answer, buttonEl) {
        try {
            const localDecks = JSON.parse(localStorage.getItem(getKey('fc_decks')) || '{}');
            const activeDeckName = localStorage.getItem(getKey('fc_active_deck')) || 'Default Deck';
            
            if (!localDecks[activeDeckName]) {
                localDecks[activeDeckName] = [];
            }
            
            const newCard = {
                client_id: 'card_' + Math.random().toString(36).substr(2, 9),
                front: question,
                back: answer,
                rating: 0,
                nextReview: new Date().toISOString().split('T')[0],
                interval: 1,
                ease: 2.5,
                version: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            localDecks[activeDeckName].push(newCard);
            localStorage.setItem(getKey('fc_decks'), JSON.stringify(localDecks));
            
            buttonEl.textContent = 'Saved!';
            buttonEl.disabled = true;
            buttonEl.style.borderColor = 'var(--neon-accent)';
            buttonEl.style.color = 'var(--neon-accent)';
            
            // Reload flashcard quiz panel if active
            if (typeof loadProfileData === 'function') loadProfileData();
        } catch (e) {
            console.error('Failed to save extracted card:', e);
        }
    };

    // Load initial sync states
    updateSyncUI();
});

