/* ==========================================
   PWA - instalação do app no celular / computador
   Carregue este arquivo DEPOIS do script.js
========================================== */
var pwaEvento = null;

function pwaInstalado() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function pwaEhIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
           (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/* Cartão "Instalar aplicativo" na tela Perfil */
function pwaRender() {
    var box = document.getElementById("pwaCard");
    if (!box) return;

    if (pwaInstalado()) {
        box.style.display = "none";
        return;
    }
    box.style.display = "block";

    var corpo = document.getElementById("pwaCorpo");

    if (pwaEvento) {
        corpo.innerHTML =
            '<p class="dica" style="margin:0 0 12px">Instale o app na tela inicial: abre em tela cheia, como um aplicativo, e continua abrindo mesmo com internet fraca.</p>' +
            '<button class="btn-pri cheio" style="margin-top:0" onclick="pwaInstalar()"><i class="fa-solid fa-download"></i> Instalar aplicativo</button>';
    } else if (pwaEhIOS()) {
        corpo.innerHTML =
            '<p class="dica" style="margin:0">No iPhone/iPad, abra este endereço no <b>Safari</b>, toque no botão <b>Compartilhar</b> ' +
            '<i class="fa-solid fa-arrow-up-from-bracket"></i> e escolha <b>Adicionar à Tela de Início</b>.</p>';
    } else {
        corpo.innerHTML =
            '<p class="dica" style="margin:0">Para instalar, abra o menu do navegador (⋮) e escolha <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>. ' +
            'No computador, procure o ícone de instalar na barra de endereço.</p>';
    }
}

function pwaInstalar() {
    if (!pwaEvento) return;
    pwaEvento.prompt();
    pwaEvento.userChoice.then(function (r) {
        if (r.outcome === "accepted") toast("Instalando o aplicativo...");
        pwaEvento = null;
        pwaRender();
    });
}

window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    pwaEvento = e;
    pwaRender();
});

window.addEventListener("appinstalled", function () {
    pwaEvento = null;
    pwaRender();
    toast("Aplicativo instalado ✔");
});

/* Atualiza o cartão sempre que o perfil é aberto */
(function () {
    var irOriginal = ir;
    ir = function (nome) {
        irOriginal(nome);
        if (nome === "perfil") pwaRender();
    };
})();

/* Service worker (só funciona em https ou localhost) */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {});
    });

    // Quando uma versão nova assume o controle, recarrega uma vez
    var pwaRecarregou = false;
    var pwaTinhaControle = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (!pwaTinhaControle || pwaRecarregou) { pwaTinhaControle = true; return; }
        pwaRecarregou = true;
        if (viewAtual !== "nova" && !$("sheet").classList.contains("on")) location.reload();
    });
}

pwaRender();
