/* ==========================================
   SERVICE WORKER - app instalável e uso offline
   Não precisa mexer: ao publicar uma versão nova,
   o app se atualiza sozinho quando o aparelho tem internet.
========================================== */
var VERSAO = "manutencao-v1";
var CACHE_APP = VERSAO + "-app";
var CACHE_LIVRE = VERSAO + "-externo";   // ícones, fontes e bibliotecas de CDN
var CACHE_FOTOS = VERSAO + "-fotos";     // fotos do Supabase Storage
var MAX_FOTOS = 150;

var ARQUIVOS = [
    "./",
    "index.html",
    "style.css",
    "script.js",
    "supabase.js",
    "pwa.js",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/apple-touch-icon.png",
    "icons/favicon-32.png"
];

self.addEventListener("install", function (e) {
    e.waitUntil(
        caches.open(CACHE_APP).then(function (c) { return c.addAll(ARQUIVOS); })
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener("activate", function (e) {
    e.waitUntil(
        caches.keys().then(function (nomes) {
            return Promise.all(nomes.filter(function (n) {
                return n.indexOf(VERSAO) !== 0;
            }).map(function (n) { return caches.delete(n); }));
        }).then(function () { return self.clients.claim(); })
    );
});

function limitar(nome, max) {
    caches.open(nome).then(function (c) {
        c.keys().then(function (ks) {
            if (ks.length > max) {
                ks.slice(0, ks.length - max).forEach(function (k) { c.delete(k); });
            }
        });
    });
}

// Rede primeiro (pega a versão nova); se demorar ou falhar, usa o que está guardado
function redePrimeiro(req) {
    return new Promise(function (resolve) {
        var respondeu = false;

        function doCache() {
            return caches.match(req, { ignoreSearch: true }).then(function (r) {
                return r || (req.mode === "navigate" ? caches.match("index.html") : undefined);
            });
        }

        var tempo = setTimeout(function () {
            doCache().then(function (r) { if (r && !respondeu) { respondeu = true; resolve(r); } });
        }, 4000);

        fetch(req).then(function (res) {
            clearTimeout(tempo);
            if (res && res.ok) {
                var copia = res.clone();
                caches.open(CACHE_APP).then(function (c) { c.put(req, copia); });
            }
            if (!respondeu) { respondeu = true; resolve(res); }
        }).catch(function () {
            clearTimeout(tempo);
            if (respondeu) return;
            doCache().then(function (r) {
                respondeu = true;
                resolve(r || new Response("Sem conexão", { status: 503, statusText: "Offline" }));
            });
        });
    });
}

// Cache primeiro (fontes, bibliotecas e fotos quase nunca mudam)
function cachePrimeiro(req, nomeCache, max) {
    return caches.open(nomeCache).then(function (c) {
        return c.match(req).then(function (r) {
            if (r) return r;
            return fetch(req).then(function (res) {
                if (res && (res.ok || res.type === "opaque")) {
                    c.put(req, res.clone());
                    if (max) limitar(nomeCache, max);
                }
                return res;
            });
        });
    });
}

self.addEventListener("fetch", function (e) {
    var req = e.request;
    if (req.method !== "GET") return;

    var url = new URL(req.url);

    // Supabase: só as fotos ficam guardadas; dados (API) sempre direto da rede
    if (url.hostname.slice(-12) === ".supabase.co") {
        if (url.pathname.indexOf("/storage/v1/object/public/") === 0) {
            e.respondWith(cachePrimeiro(req, CACHE_FOTOS, MAX_FOTOS));
        }
        return;
    }

    // Arquivos do próprio app
    if (url.origin === self.location.origin) {
        e.respondWith(redePrimeiro(req));
        return;
    }

    // Bibliotecas e fontes de CDN
    if (/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
        e.respondWith(cachePrimeiro(req, CACHE_LIVRE, 0));
    }
});

// Toque em uma notificação: abre/foca o app
self.addEventListener("notificationclick", function (e) {
    e.notification.close();
    e.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (lista) {
            for (var i = 0; i < lista.length; i++) {
                if ("focus" in lista[i]) return lista[i].focus();
            }
            return self.clients.openWindow("./");
        })
    );
});
