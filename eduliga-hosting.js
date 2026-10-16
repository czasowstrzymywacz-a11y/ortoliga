/* Keep local progress and authentication callbacks safe while changing origin. */
(() => {
  const destination = 'https://eduliga.web.app/';
  if (location.hostname !== 'czasowstrzymywacz-a11y.github.io' || !location.pathname.startsWith('/eduliga/')) return;
  const hasProgress = value => {
    if (!value || typeof value !== 'object') return false;
    return !!(value.sessions?.length || Object.keys(value.words || {}).length ||
      value.history?.length || value.events?.length || Number(value.xp) ||
      hasProgress(value.englishLeague) || hasProgress(value.spanishLeague) || hasProgress(value.orthoBattle));
  };
  let protectedStorage = false;
  try {
    for (const key of Object.keys(localStorage)) {
      if (/^sb-.*-auth-token$/.test(key) || key.startsWith('ortoliga-pending:')) {
        protectedStorage = true;
        break;
      }
      if (/^(ortoliga-progress-v2:|liga-english-v1:|ortoliga-legacy-unclaimed$|iskierka-progress-v1$)/.test(key)) {
        try { if (hasProgress(JSON.parse(localStorage.getItem(key)))) { protectedStorage = true; break; } }
        catch { protectedStorage = true; break; }
      }
    }
  } catch { protectedStorage = true; }
  const callback = !!location.hash || /(?:code|token|type|error)=/.test(location.search);
  // Never send session tokens or recovery links to another origin.
  if (!protectedStorage && !callback) { location.replace(destination); return; }

  const banner = document.createElement('section');
  banner.className = 'eduliga-address-notice';
  banner.setAttribute('aria-label', 'Nowy adres EduLigi');
  const title = document.createElement('strong'); title.textContent = 'EduLiga ma nowy adres: eduliga.web.app';
  const note = document.createElement('p');
  note.textContent = 'Możesz nadal korzystać z tego adresu. Wyniki zapisane tylko na tym urządzeniu pozostają tutaj. Przed przejściem na nowy adres zapisz postępy na swoim koncie. Na nowym adresie zaloguj się ponownie.';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'primary';
  button.textContent = 'Otwórz nowy adres →';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  banner.append(title, note, button, status);
  document.querySelector('main')?.prepend(banner);
  const style = document.createElement('style');
  style.textContent = '.eduliga-address-notice{padding:18px;margin:0 0 18px;border:1px solid #73b8dc;border-radius:18px;background:#e9f6ff;color:#183c56}.eduliga-address-notice p{line-height:1.5;margin:9px 0}.eduliga-address-notice button{max-width:100%;white-space:normal}.eduliga-address-notice [role=status]:empty{display:none}';
  document.head.append(style);
  button.onclick = async () => {
    if (typeof passwordRecoveryActive !== 'undefined' && passwordRecoveryActive) {
      status.textContent = 'Najpierw zakończ zmianę hasła na tym ekranie.'; return;
    }
    button.disabled = true;
    try {
      const account = typeof syncUser !== 'undefined' ? syncUser : null;
      if (account) {
        status.textContent = 'Zapisuję wyniki na Twoim koncie…';
        if (!syncReady) throw new Error('Poczekaj na zakończenie wczytywania konta i spróbuj ponownie.');
        // A save may already be in flight; the second call captures later changes.
        let saved = await writeCloudProgress();
        if (saved && localStorage.getItem('ortoliga-pending:' + account.id)) saved = await writeCloudProgress();
        if (!saved || syncUser?.id !== account.id || localStorage.getItem('ortoliga-pending:' + account.id)) {
          throw new Error('Zapis nie został potwierdzony. Zostań na tym adresie i spróbuj ponownie po odzyskaniu połączenia.');
        }
      } else if (!confirm('Wyniki zapisane tylko na tym urządzeniu pozostaną pod starym adresem. Możesz wrócić do nich, otwierając stary link. Otworzyć teraz nowy adres?')) return;
      location.assign(destination);
    } catch (error) { status.textContent = error.message || 'Nie udało się zapisać wyników. Spróbuj ponownie.'; }
    finally { button.disabled = false; }
  };
})();
