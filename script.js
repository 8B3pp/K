// ============================================================
// Terminarz 7B — script.js
// UWAGA: adres i klucz Supabase, oraz nazwy tabel/kolumn w bazie
// pozostają DOKŁADNIE takie same jak wcześniej — żadne konto nie ginie.
// ============================================================

if (typeof window.supabaseClient === 'undefined') {
    const SUPABASE_URL = 'https://uvjgmxvfzvweoxeicned.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_hGHRqdmuObIyLnpzVzZiPA_Cslp7V1G';
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
const sb = window.supabaseClient;

// Service Worker dla powiadomień push
if ('serviceWorker' in navigator) {
    const swCode = `
        self.addEventListener('push', function(event) {
            const data = event.data ? event.data.json() : {};
            const options = {
                body: data.body || 'Sprawdź na stronie!',
                icon: '/K/icon.png',
                badge: '/K/badge.png',
                vibrate: [200, 100, 200],
                data: { url: data.url || 'https://8b3pp.github.io/K/index.html' }
            };
            event.waitUntil(self.registration.showNotification(data.title || 'Terminarz 7B', options));
        });
        self.addEventListener('notificationclick', function(event) {
            event.notification.close();
            event.waitUntil(clients.matchAll({ type: 'window' }).then(function(clientList) {
                for (var i = 0; i < clientList.length; i++) {
                    if (clientList[i].url === event.notification.data.url && 'focus' in clientList[i]) return clientList[i].focus();
                }
                if (clients.openWindow) return clients.openWindow(event.notification.data.url);
            }));
        });
    `;
    const blob = new Blob([swCode], { type: 'application/javascript' });
    navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(err => console.log('SW error:', err));
}

// ------------------------------------------------------------
// Stan aplikacji
// ------------------------------------------------------------
const LISTA_ADMINOW = ["Hubert_Bereźnicki", "Ewa_Pachana", "iwo_nowacki"];
const KOLORY = { bg: '#0D1B2A', panel: '#162447', karta: '#1C3A5C', input: '#1C3A5C', obwodka: 'rgba(255,255,255,0.15)', tekst: '#FFFFFF', tekstPrzygaszony: '#CBD5E1' };
const STYL_INPUT = `width:100%;padding:10px;border:2px solid ${KOLORY.obwodka};border-radius:8px;background:${KOLORY.input};color:${KOLORY.tekst};box-sizing:border-box;`;
const STYL_LABEL = `display:block;margin-bottom:5px;font-size:14px;color:${KOLORY.tekstPrzygaszony};`;

let aktualnaSekcja = 'skrzynka';
let aktualnaZakladkaGlowna = 'glowna';
let edytowaneID = null;
let mojaSesja = null;
let mojProfil = null;
let jestemAdminem = false;
let podgladWiadomoscObj = null;
let aktywnyRanking = null;

// ------------------------------------------------------------
// Funkcje pomocnicze ogólne
// ------------------------------------------------------------
function normalizujTekst(t) {
    return (t || '').trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").toLowerCase();
}

function wyslijPowiadomienie(tytul, tresc) {
    if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(tytul, { body: tresc, icon: '/K/icon.png' }); } catch (e) {}
    }
}

function generujFakeEmail(imie, nazwisko) {
    let czysteImie = imie.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]/g, '');
    let czysteNazwisko = nazwisko.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]/g, '');
    return czysteImie + czysteNazwisko + '@klasa.com';
}

function jestKontemAdmina(imie, nazwisko) {
    if (!imie || !nazwisko) return false;
    const klucz1 = imie + "_" + nazwisko;
    const klucz2 = normalizujTekst(imie).replace(/^\w/, c => c.toUpperCase()) + "_" + nazwisko;
    const kNorm = normalizujTekst(imie) + "_" + normalizujTekst(nazwisko);
    return LISTA_ADMINOW.some(a => a === klucz1 || a === klucz2 || normalizujTekst(a) === kNorm);
}

// Solidne wyszukiwanie konta głównego administratora (nie zależy od dokładnych
// polskich znaków w bazie — dawniej to potrafiło się wysypać i np. wiadomość
// powitalna po prostu nie leciała).
async function znajdzGlownegoAdmina() {
    const { data: users } = await sb.from('profiles').select('id, imie, nazwisko');
    if (!users) return null;
    return users.find(u => jestKontemAdmina(u.imie, u.nazwisko)) || null;
}

// Awatar z bezpiecznym fallbackiem — jeśli obrazek się nie wczyta (albo go nie ma),
// pokazujemy okrągłą plakietkę z inicjałem zamiast zepsutej ikonki.
function markupAwatara(profil, rozmiarPx, idAttr) {
    const inicjal = (profil && profil.imie) ? profil.imie.charAt(0).toUpperCase() : '?';
    const idHtml = idAttr ? `id="${idAttr}"` : '';
    if (profil && profil.avatar_url) {
        const bezpieczny = String(profil.avatar_url).replace(/"/g, '&quot;');
        return `<img ${idHtml} src="${bezpieczny}" style="width:${rozmiarPx}px;height:${rozmiarPx}px;border-radius:50%;object-fit:cover;background:#007bff;" onerror="this.outerHTML='<div style=&quot;width:${rozmiarPx}px;height:${rozmiarPx}px;border-radius:50%;background:#007bff;color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:${Math.round(rozmiarPx*0.4)}px;&quot;>${inicjal}</div>'">`;
    }
    return `<div ${idHtml} style="width:${rozmiarPx}px;height:${rozmiarPx}px;border-radius:50%;background:#007bff;color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:${Math.round(rozmiarPx*0.4)}px;">${inicjal}</div>`;
}

function formatujDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('pl-PL'); } catch (e) { return iso; }
}

// ------------------------------------------------------------
// Ekran startowy — logo "Terminarz 7B" (czarny ekran, bez %) +
// pasek z prawdziwym postępem ładowania danych (mniejszy box nad menu)
// ------------------------------------------------------------
function wstrzykniStyleLadowania() {
    if (document.getElementById('styl-ladowania-terminarza')) return;
    const style = document.createElement('style');
    style.id = 'styl-ladowania-terminarza';
    style.textContent = `
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes t7b-wirnik { to { transform: rotate(360deg); } }
        @keyframes t7b-wjazd-karty { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .t7b-fade-in { animation: t7b-wjazd-karty .35s ease; }
        #t7b-ekran-logo { position:fixed; inset:0; background:#000; z-index:99999; display:flex; align-items:center; justify-content:center; flex-direction:column; transition:opacity .9s ease, transform .9s ease; }
        #t7b-ekran-logo .t7b-logo-tekst { font-family:'Segoe UI',sans-serif; color:#fff; font-size:34px; font-weight:700; letter-spacing:1px; position:relative; }
        #t7b-ekran-logo .t7b-ladowanie-tekst { position:absolute; right:-70px; bottom:2px; font-size:15px; font-weight:300; color:#7DD3FC; }
        #t7b-ekran-logo.t7b-znika { opacity:0; transform:scale(6); }
        #t7b-loader-menu { position:relative; background:#0D1B2A; border-radius:16px; padding:26px 20px; text-align:center; transition:opacity .4s ease; }
        #t7b-loader-menu .t7b-pasek-tlo { width:100%; max-width:280px; margin:14px auto 0; height:8px; border-radius:5px; background:#1C3A5C; overflow:hidden; }
        #t7b-loader-menu .t7b-pasek-wypelnienie { height:100%; width:0%; background:#38BDF8; border-radius:5px; transition:width .25s ease; }
        .t7b-spinner { width:34px; height:34px; border-radius:50%; border:4px solid rgba(255,255,255,0.15); border-top-color:#38BDF8; animation:t7b-wirnik .8s linear infinite; margin:0 auto; }
    `;
    document.head.appendChild(style);
}

function pokazEkranLogo() {
    wstrzykniStyleLadowania();
    if (document.getElementById('t7b-ekran-logo')) return;
    const el = document.createElement('div');
    el.id = 't7b-ekran-logo';
    el.innerHTML = `<div class="t7b-logo-tekst">Terminarz 7B<span class="t7b-ladowanie-tekst">Ładowanie</span></div>`;
    document.body.appendChild(el);
    setTimeout(() => {
        el.classList.add('t7b-znika');
        setTimeout(() => el.remove(), 950);
    }, 1000);
}

function pokazLoaderMenu() {
    const kontener = document.querySelector('.t7b-glowny-kontener');
    if (!kontener) return;
    let loader = document.getElementById('t7b-loader-menu');
    if (loader) return;
    loader = document.createElement('div');
    loader.id = 't7b-loader-menu';
    loader.innerHTML = `<div class="t7b-spinner"></div><div style="color:#CBD5E1;margin-top:12px;font-weight:bold;">Ładowanie…</div><div class="t7b-pasek-tlo"><div class="t7b-pasek-wypelnienie" id="t7b-pasek-procent"></div></div>`;
    kontener.prepend(loader);
    const pasekGorny = document.getElementById('pasek-gorny-menu');
    if (pasekGorny) pasekGorny.style.display = 'none';
}

function ustawPostepLadowania(procent) {
    const pasek = document.getElementById('t7b-pasek-procent');
    if (pasek) pasek.style.width = Math.min(100, procent) + '%';
}

function ukryjLoaderMenu() {
    const loader = document.getElementById('t7b-loader-menu');
    const pasekGorny = document.getElementById('pasek-gorny-menu');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.remove(), 400);
    }
    if (pasekGorny) pasekGorny.style.display = '';
}

// ------------------------------------------------------------
// Sprawdzenie autoryzacji
// ------------------------------------------------------------
sb.auth.onAuthStateChange((event, session) => {
    const obecnaStrona = window.location.pathname.toLowerCase();
    if (session) {
        if (event === 'SIGNED_IN') {
            if (obecnaStrona.includes('rejestracja')) {
                window.location.href = 'https://8b3pp.github.io/K/index.html';
            } else if (obecnaStrona.includes('logowanie')) {
                window.location.href = 'https://8b3pp.github.io/K/index.html';
            }
        }
    } else {
        if (obecnaStrona.includes('index') || obecnaStrona === '/' || obecnaStrona === '/K/' || obecnaStrona.endsWith('/K/')) {
            window.location.href = 'https://8b3pp.github.io/K/logowanie.html';
        }
    }
});

// ------------------------------------------------------------
// Sprzątanie: stare wpisy terminarza i przeterminowany kosz
// (najlepsze możliwe rozwiązanie po stronie klienta — brak
// serwera z harmonogramem (cron) w tym projekcie).
// ------------------------------------------------------------
async function posprzatajStareDane() {
    try {
        const dzis = new Date();
        const dzisStr = dzis.getFullYear() + '-' + String(dzis.getMonth() + 1).padStart(2, '0') + '-' + String(dzis.getDate()).padStart(2, '0');
        // Usuń wydarzenia z datą wcześniejszą niż dziś (dzisiejsze zostają)
        await sb.from('terminarz').delete().lt('data_wydarzenia', dzisStr);
        // Usuń wiadomości w koszu starsze niż 7 dni
        const siedemDniTemu = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        await sb.from('wiadomosci').delete().eq('deleted', true).lt('deleted_at', siedemDniTemu);
    } catch (e) { console.log('Sprzątanie: pominięto (brak uprawnień lub kolumny):', e); }
}

// ------------------------------------------------------------
// Ogłoszenia administracji (popup)
// ------------------------------------------------------------
async function pokazOgloszeniaAdmina() {
    if (!mojaSesja) return;
    try {
        const { data: ogloszenia } = await sb.from('powiadomienia_admina').select('*').eq('aktywne', true).order('stworzono_gdy', { ascending: true });
        if (!ogloszenia || ogloszenia.length === 0) return;
        const { data: odczytane } = await sb.from('powiadomienia_admina_odczytane').select('powiadomienie_id').eq('user_id', mojaSesja.id);
        const odczytaneIdy = new Set((odczytane || []).map(o => o.powiadomienie_id));
        const doPokazania = ogloszenia.filter(o => !o.tylko_raz || !odczytaneIdy.has(o.id));
        if (doPokazania.length === 0) return;
        pokazJednoOgloszenie(doPokazania, 0);
    } catch (e) { console.log('Brak tabeli ogłoszeń — pomiń (uruchom migracje_supabase.sql):', e); }
}

function pokazJednoOgloszenie(lista, idx) {
    if (idx >= lista.length) return;
    const o = lista[idx];
    let modal = document.getElementById('modal-ogloszenie-admina');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-ogloszenie-admina';
        modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);z-index:5000;align-items:center;justify-content:center;';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="t7b-fade-in" style="background:${KOLORY.panel};width:100%;max-width:440px;margin:20px;padding:28px;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,0.3);">
        <h3 style="text-align:left;margin:0 0 16px 0;color:#fff;font-weight:800;font-size:20px;">${o.tytul}</h3>
        <p style="text-align:center;color:${KOLORY.tekstPrzygaszony};line-height:1.6;white-space:pre-wrap;">${o.opis}</p>
        <button id="btn-ogloszenie-ok" style="margin-top:20px;width:100%;padding:12px;background:#007bff;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">OK</button>
    </div>`;
    modal.style.display = 'flex';
    document.getElementById('btn-ogloszenie-ok').addEventListener('click', async () => {
        if (o.tylko_raz) {
            await sb.from('powiadomienia_admina_odczytane').insert([{ powiadomienie_id: o.id, user_id: mojaSesja.id }]).select();
        }
        if (idx + 1 < lista.length) {
            pokazJednoOgloszenie(lista, idx + 1);
        } else {
            modal.style.display = 'none';
        }
    });
}

// ------------------------------------------------------------
// Główna funkcja interfejsu
// ------------------------------------------------------------
function _uruchomInterfejs() {
    if (typeof window.supabaseClient === 'undefined') {
        setTimeout(_uruchomInterfejs, 100);
        return;
    }
    if (!document.getElementById('kontener-kafelkow')) return;

    pokazEkranLogo();
    pokazLoaderMenu();
    ustawPostepLadowania(10);

    sb.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) {
            window.location.href = 'https://8b3pp.github.io/K/logowanie.html';
            return;
        }
        mojaSesja = user;
        ustawPostepLadowania(30);

        const { data: profil } = await sb.from('profiles').select('*').eq('id', user.id).single();
        mojProfil = profil;
        if (profil) {
            const ikonka = document.getElementById('ikonka-profilu');
            const pelneNazwisko = document.getElementById('profil-pelne-nazwisko');
            if (ikonka) ikonka.innerHTML = markupAwatara(profil, 45);
            if (pelneNazwisko) pelneNazwisko.innerText = (profil.imie || '') + " " + (profil.nazwisko || '');
            ustawFavicon(profil);

            jestemAdminem = jestKontemAdmina(profil.imie, profil.nazwisko);
            if (jestemAdminem) {
                const plusik = document.getElementById('plusik-admina');
                const mlotek = document.getElementById('mlotek-admina');
                const dzwonek = document.getElementById('dzwonek-admina');
                if (plusik) plusik.style.display = 'flex';
                if (mlotek) mlotek.style.display = 'flex';
                if (dzwonek) dzwonek.style.display = 'flex';
                const zakladkaAdminWyslane = document.getElementById('sekcja-admin-wyslane');
                if (zakladkaAdminWyslane) zakladkaAdminWyslane.style.display = 'block';
            }
        }
        ustawPostepLadowania(55);

        await posprzatajStareDane();
        ustawPostepLadowania(70);

        await odswiezTerminarz();
        ustawPostepLadowania(85);

        await sprawdzNoweWiadomosci();
        await odswiezRankingSekcje();
        await pokazOgloszeniaAdmina();
        ustawPostepLadowania(100);
        setTimeout(ukryjLoaderMenu, 250);
    });

    sb.channel('zmiany-interfejsu')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'terminarz' }, () => {
            odswiezTerminarz();
            wyslijPowiadomienie('Nowość w terminarzu!', 'Pojawiło się nowe wydarzenie.');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wiadomosci' }, () => {
            sprawdzNoweWiadomosci();
            const modalPoczty = document.getElementById('modal-poczty');
            if (modalPoczty && modalPoczty.style.display === 'flex') ladujWiadomosci();
        })
        .subscribe();

    // Awaryjne odświeżenie co 20s (na wypadek utraty połączenia realtime)
    // plus odświeżenie po powrocie na kartę — spełnia "sprawdzaj co jakiś czas"
    // bez zbędnego dobijania serwera co sekundę.
    setInterval(() => { if (mojaSesja) { odswiezTerminarz(); sprawdzNoweWiadomosci(); } }, 20000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && mojaSesja) { odswiezTerminarz(); sprawdzNoweWiadomosci(); }
    });

    // Event listenery
    const ikonkaProfilu = document.getElementById('ikonka-profilu');
    const btnWyloguj = document.getElementById('btn-wyloguj');
    const menuProfilu = document.getElementById('menu-profilu');
    const btnPowiadomienia = document.getElementById('btn-powiadomienia');
    const btnUstawienia = document.getElementById('btn-ustawienia');
    const modalUstawien = document.getElementById('modal-ustawien');
    const zamknijUstawienia = document.getElementById('zamknij-modal-ustawien');
    const ustAwatarInput = document.getElementById('ust-awatar-input');
    const plusikAdmina = document.getElementById('plusik-admina');
    const modalAdmina = document.getElementById('modal-admina');
    const zamknijModalAdmina = document.getElementById('zamknij-modal-admina');
    const btnAnulujAdmina = document.getElementById('btn-anuluj-admina');
    const btnZapiszAdmina = document.getElementById('btn-zapisz-admina');
    const formTyp = document.getElementById('form-typ');
    const zamknijPodglad = document.getElementById('zamknij-modal-podgladu');
    const zamknijEdycji = document.getElementById('zamknij-modal-edycji');
    const btnZapiszEdycje = document.getElementById('btn-zapisz-edycje');
    const ikonkaPoczty = document.getElementById('ikonka-poczty');
    const modalPoczty = document.getElementById('modal-poczty');
    const zamknijPoczty = document.getElementById('zamknij-modal-poczty');
    const btnNowaWiadomosc = document.getElementById('btn-nowa-wiadomosc');
    const zamknijAdmin = document.getElementById('zamknij-modal-administracyjny');
    const adminTypKary = document.getElementById('admin-typ-kary');
    const btnWykonajKare = document.getElementById('btn-wykonaj-kare');

    if (ikonkaProfilu) {
        ikonkaProfilu.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menuProfilu) menuProfilu.style.display = menuProfilu.style.display === 'none' ? 'block' : 'none';
        });
    }

    if (btnWyloguj) {
        btnWyloguj.addEventListener('click', async () => {
            await sb.auth.signOut();
            window.location.href = 'https://8b3pp.github.io/K/logowanie.html';
        });
    }

    document.addEventListener('click', () => {
        if (menuProfilu) menuProfilu.style.display = 'none';
    });

    if (btnPowiadomienia) {
        btnPowiadomienia.addEventListener('click', async (e) => {
            e.stopPropagation();
            if ('Notification' in window) {
                const perm = await Notification.requestPermission();
                alert(perm === 'granted' ? "Powiadomienia włączone!" : "Nie udzielono zgody.");
            }
        });
    }

    if (btnUstawienia) {
        btnUstawienia.addEventListener('click', (e) => {
            e.stopPropagation();
            if (modalUstawien) modalUstawien.style.display = 'flex';
            if (menuProfilu) menuProfilu.style.display = 'none';
            zaladujUstawienia();
        });
    }

    if (zamknijUstawienia) {
        zamknijUstawienia.addEventListener('click', () => {
            if (modalUstawien) modalUstawien.style.display = 'none';
        });
    }

    if (ustAwatarInput) {
        ustAwatarInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file || !mojaSesja) return;
            if (file.size > 1.5 * 1024 * 1024) return alert("Zdjęcie jest za duże (max ok. 1.5MB).");
            const reader = new FileReader();
            reader.onload = async function(ev) {
                await sb.from('profiles').update({ avatar_url: ev.target.result }).eq('id', mojaSesja.id);
                const podglad = document.getElementById('ust-awatar-podglad-kontener');
                if (podglad) podglad.innerHTML = markupAwatara({ avatar_url: ev.target.result, imie: mojProfil?.imie }, 80);
                const ikonka = document.getElementById('ikonka-profilu');
                if (ikonka) ikonka.innerHTML = markupAwatara({ avatar_url: ev.target.result, imie: mojProfil?.imie }, 45);
                if (mojProfil) mojProfil.avatar_url = ev.target.result;
                alert("Ikona zaktualizowana!");
            };
            reader.readAsDataURL(file);
        });
    }

    // Przycisk młotka admina
    if (plusikAdmina && plusikAdmina.parentNode && !document.getElementById('mlotek-admina')) {
        const przyciskAdminPanel = document.createElement('div');
        przyciskAdminPanel.id = 'mlotek-admina';
        przyciskAdminPanel.style.cssText = 'display:none; cursor:pointer; width:45px; height:45px; background:#dc3545; color:white; border-radius:50%; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 10px rgba(220,53,69,0.3);';
        przyciskAdminPanel.innerHTML = '&#128296;';
        przyciskAdminPanel.title = 'Panel administracyjny';
        plusikAdmina.parentNode.insertBefore(przyciskAdminPanel, plusikAdmina.nextSibling);

        // Przycisk dzwonka — ogłoszenia
        const przyciskOgloszenia = document.createElement('div');
        przyciskOgloszenia.id = 'dzwonek-admina';
        przyciskOgloszenia.style.cssText = 'display:none; cursor:pointer; width:45px; height:45px; background:#ff9800; color:white; border-radius:50%; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 10px rgba(255,152,0,0.3);';
        przyciskOgloszenia.innerHTML = '&#128276;';
        przyciskOgloszenia.title = 'Ogłoszenia dla wszystkich';
        przyciskAdminPanel.parentNode.insertBefore(przyciskOgloszenia, przyciskAdminPanel.nextSibling);
        przyciskOgloszenia.addEventListener('click', otworzPanelOgloszen);

        document.getElementById('mlotek-admina').addEventListener('click', async () => {
            const { data: users } = await sb.from('profiles').select('*');
            let op = users.map(u => `<option value="${u.id}">${u.imie} ${u.nazwisko}</option>`).join('');
            const wybor = document.getElementById('admin-wybor-uzytkownika');
            const modalAdmin = document.getElementById('modal-administracyjny');
            if (wybor) wybor.innerHTML = '<option value="">-- Wybierz --</option><option value="all">WSZYSCY UŻYTKOWNICY</option>' + op;
            if (modalAdmin) modalAdmin.style.display = 'flex';
            const czasBana = document.getElementById('admin-czas-bana-kontener');
            const tematKontener = document.getElementById('admin-temat-kontener');
            const priorytetKontener = document.getElementById('admin-priorytet-kontener');
            if (czasBana) czasBana.style.display = 'block';
            if (tematKontener) tematKontener.style.display = 'none';
            if (priorytetKontener) priorytetKontener.style.display = 'none';
        });
    }

    if (zamknijAdmin) {
        zamknijAdmin.addEventListener('click', () => {
            const modal = document.getElementById('modal-administracyjny');
            if (modal) modal.style.display = 'none';
        });
    }

    if (adminTypKary) {
        adminTypKary.addEventListener('change', function() {
            const typ = this.value;
            const czasBana = document.getElementById('admin-czas-bana-kontener');
            const tematKontener = document.getElementById('admin-temat-kontener');
            const priorytetKontener = document.getElementById('admin-priorytet-kontener');
            const btnKary = document.getElementById('btn-wykonaj-kare');
            if (czasBana) czasBana.style.display = typ === 'ban' ? 'block' : 'none';
            if (tematKontener) tematKontener.style.display = typ === 'wiadomosc' ? 'block' : 'none';
            if (priorytetKontener) priorytetKontener.style.display = typ === 'wiadomosc' ? 'block' : 'none';
            if (btnKary) btnKary.innerText = typ === 'wiadomosc' ? 'Wyślij' : 'Wykonaj';
        });
    }

    if (btnWykonajKare) {
        btnWykonajKare.addEventListener('click', async () => {
            if (!mojaSesja) return;
            const userId = document.getElementById('admin-wybor-uzytkownika')?.value;
            const typ = document.getElementById('admin-typ-kary')?.value;
            const powod = document.getElementById('admin-powod')?.value.trim();
            const czas = parseInt(document.getElementById('admin-czas-bana')?.value) || 60;

            if (!userId) return alert("Wybierz użytkownika!");
            if (!powod) return alert(typ === 'wiadomosc' ? "Wpisz treść!" : "Podaj powód!");

            btnWykonajKare.disabled = true;
            btnWykonajKare.innerText = 'Ładowanie...';

            if (typ === 'ban') {
                const doKiedy = new Date(Date.now() + czas * 60000).toISOString();
                await sb.from('bany').insert([{ user_id: userId, zbanowany_przez: mojaSesja.id, powod, do_kiedy: doKiedy, typ: 'wiadomosci' }]);
                await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: userId, temat: 'Zostałeś zbanowany/-a', tresc: `Zostałeś zbanowany/-a.\nPrzez: administrator\nNa: ${czas} min\nPowód: ${powod}\nKara wygasa: ${new Date(doKiedy).toLocaleString('pl-PL')}`, priorytet: 'zwykly' }]);
                alert("Użytkownik zbanowany!");
            } else if (typ === 'usun') {
                await sb.from('profiles').delete().eq('id', userId);
                alert("Konto usunięte!");
            } else if (typ === 'wiadomosc') {
                const temat = document.getElementById('admin-temat-wiadomosci')?.value.trim();
                const priorytet = document.getElementById('admin-priorytet')?.value;
                if (!temat) { btnWykonajKare.disabled = false; btnWykonajKare.innerText = 'Wyślij'; return alert("Wpisz temat!"); }

                if (userId === 'all') {
                    const { data: users } = await sb.from('profiles').select('id');
                    const broadcastGrupa = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
                    const progressDiv = document.getElementById('admin-progress');
                    if (progressDiv) progressDiv.style.display = 'block';
                    for (let i = 0; i < users.length; i++) {
                        if (progressDiv) progressDiv.innerText = `Wysyłanie: (${i+1}/${users.length})`;
                        await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: users[i].id, temat, tresc: powod, priorytet, jest_broadcast: true, broadcast_grupa: broadcastGrupa }]);
                    }
                    if (progressDiv) {
                        progressDiv.innerText = 'Wysłano!';
                        setTimeout(() => { progressDiv.style.display = 'none'; }, 2000);
                    }
                } else {
                    await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: userId, temat, tresc: powod, priorytet }]);
                }
                alert("Wiadomość wysłana!");
            }
            btnWykonajKare.disabled = false;
            btnWykonajKare.innerText = typ === 'wiadomosc' ? 'Wyślij' : 'Wykonaj';
            const modal = document.getElementById('modal-administracyjny');
            if (modal) modal.style.display = 'none';
        });
    }

    // Formularz dodawania
    const priorytetSelect = `<div style="margin-bottom:15px;"><label style="${STYL_LABEL}">Priorytet</label><select id="form-priorytet" style="${STYL_INPUT}"><option value="normalny">Normalny</option><option value="sredni">Średni</option><option value="wysoki">Wysoki</option></select></div>`;

    function renderujPolaFormularza() {
        const kontenerPol = document.getElementById('pola-dynamiczne');
        if (!kontenerPol || !formTyp) return;
        const t = formTyp.value;
        const liczySieDoRankingu = t !== 'informacja' ? `<div style="margin-bottom:15px;display:flex;align-items:center;gap:8px;"><input type="checkbox" id="form-liczy-rankingu" style="width:18px;height:18px;"><label for="form-liczy-rankingu" style="color:${KOLORY.tekst};font-size:14px;margin:0;">Liczy się do aktywnego rankingu</label></div><div id="form-termin-oceny-kontener" style="display:none;margin-bottom:15px;"><label style="${STYL_LABEL}">Termin podania oceny (data i godzina)</label><input type="datetime-local" id="form-termin-oceny" style="${STYL_INPUT}"></div>` : '';
        if (t === 'informacja') {
            kontenerPol.innerHTML = `<div style="margin-bottom:15px;"><label style="${STYL_LABEL}">Temat</label><input type="text" id="form-temat" style="${STYL_INPUT}"></div><div style="margin-bottom:15px;"><label style="${STYL_LABEL}">Treść</label><textarea id="form-szczegoly" style="${STYL_INPUT}height:80px;"></textarea></div>${priorytetSelect}<div style="margin-bottom:15px;"><label style="${STYL_LABEL}">Data</label><input type="date" id="form-data" style="${STYL_INPUT}"></div>`;
        } else {
            const et = t === 'sprawdzian' ? 'Jaki dział' : 'Jaki temat/dział';
            kontenerPol.innerHTML = `<div style="margin-bottom:15px;"><label style="${STYL_LABEL}">Przedmiot</label><input type="text" id="form-temat" style="${STYL_INPUT}"></div><div style="margin-bottom:15px;"><label style="${STYL_LABEL}">${et}</label><input type="text" id="form-szczegoly" style="${STYL_INPUT}"></div>${priorytetSelect}<div style="margin-bottom:15px;"><label style="${STYL_LABEL}">Dodatkowe info</label><textarea id="form-dodatkowe" style="${STYL_INPUT}height:60px;"></textarea></div><div style="margin-bottom:15px;"><label style="${STYL_LABEL}">Kiedy</label><input type="date" id="form-data" style="${STYL_INPUT}"></div>${liczySieDoRankingu}`;
            const chk = document.getElementById('form-liczy-rankingu');
            if (chk) chk.addEventListener('change', () => {
                const kont = document.getElementById('form-termin-oceny-kontener');
                if (kont) kont.style.display = chk.checked ? 'block' : 'none';
            });
        }
    }

    if (formTyp) {
        formTyp.addEventListener('change', renderujPolaFormularza);
        renderujPolaFormularza();
    }

    if (plusikAdmina) {
        plusikAdmina.addEventListener('click', () => {
            if (modalAdmina) modalAdmina.style.display = 'flex';
        });
    }

    if (zamknijModalAdmina) {
        zamknijModalAdmina.addEventListener('click', () => {
            if (modalAdmina) modalAdmina.style.display = 'none';
        });
    }

    if (btnAnulujAdmina) {
        btnAnulujAdmina.addEventListener('click', () => {
            if (modalAdmina) modalAdmina.style.display = 'none';
        });
    }

    if (btnZapiszAdmina) {
        btnZapiszAdmina.addEventListener('click', async () => {
            if (!mojaSesja) return;
            const typ = formTyp?.value;
            const temat = document.getElementById('form-temat')?.value.trim();
            const szczegoly = document.getElementById('form-szczegoly')?.value.trim();
            const priorytet = document.getElementById('form-priorytet')?.value;
            const dataW = document.getElementById('form-data')?.value;
            const dN = document.getElementById('form-dodatkowe');
            const dodatkowe = dN ? dN.value.trim() : '';
            const liczyRankingChk = document.getElementById('form-liczy-rankingu');
            const terminOceny = document.getElementById('form-termin-oceny')?.value;

            if (!temat || !szczegoly || !dataW) return alert("Wypełnij wymagane pola!");
            btnZapiszAdmina.disabled = true; btnZapiszAdmina.innerText = 'Ładowanie...';
            const wpis = { nadawca_id: mojaSesja.id, typ, temat, szczegoly, priorytet, data_wydarzenia: dataW, dodatkowe_info: dodatkowe || null };
            if (liczyRankingChk && liczyRankingChk.checked) {
                wpis.liczy_do_rankingu = true;
                wpis.ranking_id = aktywnyRanking ? aktywnyRanking.id : null;
                wpis.termin_podania_oceny = terminOceny ? new Date(terminOceny).toISOString() : null;
            }
            const { error } = await sb.from('terminarz').insert([wpis]);
            btnZapiszAdmina.disabled = false; btnZapiszAdmina.innerText = 'Dodaj';
            if (error) alert("Błąd: " + error.message);
            else {
                if (modalAdmina) modalAdmina.style.display = 'none';
                odswiezTerminarz();
            }
        });
    }

    if (zamknijPodglad) {
        zamknijPodglad.addEventListener('click', () => {
            const modal = document.getElementById('modal-podgladu');
            if (modal) modal.style.display = 'none';
        });
    }

    if (zamknijEdycji) {
        zamknijEdycji.addEventListener('click', () => {
            const modal = document.getElementById('modal-edycji');
            if (modal) modal.style.display = 'none';
        });
    }

    if (btnZapiszEdycje) {
        btnZapiszEdycje.addEventListener('click', async () => {
            if (!edytowaneID) return;
            btnZapiszEdycje.disabled = true; btnZapiszEdycje.innerText = 'Ładowanie...';
            await sb.from('terminarz').update({
                typ: document.getElementById('edit-typ')?.value,
                temat: document.getElementById('edit-temat')?.value.trim(),
                szczegoly: document.getElementById('edit-szczegoly')?.value.trim(),
                priorytet: document.getElementById('edit-priorytet')?.value,
                data_wydarzenia: document.getElementById('edit-data')?.value
            }).eq('id', edytowaneID);
            btnZapiszEdycje.disabled = false; btnZapiszEdycje.innerText = 'Zapisz zmiany';
            const modal = document.getElementById('modal-edycji');
            if (modal) modal.style.display = 'none';
            odswiezTerminarz();
        });
    }

    if (ikonkaPoczty) {
        ikonkaPoczty.addEventListener('click', () => {
            if (modalPoczty) modalPoczty.style.display = 'flex';
            window.zmienSekcje('skrzynka');
        });
    }

    if (zamknijPoczty) {
        zamknijPoczty.addEventListener('click', () => {
            if (modalPoczty) modalPoczty.style.display = 'none';
        });
    }

    if (btnNowaWiadomosc) {
        btnNowaWiadomosc.addEventListener('click', async () => {
            if (!mojaSesja) return;
            const pocztaZawartosc = document.getElementById('poczta-zawartosc');
            if (pocztaZawartosc) pocztaZawartosc.innerHTML = `<div style="text-align:center;color:${KOLORY.tekstPrzygaszony};padding:30px;">Ładowanie…</div>`;
            const { data: users } = await sb.from('profiles').select('*');
            const op = users.filter(u => u.id !== mojaSesja.id).map(u => `<option value="${u.id}">${u.imie} ${u.nazwisko}</option>`).join('');
            if (pocztaZawartosc) {
                pocztaZawartosc.innerHTML = `<h4 style="color:${KOLORY.tekst};">Nowa wiadomość</h4>
                    <div id="podglad-odbiorcy" style="margin-bottom:10px;padding:10px;background:${KOLORY.karta};border-radius:8px;display:flex;align-items:center;gap:10px;">
                        <div id="podglad-odbiorcy-avatar"></div>
                        <div><span id="podglad-odbiorcy-imie" style="font-weight:bold;color:${KOLORY.tekst};"></span> <span id="podglad-odbiorcy-nazwisko" style="color:${KOLORY.tekst};"></span></div>
                    </div>
                    <span style="color:${KOLORY.tekst};">Do: </span><select id="n-o" onchange="window.aktualizujPodgladOdbiorcy()" style="${STYL_INPUT}margin-bottom:10px;">${op}</select>
                    <span style="color:${KOLORY.tekst};">Temat: </span><input type="text" id="n-t" style="${STYL_INPUT}margin-bottom:10px;">
                    <span style="color:${KOLORY.tekst};">Treść: </span><textarea id="n-tr" style="${STYL_INPUT}height:80px;margin-bottom:10px;"></textarea>
                    <button onclick="window.wNPB()" style="width:100%;padding:10px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Wyślij</button>`;
                window.aktualizujPodgladOdbiorcy();
            }
        });
    }

    // Zakładki strony głównej
    const zakladkaGlowna = document.getElementById('zakladka-glowna');
    const zakladkaRanking = document.getElementById('zakladka-ranking');
    if (zakladkaGlowna) zakladkaGlowna.addEventListener('click', () => przelaczZakladke('glowna'));
    if (zakladkaRanking) zakladkaRanking.addEventListener('click', () => przelaczZakladke('ranking'));
}

function przelaczZakladke(nazwa) {
    aktualnaZakladkaGlowna = nazwa;
    const sekcjaGlowna = document.getElementById('sekcja-strona-glowna');
    const sekcjaRanking = document.getElementById('sekcja-ranking');
    const zakladkaGlowna = document.getElementById('zakladka-glowna');
    const zakladkaRanking = document.getElementById('zakladka-ranking');
    if (sekcjaGlowna) sekcjaGlowna.style.display = nazwa === 'glowna' ? 'grid' : 'none';
    if (sekcjaRanking) sekcjaRanking.style.display = nazwa === 'ranking' ? 'block' : 'none';
    if (zakladkaGlowna) { zakladkaGlowna.style.background = nazwa === 'glowna' ? '#007bff' : 'transparent'; zakladkaGlowna.style.color = '#fff'; }
    if (zakladkaRanking) { zakladkaRanking.style.background = nazwa === 'ranking' ? '#007bff' : 'transparent'; zakladkaRanking.style.color = '#fff'; }
}
window.przelaczZakladke = przelaczZakladke;

function ustawFavicon(profil) {
    try {
        let link = document.querySelector("link[rel~='icon']");
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
        link.href = profil && profil.avatar_url ? profil.avatar_url : 'data:,';
    } catch (e) {}
}

// ------------------------------------------------------------
// Funkcje globalne — poczta
// ------------------------------------------------------------
window.zmienSekcje = function(sekcja) {
    aktualnaSekcja = sekcja;
    const btnSkrzynka = document.getElementById('sekcja-skrzynka');
    const btnWyslane = document.getElementById('sekcja-wyslane');
    const btnKosz = document.getElementById('sekcja-kosz');
    const btnAdminWyslane = document.getElementById('sekcja-admin-wyslane');
    [[btnSkrzynka, 'skrzynka'], [btnWyslane, 'wyslane'], [btnKosz, 'kosz'], [btnAdminWyslane, 'admin-wyslane']].forEach(([btn, nazwa]) => {
        if (!btn) return;
        btn.style.background = sekcja === nazwa ? '#007bff' : '#e2e8f0';
        btn.style.color = sekcja === nazwa ? 'white' : '#333';
    });
    const kontener = document.getElementById('poczta-zawartosc');
    if (kontener) kontener.innerHTML = `<div style="text-align:center;color:${KOLORY.tekstPrzygaszony};padding:30px;">Ładowanie…</div>`;
    ladujWiadomosci();
};

async function ladujWiadomosci() {
    if (!mojaSesja) return;
    let query;
    if (aktualnaSekcja === 'skrzynka') {
        query = sb.from('wiadomosci').select('*, profiles:nadawca_id(imie, nazwisko, avatar_url)').eq('odbiorca_id', mojaSesja.id).eq('deleted', false).order('stworzono_gdy', { ascending: false });
    } else if (aktualnaSekcja === 'wyslane') {
        query = sb.from('wiadomosci').select('*, profiles:odbiorca_id(imie, nazwisko, avatar_url)').eq('nadawca_id', mojaSesja.id).eq('deleted', false).eq('jest_broadcast', false).order('stworzono_gdy', { ascending: false });
    } else if (aktualnaSekcja === 'admin-wyslane') {
        query = sb.from('wiadomosci').select('*').eq('nadawca_id', mojaSesja.id).eq('jest_broadcast', true).order('stworzono_gdy', { ascending: false });
    } else {
        query = sb.from('wiadomosci').select('*, profiles:nadawca_id(imie, nazwisko), profiles_odbiorca:odbiorca_id(imie, nazwisko)').or(`nadawca_id.eq.${mojaSesja.id},odbiorca_id.eq.${mojaSesja.id}`).eq('deleted', true).order('deleted_at', { ascending: false });
    }

    const { data, error } = await query;
    const k = document.getElementById('poczta-zawartosc');
    if (!k) return;
    if (error || !data || data.length === 0) {
        k.innerHTML = `<div style="text-align:center;color:${KOLORY.tekstPrzygaszony};padding:40px;">Brak wiadomości.</div>`;
        return;
    }

    if (aktualnaSekcja === 'admin-wyslane') {
        // Grupuj rozesłane do wszystkich wiadomości w jedną pozycję, żeby nie zaśmiecać widoku
        const grupy = new Map();
        data.forEach(m => {
            const klucz = m.broadcast_grupa || (m.temat + '|' + m.stworzono_gdy);
            if (!grupy.has(klucz)) grupy.set(klucz, { ...m, liczbaOdbiorcow: 0 });
            grupy.get(klucz).liczbaOdbiorcow++;
        });
        k.innerHTML = [...grupy.values()].map(m => `<div style="padding:12px;border-radius:10px;margin-bottom:10px;background:${KOLORY.karta};display:flex;align-items:center;justify-content:space-between;">
            <div><strong style="color:${KOLORY.tekst};display:block;font-size:13px;">${m.temat}</strong><span style="font-size:12px;color:${KOLORY.tekstPrzygaszony};">Do wszystkich · ${m.liczbaOdbiorcow} odbiorców</span></div>
            <span style="font-size:11px;color:${KOLORY.tekstPrzygaszony};">${new Date(m.stworzono_gdy).toLocaleDateString('pl-PL')}</span>
        </div>`).join('');
        return;
    }

    k.innerHTML = data.map(m => {
        const nadawca = m.profiles ? m.profiles.imie + ' ' + m.profiles.nazwisko : (aktualnaSekcja === 'wyslane' ? 'Ja' : 'Nieznany');
        const jestWazne = m.priorytet === 'wazne';
        const bg = jestWazne ? '#1f3d24' : KOLORY.karta;
        const borderL = jestWazne ? '4px solid #4caf50' : `1px solid ${KOLORY.obwodka}`;
        const kropkaNowej = (!m.przeczytane && aktualnaSekcja === 'skrzynka') ? `<span style="display:inline-block;width:10px;height:10px;background:#ff9800;border-radius:50%;margin-right:10px;animation:blink 1s infinite;"></span>` : '';
        const clickHandler = aktualnaSekcja === 'kosz' ? `window.podgladWiadomosciKosz(${m.id})` : `window.podgladWiadomosci(${m.id})`;

        return `<div onclick="${clickHandler}" style="padding:12px;border-radius:10px;margin-bottom:10px;cursor:pointer;background:${bg};border-left:${borderL};display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;">${kropkaNowej}<div><strong style="color:${KOLORY.tekst};display:block;font-size:13px;">${nadawca} - ${m.temat}</strong></div></div>
            <span style="font-size:11px;color:${KOLORY.tekstPrzygaszony};">${new Date(m.stworzono_gdy).toLocaleDateString('pl-PL')}</span>
        </div>`;
    }).join('');
}

window.podgladWiadomosci = async function(id) {
    if (!mojaSesja) return;
    const k = document.getElementById('poczta-zawartosc');
    if (k) k.innerHTML = `<div style="text-align:center;color:${KOLORY.tekstPrzygaszony};padding:30px;">Ładowanie…</div>`;
    const { data } = await sb.from('wiadomosci').select('*, profiles:nadawca_id(imie, nazwisko)').eq('id', id).single();
    if (!data) return;
    if (!data.przeczytane && data.odbiorca_id === mojaSesja.id) {
        await sb.from('wiadomosci').update({ przeczytane: true }).eq('id', id);
        sprawdzNoweWiadomosci();
    }
    podgladWiadomoscObj = data;
    const czyMoje = data.nadawca_id === mojaSesja.id; // to Ty jesteś nadawcą — to nie jest Twoja skrzynka odbiorcza
    const odKogo = data.profiles ? data.profiles.imie + ' ' + data.profiles.nazwisko : 'Nieznany';
    const bg = data.priorytet === 'wazne' ? '#1f3d24' : KOLORY.karta;
    if (!k) return;

    const akcje = czyMoje
        ? `<div style="display:flex;gap:5px;"><button onclick="window.zmienSekcje('${aktualnaSekcja}')" style="background:${KOLORY.obwodka};color:white;padding:8px;border:none;border-radius:4px;flex:1;cursor:pointer;">Powrót</button></div>`
        : `<div id="k-odp" style="display:none;margin-bottom:10px;">
                <textarea id="t-odp" placeholder="Wpisz odpowiedź..." style="${STYL_INPUT}height:60px;"></textarea>
                <button onclick="window.wyslijOdpowiedzBaza()" style="background:#28a745;color:white;padding:6px 12px;border:none;border-radius:4px;margin-top:5px;cursor:pointer;">Wyślij odpowiedź</button>
            </div>
            <div style="display:flex;gap:5px;">
                <button onclick="document.getElementById('k-odp').style.display='block'" style="background:#007bff;color:white;padding:8px;border:none;border-radius:4px;flex:1;cursor:pointer;">Odpowiedz</button>
                <button onclick="window.zglosWiadomoscBaza(${data.id})" style="background:#ff9800;color:white;padding:8px;border:none;border-radius:4px;flex:1;cursor:pointer;">Zgłoś</button>
                <button onclick="window.usunWiadomoscBaza(${data.id})" style="background:#dc3545;color:white;padding:8px;border:none;border-radius:4px;flex:1;cursor:pointer;">Usuń</button>
                <button onclick="window.zmienSekcje('skrzynka')" style="background:${KOLORY.obwodka};color:white;padding:8px;border:none;border-radius:4px;flex:1;cursor:pointer;">Powrót</button>
            </div>`;

    k.innerHTML = `
        <div>
            <div style="background:${KOLORY.karta};padding:12px;border-radius:8px;">
                <p style="margin:5px 0;color:${KOLORY.tekst};"><strong>${czyMoje ? 'Do' : 'Od'}:</strong> ${czyMoje ? '' : odKogo}</p>
                <p style="margin:5px 0;color:${KOLORY.tekst};"><strong>Temat:</strong> ${data.temat}</p>
            </div>
            <hr style="border:none;border-top:1px solid ${KOLORY.obwodka};margin:15px 0;">
            <div style="background:${bg};padding:15px;border-radius:8px;margin-top:10px;white-space:pre-wrap;color:${KOLORY.tekst};">
                ${data.tresc}
            </div>
            <hr style="border:none;border-top:1px solid ${KOLORY.obwodka};margin:15px 0;">
            ${akcje}
        </div>`;
};

window.podgladWiadomosciKosz = async function(id) {
    const k = document.getElementById('poczta-zawartosc');
    if (k) k.innerHTML = `<div style="text-align:center;color:${KOLORY.tekstPrzygaszony};padding:30px;">Ładowanie…</div>`;
    const { data } = await sb.from('wiadomosci').select('*, profiles:nadawca_id(imie, nazwisko), profiles_odbiorca:odbiorca_id(imie, nazwisko)').eq('id', id).single();
    if (!data) return;
    const nadawca = data.profiles ? data.profiles.imie + ' ' + data.profiles.nazwisko : 'Nieznany';
    const odbiorca = data.profiles_odbiorca ? data.profiles_odbiorca.imie + ' ' + data.profiles_odbiorca.nazwisko : 'Nieznany';
    if (!k) return;
    k.innerHTML = `
        <div>
            <div style="background:${KOLORY.karta};padding:12px;border-radius:8px;">
                <p style="margin:5px 0;color:${KOLORY.tekst};"><strong>Od:</strong> ${nadawca}</p>
                <p style="margin:5px 0;color:${KOLORY.tekst};"><strong>Do:</strong> ${odbiorca}</p>
                <p style="margin:5px 0;color:${KOLORY.tekst};"><strong>Temat:</strong> ${data.temat}</p>
                <p style="margin:5px 0;font-size:11px;color:${KOLORY.tekstPrzygaszony};">Usunięta: ${new Date(data.deleted_at).toLocaleString('pl-PL')} (zniknie automatycznie po 7 dniach)</p>
            </div>
            <hr style="border:none;border-top:1px solid ${KOLORY.obwodka};margin:15px 0;">
            <div style="background:${KOLORY.karta};padding:15px;border-radius:8px;margin-top:10px;white-space:pre-wrap;color:${KOLORY.tekst};">
                ${data.tresc}
            </div>
            <hr style="border:none;border-top:1px solid ${KOLORY.obwodka};margin:15px 0;">
            <button onclick="window.zmienSekcje('kosz')" style="width:100%;padding:8px;background:${KOLORY.obwodka};color:white;border:none;border-radius:4px;cursor:pointer;">Powrót</button>
        </div>`;
};

window.wyslijOdpowiedzBaza = async function() {
    if (!mojaSesja || !podgladWiadomoscObj) return;
    const m = podgladWiadomoscObj;
    const t = document.getElementById('t-odp')?.value.trim();
    if (!t) return alert("Wpisz treść odpowiedzi!");
    const tO = `Odpowiedź: ${m.temat}`;
    await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: m.nadawca_id, temat: tO, tresc: t, priorytet: 'zwykly' }]);
    window.zmienSekcje('skrzynka');
};

window.usunWiadomoscBaza = async function(id) {
    if (!confirm("Usunąć tę wiadomość? Zostanie ona przeniesiona do kosza i usunie się po 7 dniach AUTOMATYCZNIE! Ta opercacja JEST NIE ODWRACALNA!")) return;
    await sb.from('wiadomosci').update({ deleted: true, deleted_at: new Date().toISOString() }).eq('id', id);
    window.zmienSekcje('skrzynka');
};

window.zglosWiadomoscBaza = async function(id) {
    if (!mojaSesja || !podgladWiadomoscObj) return;
    if (!confirm("Czy napewno chcesz zgłosić tą wiadomość? Ta operacja jest nie odwracalna!")) return;
    const m = podgladWiadomoscObj;
    const { data: mp } = await sb.from('profiles').select('imie, nazwisko').eq('id', mojaSesja.id).single();
    const admin = await znajdzGlownegoAdmina();
    if (!admin) return alert("Nie znaleziono administratora!");
    const nadawca = m.profiles ? m.profiles.imie + ' ' + m.profiles.nazwisko : 'Nieznany';
    await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: admin.id, temat: 'Zgłoszenie wiadomości', tresc: `Od: ${nadawca}\nDo: ${mp.imie} ${mp.nazwisko}\nTreść: "${m.tresc}"\nZgłaszający: ${mp.imie} ${mp.nazwisko}`, priorytet: 'zwykly' }]);
    alert("Zgłoszono wiadomość prawidłowo!");
};

window.aktualizujPodgladOdbiorcy = async function() {
    const sel = document.getElementById('n-o');
    if (!sel || !sel.value) return;
    const { data: profil } = await sb.from('profiles').select('imie, nazwisko, avatar_url').eq('id', sel.value).single();
    const imie = document.getElementById('podglad-odbiorcy-imie');
    const nazwisko = document.getElementById('podglad-odbiorcy-nazwisko');
    const avatar = document.getElementById('podglad-odbiorcy-avatar');
    if (profil) {
        if (imie) imie.innerText = profil.imie || '';
        if (nazwisko) nazwisko.innerText = profil.nazwisko || '';
        if (avatar) avatar.innerHTML = markupAwatara(profil, 40);
    }
};

window.wNPB = async function() {
    if (!mojaSesja) return;
    const o = document.getElementById('n-o')?.value;
    const t = document.getElementById('n-t')?.value.trim();
    const tr = document.getElementById('n-tr')?.value.trim();
    if (!t || !tr) return alert("Wpisz temat i treść!");
    await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: o, temat: t, tresc: tr, priorytet: 'zwykly' }]);
    window.zmienSekcje('wyslane');
};

// ------------------------------------------------------------
// Terminarz
// ------------------------------------------------------------
window.otworzPodgladElementu = async function(id) {
    if (!mojaSesja) return;
    const trescPodgladuWczesnie = document.getElementById('tresc-podgladu');
    const modalPodgladuWczesnie = document.getElementById('modal-podgladu');
    if (modalPodgladuWczesnie) modalPodgladuWczesnie.style.display = 'flex';
    if (trescPodgladuWczesnie) trescPodgladuWczesnie.innerHTML = `<div style="text-align:center;color:${KOLORY.tekstPrzygaszony};padding:30px;"><div class="t7b-spinner"></div><p style="margin-top:10px;">Ładowanie…</p></div>`;

    const { data, error } = await sb.from('terminarz').select('*, profiles(imie, nazwisko)').eq('id', id).single();
    if (error || !data) return;
    const n = data.profiles ? `${data.profiles.imie} ${data.profiles.nazwisko}` : "Nieznany";
    const dUtw = data.stworzono_gdy ? new Date(data.stworzono_gdy).toLocaleString('pl-PL') : "Brak daty";
    const dH = data.dodatkowe_info || "Brak dodatkowych informacji";
    let c = data.priorytet === 'wysoki' ? '#f44336' : (data.priorytet === 'sredni' ? '#ff9800' : '#9e9e9e');
    let tH = data.typ === 'informacja' ? `<p style="color:${KOLORY.tekst};"><strong>Temat:</strong> ${data.temat}</p><p style="color:${KOLORY.tekst};"><strong>Informacja:</strong> ${data.szczegoly}</p>` : `<p style="color:${KOLORY.tekst};"><strong>Przedmiot:</strong> ${data.temat}</p><p style="color:${KOLORY.tekst};"><strong>Dział:</strong> ${data.szczegoly}</p><p style="color:${KOLORY.tekst};"><strong>Informacje dodatkowe:</strong> ${dH}</p>`;
    let pS = data.typ === 'sprawdzian' ? `<div style="display:flex;gap:10px;margin-top:20px;"><button disabled style="flex:1;padding:10px;background:${KOLORY.obwodka};color:#a0aec0;border:none;border-radius:6px;cursor:not-allowed;">Poucz się</button><button disabled style="flex:1;padding:10px;background:${KOLORY.obwodka};color:#a0aec0;border:none;border-radius:6px;cursor:not-allowed;">Powtórka</button></div>` : '';

    let przyciskiAdmina = '';
    if (jestemAdminem) {
        przyciskiAdmina = `<div style="display:flex;gap:10px;margin-top:15px;"><button onclick="window.edytujWpis(${data.id})" style="flex:1;padding:10px;background:#ff9800;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">✏️ Edytuj</button><button onclick="window.usunWpis(${data.id})" style="flex:1;padding:10px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">🗑️ Usuń</button></div>`;
    }

    const trescPodgladu = document.getElementById('tresc-podgladu');
    if (trescPodgladu) {
        trescPodgladu.innerHTML = `<h3 style="text-transform:capitalize;margin-top:0;color:${KOLORY.tekst};">${data.typ}</h3><p style="font-size:12px;color:${KOLORY.tekst};margin:5px 0;">Nadał: ${n} (${dUtw})</p><p style="font-size:12px;color:${KOLORY.tekst};margin:5px 0;">Termin: ${data.data_wydarzenia}</p><p style="color:${c};font-size:12px;margin:5px 0;"><strong>Priorytet:</strong> ${data.priorytet.toUpperCase()}</p><hr style="border:none;border-top:1px solid ${KOLORY.obwodka};margin:15px 0;">${tH}${pS}${przyciskiAdmina}`;
    }
};

window.edytujWpis = async function(id) {
    const { data } = await sb.from('terminarz').select('*').eq('id', id).single();
    if (!data) return;
    edytowaneID = id;
    const editTyp = document.getElementById('edit-typ');
    const editTemat = document.getElementById('edit-temat');
    const editSzczegoly = document.getElementById('edit-szczegoly');
    const editPriorytet = document.getElementById('edit-priorytet');
    const editData = document.getElementById('edit-data');
    if (editTyp) editTyp.value = data.typ;
    if (editTemat) editTemat.value = data.temat;
    if (editSzczegoly) editSzczegoly.value = data.szczegoly;
    if (editPriorytet) editPriorytet.value = data.priorytet;
    if (editData) editData.value = data.data_wydarzenia;
    const modalPodgladu = document.getElementById('modal-podgladu');
    const modalEdycji = document.getElementById('modal-edycji');
    if (modalPodgladu) modalPodgladu.style.display = 'none';
    if (modalEdycji) modalEdycji.style.display = 'flex';
};

window.usunWpis = async function(id) {
    if (!confirm("Usunąć ten wpis z terminarza?")) return;
    await sb.from('terminarz').delete().eq('id', id);
    const modalPodgladu = document.getElementById('modal-podgladu');
    if (modalPodgladu) modalPodgladu.style.display = 'none';
    odswiezTerminarz();
};

async function odswiezTerminarz() {
    const { data, error } = await sb.from('terminarz').select('*, profiles(imie, nazwisko)').order('data_wydarzenia', { ascending: true });
    const k = document.getElementById('kontener-kafelkow');
    if (!k) return;
    if (error || !data || data.length === 0) {
        k.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:${KOLORY.tekstPrzygaszony};padding:40px;">Brak wydarzeń.</div>`;
        return;
    }
    k.innerHTML = data.map(w => {
        let c = w.priorytet === 'wysoki' ? '#f44336' : (w.priorytet === 'sredni' ? '#ff9800' : '#9e9e9e');
        return `<div style="background:${KOLORY.karta};border:1px solid ${KOLORY.obwodka};border-radius:12px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;border-left:6px solid ${c};"><div><h4 style="margin:0 0 5px 0;color:${KOLORY.tekst};">${w.typ==='informacja'?w.temat:w.typ.toUpperCase()+': '+w.temat}</h4><span style="font-size:12px;font-weight:bold;color:${c};">${w.priorytet}</span></div><button onclick="window.otworzPodgladElementu(${w.id})" style="margin-top:15px;width:100%;padding:8px;background:#007bff;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">Sprawdź</button></div>`;
    }).join('');
}

// ------------------------------------------------------------
// Ustawienia profilu
// ------------------------------------------------------------
async function zaladujUstawienia() {
    if (!mojaSesja) return;
    const { data: profil } = await sb.from('profiles').select('*').eq('id', mojaSesja.id).single();
    if (profil) {
        const ustAwatar = document.getElementById('ust-awatar-podglad-kontener');
        if (ustAwatar) ustAwatar.innerHTML = markupAwatara(profil, 80);
    }
}

window.usunAwatar = async function() {
    if (!mojaSesja) return;
    await sb.from('profiles').update({ avatar_url: null }).eq('id', mojaSesja.id);
    if (mojProfil) mojProfil.avatar_url = null;
    const podglad = document.getElementById('ust-awatar-podglad-kontener');
    if (podglad) podglad.innerHTML = markupAwatara({ imie: mojProfil?.imie }, 80);
    const ikonka = document.getElementById('ikonka-profilu');
    if (ikonka) ikonka.innerHTML = markupAwatara({ imie: mojProfil?.imie }, 45);
    alert("Ikona usunięta!");
};

window.zmienHaslo = async function() {
    if (!mojaSesja) return;
    const s = document.getElementById('ust-stare-haslo')?.value;
    const n = document.getElementById('ust-nowe-haslo')?.value;
    if (!s || !n) return alert("Wypełnij oba pola!");
    const { data: profil } = await sb.from('profiles').select('*').eq('id', mojaSesja.id).single();
    if (!profil) return alert("Błąd profilu!");
    const { error } = await sb.auth.signInWithPassword({ email: generujFakeEmail(profil.imie, profil.nazwisko), password: s });
    if (error) return alert("Błędne stare hasło!");
    await sb.auth.updateUser({ password: n });
    alert("Hasło zmienione!");
};

window.prosbaOZmianeHasla = async function() {
    if (!mojaSesja) return;
    const adminData = await znajdzGlownegoAdmina();
    if (!adminData) return alert("Nie znaleziono administratora!");
    const { data: mp } = await sb.from('profiles').select('imie, nazwisko').eq('id', mojaSesja.id).single();
    await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: adminData.id, temat: 'Prośba o zmianę hasła', tresc: `Użytkownik ${mp.imie} ${mp.nazwisko} prosi o zmianę hasła.`, priorytet: 'zwykly' }]);
    alert("Prośba wysłana!");
};

window.usunMojeKonto = async function() {
    if (!mojaSesja) return;
    if (!confirm("Czy na pewno chcesz bezpowrotnie usunąć swoje konto?")) return;
    const haslo = prompt("Wpisz swoje hasło aby potwierdzić:");
    if (!haslo) return;
    const { data: profil } = await sb.from('profiles').select('*').eq('id', mojaSesja.id).single();
    if (!profil) return;
    const { error: loginError } = await sb.auth.signInWithPassword({ email: generujFakeEmail(profil.imie, profil.nazwisko), password: haslo });
    if (loginError) return alert("Błędne hasło!");
    await sb.from('profiles').delete().eq('id', mojaSesja.id);
    await sb.auth.signOut();
    window.location.href = 'https://8b3pp.github.io/K/logowanie.html';
};

async function sprawdzNoweWiadomosci() {
    if (!mojaSesja) return;
    const { data } = await sb.from('wiadomosci').select('id, priorytet').eq('odbiorca_id', mojaSesja.id).eq('przeczytane', false).eq('deleted', false);
    const maNowe = data && data.length > 0;
    const maWazne = data && data.some(m => m.priorytet === 'wazne');
    const powiadomienie = document.getElementById('poczta-powiadomienie');
    const chmurka = document.getElementById('poczta-wazne-chmurka');
    if (powiadomienie) powiadomienie.style.display = maNowe ? 'block' : 'none';
    if (chmurka) chmurka.style.display = maWazne ? 'block' : 'none';
}

// ------------------------------------------------------------
// Panel ogłoszeń administracji (tworzenie / kończenie)
// ------------------------------------------------------------
async function otworzPanelOgloszen() {
    let modal = document.getElementById('modal-panel-ogloszen');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-panel-ogloszen';
        modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);backdrop-filter:blur(5px);z-index:2900;align-items:center;justify-content:center;';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `<div style="background:${KOLORY.panel};width:100%;max-width:500px;margin:20px;padding:25px;border-radius:16px;max-height:85vh;overflow-y:auto;">
        <h3 style="color:${KOLORY.tekst};margin-top:0;">Ogłoszenia dla wszystkich</h3>
        <div style="margin-bottom:12px;"><label style="${STYL_LABEL}">Tytuł</label><input type="text" id="ogl-tytul" style="${STYL_INPUT}"></div>
        <div style="margin-bottom:12px;"><label style="${STYL_LABEL}">Opis</label><textarea id="ogl-opis" style="${STYL_INPUT}height:80px;"></textarea></div>
        <div style="margin-bottom:15px;display:flex;align-items:center;gap:8px;"><input type="checkbox" id="ogl-tylko-raz" checked style="width:18px;height:18px;"><label for="ogl-tylko-raz" style="color:${KOLORY.tekst};margin:0;">Pokaż tylko raz każdej osobie</label></div>
        <button id="btn-ogl-dodaj" style="width:100%;padding:12px;background:#28a745;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Opublikuj</button>
        <hr style="border:none;border-top:1px solid ${KOLORY.obwodka};margin:20px 0;">
        <div id="ogl-lista"><div style="text-align:center;color:${KOLORY.tekstPrzygaszony};">Ładowanie…</div></div>
        <button id="btn-ogl-zamknij" style="width:100%;padding:10px;margin-top:15px;background:${KOLORY.obwodka};color:white;border:none;border-radius:8px;cursor:pointer;">Zamknij</button>
    </div>`;
    modal.style.display = 'flex';
    document.getElementById('btn-ogl-zamknij').addEventListener('click', () => modal.style.display = 'none');
    document.getElementById('btn-ogl-dodaj').addEventListener('click', async () => {
        const tytul = document.getElementById('ogl-tytul').value.trim();
        const opis = document.getElementById('ogl-opis').value.trim();
        const tylkoRaz = document.getElementById('ogl-tylko-raz').checked;
        if (!tytul || !opis) return alert('Uzupełnij tytuł i opis!');
        await sb.from('powiadomienia_admina').insert([{ tytul, opis, tylko_raz: tylkoRaz, aktywne: true, stworzono_przez: mojaSesja.id }]);
        odswiezListeOgloszen();
    });
    odswiezListeOgloszen();
}

async function odswiezListeOgloszen() {
    const { data } = await sb.from('powiadomienia_admina').select('*').order('stworzono_gdy', { ascending: false });
    const lista = document.getElementById('ogl-lista');
    if (!lista) return;
    if (!data || data.length === 0) { lista.innerHTML = `<p style="color:${KOLORY.tekstPrzygaszony};text-align:center;">Brak ogłoszeń.</p>`; return; }
    lista.innerHTML = data.map(o => `<div style="background:${KOLORY.karta};padding:10px;border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div><strong style="color:${KOLORY.tekst};">${o.tytul}</strong><br><span style="font-size:12px;color:${o.aktywne ? '#4caf50' : '#f44336'};">${o.aktywne ? 'Aktywne' : 'Zakończone'}</span></div>
        ${o.aktywne ? `<button onclick="window.zakonczOgloszenie(${o.id})" style="padding:6px 10px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Zakończ</button>` : ''}
    </div>`).join('');
}

window.zakonczOgloszenie = async function(id) {
    await sb.from('powiadomienia_admina').update({ aktywne: false }).eq('id', id);
    odswiezListeOgloszen();
};

// ------------------------------------------------------------
// RANKING
// ------------------------------------------------------------
async function odswiezRankingSekcje() {
    const sekcja = document.getElementById('sekcja-ranking');
    if (!sekcja) return;
    sekcja.innerHTML = `<div style="text-align:center;color:${KOLORY.tekstPrzygaszony};padding:30px;">Ładowanie rankingu…</div>`;
    try {
        const { data: rankingi } = await sb.from('rankingi').select('*').eq('aktywny', true).order('stworzono_gdy', { ascending: false }).limit(1);
        aktywnyRanking = rankingi && rankingi.length ? rankingi[0] : null;
    } catch (e) {
        sekcja.innerHTML = `<div style="text-align:center;color:${KOLORY.tekstPrzygaszony};padding:30px;">Ranking jest niedostępny — uruchom migracja_supabase.sql w Supabase.</div>`;
        return;
    }

    const przyciskAdmina = jestemAdminem ? `<button onclick="window.otworzPanelRankingu()" style="margin-bottom:15px;padding:10px 16px;background:#28a745;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">⚙️ Zarządzaj rankingiem</button>` : '';

    if (!aktywnyRanking) {
        sekcja.innerHTML = `${przyciskAdmina}<div style="background:${KOLORY.panel};padding:30px;border-radius:16px;text-align:center;color:${KOLORY.tekstPrzygaszony};">Obecnie nie trwa żaden ranking.</div>`;
        return;
    }

    // sprawdź czy istnieje bramka (sprawdzian z minionym terminem podania oceny)
    const { data: bramkaWpisy } = await sb.from('terminarz').select('*').eq('ranking_id', aktywnyRanking.id).eq('liczy_do_rankingu', true).not('termin_podania_oceny', 'is', null);
    const teraz = new Date();
    const bramka = (bramkaWpisy || []).find(w => new Date(w.termin_podania_oceny) <= teraz);

    const { data: mojUdzial } = await sb.from('ranking_uczestnicy').select('*').eq('ranking_id', aktywnyRanking.id).eq('user_id', mojaSesja.id).maybeSingle ? await sb.from('ranking_uczestnicy').select('*').eq('ranking_id', aktywnyRanking.id).eq('user_id', mojaSesja.id).limit(1) : { data: [] };
    const mojWpis = Array.isArray(mojUdzial) ? mojUdzial[0] : (mojUdzial && mojUdzial[0]);

    if (bramka && (!mojWpis || mojWpis.ocena === null || mojWpis.ocena === undefined)) {
        sekcja.innerHTML = `${przyciskAdmina}<div style="background:${KOLORY.panel};padding:30px;border-radius:16px;">
            <h3 style="color:${KOLORY.tekst};margin-top:0;">Zanim zobaczysz ranking…</h3>
            <p style="color:${KOLORY.tekstPrzygaszony};">Podaj swoją ocenę z: <strong>${bramka.temat}</strong> (${bramka.szczegoly || ''}). Wpisz 0, jeśli Cię nie było.</p>
            <p style="color:#ff9800;font-size:13px;">Podanie nieprawdziwej oceny psuje zabawę wszystkim — bądź fair. Administracja może to zweryfikować.</p>
            <div style="display:flex;gap:8px;margin:15px 0;">
                <select id="ranking-moja-ocena" style="${STYL_INPUT}">
                    <option value="0">0 (nieobecność)</option>
                    <option value="1">1</option><option value="2">2</option><option value="3">3</option>
                    <option value="4">4</option><option value="5">5</option><option value="6">6</option>
                </select>
                <button onclick="window.wyslijOceneRankingu(${aktywnyRanking.id})" style="padding:10px 16px;background:#007bff;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Wyślij</button>
            </div>
            <button onclick="window.pomocnikRankinguBezOceny(${aktywnyRanking.id})" style="width:100%;padding:10px;background:${KOLORY.obwodka};color:white;border:none;border-radius:8px;cursor:pointer;">Jeszcze nie znam oceny</button>
        </div>`;
        return;
    }

    if (mojWpis && (mojWpis.ocena === null || mojWpis.ocena === undefined)) {
        sekcja.innerHTML = `${przyciskAdmina}<div style="background:${KOLORY.panel};padding:30px;border-radius:16px;text-align:center;">
            <h3 style="color:${KOLORY.tekst};">Ranking jest ukryty do czasu podania oceny</h3>
            <button onclick="window.pokazFormularzOceny(${aktywnyRanking.id})" style="margin-top:10px;padding:10px 16px;background:#007bff;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Dodaj ocenę</button>
        </div>`;
        return;
    }

    // pokaż pełny ranking
    const { data: uczestnicy } = await sb.from('ranking_uczestnicy').select('*, profiles(imie, nazwisko, avatar_url)').eq('ranking_id', aktywnyRanking.id).eq('wyrzucony', false).order('punkty', { ascending: false }).limit(20);
    const listaHtml = (uczestnicy || []).map((u, idx) => `<div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid ${KOLORY.obwodka};">
        <strong style="width:24px;color:${KOLORY.tekstPrzygaszony};">${idx + 1}.</strong>
        ${markupAwatara(u.profiles || {}, 36)}
        <span style="flex:1;color:${KOLORY.tekst};">${u.profiles ? u.profiles.imie + ' ' + u.profiles.nazwisko : 'Nieznany'}</span>
        <strong style="color:#38BDF8;">${u.punkty} pkt</strong>
        ${jestemAdminem ? `<div style="position:relative;"><span onclick="window.pokazMenuKick(event, ${u.id})" style="cursor:pointer;padding:0 6px;color:${KOLORY.tekstPrzygaszony};">⋮</span></div>` : ''}
    </div>`).join('');

    const twojaPozycja = mojWpis ? `<div style="background:${KOLORY.karta};padding:16px;border-radius:12px;margin-bottom:15px;text-align:center;"><p style="margin:0;color:${KOLORY.tekstPrzygaszony};">Twój wynik</p><p style="margin:5px 0 0;font-size:26px;color:#38BDF8;font-weight:bold;">${mojWpis.punkty} pkt</p></div>`
        : `<div style="background:${KOLORY.karta};padding:16px;border-radius:12px;margin-bottom:15px;text-align:center;">
            <p style="color:${KOLORY.tekstPrzygaszony};margin-top:0;">Nie bierzesz jeszcze udziału.</p>
            <div style="display:flex;gap:8px;">
                <select id="ranking-moja-ocena-2" style="${STYL_INPUT}"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option></select>
                <button onclick="window.wyslijOceneRankingu(${aktywnyRanking.id}, 'ranking-moja-ocena-2')" style="padding:10px 16px;background:#007bff;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Dołącz</button>
            </div>
        </div>`;

    sekcja.innerHTML = `${przyciskAdmina}
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;">
        <div style="background:${KOLORY.panel};padding:20px;border-radius:16px;">
            <h3 style="color:${KOLORY.tekst};margin-top:0;">${aktywnyRanking.nazwa} — TOP 20</h3>
            ${aktywnyRanking.opis_nagrod ? `<p style="color:${KOLORY.tekstPrzygaszony};font-size:13px;">${aktywnyRanking.opis_nagrod}</p>` : ''}
            ${listaHtml || `<p style="color:${KOLORY.tekstPrzygaszony};text-align:center;">Nikt jeszcze nie dołączył.</p>`}
        </div>
        <div>${twojaPozycja}
            <div style="background:${KOLORY.panel};padding:16px;border-radius:12px;font-size:13px;color:${KOLORY.tekstPrzygaszony};">
                ${aktywnyRanking.data_konca ? `<p>Koniec: ${formatujDate(aktywnyRanking.data_konca)}</p>` : ''}
                ${aktywnyRanking.limit_uczestnikow ? `<p>Limit uczestników: ${aktywnyRanking.limit_uczestnikow}</p>` : ''}
                <p>Wygrane miejsca: ${aktywnyRanking.miejsce_wygrana_od || 1}–${aktywnyRanking.miejsce_wygrana_do || 3}</p>
            </div>
        </div>
    </div>`;
}
window.pokazFormularzOceny = function(rankingId) { odswiezRankingSekcjeZOcena(rankingId); };
async function odswiezRankingSekcjeZOcena(rankingId) {
    const sekcja = document.getElementById('sekcja-ranking');
    sekcja.innerHTML = `<div style="background:${KOLORY.panel};padding:30px;border-radius:16px;text-align:center;">
        <p style="color:${KOLORY.tekstPrzygaszony};">Podaj swoją ocenę:</p>
        <div style="display:flex;gap:8px;justify-content:center;max-width:300px;margin:10px auto;">
            <select id="ranking-moja-ocena" style="${STYL_INPUT}"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option></select>
            <button onclick="window.wyslijOceneRankingu(${rankingId})" style="padding:10px 16px;background:#007bff;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Wyślij</button>
        </div>
    </div>`;
}
window.pomocnikRankinguBezOceny = async function(rankingId) {
    await sb.from('ranking_uczestnicy').upsert([{ ranking_id: rankingId, user_id: mojaSesja.id, ocena: null, punkty: 0 }], { onConflict: 'ranking_id,user_id' });
    odswiezRankingSekcje();
};
window.wyslijOceneRankingu = async function(rankingId, idPola) {
    const sel = document.getElementById(idPola || 'ranking-moja-ocena');
    if (!sel) return;
    const ocena = parseFloat(sel.value);
    const { data: punktacja } = await sb.from('ranking_punktacja').select('*').eq('ranking_id', rankingId).eq('ocena', ocena).maybeSingle ? await sb.from('ranking_punktacja').select('*').eq('ranking_id', rankingId).eq('ocena', ocena) : { data: [] };
    const wiersz = Array.isArray(punktacja) ? punktacja[0] : null;
    const punkty = wiersz ? wiersz.punkty : 0;
    await sb.from('ranking_uczestnicy').upsert([{ ranking_id: rankingId, user_id: mojaSesja.id, ocena, punkty }], { onConflict: 'ranking_id,user_id' });
    odswiezRankingSekcje();
};
window.pokazMenuKick = async function(ev, uczestnikId) {
    ev.stopPropagation();
    const powod = prompt('Powód wyrzucenia z rankingu:');
    if (powod === null) return;
    await sb.from('ranking_uczestnicy').update({ wyrzucony: true, powod_wyrzucenia: powod }).eq('id', uczestnikId);
    odswiezRankingSekcje();
};

// Panel administracyjny rankingu
window.otworzPanelRankingu = async function() {
    let modal = document.getElementById('modal-panel-rankingu');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-panel-rankingu';
        modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);backdrop-filter:blur(5px);z-index:2950;align-items:center;justify-content:center;';
        document.body.appendChild(modal);
    }
    const opcjeTerminarza = await sb.from('terminarz').select('id, temat, typ').in('typ', ['sprawdzian', 'kartkowka']);
    const opcjeHtml = (opcjeTerminarza.data || []).map(t => `<option value="${t.id}">${t.typ}: ${t.temat}</option>`).join('');
    modal.innerHTML = `<div style="background:${KOLORY.panel};width:100%;max-width:520px;margin:20px;padding:25px;border-radius:16px;max-height:85vh;overflow-y:auto;">
        <h3 style="color:${KOLORY.tekst};margin-top:0;">Zarządzanie rankingiem</h3>
        ${aktywnyRanking ? `<p style="color:${KOLORY.tekstPrzygaszony};">Aktywny: <strong>${aktywnyRanking.nazwa}</strong></p><button onclick="window.zakonczRanking(${aktywnyRanking.id})" style="width:100%;padding:10px;background:#dc3545;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;margin-bottom:15px;">Zakończ ranking</button><hr style="border:none;border-top:1px solid ${KOLORY.obwodka};margin:15px 0;">` : ''}
        <p style="color:${KOLORY.tekstPrzygaszony};">${aktywnyRanking ? 'Utwórz nowy (zastąpi bieżący po jego zakończeniu):' : 'Utwórz nowy ranking:'}</p>
        <div style="margin-bottom:10px;"><label style="${STYL_LABEL}">Nazwa</label><input id="rank-nazwa" style="${STYL_INPUT}"></div>
        <div style="display:flex;gap:10px;">
            <div style="flex:1;"><label style="${STYL_LABEL}">Start</label><input type="datetime-local" id="rank-start" style="${STYL_INPUT}"></div>
            <div style="flex:1;"><label style="${STYL_LABEL}">Koniec</label><input type="datetime-local" id="rank-koniec" style="${STYL_INPUT}"></div>
        </div>
        <div style="margin:10px 0;"><label style="${STYL_LABEL}">Limit uczestników (opcjonalnie)</label><input type="number" id="rank-limit" style="${STYL_INPUT}"></div>
        <div style="display:flex;gap:10px;">
            <div style="flex:1;"><label style="${STYL_LABEL}">Wygrana od miejsca</label><input type="number" id="rank-wygrana-od" value="1" style="${STYL_INPUT}"></div>
            <div style="flex:1;"><label style="${STYL_LABEL}">Wygrana do miejsca</label><input type="number" id="rank-wygrana-do" value="3" style="${STYL_INPUT}"></div>
        </div>
        <div style="margin:10px 0;"><label style="${STYL_LABEL}">Opis nagród / zasad</label><textarea id="rank-opis" style="${STYL_INPUT}height:60px;"></textarea></div>
        <div style="margin:10px 0;"><label style="${STYL_LABEL}">Powiąż ze sprawdzianem/kartkówką z terminarza (opcjonalnie)</label><select id="rank-wpis-terminarz" style="${STYL_INPUT}"><option value="">-- brak --</option>${opcjeHtml}</select></div>
        <p style="color:${KOLORY.tekstPrzygaszony};font-size:13px;margin-top:15px;">Punkty za oceny (0 = nieobecność, może być ujemne):</p>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:15px;">
            ${[0,1,2,3,4,5,6].map(o => `<div><label style="${STYL_LABEL}">Ocena ${o}</label><input type="number" id="rank-pkt-${o}" value="0" style="${STYL_INPUT}"></div>`).join('')}
        </div>
        <button id="btn-rank-utworz" style="width:100%;padding:12px;background:#28a745;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Utwórz ranking</button>
        <button id="btn-rank-zamknij" style="width:100%;padding:10px;margin-top:10px;background:${KOLORY.obwodka};color:white;border:none;border-radius:8px;cursor:pointer;">Zamknij</button>
    </div>`;
    modal.style.display = 'flex';
    document.getElementById('btn-rank-zamknij').addEventListener('click', () => modal.style.display = 'none');
    document.getElementById('btn-rank-utworz').addEventListener('click', async () => {
        const nazwa = document.getElementById('rank-nazwa').value.trim();
        if (!nazwa) return alert('Podaj nazwę rankingu!');
        const btn = document.getElementById('btn-rank-utworz');
        btn.disabled = true; btn.innerText = 'Ładowanie...';
        const { data: nowy, error } = await sb.from('rankingi').insert([{
            nazwa,
            aktywny: true,
            data_startu: document.getElementById('rank-start').value ? new Date(document.getElementById('rank-start').value).toISOString() : null,
            data_konca: document.getElementById('rank-koniec').value ? new Date(document.getElementById('rank-koniec').value).toISOString() : null,
            limit_uczestnikow: parseInt(document.getElementById('rank-limit').value) || null,
            miejsce_wygrana_od: parseInt(document.getElementById('rank-wygrana-od').value) || 1,
            miejsce_wygrana_do: parseInt(document.getElementById('rank-wygrana-do').value) || 3,
            opis_nagrod: document.getElementById('rank-opis').value.trim() || null,
            stworzono_przez: mojaSesja.id
        }]).select().single();
        btn.disabled = false; btn.innerText = 'Utwórz ranking';
        if (error || !nowy) return alert('Błąd: ' + (error ? error.message : 'nieznany'));

        const punktyWiersze = [0,1,2,3,4,5,6].map(o => ({ ranking_id: nowy.id, ocena: o, punkty: parseFloat(document.getElementById('rank-pkt-' + o).value) || 0 }));
        await sb.from('ranking_punktacja').insert(punktyWiersze);

        const powiazanyWpis = document.getElementById('rank-wpis-terminarz').value;
        if (powiazanyWpis) {
            await sb.from('terminarz').update({ liczy_do_rankingu: true, ranking_id: nowy.id }).eq('id', powiazanyWpis);
        }
        modal.style.display = 'none';
        odswiezRankingSekcje();
    });
};

window.zakonczRanking = async function(id) {
    if (!confirm('Zakończyć ranking? Punkty uczestników zostaną wyzerowane przy starcie kolejnego rankingu.')) return;
    await sb.from('rankingi').update({ aktywny: false }).eq('id', id);
    const modal = document.getElementById('modal-panel-rankingu');
    if (modal) modal.style.display = 'none';
    odswiezRankingSekcje();
};

// ------------------------------------------------------------
// Uruchom interfejs
// ------------------------------------------------------------
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _uruchomInterfejs);
} else {
    _uruchomInterfejs();
}
