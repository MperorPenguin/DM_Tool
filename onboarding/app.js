(function(){
  const agree = document.getElementById('agree');
  const btn = document.getElementById('enterBtn');
  const msg = document.getElementById('consent-msg');

  const setState = () => {
    const ok = agree.checked === true;
    btn.classList.toggle('disabled', !ok);
    btn.setAttribute('aria-disabled', String(!ok));
    msg.textContent = ok ? "Thanks — you can enter the beta." : "";
    if (ok) localStorage.setItem('tp_beta_agreed', 'true');
  };

  if (localStorage.getItem('tp_beta_agreed') === 'true') {
    agree.checked = true;
  }
  setState();

  agree.addEventListener('change', setState);

  btn.addEventListener('click', (e) => {
    if (btn.classList.contains('disabled')) {
      e.preventDefault();
      msg.textContent = "Tick the checkbox to accept the terms before continuing.";
      agree.focus();
    }
  });
})();
