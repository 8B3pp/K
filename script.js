// Inicjalizacja Supabase
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
                data: { url: data.url || '/K/index.html' }
            };
            event.waitUntil(self.registration.showNotification(data.title || 'Terminarz 6B', options));
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

// Stan aplikacji
const LISTA_ADMINOW = ["Hubert_Bereźnicki", "Ewa_Pachana", "iwo_nowacki"];
let aktualnaSekcja = 'skrzynka';
let edytowaneID = null;
let mojaSesja = null;
let podgladWiadomoscObj = null;

// Funkcje pomocnicze
function wyslijPowiadomienie(tytul, tresc) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(tytul, { body: tresc, icon: '/K/icon.png' });
    }
}

function generujFakeEmail(imie, nazwisko) {
    let czysteImie = imie.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]/g, '');
    let czysteNazwisko = nazwisko.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]/g, '');
    return czysteImie + czysteNazwisko + '@klasa.com';
}

// Sprawdzenie autoryzacji - POPRAWIONE ŚCIEŻKI
sb.auth.onAuthStateChange((event, session) => {
    const obecnaStrona = window.location.pathname.toLowerCase();
    if (session) {
        if (event === 'SIGNED_IN') {
            if (obecnaStrona.includes('rejestracja')) {
                alert("Poprawnie zarejestrowano i zalogowano!");
                window.location.href = '/K/index.html';
            } else if (obecnaStrona.includes('logowanie')) {
                alert("Poprawnie zalogowano!");
                window.location.href = '/K/index.html';
            }
        }
    } else {
        if (obecnaStrona.includes('index') || obecnaStrona === '/' || obecnaStrona === '/K/' || obecnaStrona.endsWith('/K/')) {
            window.location.href = '/K/logowanie.html';
        }
    }
});

// Główna funkcja interfejsu
function _uruchomInterfejs() {
    if (typeof window.supabaseClient === 'undefined') {
        setTimeout(_uruchomInterfejs, 100);
        return;
    }

    if (!document.getElementById('kontener-kafelkow')) return;

    sb.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) {
            window.location.href = '/K/logowanie.html';
            return;
        }
        mojaSesja = user;

        const { data: profil } = await sb.from('profiles').select('*').eq('id', user.id).single();
        if (profil) {
            const ikonka = document.getElementById('ikonka-profilu');
            const pelneNazwisko = document.getElementById('profil-pelne-nazwisko');
            if (ikonka) ikonka.innerText = profil.imie ? profil.imie.charAt(0).toUpperCase() : 'U';
            if (pelneNazwisko) pelneNazwisko.innerText = (profil.imie || '') + " " + (profil.nazwisko || '');

            const klucz1 = profil.imie + "_" + profil.nazwisko;
            const klucz2 = profil.imie.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l") + "_" + profil.nazwisko.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");

            if (LISTA_ADMINOW.includes(klucz1) || LISTA_ADMINOW.includes(klucz2)) {
                const plusik = document.getElementById('plusik-admina');
                const mlotek = document.getElementById('mlotek-admina');
                if (plusik) plusik.style.display = 'flex';
                if (mlotek) mlotek.style.display = 'flex';
            }
        }

        odswiezTerminarz();
        sprawdzNoweWiadomosci();
    });

    sb.channel('zmiany-interfejsu')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'terminarz' }, () => {
            odswiezTerminarz();
            wyslijPowiadomienie('Nowość w terminarzu!', 'Pojawiło się nowe wydarzenie.');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wiadomosci' }, () => {
            sprawdzNoweWiadomosci();
        })
        .subscribe();

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
            window.location.href = '/K/logowanie.html';
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
            const reader = new FileReader();
            reader.onload = async function(ev) {
                await sb.from('profiles').update({ avatar_url: ev.target.result }).eq('id', mojaSesja.id);
                const podglad = document.getElementById('ust-awatar-podglad');
                if (podglad) {
                    podglad.src = ev.target.result;
                    podglad.style.display = 'inline-block';
                }
                alert("Ikona zaktualizowana!");
            };
            reader.readAsDataURL(file);
        });
    }

    // Przycisk młotka admina
    const przyciskAdminPanel = document.createElement('div');
    przyciskAdminPanel.id = 'mlotek-admina';
    przyciskAdminPanel.style.cssText = 'display:none; cursor:pointer; width:45px; height:45px; background:#dc3545; color:white; border-radius:50%; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 10px rgba(220,53,69,0.3);';
    przyciskAdminPanel.innerHTML = '&#128296;';
    przyciskAdminPanel.title = 'Panel administracyjny';
    if (plusikAdmina && plusikAdmina.parentNode) {
        plusikAdmina.parentNode.insertBefore(przyciskAdminPanel, plusikAdmina.nextSibling);
    }

    przyciskAdminPanel.addEventListener('click', async () => {
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

            if (typ === 'ban') {
                const doKiedy = new Date(Date.now() + czas * 60000).toISOString();
                await sb.from('bany').insert([{ user_id: userId, zbanowany_przez: mojaSesja.id, powod, do_kiedy: doKiedy, typ: 'wiadomosci' }]);
                await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: userId, temat: 'Zostałeś zbanowany', tresc: `Zostałeś zbanowany.\nPrzez: administrator\nNa: ${czas} min\nPowód: ${powod}\nKara wygasa: ${new Date(doKiedy).toLocaleString('pl-PL')}`, priorytet: 'zwykly' }]);
                alert("Użytkownik zbanowany!");
            } else if (typ === 'usun') {
                await sb.from('profiles').delete().eq('id', userId);
                alert("Konto usunięte!");
            } else if (typ === 'wiadomosc') {
                const temat = document.getElementById('admin-temat-wiadomosci')?.value.trim();
                const priorytet = document.getElementById('admin-priorytet')?.value;
                if (!temat) return alert("Wpisz temat!");

                if (userId === 'all') {
                    const { data: users } = await sb.from('profiles').select('id');
                    const progressDiv = document.getElementById('admin-progress');
                    if (progressDiv) progressDiv.style.display = 'block';
                    for (let i = 0; i < users.length; i++) {
                        if (progressDiv) progressDiv.innerText = `Wysyłanie: (${i+1}/${users.length})`;
                        await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: users[i].id, temat, tresc: powod, priorytet }]);
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
            const modal = document.getElementById('modal-administracyjny');
            if (modal) modal.style.display = 'none';
        });
    }

    // Formularz dodawania
    const priorytetSelect = `<div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Priorytet</label><select id="form-priorytet" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;"><option value="normalny">Normalny</option><option value="sredni">Średni</option><option value="wysoki">Wysoki</option></select></div>`;

    function renderujPolaFormularza() {
        const kontenerPol = document.getElementById('pola-dynamiczne');
        if (!kontenerPol || !formTyp) return;
        const t = formTyp.value;
        if (t === 'informacja') {
            kontenerPol.innerHTML = `<div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Temat</label><input type="text" id="form-temat" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;"></div><div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Treść</label><textarea id="form-szczegoly" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;height:80px;"></textarea></div>${priorytetSelect}<div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Data</label><input type="date" id="form-data" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;"></div>`;
        } else {
            const et = t === 'sprawdzian' ? 'Jaki dział' : 'Jaki temat/dział';
            kontenerPol.innerHTML = `<div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Przedmiot</label><input type="text" id="form-temat" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;"></div><div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">${et}</label><input type="text" id="form-szczegoly" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;"></div>${priorytetSelect}<div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Dodatkowe info</label><textarea id="form-dodatkowe" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;height:60px;"></textarea></div><div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Kiedy</label><input type="date" id="form-data" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;"></div>`;
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

            if (!temat || !szczegoly || !dataW) return alert("Wypełnij wymagane pola!");
            const { error } = await sb.from('terminarz').insert([{ nadawca_id: mojaSesja.id, typ, temat, szczegoly, priorytet, data_wydarzenia: dataW, dodatkowe_info: dodatkowe || null }]);
            if (error) alert("Błąd: " + error.message);
            else {
                alert("Dodano!");
                if (modalAdmina) modalAdmina.style.display = 'none';
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
            await sb.from('terminarz').update({
                typ: document.getElementById('edit-typ')?.value,
                temat: document.getElementById('edit-temat')?.value.trim(),
                szczegoly: document.getElementById('edit-szczegoly')?.value.trim(),
                priorytet: document.getElementById('edit-priorytet')?.value,
                data_wydarzenia: document.getElementById('edit-data')?.value
            }).eq('id', edytowaneID);
            alert("Zapisano zmiany!");
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
            const { data: users } = await sb.from('profiles').select('*');
            const op = users.filter(u => u.id !== mojaSesja.id).map(u => `<option value="${u.id}">${u.imie} ${u.nazwisko}</option>`).join('');
            const pocztaZawartosc = document.getElementById('poczta-zawartosc');
            if (pocztaZawartosc) {
                pocztaZawartosc.innerHTML = `<h4>Nowa wiadomość</h4>
                    <div id="podglad-odbiorcy" style="margin-bottom:10px;padding:10px;background:#f8f9fa;border-radius:8px;display:flex;align-items:center;gap:10px;">
                        <img id="podglad-odbiorcy-avatar" src="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;background:#e2e8f0;display:none;" onerror="this.style.display='none'">
                        <div><span id="podglad-odbiorcy-imie" style="font-weight:bold;"></span> <span id="podglad-odbiorcy-nazwisko"></span></div>
                        <button onclick="document.getElementById('n-o').value='';window.aktualizujPodgladOdbiorcy();" style="margin-left:auto;background:none;border:none;font-size:18px;cursor:pointer;color:#999;">&times;</button>
                    </div>
                    Do: <select id="n-o" onchange="window.aktualizujPodgladOdbiorcy()" style="width:100%;padding:8px;margin-bottom:10px;border-radius:6px;border:1px solid #ccc;">${op}</select>
                    Temat: <input type="text" id="n-t" style="width:100%;padding:8px;margin-bottom:10px;border-radius:6px;border:1px solid #ccc;box-sizing:border-box;">
                    Treść: <textarea id="n-tr" style="width:100%;height:80px;margin-bottom:10px;padding:8px;border-radius:6px;border:1px solid #ccc;box-sizing:border-box;"></textarea>
                    <button onclick="window.wNPB()" style="width:100%;padding:10px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Wyślij</button>`;
            }
        });
    }
}

// Funkcje globalne
window.zmienSekcje = function(sekcja) {
    aktualnaSekcja = sekcja;
    const btnSkrzynka = document.getElementById('sekcja-skrzynka');
    const btnWyslane = document.getElementById('sekcja-wyslane');
    const btnKosz = document.getElementById('sekcja-kosz');
    if (btnSkrzynka) {
        btnSkrzynka.style.background = sekcja === 'skrzynka' ? '#007bff' : '#e2e8f0';
        btnSkrzynka.style.color = sekcja === 'skrzynka' ? 'white' : '#333';
    }
    if (btnWyslane) {
        btnWyslane.style.background = sekcja === 'wyslane' ? '#007bff' : '#e2e8f0';
        btnWyslane.style.color = sekcja === 'wyslane' ? 'white' : '#333';
    }
    if (btnKosz) {
        btnKosz.style.background = sekcja === 'kosz' ? '#007bff' : '#e2e8f0';
        btnKosz.style.color = sekcja === 'kosz' ? 'white' : '#333';
    }
    ladujWiadomosci();
};

async function ladujWiadomosci() {
    if (!mojaSesja) return;
    let query;
    if (aktualnaSekcja === 'skrzynka') {
        query = sb.from('wiadomosci').select('*, profiles:nadawca_id(imie, nazwisko)').eq('odbiorca_id', mojaSesja.id).eq('deleted', false).order('stworzono_gdy', { ascending: false });
    } else if (aktualnaSekcja === 'wyslane') {
        query = sb.from('wiadomosci').select('*, profiles:odbiorca_id(imie, nazwisko)').eq('nadawca_id', mojaSesja.id).eq('deleted', false).order('stworzono_gdy', { ascending: false });
    } else {
        query = sb.from('wiadomosci').select('*, profiles:nadawca_id(imie, nazwisko), profiles_odbiorca:odbiorca_id(imie, nazwisko)').or(`nadawca_id.eq.${mojaSesja.id},odbiorca_id.eq.${mojaSesja.id}`).eq('deleted', true).order('deleted_at', { ascending: false });
    }

    const { data, error } = await query;
    const k = document.getElementById('poczta-zawartosc');
    if (!k) return;
    if (error || !data || data.length === 0) {
        k.innerHTML = `<div style="text-align:center;color:#999;padding:40px;">Brak wiadomości.</div>`;
        return;
    }

    k.innerHTML = data.map(m => {
        const nadawca = m.profiles ? m.profiles.imie + ' ' + m.profiles.nazwisko : (aktualnaSekcja === 'wyslane' ? 'Ja' : 'Nieznany');
        const jestWazne = m.priorytet === 'wazne';
        const bg = jestWazne ? '#e8f5e9' : '#f5f5f5';
        const borderL = jestWazne ? '4px solid #4caf50' : '1px solid #e2e8f0';
        const kropkaNowej = (!m.przeczytane && aktualnaSekcja === 'skrzynka') ? `<span style="display:inline-block;width:10px;height:10px;background:#ff9800;border-radius:50%;margin-right:10px;animation:blink 1s infinite;"></span>` : '';
        const clickHandler = aktualnaSekcja === 'kosz' ? `window.podgladWiadomosciKosz(${m.id})` : `window.podgladWiadomosci(${m.id})`;

        return `<div onclick="${clickHandler}" style="padding:12px;border-radius:10px;margin-bottom:10px;cursor:pointer;background:${bg};border-left:${borderL};display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;">${kropkaNowej}<div><strong style="color:#333;display:block;font-size:13px;">${nadawca} - ${m.temat}</strong></div></div>
            <span style="font-size:11px;color:#999;">${new Date(m.stworzono_gdy).toLocaleDateString('pl-PL')}</span>
        </div>`;
    }).join('');
}

window.podgladWiadomosci = async function(id) {
    if (!mojaSesja) return;
    const { data } = await sb.from('wiadomosci').select('*, profiles:nadawca_id(imie, nazwisko)').eq('id', id).single();
    if (!data) return;
    if (!data.przeczytane && data.odbiorca_id === mojaSesja.id) {
        await sb.from('wiadomosci').update({ przeczytane: true }).eq('id', id);
        sprawdzNoweWiadomosci();
    }
    podgladWiadomoscObj = data;
    const odKogo = data.profiles ? data.profiles.imie + ' ' + data.profiles.nazwisko : 'Nieznany';
    const bg = data.priorytet === 'wazne' ? '#e8f5e9' : '#f9f9f9';
    const k = document.getElementById('poczta-zawartosc');
    if (!k) return;
    k.innerHTML = `
        <div>
            <p style="margin:5px 0;"><strong>Od:</strong> ${odKogo}</p>
            <p style="margin:5px 0;"><strong>Temat:</strong> ${data.temat}</p>
            <div style="background:${bg};padding:15px;border-radius:8px;margin-top:10px;white-space:pre-wrap;">${data.tresc}</div>
            <hr style="border:none;border-top:1px solid #eee;margin:15px 0;">
            <div id="k-odp" style="display:none;margin-bottom:10px;">
                <textarea id="t-odp" placeholder="Wpisz treść..." style="width:100%;height:60px;padding:10px;border-radius:6px;border:1px solid #ccc;box-sizing:border-box;"></textarea>
                <button onclick="window.wyslijOdpowiedzBaza()" style="background:#28a745;color:white;padding:6px 12px;border:none;border-radius:4px;margin-top:5px;cursor:pointer;">Wyślij</button>
            </div>
            <div style="display:flex;gap:5px;">
                <button onclick="document.getElementById('k-odp').style.display='block'" style="background:#007bff;color:white;padding:8px;border:none;border-radius:4px;flex:1;cursor:pointer;">Odpowiedz</button>
                <button onclick="window.zglosWiadomoscBaza(${data.id})" style="background:#ff9800;color:white;padding:8px;border:none;border-radius:4px;flex:1;cursor:pointer;">Zgłoś</button>
                <button onclick="window.usunWiadomoscBaza(${data.id})" style="background:#dc3545;color:white;padding:8px;border:none;border-radius:4px;flex:1;cursor:pointer;">Usuń</button>
                <button onclick="window.zmienSekcje('skrzynka')" style="background:#eee;color:#333;padding:8px;border:none;border-radius:4px;flex:1;cursor:pointer;">Powrót</button>
            </div>
        </div>`;
};

window.podgladWiadomosciKosz = async function(id) {
    const { data } = await sb.from('wiadomosci').select('*, profiles:nadawca_id(imie, nazwisko), profiles_odbiorca:odbiorca_id(imie, nazwisko)').eq('id', id).single();
    if (!data) return;
    const nadawca = data.profiles ? data.profiles.imie + ' ' + data.profiles.nazwisko : 'Nieznany';
    const odbiorca = data.profiles_odbiorca ? data.profiles_odbiorca.imie + ' ' + data.profiles_odbiorca.nazwisko : 'Nieznany';
    const k = document.getElementById('poczta-zawartosc');
    if (!k) return;
    k.innerHTML = `
        <div>
            <p style="margin:5px 0;"><strong>Od:</strong> ${nadawca}</p>
            <p style="margin:5px 0;"><strong>Do:</strong> ${odbiorca}</p>
            <p style="margin:5px 0;"><strong>Temat:</strong> ${data.temat}</p>
            <p style="margin:5px 0;font-size:11px;color:#999;">Usunięta: ${new Date(data.deleted_at).toLocaleString('pl-PL')}</p>
            <div style="background:#f5f5f5;padding:15px;border-radius:8px;margin-top:10px;white-space:pre-wrap;">${data.tresc}</div>
            <hr style="border:none;border-top:1px solid #eee;margin:15px 0;">
            <button onclick="window.zmienSekcje('kosz')" style="width:100%;padding:8px;background:#eee;color:#333;border:none;border-radius:4px;cursor:pointer;">Powrót</button>
        </div>`;
};

window.wyslijOdpowiedzBaza = async function() {
    if (!mojaSesja || !podgladWiadomoscObj) return;
    const m = podgladWiadomoscObj;
    const t = document.getElementById('t-odp')?.value.trim();
    if (!t) return alert("Wpisz treść!");
    const tO = `Odpowiedź: ${m.temat}`;
    await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: m.nadawca_id, temat: tO, tresc: t, priorytet: 'zwykly' }]);
    alert("Wysłano!");
    window.zmienSekcje('skrzynka');
};

window.usunWiadomoscBaza = async function(id) {
    if (!confirm("Przenieść wiadomość do kosza?")) return;
    await sb.from('wiadomosci').update({ deleted: true, deleted_at: new Date().toISOString() }).eq('id', id);
    window.zmienSekcje('skrzynka');
};

window.zglosWiadomoscBaza = async function(id) {
    if (!mojaSesja || !podgladWiadomoscObj) return;
    if (!confirm("Zgłosić tę wiadomość do Huberta B.?")) return;
    const m = podgladWiadomoscObj;
    const { data: mp } = await sb.from('profiles').select('imie, nazwisko').eq('id', mojaSesja.id).single();
    const { data: admin } = await sb.from('profiles').select('id').eq('imie', 'Hubert').eq('nazwisko', 'Bereźnicki').single();
    if (!admin) return alert("Nie znaleziono administratora!");
    const nadawca = m.profiles ? m.profiles.imie + ' ' + m.profiles.nazwisko : 'Nieznany';
    await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: admin.id, temat: 'Zgłoszenie wiadomości', tresc: `Od: ${nadawca}\nDo: ${mp.imie} ${mp.nazwisko}\nTreść: "${m.tresc}"\nZgłaszający: ${mp.imie} ${mp.nazwisko}`, priorytet: 'zwykly' }]);
    alert("Zgłoszenie wysłane!");
};

window.aktualizujPodgladOdbiorcy = function() {
    const sel = document.getElementById('n-o');
    if (!sel) return;
    const opt = sel.options[sel.selectedIndex];
    const imie = document.getElementById('podglad-odbiorcy-imie');
    const nazwisko = document.getElementById('podglad-odbiorcy-nazwisko');
    if (opt && opt.value) {
        if (imie) imie.innerText = opt.text.split(' ')[0] || '';
        if (nazwisko) nazwisko.innerText = opt.text.split(' ').slice(1).join(' ') || '';
    }
};

window.wNPB = async function() {
    if (!mojaSesja) return;
    const o = document.getElementById('n-o')?.value;
    const t = document.getElementById('n-t')?.value.trim();
    const tr = document.getElementById('n-tr')?.value.trim();
    if (!t || !tr) return alert("Wpisz temat i treść!");
    await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: o, temat: t, tresc: tr, priorytet: 'zwykly' }]);
    alert("Wiadomość wysłana!");
    window.zmienSekcje('wyslane');
};

window.otworzPodgladElementu = async function(id) {
    if (!mojaSesja) return;
    const { data, error } = await sb.from('terminarz').select('*, profiles(imie, nazwisko)').eq('id', id).single();
    if (error || !data) return;
    const n = data.profiles ? `${data.profiles.imie} ${data.profiles.nazwisko}` : "Nieznany";
    const dUtw = data.stworzono_gdy ? new Date(data.stworzono_gdy).toLocaleString('pl-PL') : "Brak daty";
    const dH = data.dodatkowe_info || "Brak";
    let c = data.priorytet === 'wysoki' ? '#f44336' : (data.priorytet === 'sredni' ? '#ff9800' : '#9e9e9e');
    let tH = data.typ === 'informacja' ? `<p><strong>Temat:</strong> ${data.temat}</p><p><strong>Informacja:</strong> ${data.szczegoly}</p>` : `<p><strong>Przedmiot:</strong> ${data.temat}</p><p><strong>Dział:</strong> ${data.szczegoly}</p><p><strong>Dodatkowe:</strong> ${dH}</p>`;
    let pS = data.typ === 'sprawdzian' ? `<div style="display:flex;gap:10px;margin-top:20px;"><button disabled style="flex:1;padding:10px;background:#e2e8f0;color:#a0aec0;border:none;border-radius:6px;cursor:not-allowed;">Poucz się</button><button disabled style="flex:1;padding:10px;background:#e2e8f0;color:#a0aec0;border:none;border-radius:6px;cursor:not-allowed;">Powtórka</button></div>` : '';

    const { data: profil } = await sb.from('profiles').select('*').eq('id', mojaSesja.id).single();
    let jestAdmin = false;
    if (profil) {
        const klucz1 = profil.imie + "_" + profil.nazwisko;
        const klucz2 = profil.imie.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l") + "_" + profil.nazwisko.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
        jestAdmin = LISTA_ADMINOW.includes(klucz1) || LISTA_ADMINOW.includes(klucz2);
    }
    let przyciskiAdmina = '';
    if (jestAdmin) {
        przyciskiAdmina = `<div style="display:flex;gap:10px;margin-top:15px;"><button onclick="window.edytujWpis(${data.id})" style="flex:1;padding:10px;background:#ff9800;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">✏️ Edytuj</button><button onclick="window.usunWpis(${data.id})" style="flex:1;padding:10px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">🗑️ Usuń</button></div>`;
    }

    const trescPodgladu = document.getElementById('tresc-podgladu');
    if (trescPodgladu) {
        trescPodgladu.innerHTML = `<h3 style="text-transform:capitalize;margin-top:0;">${data.typ}</h3><p style="font-size:12px;color:#777;margin:5px 0;">Nadał: ${n} (${dUtw})</p><p style="font-size:12px;color:#777;margin:5px 0;">Termin: ${data.data_wydarzenia}</p><p style="color:${c};font-size:12px;margin:5px 0;"><strong>Priorytet:</strong> ${data.priorytet.toUpperCase()}</p><hr style="border:none;border-top:1px solid #eee;margin:15px 0;">${tH}${pS}${przyciskiAdmina}`;
    }
    const modalPodgladu = document.getElementById('modal-podgladu');
    if (modalPodgladu) modalPodgladu.style.display = 'flex';
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

window.usunAwatar = async function() {
    if (!mojaSesja) return;
    await sb.from('profiles').update({ avatar_url: null }).eq('id', mojaSesja.id);
    const podglad = document.getElementById('ust-awatar-podglad');
    if (podglad) podglad.style.display = 'none';
    alert("Ikona usunięta!");
};

window.zmienImie = async function() {
    if (!mojaSesja) return;
    const n = document.getElementById('ust-nowe-imie')?.value.trim();
    if (!n) return alert("Wpisz imię!");
    await sb.from('profiles').update({ imie: n }).eq('id', mojaSesja.id);
    const ikonka = document.getElementById('ikonka-profilu');
    if (ikonka) ikonka.innerText = n.charAt(0).toUpperCase();
    alert("Imię zmienione!");
};

window.zmienNazwisko = async function() {
    if (!mojaSesja) return;
    const n = document.getElementById('ust-nowe-nazwisko')?.value.trim();
    if (!n) return alert("Wpisz nazwisko!");
    await sb.from('profiles').update({ nazwisko: n }).eq('id', mojaSesja.id);
    alert("Nazwisko zmienione!");
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
    const { data: adminData } = await sb.from('profiles').select('id').eq('imie', 'Hubert').eq('nazwisko', 'Bereźnicki').single();
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
    alert("Konto usunięte.");
    window.location.href = '/K/logowanie.html';
};

async function odswiezTerminarz() {
    const { data, error } = await sb.from('terminarz').select('*, profiles(imie, nazwisko)').order('data_wydarzenia', { ascending: true });
    const k = document.getElementById('kontener-kafelkow');
    if (!k) return;
    if (error || !data || data.length === 0) {
        k.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#999;padding:40px;">Brak wydarzeń.</div>`;
        return;
    }
    k.innerHTML = data.map(w => {
        let c = w.priorytet === 'wysoki' ? '#f44336' : (w.priorytet === 'sredni' ? '#ff9800' : '#9e9e9e');
        return `<div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;border-left:6px solid ${c};"><div><h4 style="margin:0 0 5px 0;color:#333;">${w.typ==='informacja'?w.temat:w.typ.toUpperCase()+': '+w.temat}</h4><span style="font-size:12px;font-weight:bold;color:${c};">${w.priorytet}</span></div><button onclick="window.otworzPodgladElementu(${w.id})" style="margin-top:15px;width:100%;padding:8px;background:#007bff;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">Sprawdź</button></div>`;
    }).join('');
}

async function zaladujUstawienia() {
    if (!mojaSesja) return;
    const { data: profil } = await sb.from('profiles').select('*').eq('id', mojaSesja.id).single();
    if (profil) {
        const ustImie = document.getElementById('ust-nowe-imie');
        const ustNazwisko = document.getElementById('ust-nowe-nazwisko');
        const ustAwatar = document.getElementById('ust-awatar-podglad');
        if (ustImie) ustImie.value = profil.imie || '';
        if (ustNazwisko) ustNazwisko.value = profil.nazwisko || '';
        if (ustAwatar && profil.avatar_url) {
            ustAwatar.src = profil.avatar_url;
            ustAwatar.style.display = 'inline-block';
        }
    }
}

async function sprawdzNoweWiadomosci() {
    if (!mojaSesja) return;
    const { data } = await sb.from('wiadomosci').select('id, priorytet').eq('odbiorca_id', mojaSesja.id).eq('przeczytane', false).eq('deleted', false);
    const maNowe = data && data.length > 0;
    const maWazne = data && data.some(m => m.priorytet === 'wazne');
    const powiadomienie = document.getElementById('poczta-powiadomienie');
    const chmurka = document.getElementById('poczta-wazne-chmurka');
    if (powiadomienie) powiadomienie.style.display = maNowe ? 'block' : 'none';
    if (chmurka) chmurka.style.display = maWazne ? 'block' : 'none';
    if (maNowe) wyslijPowiadomienie('Nowa wiadomość!', 'Masz nową wiadomość w skrzynce.');
}

// Uruchom interfejs
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _uruchomInterfejs);
} else {
    _uruchomInterfejs();
}
