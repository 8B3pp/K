<script src="https://unpkg.com/@supabase/supabase-js@2"></script>

<script>
if (typeof window.supabaseClient === 'undefined') {
  const SUPABASE_URL = 'https://uvjgmxvfzvweoxeicned.supabase.co'; 
  const SUPABASE_ANON_KEY = 'sb_publishable_hGHRqdmuObIyLnpzVzZiPA_Cslp7V1G';
  window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
const supabaseInstance = window.supabaseClient;

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

supabaseInstance.auth.onAuthStateChange((event, session) => {
  const obecnaStrona = window.location.pathname.toLowerCase();
  if (session) {
    if (event === 'SIGNED_IN') {
      if (obecnaStrona.includes('rejestracja')) { alert("Poprawnie zarejestrowano i zalogowano!"); window.location.href = '/'; }
      else if (obecnaStrona.includes('logowanie')) { alert("Poprawnie zalogowano!"); window.location.href = '/'; }
    }
  } else {
    if (['/', '', '/dashboard'].includes(obecnaStrona)) window.location.href = '/logowanie';
  }
});

function generujFakeEmail(imie, nazwisko) {
  let czysteImie = imie.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]/g, '');
  let czysteNazwisko = nazwisko.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]/g, '');
  return czysteImie + czysteNazwisko + '@klasa.com';
}

document.addEventListener("DOMContentLoaded", () => {
  const btnRejestracja = document.getElementById('btn-rejestracja');
  if (btnRejestracja) {
    btnRejestracja.addEventListener('click', async () => {
      const imie = document.getElementById('reg-imie').value;
      const nazwisko = document.getElementById('reg-nazwisko').value;
      const password = document.getElementById('reg-password').value;
      if (!imie || !nazwisko || !password) return alert("Wypełnij wszystkie pola!");
      const fakeEmail = generujFakeEmail(imie, nazwisko);
      const { data, error } = await supabaseInstance.auth.signUp({ email: fakeEmail, password });
      if (error) return alert("Błąd rejestracji: " + error.message);
      if (data.user) {
        await supabaseInstance.from('profiles').insert([{ id: data.user.id, imie, nazwisko }]);
        const { data: adminData } = await supabaseInstance.from('profiles').select('id').eq('imie', 'Hubert').eq('nazwisko', 'Bereźnicki').single();
        if (adminData) {
          await supabaseInstance.from('wiadomosci').insert([{
            nadawca_id: adminData.id, odbiorca_id: data.user.id,
            temat: 'Witamy w terminarzu 6B!',
            tresc: `Witaj! To jest automatyczna wiaodmość, witamy cię w terminarzu 6B, który jest najbardziej pomocnym projektem w naszel klasie.\n\nRegulamin:\n1.Nie przeklinaj do innych w wiadomości i nie spam, wszystko jest zapisywane a zgłoszenie dla drugiej osoby to nie problem\n2.nie zgłaszaj każdej osoby\n3.Regularnie sprawdzaj terminarz\n\nŻyczę miłęgo korzystania! (By Hubert B. 6B)`,
            priorytet: 'zwykly'
          }]);
        }
        alert("Konto założone pomyślnie!");
        window.location.href = '/';
      }
    });
  }

  const btnLogowanie = document.getElementById('btn-logowanie');
  if (btnLogowanie) {
    btnLogowanie.addEventListener('click', async () => {
      const imie = document.getElementById('login-imie').value;
      const nazwisko = document.getElementById('login-nazwisko').value;
      const password = document.getElementById('login-password').value;
      if (!imie || !nazwisko || !password) return alert("Wypełnij wszystkie pola!");
      const fakeEmail = generujFakeEmail(imie, nazwisko);
      const { error } = await supabaseInstance.auth.signInWithPassword({ email: fakeEmail, password });
      if (error) return alert("Błędne imię, nazwisko lub hasło!");
      window.location.href = '/';
    });
  }
});
</script>