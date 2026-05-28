/* 居酒屋フダヒロパート２ 予約LIFF（フェーズ1） */
(function () {
  'use strict';

  // index.html の window.APP_CONFIG（LIFF_ID / GAS_URL）を読み込む
  const cfg = window.APP_CONFIG || {};

  // フォームの入力状態をまとめて持つ
  const state = {
    settings: null,   // お店の設定（店名・時刻スロットなど）
    idToken: null,    // 本人確認用トークン（GASへ毎回送る）
    profile: null,    // LINEプロフィール（表示名など）
    party: null,      // 人数
    date: null,       // 来店日 "YYYY-MM-DD"
    time: null,       // 時刻 "HH:mm"
    name: '',         // お名前
    phone: ''         // 電話番号
  };

  // ---- 画面切替（指定IDのsectionだけ表示する） ----
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (el) {
      el.classList.toggle('visible', el.id === id);
    });
    window.scrollTo(0, 0);
  }

  // ---- GASへAPIを投げる共通関数 ----
  async function api(action, data) {
    const res = await fetch(cfg.GAS_URL, {
      method: 'POST',
      // GASのdoPostで受けるためのおまじない（text/plainにするとCORSプリフライトを避けられる）
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, idToken: state.idToken, data: data || {} })
    });
    if (!res.ok) throw new Error('通信に失敗しました');
    return await res.json();
  }

  // ---- 初期化（LIFF起動 → ログイン → 設定取得） ----
  async function init() {
    try {
      await liff.init({ liffId: cfg.LIFF_ID });
      // LINEにログインしていなければログイン画面へ
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }
      state.idToken = liff.getIDToken();
      state.profile = await liff.getProfile();

      const r = await api('settings');
      if (!r.ok) throw new Error(r.error || '初期化に失敗しました');
      state.settings = r.settings;

      applySettings();
      show('step-party');
    } catch (e) {
      console.error(e);
      document.getElementById('loading').innerHTML =
        '<p class="error">初期化に失敗しました：' + (e.message || e) + '</p>';
    }
  }

  // ---- お店の設定を画面に反映 ----
  function applySettings() {
    const s = state.settings;
    document.getElementById('shopName').textContent = s.shopName || '居酒屋フダヒロパート２';

    // フッターの電話リンク
    const telDigits = (s.phone || '').replace(/[^0-9]/g, '');
    const telFoot = document.getElementById('telFoot');
    telFoot.textContent = s.phone || '店舗';
    telFoot.href = telDigits ? 'tel:' + telDigits : '#';

    // お客さんの表示名を初期値に入れておく（変更可）
    document.getElementById('name').value = (state.profile && state.profile.displayName) || '';

    buildPartyGrid(s.maxParty || 8);
    setupDateInput(s.maxAcceptDays || 60);
  }

  // ---- ステップ1: 人数ボタンを生成 ----
  function buildPartyGrid(maxParty) {
    const grid = document.getElementById('partyGrid');
    grid.innerHTML = '';
    for (let i = 1; i <= maxParty; i++) {
      const btn = document.createElement('button');
      btn.className = 'btn-tile';
      btn.textContent = i + '名';
      btn.addEventListener('click', function () {
        state.party = i;
        show('step-date');
      });
      grid.appendChild(btn);
    }
    document.getElementById('partyNote').textContent =
      maxParty + '名を超えるご予約は、お電話にてお願いいたします。';
  }

  // ---- ステップ2: 日付入力（今日〜maxAcceptDays先まで） ----
  function setupDateInput(maxDays) {
    const input = document.getElementById('dateInput');
    const today = new Date();
    const max = new Date();
    max.setDate(max.getDate() + maxDays);
    input.min = formatYmd(today);
    input.max = formatYmd(max);
    document.getElementById('dateNote').textContent =
      '本日から' + maxDays + '日先までご予約いただけます。';
  }

  document.getElementById('toTime').addEventListener('click', function () {
    const val = document.getElementById('dateInput').value;
    if (!val) { alert('ご来店日を選んでください'); return; }
    state.date = val;
    const d = new Date(val + 'T00:00:00+09:00');
    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    document.getElementById('dateLabel').textContent =
      state.date + '（' + dow + '）/ ' + state.party + '名';
    buildTimeGrid();
    show('step-time');
  });

  // ---- ステップ3: 時刻ボタンを生成 ----
  function buildTimeGrid() {
    const grid = document.getElementById('timeGrid');
    grid.innerHTML = '';
    (state.settings.timeSlots || []).forEach(function (t) {
      const btn = document.createElement('button');
      btn.className = 'btn-tile';
      btn.textContent = t;
      btn.addEventListener('click', function () {
        state.time = t;
        show('step-contact');
      });
      grid.appendChild(btn);
    });
  }

  // ---- ステップ4: お名前・電話 → 確認画面へ ----
  document.getElementById('toConfirm').addEventListener('click', function () {
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    if (!name) { alert('お名前を入力してください'); return; }
    if (!/^[0-9\-+]{8,15}$/.test(phone)) { alert('お電話番号をご確認ください'); return; }
    state.name = name;
    state.phone = phone;
    renderConfirm();
    show('step-confirm');
  });

  function renderConfirm() {
    document.getElementById('confDate').textContent = state.date + ' ' + state.time + '〜';
    document.getElementById('confParty').textContent = state.party + '名';
    document.getElementById('confName').textContent = state.name + ' 様';
    document.getElementById('confPhone').textContent = state.phone;
  }

  // ---- ステップ5: 確定（GASへ送信） ----
  document.getElementById('submit').addEventListener('click', async function () {
    const btn = this;
    const err = document.getElementById('submitError');
    err.textContent = '';
    btn.disabled = true;
    try {
      const r = await api('create', {
        date: state.date,
        time: state.time,
        partySize: state.party,
        name: state.name,
        phone: state.phone
      });
      if (!r.ok) {
        err.textContent = r.error || '予約に失敗しました';
        btn.disabled = false;
        return;
      }
      renderDone(r.reservation);
      show('step-done');
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  });

  function renderDone(r) {
    document.getElementById('doneSummary').innerHTML =
      '<dt>予約番号</dt><dd>' + r.id + '</dd>' +
      '<dt>日時</dt><dd>' + r.date + ' ' + r.time + '〜</dd>' +
      '<dt>人数</dt><dd>' + r.partySize + '名</dd>' +
      '<dt>お名前</dt><dd>' + r.name + ' 様</dd>';
  }

  // ---- 完了画面の「閉じる」ボタン ----
  document.getElementById('closeBtn').addEventListener('click', function () {
    // LIFFブラウザで開いている場合はウィンドウを閉じる
    if (liff.isInClient()) {
      liff.closeWindow();
    } else {
      show('step-party');
    }
  });

  // ---- data-jump属性で画面を戻る ----
  document.addEventListener('click', function (e) {
    const t = e.target.closest('[data-jump]');
    if (!t) return;
    show(t.dataset.jump);
  });

  // ---- ヘルパ: Date → "YYYY-MM-DD" ----
  function formatYmd(d) {
    const y = d.getFullYear();
    const m = ('0' + (d.getMonth() + 1)).slice(-2);
    const dd = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + dd;
  }

  // 起動
  init();
})();
