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
                icon: '/icon.png',
                badge: '/badge.png',
                vibrate: [200, 100, 200],
                data: { url: data.url || '/' }
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
        new Notification(tytul, { body: tresc, icon: '/icon.png' });
    }
}

function generujFakeEmail(imie, nazwisko) {
    let czysteImie = imie.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]/g, '');
    let czysteNazwisko = nazwisko.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]/g, '');
    return czysteImie + czysteNazwisko + '@klasa.com';
}

// Sprawdzenie autoryzacji
sb.auth.onAuthStateChange((event, session) => {
    const obecnaStrona = window.location.pathname.toLowerCase();
    if (session) {
        if (event === 'SIGNED_IN') {
            if (obecnaStrona.includes('rejestracja')) {
                alert("Poprawnie zarejestrowano i zalogowano!");
                window.location.href = '/';
            } else if (obecnaStrona.includes('logowanie')) {
                alert("Poprawnie zalogowano!");
                window.location.href = '/';
            }
        }
    } else {
        if (['/', '', '/dashboard'].includes(obecnaStrona)) {
            window.location.href = '/logowanie';
        }
    }
});

// Główna funkcja interfejsu
function _uruchomInterfejs() {
    if (typeof window.supabaseClient === 'undefined') {
        setTimeout(_uruchomInterfejs, 100);
        return;
    }

    sb.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) return;
        mojaSesja = user;

        const { data: profil } = await sb.from('profiles').select('*').eq('id', user.id).single();
        if (profil) {
            document.getElementById('ikonka-profilu').innerText = profil.imie.charAt(0).toUpperCase();
            document.getElementById('profil-pelne-nazwisko').innerText = profil.imie + " " + profil.nazwisko;

            const klucz1 = profil.imie + "_" + profil.nazwisko;
            const klucz2 = profil.imie.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l") + "_" + profil.nazwisko.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");

            if (LISTA_ADMINOW.includes(klucz1) || LISTA_ADMINOW.includes(klucz2)) {
                document.getElementById('plusik-admina').style.display = 'flex';
                document.getElementById('mlotek-admina').style.display = 'flex';
            }
        }

        odswiezTerminarz();
        sprawdzNoweWiadomosci();
    });

    // Subskrypcja na zmiany w bazie
    sb.channel('zmiany-interfejsu')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'terminarz' }, () => {
            odswiezTerminarz();
            wyslijPowiadomienie('Nowość w terminarzu!', 'Pojawiło się nowe wydarzenie.');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wiadomosci' }, () => {
            sprawdzNoweWiadomosci();
        })
        .subscribe();

    // Event listenery dla przycisków
    document.getElementById('ikonka-profilu').addEventListener('click', (e) => {
        e.stopPropagation();
        const m = document.getElementById('menu-profilu');
        m.style.display = m.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('btn-wyloguj').addEventListener('click', async () => {
        await sb.auth.signOut();
        window.location.href = '/logowanie';
    });

    document.addEventListener('click', () => {
        document.getElementById('menu-profilu').style.display = 'none';
    });

    document.getElementById('btn-powiadomienia').addEventListener('click', async (e) => {
        e.stopPropagation();
        if ('Notification' in window) {
            const perm = await Notification.requestPermission();
            alert(perm === 'granted' ? "Powiadomienia włączone!" : "Nie udzielono zgody.");
        }
    });

    document.getElementById('btn-ustawienia').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('modal-ustawien').style.display = 'flex';
        document.getElementById('menu-profilu').style.display = 'none';
        zaladujUstawienia();
    });

    document.getElementById('zamknij-modal-ustawien').addEventListener('click', () => {
        document.getElementById('modal-ustawien').style.display = 'none';
    });

    // Ustawienia awatara
    document.getElementById('ust-awatar-input').addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async function(ev) {
            await sb.from('profiles').update({ avatar_url: ev.target.result }).eq('id', mojaSesja.id);
            document.getElementById('ust-awatar-podglad').src = ev.target.result;
            document.getElementById('ust-awatar-podglad').style.display = 'inline-block';
            alert("Ikona zaktualizowana!");
        };
        reader.readAsDataURL(file);
    });

    // Przycisk młotka admina
    const przyciskAdminPanel = document.createElement('div');
    przyciskAdminPanel.id = 'mlotek-admina';
    przyciskAdminPanel.style.cssText = 'display:none; cursor:pointer; width:45px; height:45px; background:#dc3545; color:white; border-radius:50%; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 10px rgba(220,53,69,0.3);';
    przyciskAdminPanel.innerHTML = '&#128296;';
    przyciskAdminPanel.title = 'Panel administracyjny';
    document.getElementById('plusik-admina').parentNode.insertBefore(przyciskAdminPanel, document.getElementById('plusik-admina').nextSibling);

    document.getElementById('mlotek-admina').addEventListener('click', async () => {
        const { data: users } = await sb.from('profiles').select('*');
        let op = users.map(u => `<option value="${u.id}">${u.imie} ${u.nazwisko}</option>`).join('');
        document.getElementById('admin-wybor-uzytkownika').innerHTML = '<option value="">-- Wybierz --</option><option value="all">WSZYSCY UŻYTKOWNICY</option>' + op;
        document.getElementById('modal-administracyjny').style.display = 'flex';
        document.getElementById('admin-czas-bana-kontener').style.display = 'block';
        document.getElementById('admin-temat-kontener').style.display = 'none';
        document.getElementById('admin-priorytet-kontener').style.display = 'none';
    });

    document.getElementById('zamknij-modal-administracyjny').addEventListener('click', () => {
        document.getElementById('modal-administracyjny').style.display = 'none';
    });

    document.getElementById('admin-typ-kary').addEventListener('change', function() {
        const typ = this.value;
        document.getElementById('admin-czas-bana-kontener').style.display = typ === 'ban' ? 'block' : 'none';
        document.getElementById('admin-temat-kontener').style.display = typ === 'wiadomosc' ? 'block' : 'none';
        document.getElementById('admin-priorytet-kontener').style.display = typ === 'wiadomosc' ? 'block' : 'none';
        document.getElementById('btn-wykonaj-kare').innerText = typ === 'wiadomosc' ? 'Wyślij' : 'Wykonaj';
    });

    document.getElementById('btn-wykonaj-kare').addEventListener('click', async () => {
        const userId = document.getElementById('admin-wybor-uzytkownika').value;
        const typ = document.getElementById('admin-typ-kary').value;
        const powod = document.getElementById('admin-powod').value.trim();
        const czas = parseInt(document.getElementById('admin-czas-bana').value) || 60;

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
            const temat = document.getElementById('admin-temat-wiadomosci').value.trim();
            const priorytet = document.getElementById('admin-priorytet').value;
            if (!temat) return alert("Wpisz temat!");

            if (userId === 'all') {
                const { data: users } = await sb.from('profiles').select('id');
                const progressDiv = document.getElementById('admin-progress');
                progressDiv.style.display = 'block';
                for (let i = 0; i < users.length; i++) {
                    progressDiv.innerText = `Wysyłanie: (${i+1}/${users.length})`;
                    await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: users[i].id, temat, tresc: powod, priorytet }]);
                }
                progressDiv.innerText = 'Wysłano!';
                setTimeout(() => { progressDiv.style.display = 'none'; }, 2000);
            } else {
                await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: userId, temat, tresc: powod, priorytet }]);
            }
            alert("Wiadomość wysłana!");
        }
        document.getElementById('modal-administracyjny').style.display = 'none';
    });

    // Formularz dodawania
    const selectTyp = document.getElementById('form-typ');
    const kontenerPol = document.getElementById('pola-dynamiczne');
    const priorytetSelect = `<div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Priorytet</label><select id="form-priorytet" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;"><option value="normalny">Normalny</option><option value="sredni">Średni</option><option value="wysoki">Wysoki</option></select></div>`;

    function renderujPolaFormularza() {
        const t = selectTyp.value;
        if (t === 'informacja') {
            kontenerPol.innerHTML = `<div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Temat</label><input type="text" id="form-temat" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;"></div><div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Treść</label><textarea id="form-szczegoly" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;height:80px;"></textarea></div>${priorytetSelect}<div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Data</label><input type="date" id="form-data" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;"></div>`;
        } else {
            const et = t === 'sprawdzian' ? 'Jaki dział' : 'Jaki temat/dział';
            kontenerPol.innerHTML = `<div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Przedmiot</label><input type="text" id="form-temat" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;"></div><div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">${et}</label><input type="text" id="form-szczegoly" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;"></div>${priorytetSelect}<div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Dodatkowe info</label><textarea id="form-dodatkowe" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;height:60px;"></textarea></div><div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;font-size:14px;color:#666;">Kiedy</label><input type="date" id="form-data" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;"></div>`;
        }
    }

    selectTyp.addEventListener('change', renderujPolaFormularza);
    renderujPolaFormularza();

    document.getElementById('plusik-admina').addEventListener('click', () => {
        document.getElementById('modal-admina').style.display = 'flex';
    });

    document.getElementById('zamknij-modal-admina').addEventListener('click', () => {
        document.getElementById('modal-admina').style.display = 'none';
    });

    document.getElementById('btn-anuluj-admina').addEventListener('click', () => {
        document.getElementById('modal-admina').style.display = 'none';
    });

    document.getElementById('btn-zapisz-admina').addEventListener('click', async () => {
        const typ = selectTyp.value;
        const temat = document.getElementById('form-temat').value.trim();
        const szczegoly = document.getElementById('form-szczegoly').value.trim();
        const priorytet = document.getElementById('form-priorytet').value;
        const dataW = document.getElementById('form-data').value;
        const dN = document.getElementById('form-dodatkowe');
        const dodatkowe = dN ? dN.value.trim() : '';

        if (!temat || !szczegoly || !dataW) return alert("Wypełnij wymagane pola!");
        const { error } = await sb.from('terminarz').insert([{ nadawca_id: mojaSesja.id, typ, temat, szczegoly, priorytet, data_wydarzenia: dataW, dodatkowe_info: dodatkowe || null }]);
        if (error) alert("Błąd: " + error.message);
        else {
            alert("Dodano!");
            document.getElementById('modal-admina').style.display = 'none';
        }
    });

    // Podgląd kafelka
    document.getElementById('zamknij-modal-podgladu').addEventListener('click', () => {
        document.getElementById('modal-podgladu').style.display = 'none';
    });

    // Edycja wpisu
    document.getElementById('zamknij-modal-edycji').addEventListener('click', () => {
        document.getElementById('modal-edycji').style.display = 'none';
    });

    document.getElementById('btn-zapisz-edycje').addEventListener('click', async () => {
        await sb.from('terminarz').update({
            typ: document.getElementById('edit-typ').value,
            temat: document.getElementById('edit-temat').value.trim(),
            szczegoly: document.getElementById('edit-szczegoly').value.trim(),
            priorytet: document.getElementById('edit-priorytet').value,
            data_wydarzenia: document.getElementById('edit-data').value
        }).eq('id', edytowaneID);
        alert("Zapisano zmiany!");
        document.getElementById('modal-edycji').style.display = 'none';
        odswiezTerminarz();
    });

    // Skrzynka wiadomości
    document.getElementById('ikonka-poczty').addEventListener('click', () => {
        document.getElementById('modal-poczty').style.display = 'flex';
        zmienSekcje('skrzynka');
    });

    document.getElementById('zamknij-modal-poczty').addEventListener('click', () => {
        document.getElementById('modal-poczty').style.display = 'none';
    });

    document.getElementById('btn-nowa-wiadomosc').addEventListener('click', async () => {
        const { data: users } = await sb.from('profiles').select('*');
        const op = users.filter(u => u.id !== mojaSesja.id).map(u => `<option value="${u.id}">${u.imie} ${u.nazwisko}</option>`).join('');
        document.getElementById('poczta-zawartosc').innerHTML = `<h4>Nowa wiadomość</h4>
            <div id="podglad-odbiorcy" style="margin-bottom:10px;padding:10px;background:#f8f9fa;border-radius:8px;display:flex;align-items:center;gap:10px;">
                <img id="podglad-odbiorcy-avatar" src="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;background:#e2e8f0;display:none;" onerror="this.style.display='none'">
                <div><span id="podglad-odbiorcy-imie" style="font-weight:bold;"></span> <span id="podglad-odbiorcy-nazwisko"></span></div>
                <button onclick="document.getElementById('n-o').value='';window.aktualizujPodgladOdbiorcy();" style="margin-left:auto;background:none;border:none;font-size:18px;cursor:pointer;color:#999;">&times;</button>
            </div>
            Do: <select id="n-o" onchange="window.aktualizujPodgladOdbiorcy()" style="width:100%;padding:8px;margin-bottom:10px;border-radius:6px;border:1px solid #ccc;">${op}</select>
            Temat: <input type="text" id="n-t" style="width:100%;padding:8px;margin-bottom:10px;border-radius:6px;border:1px solid #ccc;box-sizing:border-box;">
            Treść: <textarea id="n-tr" style="width:100%;height:80px;margin-bottom:10px;padding:8px;border-radius:6px;border:1px solid #ccc;box-sizing:border-box;"></textarea>
            <button onclick="window.wNPB()" style="width:100%;padding:10px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Wyślij</button>`;
    });
}

// Funkcje globalne
window.zmienSekcje = function(sekcja) {
    aktualnaSekcja = sekcja;
    document.getElementById('sekcja-skrzynka').style.background = sekcja === 'skrzynka' ? '#007bff' : '#e2e8f0';
    document.getElementById('sekcja-skrzynka').style.color = sekcja === 'skrzynka' ? 'white' : '#333';
    document.getElementById('sekcja-wyslane').style.background = sekcja === 'wyslane' ? '#007bff' : '#e2e8f0';
    document.getElementById('sekcja-wyslane').style.color = sekcja === 'wyslane' ? 'white' : '#333';
    document.getElementById('sekcja-kosz').style.background = sekcja === 'kosz' ? '#007bff' : '#e2e8f0';
    document.getElementById('sekcja-kosz').style.color = sekcja === 'kosz' ? 'white' : '#333';
    ladujWiadomosci();
};

async function ladujWiadomosci() {
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
    const { data } = await sb.from('wiadomosci').select('*, profiles:nadawca_id(imie, nazwisko)').eq('id', id).single();
    if (!data) return;
    if (!data.przeczytane && data.odbiorca_id === mojaSesja.id) {
        await sb.from('wiadomosci').update({ przeczytane: true }).eq('id', id);
        sprawdzNoweWiadomosci();
    }
    podgladWiadomoscObj = data;
    const odKogo = data.profiles ? data.profiles.imie + ' ' + data.profiles.nazwisko : 'Nieznany';
    const bg = data.priorytet === 'wazne' ? '#e8f5e9' : '#f9f9f9';
    document.getElementById('poczta-zawartosc').innerHTML = `
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
    document.getElementById('poczta-zawartosc').innerHTML = `
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
    const m = podgladWiadomoscObj;
    const t = document.getElementById('t-odp').value.trim();
    if (!t) return alert("Wpisz treść!");
    const tO = `Odpowiedź: ${m.temat}`;
    await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: m.nadawca_id, temat: tO, tresc: t, priorytet: 'zwykly' }]);
    alert("Wysłano!");
    zmienSekcje('skrzynka');
};

window.usunWiadomoscBaza = async function(id) {
    if (!confirm("Przenieść wiadomość do kosza?")) return;
    await sb.from('wiadomosci').update({ deleted: true, deleted_at: new Date().toISOString() }).eq('id', id);
    zmienSekcje('skrzynka');
};

window.zglosWiadomoscBaza = async function(id) {
    if (!confirm("Zgłosić tę wiadomość do Huberta B.?")) return;
    const m = podgladWiadomoscObj;
    const { data: mp } = await sb.from('profiles').select('imie, nazwisko').eq('id', mojaSesja.id).single();
    const { data: admin } = await sb.from('profiles').select('id').eq('imie', 'Hubert').eq('nazwisko', 'Bereźnicki').single();
    const nadawca = m.profiles ? m.profiles.imie + ' ' + m.profiles.nazwisko : 'Nieznany';
    await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: admin.id, temat: 'Zgłoszenie wiadomości', tresc: `Od: ${nadawca}\nDo: ${mp.imie} ${mp.nazwisko}\nTreść: "${m.tresc}"\nZgłaszający: ${mp.imie} ${mp.nazwisko}`, priorytet: 'zwykly' }]);
    alert("Zgłoszenie wysłane!");
};

window.aktualizujPodgladOdbiorcy = function() {
    const sel = document.getElementById('n-o');
    if (!sel) return;
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.value) {
        document.getElementById('podglad-odbiorcy-imie').innerText = opt.text.split(' ')[0] || '';
        document.getElementById('podglad-odbiorcy-nazwisko').innerText = opt.text.split(' ').slice(1).join(' ') || '';
    }
};

window.wNPB = async function() {
    const o = document.getElementById('n-o').value;
    const t = document.getElementById('n-t').value.trim();
    const tr = document.getElementById('n-tr').value.trim();
    if (!t || !tr) return alert("Wpisz temat i treść!");
    await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: o, temat: t, tresc: tr, priorytet: 'zwykly' }]);
    alert("Wiadomość wysłana!");
    zmienSekcje('wyslane');
};

window.otworzPodgladElementu = async function(id) {
    const { data, error } = await sb.from('terminarz').select('*, profiles(imie, nazwisko)').eq('id', id).single();
    if (error || !data) return;
    const n = data.profiles ? `${data.profiles.imie} ${data.profiles.nazwisko}` : "Nieznany";
    const dUtw = new Date(data.stworzono_gdy).toLocaleString('pl-PL');
    const dH = data.dodatkowe_info || "Brak";
    let c = data.priorytet === 'wysoki' ? '#f44336' : (data.priorytet === 'sredni' ? '#ff9800' : '#9e9e9e');
    let tH = data.typ === 'informacja' ? `<p><strong>Temat:</strong> ${data.temat}</p><p><strong>Informacja:</strong> ${data.szczegoly}</p>` : `<p><strong>Przedmiot:</strong> ${data.temat}</p><p><strong>Dział:</strong> ${data.szczegoly}</p><p><strong>Dodatkowe:</strong> ${dH}</p>`;
    let pS = data.typ === 'sprawdzian' ? `<div style="display:flex;gap:10px;margin-top:20px;"><button disabled style="flex:1;padding:10px;background:#e2e8f0;color:#a0aec0;border:none;border-radius:6px;cursor:not-allowed;">Poucz się</button><button disabled style="flex:1;padding:10px;background:#e2e8f0;color:#a0aec0;border:none;border-radius:6px;cursor:not-allowed;">Powtórka</button></div>` : '';

    const { data: profil } = await sb.from('profiles').select('*').eq('id', mojaSesja.id).single();
    const klucz1 = profil.imie + "_" + profil.nazwisko;
    const klucz2 = profil.imie.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l") + "_" + profil.nazwisko.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
    const jestAdmin = LISTA_ADMINOW.includes(klucz1) || LISTA_ADMINOW.includes(klucz2);
    let przyciskiAdmina = '';
    if (jestAdmin) {
        przyciskiAdmina = `<div style="display:flex;gap:10px;margin-top:15px;"><button onclick="window.edytujWpis(${data.id})" style="flex:1;padding:10px;background:#ff9800;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">✏️ Edytuj</button><button onclick="window.usunWpis(${data.id})" style="flex:1;padding:10px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">🗑️ Usuń</button></div>`;
    }

    document.getElementById('tresc-podgladu').innerHTML = `<h3 style="text-transform:capitalize;margin-top:0;">${data.typ}</h3><p style="font-size:12px;color:#777;margin:5px 0;">Nadał: ${n} (${dUtw})</p><p style="font-size:12px;color:#777;margin:5px 0;">Termin: ${data.data_wydarzenia}</p><p style="color:${c};font-size:12px;margin:5px 0;"><strong>Priorytet:</strong> ${data.priorytet.toUpperCase()}</p><hr style="border:none;border-top:1px solid #eee;margin:15px 0;">${tH}${pS}${przyciskiAdmina}`;
    document.getElementById('modal-podgladu').style.display = 'flex';
};

window.edytujWpis = async function(id) {
    const { data } = await sb.from('terminarz').select('*').eq('id', id).single();
    if (!data) return;
    edytowaneID = id;
    document.getElementById('edit-typ').value = data.typ;
    document.getElementById('edit-temat').value = data.temat;
    document.getElementById('edit-szczegoly').value = data.szczegoly;
    document.getElementById('edit-priorytet').value = data.priorytet;
    document.getElementById('edit-data').value = data.data_wydarzenia;
    document.getElementById('modal-podgladu').style.display = 'none';
    document.getElementById('modal-edycji').style.display = 'flex';
};

window.usunWpis = async function(id) {
    if (!confirm("Usunąć ten wpis z terminarza?")) return;
    await sb.from('terminarz').delete().eq('id', id);
    document.getElementById('modal-podgladu').style.display = 'none';
    odswiezTerminarz();
};

window.usunAwatar = async function() {
    await sb.from('profiles').update({ avatar_url: null }).eq('id', mojaSesja.id);
    document.getElementById('ust-awatar-podglad').style.display = 'none';
    alert("Ikona usunięta!");
};

window.zmienImie = async function() {
    const n = document.getElementById('ust-nowe-imie').value.trim();
    if (!n) return alert("Wpisz imię!");
    await sb.from('profiles').update({ imie: n }).eq('id', mojaSesja.id);
    document.getElementById('ikonka-profilu').innerText = n.charAt(0).toUpperCase();
    alert("Imię zmienione!");
};

window.zmienNazwisko = async function() {
    const n = document.getElementById('ust-nowe-nazwisko').value.trim();
    if (!n) return alert("Wpisz nazwisko!");
    await sb.from('profiles').update({ nazwisko: n }).eq('id', mojaSesja.id);
    alert("Nazwisko zmienione!");
};

window.zmienHaslo = async function() {
    const s = document.getElementById('ust-stare-haslo').value;
    const n = document.getElementById('ust-nowe-haslo').value;
    if (!s || !n) return alert("Wypełnij oba pola!");
    const { data: profil } = await sb.from('profiles').select('*').eq('id', mojaSesja.id).single();
    const { error } = await sb.auth.signInWithPassword({ email: profil.imie.toLowerCase() + profil.nazwisko.toLowerCase() + '@klasa.com', password: s });
    if (error) return alert("Błędne stare hasło!");
    await sb.auth.updateUser({ password: n });
    alert("Hasło zmienione!");
};

window.prosbaOZmianeHasla = async function() {
    const { data: adminData } = await sb.from('profiles').select('id').eq('imie', 'Hubert').eq('nazwisko', 'Bereźnicki').single();
    const { data: mp } = await sb.from('profiles').select('imie, nazwisko').eq('id', mojaSesja.id).single();
    await sb.from('wiadomosci').insert([{ nadawca_id: mojaSesja.id, odbiorca_id: adminData.id, temat: 'Prośba o zmianę hasła', tresc: `Użytkownik ${mp.imie} ${mp.nazwisko} prosi o zmianę hasła.`, priorytet: 'zwykly' }]);
    alert("Prośba wysłana!");
};

window.usunMojeKonto = async function() {
    if (!confirm("Czy na pewno chcesz bezpowrotnie usunąć swoje konto?")) return;
    const haslo = prompt("Wpisz swoje hasło aby potwierdzić:");
    if (!haslo) return;
    const { data: profil } = await sb.from('profiles').select('*').eq('id', mojaSesja.id).single();
    const { error: loginError } = await sb.auth.signInWithPassword({ email: profil.imie.toLowerCase() + profil.nazwisko.toLowerCase() + '@klasa.com', password: haslo });
    if (loginError) return alert("Błędne hasło!");
    await sb.from('profiles').delete().eq('id', mojaSesja.id);
    await sb.auth.signOut();
    alert("Konto usunięte.");
    window.location.href = '/logowanie';
};

async function odswiezTerminarz() {
    const { data, error } = await sb.from('terminarz').select('*, profiles(imie, nazwisko)').order('data_wydarzenia', { ascending: true });
    const k = document.getElementById('kontener-kafelkow');
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
    const { data: profil } = await sb.from('profiles').select('*').eq('id', mojaSesja.id).single();
    if (profil) {
        document.getElementById('ust-nowe-imie').value = profil.imie || '';
        document.getElementById('ust-nowe-nazwisko').value = profil.nazwisko || '';
        if (profil.avatar_url) {
            document.getElementById('ust-awatar-podglad').src = profil.avatar_url;
            document.getElementById('ust-awatar-podglad').style.display = 'inline-block';
        }
    }
}

async function sprawdzNoweWiadomosci() {
    const { data } = await sb.from('wiadomosci').select('id, priorytet').eq('odbiorca_id', mojaSesja.id).eq('przeczytane', false).eq('deleted', false);
    const maNowe = data && data.length > 0;
    const maWazne = data && data.some(m => m.priorytet === 'wazne');
    document.getElementById('poczta-powiadomienie').style.display = maNowe ? 'block' : 'none';
    document.getElementById('poczta-wazne-chmurka').style.display = maWazne ? 'block' : 'none';
    if (maNowe) wyslijPowiadomienie('Nowa wiadomość!', 'Masz nową wiadomość w skrzynce.');
}

// Uruchom interfejs po załadowaniu strony
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _uruchomInterfejs);
} else {
    _uruchomInterfejs();
}
