<?php
require __DIR__ . '/api/bootstrap.php';
session_start();

$me = $_SESSION['me'] ?? null;
$csrf = ensure_csrf();

$themes = json_read(__DIR__ . '/data/themes.json', ['default' => 'dark', 'list' => []]);
$apps = json_read(__DIR__ . '/data/apps.json', ['apps' => []]);

$activeTheme = $themes['default'] ?? 'dark';
if ($me) {
  $state = user_state_read($me);
  if (isset($state['theme'])) $activeTheme = $state['theme'];
}
?><!DOCTYPE html>
<html lang="en" data-theme="<?php echo h($activeTheme); ?>">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WebDesktop</title>
  <link rel="stylesheet" href="assets/style.css" />
</head>
<body class="<?php echo $me ? 'is-auth' : 'is-guest'; ?>">
<?php if (!$me): ?>
<main class="login">
<form class="card" method="post" action="api/auth.php">
<h1>Sign in</h1>
<label><span>Username</span><input name="username" required /></label>
<label><span>Password</span><input name="password" type="password" required /></label>
<input type="hidden" name="csrf" value="<?php echo h($csrf); ?>" />
<button type="submit">Login</button>
<p class="muted">Demo user: <code>admin</code> / <code>admin</code></p>
</form></main>
<?php else: ?>
<header class="topbar"><div class="brand">WebDesktop</div><div class="spacer"></div>
<div class="clock" id="clock"></div>
<form method="post" action="api/auth.php"><input type="hidden" name="csrf" value="<?php echo h($csrf); ?>"><input type="hidden" name="action" value="logout"><button>⎋</button></form></header>
<nav class="dock" id="dock">
<?php foreach (($apps['apps'] ?? []) as $app): ?>
<button class="dock-item" data-app-id="<?php echo h($app['id']); ?>" title="<?php echo h($app['name']); ?>">
<?php echo !empty($app['icon']) ? '<img src="'.h($app['icon']).'" alt="">' : '■'; ?>
<span><?php echo h($app['name']); ?></span></button>
<?php endforeach; ?>
</nav>
<main id="desktop" class="desktop"></main>
<footer class="taskbar" id="taskbar"></footer>
<script>window.__WD__={me:<?php echo json_encode($me); ?>,csrf:<?php echo json_encode($csrf); ?>,appsEndpoint:'api/apps.php',stateEndpoint:'api/state.php'};</script>
<script src="assets/desktop.js"></script>
<?php endif; ?>
</body></html>