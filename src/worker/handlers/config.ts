const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NextTrain – Rename Favorites</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, sans-serif; background: #f5f5f5; padding: 16px; }
  h1 { font-size: 18px; margin-bottom: 16px; color: #111; }
  .card { background: #fff; border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; }
  label { display: block; font-size: 11px; color: #888; margin-bottom: 4px; }
  input { width: 100%; font-size: 16px; border: none; outline: none; color: #111; }
  .slug { font-size: 12px; color: #aaa; margin-top: 4px; }
  .empty { color: #aaa; text-align: center; padding: 32px 0; }
  button {
    display: block; width: 100%; margin-top: 20px; padding: 14px;
    background: #007aff; color: #fff; border: none; border-radius: 8px;
    font-size: 16px; font-weight: 600; cursor: pointer;
  }
  button:active { opacity: 0.8; }
</style>
</head>
<body>
<h1>Rename Favorites</h1>
<div id="list"></div>
<script>
(function() {
  var params = new URLSearchParams(location.search);
  var favs = [];
  try { favs = JSON.parse(params.get('favs') || '[]'); } catch(e) {}

  var origNames = {};
  favs.forEach(function(f) { origNames[f.i] = f.n || ''; });

  var list = document.getElementById('list');

  if (!favs.length) {
    list.innerHTML = '<p class="empty">No favorites on watch yet.</p>';
    return;
  }

  favs.forEach(function(f) {
    var slug = f.s || '';
    var display = slug.replace(/_/g, ' ').replace(/\\b\\w/g, function(c) { return c.toUpperCase(); });
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<label>Name</label>' +
      '<input type="text" maxlength="23" data-idx="' + f.i + '" value="' + escHtml(f.n || '') + '" placeholder="' + escHtml(display) + '">' +
      '<div class="slug">' + escHtml(display) + '</div>';
    list.appendChild(card);
  });

  var btn = document.createElement('button');
  btn.textContent = 'Save';
  btn.onclick = function() {
    var changes = [];
    var inputs = document.querySelectorAll('input[data-idx]');
    for (var i = 0; i < inputs.length; i++) {
      var idx = parseInt(inputs[i].getAttribute('data-idx'), 10);
      var val = inputs[i].value.trim().slice(0, 23);
      if (val !== (origNames[idx] || '')) {
        changes.push({ i: idx, n: val });
      }
    }
    var encoded = encodeURIComponent(JSON.stringify(changes));
    location.href = 'pebblejs://close#' + encoded;
  };
  list.appendChild(btn);

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }
})();
</script>
</body>
</html>`;

export function handleConfig(): Response {
  return new Response(HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
