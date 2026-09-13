// ============================================================
// GRY — WSPÓLNE (limit dzienny, zapis punktów, tło z gwiazdami)
// Każda gra ma WŁASNĄ logikę rozgrywki we własnym pliku — ten
// plik odpowiada tylko za "sklejenie" z resztą apki (limit czasu,
// punkty, powrót), żeby nie powtarzać tego samego kodu 3 razy.
// ============================================================
(function () {
    const SUPABASE_URL = 'https://uvjgmxvfzvweoxeicned.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_hGHRqdmuObIyLnpzVzZiPA_Cslp7V1G';
    const sb = window.supabaseClient || supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = sb;

    function dzisiajStr() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    const GryWspolne = {
        sb,
        user: null,

        async start() {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) { window.location.href = 'logowanie.html'; return null; }
            this.user = user;
            return user;
        },

        // Zwraca liczbę minut, jakie zostały dziś do wykorzystania (może być 0)
        async pobierzPozostalyCzas() {
            const [{ data: ust }, { data: sesja }] = await Promise.all([
                sb.from('ustawienia_gier').select('limit_minut').eq('id', 1).limit(1),
                sb.from('gry_sesje').select('*').eq('user_id', this.user.id).eq('dzien', dzisiajStr()).limit(1)
            ]);
            const limit = (ust && ust[0]) ? ust[0].limit_minut : 45;
            const zagrane = (sesja && sesja[0]) ? sesja[0].minuty_grane : 0;
            return Math.max(0, limit - zagrane);
        },

        // Dopisuje minuty do dzisiejszej sesji (heartbeat)
        async dodajZagranyCzas(minuty) {
            const { data: sesja } = await sb.from('gry_sesje').select('*').eq('user_id', this.user.id).eq('dzien', dzisiajStr()).limit(1);
            if (sesja && sesja[0]) {
                await sb.from('gry_sesje').update({ minuty_grane: sesja[0].minuty_grane + minuty }).eq('user_id', this.user.id).eq('dzien', dzisiajStr());
            } else {
                await sb.from('gry_sesje').insert([{ user_id: this.user.id, dzien: dzisiajStr(), minuty_grane: minuty }]);
            }
        },

        // Uruchamia licznik czasu gry — co 20s dolicza czas i sprawdza limit.
        // onLimitReached wywoływane raz, gdy limit się skończy w trakcie gry.
        uruchomZegar(onLimitReached) {
            const KROK_MIN = 20 / 60; // 20 sekund w minutach
            this._zegar = setInterval(async () => {
                await this.dodajZagranyCzas(KROK_MIN);
                const pozostalo = await this.pobierzPozostalyCzas();
                this.aktualizujPasekCzasu(pozostalo);
                if (pozostalo <= 0) {
                    clearInterval(this._zegar);
                    if (onLimitReached) onLimitReached();
                }
            }, 20000);
        },

        zatrzymajZegar() {
            if (this._zegar) clearInterval(this._zegar);
        },

        // Dodaje punkty do wyniku danej gry (kumulatywnie) i zwraca nowy total
        async dodajPunkty(gra, ilosc) {
            const { data } = await sb.from('gry_wyniki').select('*').eq('user_id', this.user.id).eq('gra', gra).limit(1);
            const obecne = (data && data[0]) ? data[0].punkty : 0;
            const nowe = obecne + ilosc;
            await sb.from('gry_wyniki').upsert([{ user_id: this.user.id, gra, punkty: nowe, zaktualizowano_gdy: new Date().toISOString() }], { onConflict: 'user_id,gra' });
            return nowe;
        },

        // Postęp "w toku" do progu (np. 15 statków, 2 wygrane) — trzymany osobno,
        // żeby po przyznaniu 1 punktu licznik zaczynał się od nowa.
        async ustawPostep(gra, wartosc) {
            const { data } = await sb.from('gry_wyniki').select('punkty').eq('user_id', this.user.id).eq('gra', gra).limit(1);
            const punkty = (data && data[0]) ? data[0].punkty : 0;
            await sb.from('gry_wyniki').upsert([{ user_id: this.user.id, gra, punkty, licznik_postepu: wartosc, zaktualizowano_gdy: new Date().toISOString() }], { onConflict: 'user_id,gra' });
        },
        async pobierzPostep(gra) {
            const { data } = await sb.from('gry_wyniki').select('*').eq('user_id', this.user.id).eq('gra', gra).limit(1);
            return (data && data[0]) ? data[0] : { punkty: 0, licznik_postepu: 0 };
        },

        aktualizujPasekCzasu(minutyPozostale) {
            const el = document.getElementById('gry-czas-pozostaly');
            if (el) el.innerText = `Pozostały dzisiejszy czas: ${Math.max(0, Math.round(minutyPozostale))} min`;
        },

        // Ekran blokady po wyczerpaniu limitu
        pokazBlokadeLimitu() {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(5,8,20,0.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:Segoe UI,sans-serif;text-align:center;padding:20px;';
            overlay.innerHTML = `<div style="font-size:48px;margin-bottom:16px;">⏳</div><h2 style="margin:0 0 10px;">Dzienny limit gier wykorzystany</h2><p style="color:#94A3B8;max-width:340px;">Wróć jutro po więcej grania. Limit ustala administracja.</p><a href="index.html" style="margin-top:20px;padding:12px 24px;background:#007bff;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Powrót do terminarza</a>`;
            document.body.appendChild(overlay);
        },

        // Górny pasek wspólny dla wszystkich gier: powrót + czas + punkty
        renderujPasekGory(nazwaGry, kontenerId) {
            const kontener = document.getElementById(kontenerId);
            if (!kontener) return;
            const pasek = document.createElement('div');
            pasek.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:rgba(13,27,42,0.85);backdrop-filter:blur(6px);border-radius:12px;margin-bottom:16px;flex-wrap:wrap;gap:8px;';
            pasek.innerHTML = `
                <a href="index.html" style="color:#38BDF8;text-decoration:none;font-weight:bold;font-size:14px;">← Terminarz</a>
                <strong style="color:#fff;">${nazwaGry}</strong>
                <span id="gry-czas-pozostaly" style="color:#94A3B8;font-size:12px;">Pozostały dzisiejszy czas: … min</span>
            `;
            kontener.prepend(pasek);
        },

        // Tło z delikatnie migoczącymi gwiazdami — dodaje styl + gwiazdy do danego kontenera
        stworzGwiazdy(kontenerEl, ilosc) {
            if (!document.getElementById('gry-gwiazdy-styl')) {
                const style = document.createElement('style');
                style.id = 'gry-gwiazdy-styl';
                style.textContent = `
                    .gry-gwiazda { position:absolute; background:#fff; border-radius:50%; animation:gry-migot ease-in-out infinite; }
                    @keyframes gry-migot { 0%,100%{opacity:.15;} 50%{opacity:1;} }
                `;
                document.head.appendChild(style);
            }
            for (let i = 0; i < (ilosc || 80); i++) {
                const s = document.createElement('div');
                const rozmiar = Math.random() * 2 + 1;
                s.className = 'gry-gwiazda';
                s.style.width = rozmiar + 'px';
                s.style.height = rozmiar + 'px';
                s.style.left = Math.random() * 100 + '%';
                s.style.top = Math.random() * 100 + '%';
                s.style.animationDuration = (Math.random() * 3 + 2) + 's';
                s.style.animationDelay = (Math.random() * 3) + 's';
                kontenerEl.appendChild(s);
            }
        }
    };

    window.GryWspolne = GryWspolne;
})();
