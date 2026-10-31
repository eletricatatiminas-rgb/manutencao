/* ==========================================
   CONSTANTES
========================================== */
var STAT = {
    aguardando: { t: "Aguardando aceite", c: "s-aguardando" },
    andamento:  { t: "Em andamento",      c: "s-andamento" },
    final:      { t: "Finalizada",        c: "s-final" }
};

var PRIOR = {
    baixa:   { t: "Baixa",   c: "p-baixa",   k: "pb" },
    media:   { t: "Média",   c: "p-media",   k: "pm" },
    alta:    { t: "Alta",    c: "p-alta",    k: "pa" },
    urgente: { t: "Urgente", c: "p-urgente", k: "pu" }
};

var TIPOS = ["Corretiva", "Preventiva", "Preditiva", "Melhoria"];
var SETORES_PADRAO = ["Produção", "Elétrica", "Mecânica", "Utilidades", "Logística", "Outro"];
var TIPOS_EVENTO = ["Manutenção preventiva", "Inspeção", "Parada programada", "Reunião", "Treinamento", "Outro"];
var MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
var DIAS = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
var MAX_FOTOS = 8;
var UNIDADES = ["un", "m", "kg", "L", "cx", "par", "rolo"];

/* ==========================================
   ESTADO
========================================== */
var usuarios = [];
var ordens = [];
var setores = [];
var eventos = [];
var avisos = [];
var formItens = [];
var empresa = { nome: "", logo: "" };
var sessao = null;
var DB = null;
var viewAtual = "inicio";
var filtro = "todas";
var soMinhas = false;
var calMes = new Date();
calMes.setDate(1);
var calSel = hoje();
var formFotos = { antes: [], depois: [] };
var pickCtx = null;
var loginSel = null;
var edId = null;
var edFoto = "";

/* ==========================================
   UTILITÁRIOS
========================================== */
function $(id) { return document.getElementById(id); }

function esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function iso(d) {
    var m = d.getMonth() + 1, dia = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (dia < 10 ? "0" : "") + dia;
}

function hoje() { return iso(new Date()); }

function somaDias(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return iso(d);
}

function dataDe(s) {
    var p = s.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function diasAte(s) {
    var a = new Date();
    a.setHours(0, 0, 0, 0);
    return Math.round((dataDe(s) - a) / 86400000);
}

function fmtData(s) {
    if (!s) return "—";
    var p = s.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
}

function num(id) { return "#" + String(id).padStart(4, "0"); }

function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toast.h);
    toast.h = setTimeout(function () { t.classList.remove("on"); }, 2600);
}

function user() {
    return usuarios.filter(function (u) { return u.id === sessao; })[0];
}

function ehAdmin() {
    var u = user();
    return !!u && u.papel === "admin";
}

function userPorId(id) {
    return usuarios.filter(function (x) { return x.id === id; })[0];
}

function nomeDe(id) {
    var u = userPorId(id);
    return u ? u.nome : "(removido)";
}

function inicialDe(nome) { return (nome || "?").trim().charAt(0).toUpperCase(); }

function atrasada(o) {
    return o.status !== "final" && o.data && o.data < hoje();
}

function buscar(id) {
    id = Number(id);
    return ordens.filter(function (o) { return o.id === id; })[0];
}

function buscarEv(id) {
    id = Number(id);
    return eventos.filter(function (e) { return e.id === id; })[0];
}

function proximoId(lista) {
    return lista.length ? Math.max.apply(null, lista.map(function (x) { return x.id; })) + 1 : 1;
}

function tecnicos() {
    return usuarios.filter(function (u) { return u.papel === "tecnico"; });
}

function paraMim(e) {
    return ehAdmin() || e.para === "todos" || e.para === sessao;
}

// Preenche um elemento de avatar (letra ou foto)
function setAvatar(el, u) {
    if (!el) return;
    if (u && u.foto) {
        el.classList.add("tem-foto");
        el.style.backgroundImage = "url(" + u.foto + ")";
        el.textContent = "";
    } else {
        el.classList.remove("tem-foto");
        el.style.backgroundImage = "";
        el.textContent = inicialDe(u ? u.nome : "?");
    }
}

function avatarHTML(u, cls) {
    if (u && u.foto) return '<div class="' + cls + ' tem-foto" style="background-image:url(' + u.foto + ')"></div>';
    return '<div class="' + cls + '">' + esc(inicialDe(u ? u.nome : "?")) + "</div>";
}

/* ==========================================
   ARMAZENAMENTO (IndexedDB, com plano B)
========================================== */
function abrirDB() {
    return new Promise(function (res) {
        try {
            var r = indexedDB.open("manutencao", 1);
            r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
            r.onsuccess = function () { DB = r.result; res(); };
            r.onerror = function () { res(); };
        } catch (e) { res(); }
    });
}

function kvGet(k) {
    return new Promise(function (res) {
        if (DB) {
            try {
                var q = DB.transaction("kv").objectStore("kv").get(k);
                q.onsuccess = function () { res(q.result); };
                q.onerror = function () { res(); };
            } catch (e) { res(); }
        } else {
            try { res(JSON.parse(localStorage.getItem(k))); } catch (e) { res(); }
        }
    });
}

function kvSet(k, v) {
    if (DB) {
        try { DB.transaction("kv", "readwrite").objectStore("kv").put(v, k); } catch (e) {}
    } else {
        try { localStorage.setItem(k, JSON.stringify(v)); }
        catch (e) { toast("Memória cheia: não foi possível salvar"); }
    }
}

function salvar() {
    kvSet("ordens", ordens);
    kvSet("usuarios", usuarios);
    kvSet("setores", setores);
    kvSet("eventos", eventos);
    kvSet("avisos", avisos);
    kvSet("empresa", empresa);
    if (typeof sbSync === "function") sbSync();
}

function dadosIniciais() {
    usuarios = [
        { id: 1, nome: "Líder",  papel: "admin",   pin: "1234", funcao: "Líder de Manutenção", tel: "", foto: "" },
        { id: 2, nome: "André",  papel: "tecnico", pin: "1111", funcao: "Técnico Mecânico",    tel: "", foto: "" },
        { id: 3, nome: "Marcos", papel: "tecnico", pin: "1111", funcao: "Eletricista",         tel: "", foto: "" },
        { id: 4, nome: "Carlos", papel: "tecnico", pin: "1111", funcao: "Técnico de Utilidades", tel: "", foto: "" }
    ];
    ordens = [
        { id: 1, titulo: "Motor da Esteira 01", setor: "Produção",   tipo: "Corretiva",  prior: "urgente", origem: "designada", tecId: 2, criadaPor: 1, data: somaDias(-2), status: "aguardando", desc: "Motor aquecendo e desarmando o disjuntor.", criada: somaDias(-5) },
        { id: 2, titulo: "Compressor de Ar",    setor: "Utilidades", tipo: "Preventiva", prior: "media",   origem: "designada", tecId: 3, criadaPor: 1, data: hoje(),       status: "andamento",  desc: "Troca de filtros e verificação de óleo.",   criada: somaDias(-3), aceitaEm: somaDias(-1) },
        { id: 3, titulo: "Painel Elétrico",     setor: "Elétrica",   tipo: "Preditiva",  prior: "alta",    origem: "designada", tecId: 2, criadaPor: 1, data: somaDias(2),  status: "aguardando", desc: "Termografia dos barramentos.",               criada: somaDias(-1) },
        { id: 4, titulo: "Empilhadeira 02",     setor: "Logística",  tipo: "Preventiva", prior: "media",   origem: "campo",     tecId: 4, criadaPor: 4, data: somaDias(-1), status: "final",      desc: "Troca do filtro hidráulico e lubrificação.", criada: somaDias(-1), concluida: somaDias(-1) }
    ];
    setores = SETORES_PADRAO.slice();
    eventos = [
        { id: 1, titulo: "Parada programada - Linha 2", data: somaDias(2), hora: "07:00", tipo: "Parada programada", para: "todos", desc: "Todos os técnicos na linha às 07h.", criadoPor: 1, criadoEm: Date.now() }
    ];
}

function normalizar() {
    ordens.forEach(function (o) {
        if (!o.fotos) o.fotos = { antes: [], depois: [] };
        if (!o.itens) o.itens = [];
    });
    usuarios.forEach(function (u) {
        if (!u.funcao) u.funcao = u.papel === "admin" ? "Líder de Manutenção" : "Técnico de Manutenção";
        if (u.tel == null) u.tel = "";
        if (u.foto == null) u.foto = "";
    });
    if (!setores || !setores.length) setores = SETORES_PADRAO.slice();
    ordens.forEach(function (o) {
        if (setores.indexOf(o.setor) === -1) setores.push(o.setor);
    });
    if (!eventos) eventos = [];
    if (!empresa || typeof empresa !== "object") empresa = { nome: "", logo: "" };
    if (!empresa.nome) empresa.nome = "";
    if (!empresa.logo) empresa.logo = "";
    if (!avisos) avisos = [];

    // descarta avisos com mais de 30 dias
    var limite = Date.now() - 30 * 86400000;
    avisos = avisos.filter(function (a) { return a.em > limite; });
}

/* ==========================================
   LOGIN / SESSÃO
========================================== */
function renderLogin() {
    var q = $("loginBusca").value.trim().toLowerCase();

    var lista = usuarios.filter(function (u) {
        if (!q) return true;
        return (u.nome + " " + u.funcao).toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) {
        if (a.papel !== b.papel) return a.papel === "admin" ? -1 : 1;   // líder primeiro
        return a.nome.localeCompare(b.nome, "pt-BR");
    });

    if (!lista.length) {
        $("loginUsers").innerHTML = '<div class="login-vazio">Nenhum usuário encontrado.</div>';
        return;
    }

    $("loginUsers").innerHTML = lista.map(function (u) {
        return '<button class="login-item' + (u.papel === "admin" ? " admin" : "") + '" onclick="selecionarLogin(' + u.id + ')">' +
            avatarHTML(u, "av") +
            '<span class="login-item-tx"><b>' + esc(u.nome) + '</b><small>' + (u.papel === "admin" ? "Líder · " : "") + esc(u.funcao) + '</small></span>' +
            '<i class="fa-solid fa-chevron-right"></i></button>';
    }).join("");
}

function aplicarMarca() {
    var temLogo = !!empresa.logo;

    var box = $("loginLogo");
    box.classList.toggle("tem-logo", temLogo);
    box.innerHTML = temLogo
        ? '<img src="' + empresa.logo + '" alt="Logo">'
        : '<i class="fa-solid fa-screwdriver-wrench"></i>';

    $("loginEmpresa").textContent = empresa.nome || "Controle de Manutenção";

    var t = $("topoLogo");
    t.style.display = temLogo ? "block" : "none";
    if (temLogo) t.src = empresa.logo; else t.removeAttribute("src");
    $("topo").classList.toggle("com-logo", temLogo);
}

function mostrarLogin() {
    loginSel = null;
    $("loginBusca").value = "";
    $("loginPin").style.display = "none";
    $("loginEscolha").style.display = "block";
    $("login").classList.add("on");
    aplicarMarca();
    renderLogin();
}

function selecionarLogin(id) {
    var u = userPorId(id);
    if (!u) return;
    loginSel = id;
    $("loginAv").className = "login-av";
    setAvatar($("loginAv"), u);
    $("loginNome").textContent = u.nome;
    $("loginFuncao").textContent = u.papel === "admin" ? "Líder · " + u.funcao : u.funcao;
    $("pinInput").value = "";
    $("loginErro").classList.remove("on");
    $("loginEscolha").style.display = "none";
    $("loginPin").style.display = "block";
    $("pinInput").focus();
}

function voltarLogin() {
    loginSel = null;
    $("loginPin").style.display = "none";
    $("loginEscolha").style.display = "block";
    $("loginBusca").focus();
}

function entrar() {
    var u = userPorId(loginSel);
    if (!u) return;
    if ($("pinInput").value !== u.pin) {
        $("loginErro").classList.add("on");
        $("pinInput").value = "";
        $("pinInput").classList.remove("treme");
        void $("pinInput").offsetWidth;
        $("pinInput").classList.add("treme");
        $("pinInput").focus();
        return;
    }
    iniciarSessao(u.id);
}

function iniciarSessao(id) {
    sessao = id;
    try { localStorage.setItem("mc_sessao", String(id)); } catch (e) {}
    var adm = ehAdmin();
    document.body.classList.toggle("papel-admin", adm);
    document.body.classList.toggle("papel-tec", !adm);
    $("login").classList.remove("on");
    aplicarMarca();
    filtro = "todas";
    soMinhas = false;
    calSel = hoje();
    calMes = new Date();
    calMes.setDate(1);
    montarSelects();
    ir("inicio");
    setTimeout(notificarSistema, 1200);
}

function sair() {
    try { localStorage.removeItem("mc_sessao"); } catch (e) {}
    sessao = null;
    fecharOS();
    mostrarLogin();
}

/* ==========================================
   NAVEGAÇÃO
========================================== */
function cabecalho(nome) {
    var adm = ehAdmin();
    if (nome === "inicio")     return [saudacao() + ", " + user().nome, adm ? "Painel do líder" : "Painel do técnico"];
    if (nome === "os")         return ["Ordens de Serviço", ordens.length + " ordens cadastradas"];
    if (nome === "calendario") return ["Calendário", "Prazos, serviços e eventos"];
    if (nome === "perfil")     return ["Meu Perfil", user().funcao];
    if (nome === "nova") {
        var ed = $("fId").value;
        if (ed) return ["Editar OS", "OS " + num(ed)];
        return adm ? ["Nova OS", "Designar para um técnico"] : ["Registrar serviço", "Relatório de campo com fotos"];
    }
    return ["", ""];
}

function ir(nome) {
    viewAtual = nome;

    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("ativa"); });
    $("v-" + nome).classList.add("ativa");

    document.querySelectorAll(".bottom-nav button[data-view]").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-view") === nome);
    });

    var compacto = nome === "nova";
    $("topo").classList.toggle("compacto", compacto);

    var c = cabecalho(nome);
    $("topoTitulo").textContent = c[0];
    $("topoSub").textContent = c[1];

    $("topoAvatar").style.display = compacto ? "none" : "flex";
    $("sino").style.display = compacto ? "none" : "block";
    setAvatar($("topoAvatar"), user());

    renderTudo();
    window.scrollTo(0, 0);
}

function saudacao() {
    var h = new Date().getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function renderTudo() {
    if (!user()) return;
    if (viewAtual === "inicio")     renderInicio();
    if (viewAtual === "os")         renderOS();
    if (viewAtual === "calendario") renderCalendario();
    if (viewAtual === "perfil")     renderPerfil();
    atualizarSino();
}

/* ==========================================
   AVISOS (OS atrasadas / a vencer / eventos)
========================================== */
function lidosKey() { return "mc_lidos_" + sessao; }

function getLidos() {
    try { return JSON.parse(localStorage.getItem(lidosKey()) || "[]"); } catch (e) { return []; }
}

function naoLidos() {
    var l = getLidos();
    return alertas().filter(function (a) { return l.indexOf(a.key) === -1; });
}

function marcarLidos() {
    var l = getLidos();
    alertas().forEach(function (a) { if (l.indexOf(a.key) === -1) l.push(a.key); });
    try { localStorage.setItem(lidosKey(), JSON.stringify(l.slice(-300))); } catch (e) {}
}

function alertas() {
    var lista = [];
    var adm = ehAdmin();
    var recente = Date.now() - 3 * 86400000;

    ordens.forEach(function (o) {
        if (o.status === "final" || !o.data) return;
        var minha = o.tecId === sessao;
        if (!adm && !minha) return;

        var d = diasAte(o.data);
        var quem = adm ? " · " + nomeDe(o.tecId) : "";
        var rot = "OS " + num(o.id);

        if (d < 0) {
            lista.push({ key: "a" + o.id, nivel: 4, cor: "verm", ic: "fa-triangle-exclamation", tipo: "os", ref: o.id,
                t: rot + " atrasada", s: o.titulo + " · venceu há " + (-d) + (d === -1 ? " dia" : " dias") + quem });
        } else if (d === 0) {
            lista.push({ key: "h" + o.id, nivel: 3, cor: "lar", ic: "fa-clock", tipo: "os", ref: o.id,
                t: rot + " vence HOJE", s: o.titulo + quem });
        } else if (d <= 2) {
            lista.push({ key: "p" + o.id + "_" + d, nivel: 2, cor: "amar", ic: "fa-hourglass-half", tipo: "os", ref: o.id,
                t: rot + (d === 1 ? " vence amanhã" : " vence em 2 dias"), s: o.titulo + quem });
        } else if (!adm && minha && o.origem === "designada" && o.status === "aguardando") {
            lista.push({ key: "n" + o.id, nivel: 2, cor: "azul", ic: "fa-hand-point-right", tipo: "os", ref: o.id,
                t: "Nova OS para você", s: rot + " · " + o.titulo });
        }
    });

    avisos.forEach(function (a) {
        if (a.para !== sessao || a.em < recente) return;
        lista.push({ key: "v" + a.id, nivel: 3, cor: "verde", ic: "fa-circle-check", tipo: "os", ref: a.osId, t: a.t, s: a.s });
    });

    eventos.forEach(function (e) {
        if (!paraMim(e)) return;
        var d = diasAte(e.data);
        if (d < 0) return;
        var novo = e.criadoEm > recente && e.criadoPor !== sessao;
        if (!novo && d > 2) return;
        var quando = d === 0 ? "hoje" : d === 1 ? "amanhã" : d === 2 ? "em 2 dias" : fmtData(e.data);
        lista.push({ key: "e" + e.id + "_" + e.criadoEm, nivel: d === 0 ? 3 : 2, cor: "roxo", ic: "fa-calendar-check", tipo: "ev", ref: e.id,
            t: (novo ? "Novo evento: " : "Evento: ") + e.titulo,
            s: quando + (e.hora ? " às " + e.hora : "") + " · " + e.tipo });
    });

    lista.sort(function (a, b) { return b.nivel - a.nivel; });
    return lista;
}

function atualizarSino() {
    if (!user()) return;
    var novos = naoLidos();
    var n = novos.length;
    var b = $("sinoBadge");
    b.textContent = n > 9 ? "9+" : n;
    b.classList.toggle("on", n > 0);
    $("sino").classList.toggle("toca", novos.some(function (a) { return a.nivel >= 3; }));
}

function abrirAlertas() {
    var lista = alertas();
    var lidos = getLidos();
    var h = '<div class="sheet-alca"></div><h2>🔔 Avisos</h2>';

    if ("Notification" in window && Notification.permission === "default") {
        h += '<button class="btn-ativar" onclick="ativarAvisos()"><i class="fa-solid fa-bell"></i> Ativar avisos no celular</button>';
    }

    if (!lista.length) {
        h += '<div class="vazio"><i class="fa-regular fa-circle-check"></i>Tudo em dia! Nenhum aviso no momento.</div>';
    } else {
        h += lista.map(function (a) {
            var acao = a.tipo === "os" ? "abrirOS(" + a.ref + ")" : "irEvento(" + a.ref + ")";
            return '<div class="notif ' + a.cor + (lidos.indexOf(a.key) === -1 ? " nova" : "") + '" onclick="' + acao + '">' +
                '<div class="notif-ic"><i class="fa-solid ' + a.ic + '"></i></div>' +
                '<div class="notif-tx"><b>' + esc(a.t) + '</b><small>' + esc(a.s) + '</small></div></div>';
        }).join("");
    }

    h += '<p class="dica">Os avisos de pop-up aparecem quando o app está aberto neste aparelho.</p>';

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");

    marcarLidos();
    atualizarSino();
}

function ativarAvisos() {
    try {
        Notification.requestPermission().then(function (p) {
            toast(p === "granted" ? "Avisos ativados ✔" : "Permissão não concedida");
            abrirAlertas();
            if (p === "granted") notificarSistema();
        });
    } catch (e) { toast("Este navegador não suporta avisos"); }
}

function mostrarNotif(t, b) {
    var op = { body: b, icon: "icons/icon-192.png", badge: "icons/icon-192.png" };
    // No celular (app instalado) o aviso precisa sair pelo service worker
    try {
        if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(function (r) { r.showNotification(t, op); });
            return;
        }
    } catch (e) {}
    try { new Notification(t, op); } catch (e) {}
}

function notificarSistema() {
    if (!user() || !("Notification" in window) || Notification.permission !== "granted") return;
    var chave = "mc_n_" + sessao + "_" + hoje();
    var feitos = [];
    try { feitos = JSON.parse(localStorage.getItem(chave) || "[]"); } catch (e) {}

    var novos = alertas().filter(function (a) { return feitos.indexOf(a.key) === -1; });
    novos.slice(0, 3).forEach(function (a) { mostrarNotif(a.t, a.s); });
    if (novos.length > 3) mostrarNotif("Você tem mais " + (novos.length - 3) + " avisos", "Abra o app para ver.");

    novos.forEach(function (a) { feitos.push(a.key); });
    try { localStorage.setItem(chave, JSON.stringify(feitos)); } catch (e) {}
}

function irEvento(id) {
    var e = buscarEv(id);
    if (!e) return;
    fecharOS();
    calSel = e.data;
    var d = dataDe(e.data);
    calMes = new Date(d.getFullYear(), d.getMonth(), 1);
    ir("calendario");
    setTimeout(function () { abrirEvento(id); }, 150);
}

/* ==========================================
   LISTAGEM DE OS
========================================== */
function htmlOS(o) {
    var p = PRIOR[o.prior], s = STAT[o.status];
    var atr = atrasada(o);
    var souEu = o.tecId === sessao;
    var adm = ehAdmin();
    var nFotos = (o.fotos ? o.fotos.antes.length + o.fotos.depois.length : 0);
    var nItens = (o.itens ? o.itens.length : 0);

    var aviso = "";
    if (o.origem === "designada" && o.status === "aguardando") {
        if (souEu) aviso = '<div class="os-aviso"><i class="fa-solid fa-hand-point-right"></i>Aguardando o seu aceite</div>';
        else if (!adm) aviso = '<div class="os-aviso trava"><i class="fa-solid fa-lock"></i>Só ' + esc(nomeDe(o.tecId)) + ' pode aceitar</div>';
    }

    var destaque = (souEu && !adm && o.origem === "designada" && o.status === "aguardando") ? " destaque" : "";

    return '' +
    '<div class="os ' + p.k + destaque + '" onclick="abrirOS(' + o.id + ')">' +
        '<div class="os-topo">' +
            '<span class="os-num">OS ' + num(o.id) + '</span>' +
            '<span>' +
                '<span class="tag-orig ' + (o.origem === "campo" ? "campo" : "") + '">' + (o.origem === "campo" ? "Campo" : "Designada") + '</span> ' +
                '<span class="tag-p ' + p.c + '">' + p.t + '</span>' +
            '</span>' +
        '</div>' +
        '<div class="os-titulo">' + esc(o.titulo) + '</div>' +
        '<div class="os-resp">' + avatarHTML(userPorId(o.tecId), "os-av") +
            '<div class="os-resp-tx"><b>' + esc(nomeDe(o.tecId)) + '</b>' +
            '<small>' + esc(o.setor) + ' · ' + (o.origem === "campo" ? "Registrada" : "Aberta") + ' em ' + fmtData(o.criada) + '</small></div>' +
        '</div>' +
        (o.data ? '<div class="os-info"><span class="' + (atr ? "atraso" : "") + '"><i class="fa-solid fa-calendar"></i>' +
            (o.origem === "campo" ? "Serviço em " : "Prazo ") + fmtData(o.data) + (atr ? " · atrasada" : "") + '</span></div>' : "") +
        aviso +
        '<div class="os-rodape">' +
            '<span class="tag ' + s.c + '">' + s.t + '</span>' +
            ((nFotos || nItens) ? '<span class="os-fotos">' +
                (nFotos ? '<i class="fa-solid fa-camera"></i>' + nFotos : "") +
                (nItens ? '<i class="fa-solid fa-box-open" style="margin-left:' + (nFotos ? 10 : 0) + 'px"></i>' + nItens : "") +
            '</span>' : "") +
        '</div>' +
    '</div>';
}

function listaHTML(arr, vazioMsg) {
    if (!arr.length) return '<div class="vazio"><i class="fa-regular fa-folder-open"></i>' + vazioMsg + '</div>';
    return arr.map(htmlOS).join("");
}

function porId(a, b) { return b.id - a.id; }

/* ----- Início ----- */
function renderInicio() {
    var adm = ehAdmin();
    var base = adm ? ordens : ordens.filter(function (o) { return o.tecId === sessao; });

    function cont(st) { return base.filter(function (o) { return o.status === st; }).length; }
    var ag = cont("aguardando"), an = cont("andamento"), fi = cont("final");

    if (adm) {
        $("resumo").innerHTML =
            '<div class="res-item azul"><b>' + ordens.length + '</b><small>Total de OS</small></div>' +
            '<div class="res-item amarelo"><b>' + ag + '</b><small>Aguardando aceite</small></div>' +
            '<div class="res-item vermelho"><b>' + ordens.filter(atrasada).length + '</b><small>Atrasadas</small></div>';
    } else {
        $("resumo").innerHTML =
            '<div class="res-item azul"><b>' + (ag + an) + '</b><small>Minhas abertas</small></div>' +
            '<div class="res-item amarelo"><b>' + ag + '</b><small>Para aceitar</small></div>' +
            '<div class="res-item verde"><b>' + fi + '</b><small>Concluídas</small></div>';
    }

    var minhas = adm ? "" : ", true";
    $("cards").innerHTML =
        '<div class="card aguardando" onclick="filtrarOS(\'aguardando\'' + minhas + ')"><div class="barra"></div><h3>Aguardando aceite</h3><b>' + ag + '</b></div>' +
        '<div class="card andamento" onclick="filtrarOS(\'andamento\'' + minhas + ')"><div class="barra"></div><h3>Em andamento</h3><b>' + an + '</b></div>' +
        '<div class="card final" onclick="filtrarOS(\'final\'' + minhas + ')"><div class="barra"></div><h3>Finalizadas</h3><b>' + fi + '</b></div>';

    // Faixa de avisos
    var al = alertas();
    var nAtr = al.filter(function (a) { return a.nivel === 4; }).length;
    var nHoje = al.filter(function (a) { return a.nivel === 3; }).length;
    var banner = "";
    if (nAtr || nHoje) {
        var partes = [];
        if (nAtr) partes.push(nAtr + (nAtr === 1 ? " atrasada" : " atrasadas"));
        if (nHoje) partes.push(nHoje + (nHoje === 1 ? " para hoje" : " para hoje"));
        banner = '<div class="alerta-banner" onclick="abrirAlertas()"><i class="fa-solid fa-bell"></i>' +
                 '<div><b>Atenção aos prazos!</b><small>' + partes.join(" · ") + ' — toque para ver</small></div>' +
                 '<i class="fa-solid fa-chevron-right"></i></div>';
    }
    $("alertaBanner").innerHTML = banner;
    $("alertaBanner").style.display = banner ? "block" : "none";

    // Bloco de destaque
    var dest = "";
    if (adm) {
        var atr = ordens.filter(atrasada).sort(porId).slice(0, 3);
        if (atr.length) dest = '<h2 class="alerta-titulo" style="margin-bottom:12px"><i class="fa-solid fa-triangle-exclamation"></i> Atrasadas</h2>' + atr.map(htmlOS).join("");
    } else {
        var parAceitar = base.filter(function (o) { return o.status === "aguardando"; }).sort(porId);
        if (parAceitar.length) dest = '<h2 style="margin-bottom:12px">🔔 Aguardando seu aceite</h2>' + parAceitar.map(htmlOS).join("");
    }
    $("blocoDestaque").innerHTML = dest;
    $("blocoDestaque").style.display = dest ? "block" : "none";

    var campo = ordens.filter(function (o) { return o.origem === "campo"; }).sort(porId).slice(0, 3);
    if (adm && campo.length) {
        $("blocoCampo").innerHTML = '<div class="bloco-topo"><h2>📷 Relatórios de campo</h2><a onclick="filtrarOS(\'campo\')">Ver todos</a></div>' + campo.map(htmlOS).join("");
        $("blocoCampo").style.display = "block";
    } else {
        $("blocoCampo").innerHTML = "";
        $("blocoCampo").style.display = "none";
    }

    $("tituloRecentes").textContent = adm ? "Últimas ordens" : "Minhas últimas ordens";
    $("listaRecentes").innerHTML = listaHTML(base.slice().sort(porId).slice(0, 5),
        adm ? "Nenhuma OS ainda. Toque no + para criar." : "Você ainda não tem OS. Toque no + para registrar um serviço.");
}

/* ----- Ordens ----- */
function filtrarOS(f, minhas) {
    filtro = f;
    soMinhas = !!minhas && !ehAdmin();
    $("busca").value = "";
    ir("os");
}

function setFiltro(f) { filtro = f; renderOS(); }
function toggleMinhas() { soMinhas = !soMinhas; renderOS(); }

function passa(o) {
    if (!ehAdmin() && soMinhas && o.tecId !== sessao) return false;
    if (filtro === "atrasadas") return atrasada(o);
    if (filtro === "campo") return o.origem === "campo";
    if (filtro !== "todas") return o.status === filtro;
    return true;
}

function renderOS() {
    var chips = [
        ["todas", "Todas"], ["aguardando", "Aguardando"], ["andamento", "Em andamento"],
        ["final", "Finalizadas"], ["campo", "Campo"], ["atrasadas", "Atrasadas"]
    ];

    var html = "";
    if (!ehAdmin()) {
        html += '<button class="chip ' + (soMinhas ? "on" : "") + '" onclick="toggleMinhas()"><i class="fa-solid fa-user"></i> Minhas</button>';
    }
    html += chips.map(function (c) {
        return '<button class="chip ' + (filtro === c[0] ? "on" : "") + '" onclick="setFiltro(\'' + c[0] + '\')">' + c[1] + '</button>';
    }).join("");
    $("chips").innerHTML = html;

    var q = $("busca").value.trim().toLowerCase();

    var arr = ordens.filter(function (o) {
        if (!passa(o)) return false;
        if (!q) return true;
        var alvo = (o.titulo + " " + nomeDe(o.tecId) + " " + o.setor + " " + num(o.id)).toLowerCase();
        return alvo.indexOf(q) !== -1;
    }).sort(porId);

    $("listaOS").innerHTML = listaHTML(arr, "Nenhuma ordem encontrada.");
}

/* ==========================================
   CALENDÁRIO
========================================== */
function mudaMes(n) {
    calMes.setMonth(calMes.getMonth() + n);
    renderCalendario();
}

function selecionaDia(d) {
    calSel = d;
    renderCalendario();
}

function irHoje() {
    calSel = hoje();
    calMes = new Date();
    calMes.setDate(1);
    renderCalendario();
}

function eventosDoDia(data) {
    return eventos.filter(function (e) { return e.data === data && paraMim(e); })
                  .sort(function (a, b) { return (a.hora || "").localeCompare(b.hora || ""); });
}

function renderCalendario() {
    var ano = calMes.getFullYear(), mes = calMes.getMonth();
    $("calAno").textContent = String(ano);
    $("calMesNome").textContent = MESES[mes];

    var primeiro = new Date(ano, mes, 1).getDay();
    var total = new Date(ano, mes + 1, 0).getDate();
    var h = hoje();
    var html = "";
    var nOS = 0, nEv = 0;

    for (var i = 0; i < primeiro; i++) html += '<div class="dia fora"></div>';

    for (var d = 1; d <= total; d++) {
        var data = iso(new Date(ano, mes, d));
        var os = ordens.filter(function (o) { return o.data === data; });
        var ev = eventosDoDia(data);
        nOS += os.length;
        nEv += ev.length;

        var kinds = [];
        if (os.some(function (o) { return o.status !== "final" && !atrasada(o); })) kinds.push("azul");
        if (os.some(atrasada)) kinds.push("verm");
        if (os.some(function (o) { return o.status === "final"; })) kinds.push("verde");
        if (ev.length) kinds.push("roxo");

        var fds = new Date(ano, mes, d).getDay();
        var cls = "dia" + (kinds.length ? " tem" : "") + (fds === 0 || fds === 6 ? " fds" : "") +
                  (data === h ? " hoje" : "") + (data === calSel ? " sel" : "");

        html += '<div class="' + cls + '" onclick="selecionaDia(\'' + data + '\')">' + d +
                '<span class="pontos">' + kinds.map(function (k) { return '<i class="' + k + '"></i>'; }).join("") + '</span></div>';
    }

    $("calGrade").innerHTML = html;
    $("calResumo").textContent = nOS + (nOS === 1 ? " OS" : " OS") + " · " + nEv + (nEv === 1 ? " evento" : " eventos") + " no mês";

    // Painel do dia
    var dt = dataDe(calSel);
    $("calDiaTitulo").textContent = (calSel === h ? "Hoje · " : "") + DIAS[dt.getDay()];
    $("calDiaSub").textContent = dt.getDate() + " de " + MESES[dt.getMonth()] + " de " + dt.getFullYear();

    $("calAcoes").innerHTML = ehAdmin()
        ? '<button class="a-evento" onclick="formEvento(null, calSel)"><i class="fa-solid fa-calendar-plus"></i>Novo evento</button>' +
          '<button class="a-os" onclick="novaOS(calSel)"><i class="fa-solid fa-plus"></i>Nova OS</button>'
        : '<button class="a-os" onclick="novaOS(calSel)"><i class="fa-solid fa-camera"></i>Registrar serviço</button>';

    var evs = eventosDoDia(calSel);
    var oss = ordens.filter(function (o) { return o.data === calSel; }).sort(porId);
    var lista = "";

    if (evs.length) {
        lista += '<div class="sec-rot">Eventos</div>' + evs.map(htmlEvento).join("");
    }
    if (oss.length) {
        lista += '<div class="sec-rot">Ordens de serviço</div>' + oss.map(htmlOS).join("");
    }
    if (!lista) lista = '<div class="vazio"><i class="fa-regular fa-calendar"></i>Nada marcado para este dia.</div>';
    $("calLista").innerHTML = lista;
}

function htmlEvento(e) {
    var para = e.para === "todos" ? "Todos os técnicos" : nomeDe(e.para);
    return '<div class="evento" onclick="abrirEvento(' + e.id + ')">' +
        '<div class="ev-topo"><span class="ev-hora"><i class="fa-regular fa-clock"></i> ' + esc(e.hora || "Dia todo") + '</span>' +
        '<span class="ev-tipo">' + esc(e.tipo) + '</span></div>' +
        '<div class="ev-tit">' + esc(e.titulo) + '</div>' +
        '<div class="ev-info"><i class="fa-solid fa-user-group"></i>' + esc(para) + '</div></div>';
}

function abrirEvento(id) {
    var e = buscarEv(id);
    if (!e) return;
    var para = e.para === "todos" ? "Todos os técnicos" : nomeDe(e.para);

    var h = '<div class="sheet-alca"></div>' +
        '<div class="linha-tags"><span class="ev-hora"><i class="fa-regular fa-clock"></i> ' + esc(e.hora || "Dia todo") + '</span>' +
        '<span class="ev-tipo">' + esc(e.tipo) + '</span></div>' +
        '<h2>' + esc(e.titulo) + '</h2>' +
        '<div class="grade-info">' +
            '<div><small>Data</small><b>' + fmtData(e.data) + '</b></div>' +
            '<div><small>Para</small><b>' + esc(para) + '</b></div>' +
            '<div><small>Criado por</small><b>' + esc(nomeDe(e.criadoPor)) + '</b></div>' +
        '</div>' +
        '<h4>Detalhes</h4><div class="sheet-desc">' + (esc(e.desc) || "Sem detalhes.") + '</div>';

    if (ehAdmin()) {
        h += '<div class="sheet-acoes">' +
             '<button class="btn-sec" onclick="formEvento(' + e.id + ')"><i class="fa-solid fa-pen"></i> Editar</button>' +
             '<button class="btn-perigo" onclick="excluirEvento(' + e.id + ')"><i class="fa-solid fa-trash"></i> Excluir</button></div>';
    }

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
}

function formEvento(id, dataIni) {
    var e = id ? buscarEv(id) : null;
    var data = e ? e.data : (dataIni || calSel);

    var optsTipo = TIPOS_EVENTO.map(function (t) {
        return '<option' + (e && e.tipo === t ? " selected" : "") + '>' + t + "</option>";
    }).join("");

    var optsPara = '<option value="todos"' + (!e || e.para === "todos" ? " selected" : "") + '>Todos os técnicos</option>' +
        tecnicos().map(function (u) {
            return '<option value="' + u.id + '"' + (e && e.para === u.id ? " selected" : "") + '>' + esc(u.nome) + "</option>";
        }).join("");

    var h = '<div class="sheet-alca"></div>' +
        '<h2>' + (e ? "Editar evento" : "Novo evento") + '</h2>' +
        '<label class="campo" id="cEvTit"><span>Título *</span><input type="text" id="evTitulo" maxlength="80" placeholder="Ex: Manutenção preventiva da Linha 1" value="' + esc(e ? e.titulo : "") + '"><em class="erro">Informe o título do evento.</em></label>' +
        '<div class="linha2">' +
            '<label class="campo"><span>Data</span><input type="date" id="evData" value="' + data + '"></label>' +
            '<label class="campo"><span>Hora</span><input type="time" id="evHora" value="' + esc(e ? e.hora : "08:00") + '"></label>' +
        '</div>' +
        '<div class="linha2">' +
            '<label class="campo"><span>Tipo</span><select id="evTipo">' + optsTipo + '</select></label>' +
            '<label class="campo"><span>Avisar</span><select id="evPara">' + optsPara + '</select></label>' +
        '</div>' +
        '<label class="campo"><span>Detalhes</span><textarea id="evDesc" rows="3" maxlength="400" placeholder="Local, orientações, materiais...">' + esc(e ? e.desc : "") + '</textarea></label>' +
        '<div class="sheet-acoes">' +
            '<button class="btn-sec" onclick="fecharOS()">Cancelar</button>' +
            '<button class="btn-pri" onclick="salvarEvento(' + (e ? e.id : "null") + ')"><i class="fa-solid fa-check"></i> Salvar</button>' +
        '</div>';

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
}

function salvarEvento(id) {
    var titulo = $("evTitulo").value.trim();
    var data = $("evData").value;
    if (!titulo) { $("cEvTit").classList.add("invalido"); return; }
    if (!data) { toast("Escolha a data do evento"); return; }

    var paraVal = $("evPara").value;
    var dados = {
        titulo: titulo,
        data: data,
        hora: $("evHora").value,
        tipo: $("evTipo").value,
        para: paraVal === "todos" ? "todos" : Number(paraVal),
        desc: $("evDesc").value.trim()
    };

    if (id) {
        var e = buscarEv(id);
        for (var k in dados) e[k] = dados[k];
        e.criadoEm = Date.now();   // reaparece como "novo" nos avisos
    } else {
        dados.id = proximoId(eventos);
        dados.criadoPor = sessao;
        dados.criadoEm = Date.now();
        eventos.push(dados);
    }

    salvar();
    fecharOS();
    calSel = data;
    var d = dataDe(data);
    calMes = new Date(d.getFullYear(), d.getMonth(), 1);
    renderTudo();
    toast("Evento salvo ✔");
}

function excluirEvento(id) {
    if (!confirm("Excluir este evento?")) return;
    eventos = eventos.filter(function (e) { return e.id !== Number(id); });
    salvar();
    fecharOS();
    renderTudo();
    toast("Evento excluído");
}

/* ==========================================
   PERFIL
========================================== */
function renderPerfil() {
    var u = user(), adm = ehAdmin();
    setAvatar($("perfilAvatar"), u);
    $("perfilNome").textContent = u.nome;
    $("perfilCargo").textContent = u.funcao;
    $("perfilTel").textContent = u.tel ? "📞 " + u.tel : "";

    if (adm) {
        $("perfilStats").innerHTML =
            '<div><b>' + ordens.filter(function (o) { return o.origem === "designada"; }).length + '</b><small>OS designadas</small></div>' +
            '<div><b>' + ordens.filter(function (o) { return o.origem === "campo"; }).length + '</b><small>Relat. de campo</small></div>' +
            '<div><b>' + tecnicos().length + '</b><small>Técnicos</small></div>';
        renderEquipe();
        renderEmpresa();
        renderSetoresPerfil();
    } else {
        var m = ordens.filter(function (o) { return o.tecId === sessao; });
        $("perfilStats").innerHTML =
            '<div><b>' + m.length + '</b><small>Minhas OS</small></div>' +
            '<div><b>' + m.filter(function (o) { return o.status === "final"; }).length + '</b><small>Concluídas</small></div>' +
            '<div><b>' + m.filter(atrasada).length + '</b><small>Atrasadas</small></div>';
    }
}

/* ----- Editor de perfil (próprio ou, para o líder, de um técnico) ----- */
function abrirEditor(id) {
    var u = userPorId(id);
    if (!u) return;
    if (!ehAdmin() && id !== sessao) return;
    edId = id;
    edFoto = u.foto || "";

    var h = '<div class="sheet-alca"></div>' +
        '<h2>' + (id === sessao ? "Editar meu perfil" : "Editar técnico") + '</h2>' +
        '<div class="ed-foto">' +
            '<div class="ed-av" id="edAv"></div>' +
            '<div class="ed-foto-btns">' +
                '<button type="button" onclick="pickAvatar()"><i class="fa-solid fa-camera"></i>Alterar foto</button>' +
                '<button type="button" class="rm" onclick="removerAvatar()"><i class="fa-solid fa-trash"></i>Remover</button>' +
            '</div>' +
        '</div>' +
        '<label class="campo" id="cEdNome"><span>Nome *</span><input type="text" id="edNome" maxlength="30" value="' + esc(u.nome) + '"><em class="erro">Informe o nome.</em></label>' +
        '<label class="campo"><span>Função</span><input type="text" id="edFuncao" maxlength="40" placeholder="Ex: Eletricista" value="' + esc(u.funcao) + '"></label>' +
        '<label class="campo"><span>Telefone</span><input type="tel" id="edTel" maxlength="20" placeholder="(11) 99999-9999" value="' + esc(u.tel) + '"></label>' +
        '<label class="campo"><span>Novo PIN (4 números) — opcional</span><input type="password" id="edPin" inputmode="numeric" maxlength="4" placeholder="••••"></label>' +
        '<div class="sheet-acoes">' +
            '<button class="btn-sec" onclick="fecharOS()">Cancelar</button>' +
            '<button class="btn-pri" onclick="salvarEditor()"><i class="fa-solid fa-check"></i> Salvar</button>' +
        '</div>';

    $("sheet").innerHTML = h;
    atualizarEdAv();
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
}

/* ----- Empresa (logo e nome) ----- */
function renderEmpresa() {
    var el = $("empLogoPrev");
    el.classList.toggle("tem-logo", !!empresa.logo);
    el.innerHTML = empresa.logo ? '<img src="' + empresa.logo + '" alt="Logo">' : '<i class="fa-solid fa-image"></i>';
    $("empNome").value = empresa.nome;
}

function pickLogo() {
    $("fileLogo").value = "";
    $("fileLogo").click();
}

// Reduz a logo mantendo proporção e transparência (PNG)
function prepararLogo(file, cb) {
    var r = new FileReader();
    r.onload = function () {
        var img = new Image();
        img.onload = function () {
            var max = 360;
            var k = Math.min(1, max / Math.max(img.width, img.height));
            var c = document.createElement("canvas");
            c.width = Math.round(img.width * k);
            c.height = Math.round(img.height * k);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            cb(c.toDataURL("image/png"));
        };
        img.onerror = function () { toast("Imagem inválida"); };
        img.src = r.result;
    };
    r.readAsDataURL(file);
}

function aoEscolherLogo() {
    var f = $("fileLogo").files[0];
    if (!f || !ehAdmin()) return;
    prepararLogo(f, function (url) {
        empresa.logo = url;
        salvar();
        aplicarMarca();
        renderEmpresa();
        toast("Logo atualizada ✔");
    });
}

function removerLogo() {
    if (!ehAdmin() || !empresa.logo) return;
    empresa.logo = "";
    salvar();
    aplicarMarca();
    renderEmpresa();
    toast("Logo removida");
}

function salvarEmpresa() {
    if (!ehAdmin()) return;
    empresa.nome = $("empNome").value.trim();
    salvar();
    aplicarMarca();
    toast("Empresa salva ✔");
}

function atualizarEdAv() {
    setAvatar($("edAv"), { nome: $("edNome") ? $("edNome").value : "?", foto: edFoto });
}

function pickAvatar() {
    $("fileAvatar").value = "";
    $("fileAvatar").click();
}

function removerAvatar() {
    edFoto = "";
    atualizarEdAv();
}

// Recorta a foto em quadrado e reduz (fica leve para guardar)
function recortarQuadrado(file, lado, cb) {
    var r = new FileReader();
    r.onload = function () {
        var img = new Image();
        img.onload = function () {
            var m = Math.min(img.width, img.height);
            var sx = (img.width - m) / 2, sy = (img.height - m) / 2;
            var c = document.createElement("canvas");
            c.width = lado; c.height = lado;
            c.getContext("2d").drawImage(img, sx, sy, m, m, 0, 0, lado, lado);
            cb(c.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = function () { toast("Imagem inválida"); };
        img.src = r.result;
    };
    r.readAsDataURL(file);
}

function aoEscolherAvatar() {
    var f = $("fileAvatar").files[0];
    if (!f) return;
    recortarQuadrado(f, 260, function (url) {
        edFoto = url;
        atualizarEdAv();
    });
}

function salvarEditor() {
    var u = userPorId(edId);
    if (!u) return;
    var nome = $("edNome").value.trim();
    var pin = $("edPin").value.trim();
    if (!nome) { $("cEdNome").classList.add("invalido"); return; }
    if (pin && !/^\d{4}$/.test(pin)) { toast("O PIN deve ter 4 números"); return; }

    u.nome = nome;
    u.funcao = $("edFuncao").value.trim() || (u.papel === "admin" ? "Líder de Manutenção" : "Técnico de Manutenção");
    u.tel = $("edTel").value.trim();
    u.foto = edFoto;
    if (pin) u.pin = pin;

    salvar();
    fecharOS();
    ir(viewAtual);
    toast("Perfil salvo ✔");
}

/* ----- Equipe (líder) ----- */
function renderEquipe() {
    var t = tecnicos();
    $("listaEquipe").innerHTML = t.length ? t.map(function (u) {
        return '<div class="membro" onclick="abrirEditor(' + u.id + ')">' + avatarHTML(u, "av") +
               '<div class="info"><b>' + esc(u.nome) + '</b><small>' + esc(u.funcao) + '</small></div>' +
               '<button class="ed" onclick="event.stopPropagation();abrirEditor(' + u.id + ')" aria-label="Editar"><i class="fa-solid fa-pen"></i></button>' +
               '<button onclick="event.stopPropagation();removerTecnico(' + u.id + ')" aria-label="Remover"><i class="fa-solid fa-trash"></i></button></div>';
    }).join("") : '<div class="vazio">Nenhum técnico cadastrado.</div>';
}

function addTecnico() {
    var nome = $("eqNome").value.trim();
    var pin = $("eqPin").value.trim();
    if (!nome) { toast("Informe o nome do técnico"); return; }
    if (!/^\d{4}$/.test(pin)) { toast("O PIN deve ter 4 números"); return; }
    usuarios.push({
        id: proximoId(usuarios), nome: nome, papel: "tecnico", pin: pin,
        funcao: $("eqFuncao").value.trim() || "Técnico de Manutenção", tel: "", foto: ""
    });
    salvar();
    $("eqNome").value = "";
    $("eqPin").value = "";
    $("eqFuncao").value = "";
    renderPerfil();
    toast("Técnico adicionado ✔ (toque nele para colocar a foto)");
}

function removerTecnico(id) {
    var abertas = ordens.filter(function (o) { return o.tecId === id && o.status !== "final"; }).length;
    if (abertas) { toast("Reatribua as " + abertas + " OS abertas dele antes de remover"); return; }
    if (!confirm("Remover " + nomeDe(id) + " da equipe?")) return;
    usuarios = usuarios.filter(function (u) { return u.id !== id; });
    salvar();
    renderPerfil();
    toast("Técnico removido");
}

/* ----- Setores ----- */
function renderSetoresPerfil() {
    $("listaSetores").innerHTML = setores.map(function (s, i) {
        return '<span class="setor-chip">' + esc(s) + '<button onclick="removerSetor(' + i + ')" aria-label="Remover">✕</button></span>';
    }).join("");
}

function adicionarSetor(nome) {
    nome = (nome || "").trim();
    if (!nome) { toast("Digite o nome do setor"); return null; }
    var existe = setores.filter(function (s) { return s.toLowerCase() === nome.toLowerCase(); })[0];
    if (existe) { toast("Esse setor já existe"); return existe; }
    setores.push(nome);
    salvar();
    return nome;
}

function addSetorPerfil() {
    var r = adicionarSetor($("setNovo").value);
    if (r) {
        $("setNovo").value = "";
        renderSetoresPerfil();
        montarSelects();
        toast("Setor adicionado ✔");
    }
}

function removerSetor(i) {
    var nome = setores[i];
    var uso = ordens.filter(function (o) { return o.setor === nome; }).length;
    if (uso) { toast("'" + nome + "' está em uso por " + uso + " OS"); return; }
    if (setores.length <= 1) { toast("Mantenha ao menos um setor"); return; }
    if (!confirm("Remover o setor '" + nome + "'?")) return;
    setores.splice(i, 1);
    salvar();
    renderSetoresPerfil();
    montarSelects();
}

function exportar() {
    try {
        var blob = new Blob([JSON.stringify({ usuarios: usuarios, ordens: ordens, setores: setores, eventos: eventos, avisos: avisos, empresa: empresa })], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "backup-manutencao-" + hoje() + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast("Backup gerado");
    } catch (e) {
        toast("Não foi possível exportar aqui");
    }
}

function limparTudo() {
    if (!confirm("Apagar TODAS as ordens de serviço (com fotos)? Não pode ser desfeito.")) return;
    ordens = [];
    salvar();
    renderTudo();
    toast("Todas as OS foram apagadas");
}

/* ==========================================
   FOTOS DAS OS
========================================== */
function comprimir(file, cb) {
    var r = new FileReader();
    r.onload = function () {
        var img = new Image();
        img.onload = function () {
            var max = 1000;
            var s = Math.min(1, max / Math.max(img.width, img.height));
            var c = document.createElement("canvas");
            c.width = Math.round(img.width * s);
            c.height = Math.round(img.height * s);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            cb(c.toDataURL("image/jpeg", 0.72));
        };
        img.onerror = function () { toast("Imagem inválida"); cb(null); };
        img.src = r.result;
    };
    r.readAsDataURL(file);
}

function pickFoto(alvo, tipo) {
    pickCtx = { alvo: alvo, tipo: tipo };
    $("fileFoto").value = "";
    $("fileFoto").click();
}

function listaFotos(alvo, tipo) {
    if (alvo === "form") return formFotos[tipo];
    var o = buscar(alvo);
    return o ? o.fotos[tipo] : null;
}

function aoEscolherFotos() {
    var files = Array.prototype.slice.call($("fileFoto").files);
    if (!files.length || !pickCtx) return;
    var ctx = pickCtx, n = files.length;

    files.forEach(function (f) {
        comprimir(f, function (url) {
            var arr = listaFotos(ctx.alvo, ctx.tipo);
            if (url && arr) {
                if (arr.length >= MAX_FOTOS) toast("Máximo de " + MAX_FOTOS + " fotos por etapa");
                else arr.push(url);
            }
            n--;
            if (n === 0) fotosAtualizadas(ctx.alvo);
        });
    });
}

function fotosAtualizadas(alvo) {
    if (alvo === "form") { renderFormFotos(); return; }
    salvar();
    abrirOS(alvo);
    renderTudo();
}

function rmFoto(alvo, tipo, i) {
    var arr = listaFotos(alvo, tipo);
    if (!arr) return;
    arr.splice(i, 1);
    fotosAtualizadas(alvo);
}

function verFoto(src) {
    $("viewerImg").src = src;
    $("viewer").classList.add("on");
}

function fecharFoto() {
    $("viewer").classList.remove("on");
    $("viewerImg").src = "";
}

function grupoFotos(alvo, tipo, arr, pode) {
    return '<div class="fotos">' + fotosInner(alvo, tipo, arr, pode) + "</div>";
}

function fotosInner(alvo, tipo, arr, pode) {
    var h = "";
    arr.forEach(function (f, i) {
        h += '<div class="foto"><img src="' + f + '" onclick="verFoto(this.src)" alt="Foto">' +
             (pode ? '<button type="button" class="foto-x" onclick="rmFoto(\'' + alvo + '\',\'' + tipo + '\',' + i + ')">✕</button>' : "") +
             '</div>';
    });
    if (pode && arr.length < MAX_FOTOS) {
        h += '<button type="button" class="foto-add" onclick="pickFoto(\'' + alvo + '\',\'' + tipo + '\')"><i class="fa-solid fa-camera"></i>Adicionar</button>';
    }
    if (!arr.length && !pode) h += '<span class="sem-foto">Sem fotos</span>';
    return h;
}

function renderFormFotos() {
    $("fotosAntesForm").innerHTML = fotosInner("form", "antes", formFotos.antes, true);
    $("fotosDepoisForm").innerHTML = fotosInner("form", "depois", formFotos.depois, true);
}

/* ==========================================
   FORMULÁRIO DE OS
========================================== */
function montarSelects() {
    var vSetor = $("fSetor").value;
    $("fSetor").innerHTML = setores.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("") +
        '<option value="__novo__">➕ Novo setor...</option>';
    if (vSetor && setores.indexOf(vSetor) !== -1) $("fSetor").value = vSetor;

    $("fTipo").innerHTML = TIPOS.map(function (s) { return "<option>" + s + "</option>"; }).join("");
    montarDatalist();
}

function aoMudarSetor() {
    var box = $("novoSetorBox");
    if ($("fSetor").value === "__novo__") {
        box.style.display = "flex";
        $("novoSetorInput").value = "";
        $("novoSetorInput").focus();
    } else {
        box.style.display = "none";
    }
}

function criarSetor() {
    var r = adicionarSetor($("novoSetorInput").value);
    if (!r) return;
    montarSelects();
    $("fSetor").value = r;
    $("novoSetorBox").style.display = "none";
    toast("Setor '" + r + "' criado ✔");
}

function montarTecSelect(valor) {
    $("fTec").innerHTML = '<option value="">Selecione o técnico</option>' +
        tecnicos().map(function (u) {
            return '<option value="' + u.id + '">' + esc(u.nome) + " — " + esc(u.funcao) + "</option>";
        }).join("");
    $("fTec").value = valor ? String(valor) : "";
}

function setPrior(p) {
    $("fPrior").value = p;
    document.querySelectorAll("#segPrior button").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-p") === p);
    });
}

function rotulosForm() {
    var adm = ehAdmin(), ed = $("fId").value;
    $("lblData").textContent = adm ? "Data prevista" : "Data do serviço";
    $("lblDesc").textContent = adm ? "Descrição do serviço a executar" : "Serviço realizado *";
    $("fDesc").placeholder = adm ? "Descreva o defeito e o que deve ser feito..." : "Descreva o que foi feito em campo...";
    $("btnSalvar").innerHTML = '<i class="fa-solid fa-check"></i> ' +
        (ed ? "Salvar alterações" : (adm ? "Criar e designar OS" : "Registrar serviço"));
}

function limparErros() {
    ["cTitulo", "cTec", "cDesc"].forEach(function (id) { $(id).classList.remove("invalido"); });
    $("novoSetorBox").style.display = "none";
}

function novaOS(d) {
    $("formOS").reset();
    $("fId").value = "";
    limparErros();
    montarSelects();
    montarTecSelect("");
    $("fData").value = typeof d === "string" ? d : (ehAdmin() ? somaDias(1) : hoje());
    setPrior("media");
    formFotos = { antes: [], depois: [] };
    formItens = [];
    renderFormFotos();
    renderFormItens();
    rotulosForm();
    ir("nova");
}

function podeEditar(o) {
    if (ehAdmin()) return o.origem === "designada";
    return o.origem === "campo" && o.tecId === sessao;
}

function editarOS(id) {
    var o = buscar(id);
    if (!o || !podeEditar(o)) return;
    fecharOS();
    $("formOS").reset();
    limparErros();
    montarSelects();
    $("fId").value = o.id;
    $("fTitulo").value = o.titulo;
    $("fSetor").value = o.setor;
    $("fTipo").value = o.tipo;
    $("fData").value = o.data || "";
    $("fDesc").value = o.desc || "";
    montarTecSelect(o.tecId);
    setPrior(o.prior);
    formFotos = { antes: o.fotos.antes.slice(), depois: o.fotos.depois.slice() };
    formItens = (o.itens || []).map(function (i) { return { nome: i.nome, qtd: i.qtd, un: i.un }; });
    renderFormFotos();
    renderFormItens();
    rotulosForm();
    ir("nova");
}

function salvarOS(ev) {
    ev.preventDefault();
    var adm = ehAdmin();
    var ok = true;
    limparErros();

    if (!adm && $("iNome_form") && ($("iNome_form").value.trim() || $("iCx_form").value.trim())) {
        if (!addItem("form")) return;   // item digitado e ainda não adicionado
    }

    var titulo = $("fTitulo").value.trim();
    if (!titulo) { $("cTitulo").classList.add("invalido"); ok = false; }

    if ($("fSetor").value === "__novo__") { toast("Digite e adicione o novo setor"); $("novoSetorBox").style.display = "flex"; return; }

    if (adm && !$("fTec").value) { $("cTec").classList.add("invalido"); ok = false; }

    if (!adm) {
        if (!$("fDesc").value.trim()) { $("cDesc").classList.add("invalido"); ok = false; }
    }

    if (!ok) { toast("Preencha os campos obrigatórios"); return; }

    var id = $("fId").value;
    var base = {
        titulo: titulo,
        setor: $("fSetor").value,
        tipo: $("fTipo").value,
        data: $("fData").value,
        desc: $("fDesc").value.trim()
    };

    if (id) {
        var o = buscar(id);
        for (var k in base) o[k] = base[k];
        if (adm) {
            var novoTec = Number($("fTec").value);
            o.prior = $("fPrior").value;
            if (novoTec !== o.tecId) {
                o.tecId = novoTec;
                if (o.status !== "final") { o.status = "aguardando"; o.aceitaEm = ""; }
            }
        } else {
            o.fotos = { antes: formFotos.antes.slice(), depois: formFotos.depois.slice() };
            o.itens = formItens.slice();
            o.concluida = base.data || hoje();
        }
        toast("OS " + num(o.id) + " atualizada ✔");
    } else {
        var nova = base;
        nova.id = proximoId(ordens);
        nova.criada = hoje();
        nova.criadaPor = sessao;
        if (adm) {
            nova.origem = "designada";
            nova.tecId = Number($("fTec").value);
            nova.prior = $("fPrior").value;
            nova.status = "aguardando";
            nova.fotos = { antes: [], depois: [] };
            nova.itens = [];
            toast("OS " + num(nova.id) + " enviada para " + nomeDe(nova.tecId) + " ✔");
        } else {
            nova.origem = "campo";
            nova.tecId = sessao;
            nova.prior = "media";
            nova.status = "final";
            nova.concluida = base.data || hoje();
            nova.fotos = { antes: formFotos.antes.slice(), depois: formFotos.depois.slice() };
            nova.itens = formItens.slice();
            toast("Serviço registrado ✔");
        }
        ordens.push(nova);
    }

    salvar();
    filtro = "todas";
    soMinhas = false;
    ir("os");
}

/* ==========================================
   DETALHE DA OS
========================================== */
function abrirOS(id) {
    var o = buscar(id);
    if (!o) return;

    var adm = ehAdmin();
    var souEu = !adm && o.tecId === sessao;
    var p = PRIOR[o.prior], s = STAT[o.status];
    var podeFoto = souEu && (o.origem === "campo" || o.status === "andamento");
    var nome = esc(nomeDe(o.tecId));

    var h = '<div class="sheet-alca"></div>' +
    '<div class="linha-tags">' +
        '<span class="os-num">OS ' + num(o.id) + '</span>' +
        '<span class="tag-orig ' + (o.origem === "campo" ? "campo" : "") + '">' + (o.origem === "campo" ? "Campo" : "Designada") + '</span>' +
        '<span class="tag-p ' + p.c + '">' + p.t + '</span>' +
        '<span class="tag ' + s.c + '">' + s.t + '</span>' +
    '</div>' +
    '<h2>' + esc(o.titulo) + '</h2>';

    if (atrasada(o)) {
        h += '<div class="banner" style="background:#FDECEA;color:#C62828"><i class="fa-solid fa-triangle-exclamation"></i>Esta OS está <b>atrasada</b> (venceu em ' + fmtData(o.data) + ').</div>';
    }

    if (o.origem === "designada" && o.status === "aguardando") {
        if (souEu) h += '<div class="banner"><i class="fa-solid fa-hand-point-right"></i>Esta OS foi designada para <b>você</b>. Aceite para começar.</div>';
        else if (!adm) h += '<div class="banner trava"><i class="fa-solid fa-lock"></i>Esta OS é do(a) <b>' + nome + '</b>. Você pode visualizar, mas só ele(a) pode aceitar.</div>';
        else h += '<div class="banner"><i class="fa-solid fa-hourglass-half"></i>Aguardando o aceite de <b>' + nome + '</b>.</div>';
    }
    if (o.origem === "designada" && o.status === "andamento" && !souEu) {
        h += '<div class="banner trava"><i class="fa-solid fa-person-digging"></i><b>' + nome + '</b> está executando esta OS.</div>';
    }

    h += '<div class="grade-info">' +
        '<div><small>' + (o.origem === "campo" ? "Técnico" : "Designada para") + '</small><b>' + nome + '</b></div>' +
        '<div><small>Setor</small><b>' + esc(o.setor) + '</b></div>' +
        '<div><small>Tipo</small><b>' + esc(o.tipo) + '</b></div>' +
        '<div><small>' + (o.origem === "campo" ? "Data do serviço" : "Data prevista") + '</small><b' + (atrasada(o) ? ' style="color:#E53935"' : "") + '>' + fmtData(o.data) + '</b></div>' +
        (o.origem === "designada" ? '<div><small>Criada por</small><b>' + esc(nomeDe(o.criadaPor)) + '</b></div>' : "") +
        (o.aceitaEm ? '<div><small>Aceita em</small><b>' + fmtData(o.aceitaEm) + '</b></div>' : "") +
        (o.origem === "designada" && o.concluida ? '<div><small>Concluída em</small><b>' + fmtData(o.concluida) + '</b></div>' : "") +
    '</div>' +
    '<h4>' + (o.origem === "campo" ? "Serviço realizado" : "Descrição do serviço") + '</h4>' +
    '<div class="sheet-desc">' + (esc(o.desc) || "Sem descrição.") + '</div>';

    if (o.origem === "designada") {
        if (souEu && o.status === "andamento") {
            h += '<h4>Relatório do serviço (opcional)</h4>' +
                 '<textarea id="sRel" rows="3" maxlength="600" placeholder="O que foi feito, peças trocadas..." onchange="setRel(' + o.id + ',this.value)">' + esc(o.rel || "") + '</textarea>';
        } else if (o.rel) {
            h += '<h4>Relatório do técnico</h4><div class="sheet-desc">' + esc(o.rel) + '</div>';
        }
    }

    var mostrarFotos = o.origem === "campo" || o.status !== "aguardando";
    if (mostrarFotos) {
        h += '<h4>📷 Antes do serviço (' + o.fotos.antes.length + ')</h4>' + grupoFotos(o.id, "antes", o.fotos.antes, podeFoto) +
             '<h4>📷 Depois do serviço (' + o.fotos.depois.length + ')</h4>' + grupoFotos(o.id, "depois", o.fotos.depois, podeFoto);
    }

    if (mostrarFotos) {
        h += '<h4>📦 Materiais utilizados (<span id="itensN_' + o.id + '">' + o.itens.length + '</span>)</h4>' +
             '<div id="itensBox_' + o.id + '">' + itensInner(o.id, o.itens, podeFoto) + '</div>';
        if (adm && o.itens.length) {
            h += o.baixa
                ? '<button class="btn-sec cheio" onclick="toggleBaixa(' + o.id + ')"><i class="fa-solid fa-circle-check"></i> Baixa feita em ' + fmtData(o.baixaEm) + ' · desfazer</button>'
                : '<button class="btn-pri verde cheio" onclick="toggleBaixa(' + o.id + ')"><i class="fa-solid fa-clipboard-check"></i> Marcar baixa no estoque</button>';
        }
    }

    if (adm) {
        if (o.origem === "designada") {
            h += '<div class="sheet-acoes">' +
                 '<button class="btn-sec" onclick="editarOS(' + o.id + ')"><i class="fa-solid fa-pen"></i> Editar</button>' +
                 '<button class="btn-perigo" onclick="excluirOS(' + o.id + ')"><i class="fa-solid fa-trash"></i> Excluir</button></div>';
        } else {
            h += '<div class="sheet-acoes um"><button class="btn-perigo" onclick="excluirOS(' + o.id + ')"><i class="fa-solid fa-trash"></i> Excluir relatório</button></div>';
        }
    } else if (o.origem === "designada") {
        if (souEu && o.status === "aguardando") {
            h += '<div class="sheet-acoes um"><button class="btn-pri" onclick="aceitarOS(' + o.id + ')"><i class="fa-solid fa-circle-check"></i> Aceitar OS</button></div>';
        } else if (souEu && o.status === "andamento") {
            h += '<p class="dica" style="margin:0 0 10px">Fotos e materiais são opcionais, mas ajudam a documentar o serviço.</p>' +
                 '<div class="sheet-acoes um"><button class="btn-pri verde" onclick="finalizarOS(' + o.id + ')"><i class="fa-solid fa-flag-checkered"></i> Finalizar OS</button></div>';
        } else if (!souEu && o.status === "aguardando") {
            h += '<div class="sheet-acoes um"><button class="btn-pri btn-desab" disabled><i class="fa-solid fa-lock"></i> Só ' + nome + ' pode aceitar</button></div>';
        }
    } else if (souEu) {
        h += '<div class="sheet-acoes um"><button class="btn-sec" onclick="editarOS(' + o.id + ')"><i class="fa-solid fa-pen"></i> Editar relatório</button></div>';
    }

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
}

function fecharOS() {
    $("overlay").classList.remove("on");
    $("sheet").classList.remove("on");
}

function setRel(id, v) {
    var o = buscar(id);
    if (o) { o.rel = v; salvar(); }
}

function aceitarOS(id) {
    var o = buscar(id);
    if (!o || o.origem !== "designada" || o.status !== "aguardando") return;
    if (ehAdmin() || o.tecId !== sessao) { toast("Só o técnico designado pode aceitar"); return; }
    o.status = "andamento";
    o.aceitaEm = hoje();
    // avisa o(s) líder(es)
    usuarios.filter(function (u) { return u.papel === "admin"; }).forEach(function (l) {
        avisos.push({ id: Date.now() + "_" + l.id, para: l.id, osId: o.id, em: Date.now(),
                      t: nomeDe(sessao) + " aceitou a OS " + num(o.id), s: o.titulo + " · " + o.setor });
    });
    salvar();
    abrirOS(id);
    renderTudo();
    toast("OS aceita! Bom trabalho 💪");
}

function finalizarOS(id) {
    var o = buscar(id);
    if (!o || o.status !== "andamento" || o.tecId !== sessao) return;
    var rel = $("sRel");
    if (rel) o.rel = rel.value;
    o.status = "final";
    o.concluida = hoje();
    salvar();
    abrirOS(id);
    renderTudo();
    toast("OS finalizada ✔");
}

function excluirOS(id) {
    if (!ehAdmin()) return;
    if (!confirm("Excluir a OS " + num(id) + "?")) return;
    ordens = ordens.filter(function (o) { return o.id !== Number(id); });
    salvar();
    fecharOS();
    renderTudo();
    toast("OS excluída");
}

/* ==========================================
   MATERIAIS DA OS (itens retirados do almoxarifado)
========================================== */
function fmtQtd(n) {
    return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function listaItens(alvo) {
    if (alvo === "form") return formItens;
    var o = buscar(alvo);
    return o ? o.itens : null;
}

function nomeItem(i) { return i.nome || ("Caixa " + i.caixa); }

function chaveItem(i) {
    return (i.nome || "").toLowerCase() + "|" + (i.caixa || "").toLowerCase() + "|" + i.un;
}

// Sugestões: produtos que os próprios técnicos já registraram
function historicoItens() {
    var m = {};
    ordens.concat([{ itens: formItens }]).forEach(function (o) {
        (o.itens || []).forEach(function (i) {
            if (!i.nome) return;
            var k = i.nome.toLowerCase();
            if (!m[k]) m[k] = { nome: i.nome, un: i.un, n: 0 };
            m[k].n++;
            m[k].un = i.un;
        });
    });
    return Object.keys(m).map(function (k) { return m[k]; })
        .sort(function (a, b) { return b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR"); });
}

function montarDatalist() {
    var dl = $("dlItens");
    if (dl) dl.innerHTML = historicoItens().map(function (c) { return '<option value="' + esc(c.nome) + '">'; }).join("");
}

function optsUnidade(sel) {
    return UNIDADES.map(function (u) { return '<option' + (u === sel ? " selected" : "") + '>' + u + "</option>"; }).join("");
}

function itensInner(alvo, arr, pode) {
    var a = "'" + alvo + "'";
    var h = '<div class="itens">';

    arr.forEach(function (it, i) {
        h += '<div class="item"><div class="item-tx"><b>' + esc(nomeItem(it)) + '</b>' +
             (it.nome && it.caixa ? '<small>Caixa ' + esc(it.caixa) + '</small>' : "") + '</div>';
        if (pode) {
            h += '<div class="item-qtd">' +
                '<button type="button" onclick="mudaQtd(' + a + ',' + i + ',-1)" aria-label="Diminuir">−</button>' +
                '<span>' + fmtQtd(it.qtd) + ' ' + esc(it.un) + '</span>' +
                '<button type="button" onclick="mudaQtd(' + a + ',' + i + ',1)" aria-label="Aumentar">+</button></div>' +
                '<button type="button" class="item-x" onclick="rmItem(' + a + ',' + i + ')" aria-label="Remover">✕</button>';
        } else {
            h += '<div class="item-ro">' + fmtQtd(it.qtd) + ' ' + esc(it.un) + '</div>';
        }
        h += '</div>';
    });

    if (!arr.length && !pode) h += '<span class="sem-foto">Nenhum material registrado</span>';
    h += '</div>';

    if (pode) {
        h += '<div class="item-form">' +
            '<div class="linha2">' +
                '<label class="campo"><span>Produto</span><input type="text" id="iNome_' + alvo + '" list="dlItens" maxlength="40" placeholder="Ex: Parafuso M6" autocomplete="off" onchange="aoNomeItem(' + a + ')" onkeydown="itemEnter(event,' + a + ')"></label>' +
                '<label class="campo"><span>Nº da caixa</span><input type="text" id="iCx_' + alvo + '" maxlength="12" placeholder="Ex: 12" autocomplete="off" onkeydown="itemEnter(event,' + a + ')"></label>' +
            '</div>' +
            '<div class="linha2">' +
                '<label class="campo"><span>Quantidade</span><input type="text" id="iQtd_' + alvo + '" inputmode="decimal" value="1" maxlength="6" onkeydown="itemEnter(event,' + a + ')"></label>' +
                '<label class="campo"><span>Unidade</span><select id="iUn_' + alvo + '">' + optsUnidade("un") + '</select></label>' +
            '</div>' +
            '<button type="button" class="btn-sec cheio" style="margin-top:0" onclick="addItem(' + a + ')"><i class="fa-solid fa-plus"></i> Adicionar item</button>' +
            '<p class="dica">Informe o nome do produto ou o número da caixa (ou os dois).</p>' +
        '</div>';
    }
    return h;
}

function renderItens(alvo) {
    var box = $("itensBox_" + alvo);
    var arr = listaItens(alvo);
    if (box && arr) box.innerHTML = itensInner(alvo, arr, true);
    var n = $("itensN_" + alvo);
    if (n && arr) n.textContent = arr.length;
}

function renderFormItens() { renderItens("form"); }

function itensMudaram(alvo) {
    if (alvo !== "form") { salvar(); renderTudo(); }
    renderItens(alvo);
    montarDatalist();
}

function itemEnter(e, alvo) {
    if (e.key === "Enter") { e.preventDefault(); addItem(alvo); }
}

function aoNomeItem(alvo) {
    var n = $("iNome_" + alvo).value.trim().toLowerCase();
    var c = historicoItens().filter(function (x) { return x.nome.toLowerCase() === n; })[0];
    if (c) $("iUn_" + alvo).value = c.un;
}

function addItem(alvo) {
    var arr = listaItens(alvo);
    if (!arr) return false;
    var nome = $("iNome_" + alvo).value.trim();
    var caixa = $("iCx_" + alvo).value.trim();
    var qtd = parseFloat(String($("iQtd_" + alvo).value).replace(",", "."));
    var un = $("iUn_" + alvo).value;

    if (!nome && !caixa) { toast("Informe o produto ou o número da caixa"); return false; }
    if (!(qtd > 0)) { toast("Informe a quantidade"); return false; }

    var igual = arr.filter(function (i) { return chaveItem(i) === chaveItem({ nome: nome, caixa: caixa, un: un }); })[0];
    if (igual) igual.qtd = Math.round((igual.qtd + qtd) * 100) / 100;
    else arr.push({ nome: nome, caixa: caixa, qtd: qtd, un: un });

    itensMudaram(alvo);
    var campo = $("iNome_" + alvo);
    if (campo) campo.focus();
    return true;
}

function mudaQtd(alvo, i, d) {
    var arr = listaItens(alvo);
    if (!arr || !arr[i]) return;
    var n = Math.round((arr[i].qtd + d) * 100) / 100;
    if (n <= 0) arr.splice(i, 1); else arr[i].qtd = n;
    itensMudaram(alvo);
}

function rmItem(alvo, i) {
    var arr = listaItens(alvo);
    if (!arr) return;
    arr.splice(i, 1);
    itensMudaram(alvo);
}

function toggleBaixa(id) {
    var o = buscar(id);
    if (!o || !ehAdmin()) return;
    o.baixa = !o.baixa;
    o.baixaEm = o.baixa ? hoje() : "";
    salvar();
    abrirOS(id);
    renderTudo();
    toast(o.baixa ? "Baixa registrada ✔" : "Baixa desfeita");
}

/* ==========================================
   RELATÓRIOS (impressão / PDF)
========================================== */
var REL_TIPOS = {
    geral:      "Relatório geral de ordens de serviço",
    atrasadas:  "Relatório de ordens de serviço atrasadas",
    concluidas: "Relatório de ordens de serviço concluídas",
    materiais:  "Relatório de materiais utilizados"
};
var relUlt = null;

function abrirRelatorios() {
    if (!ehAdmin()) return;
    var optsTec = '<option value="">Todos os técnicos</option>' + tecnicos().map(function (u) {
        return '<option value="' + u.id + '">' + esc(u.nome) + "</option>";
    }).join("");

    var h = '<div class="sheet-alca"></div><h2>Gerar relatório</h2>' +
        '<label class="campo"><span>Tipo de relatório</span><select id="rTipo">' +
            '<option value="geral">Geral (todas as OS)</option>' +
            '<option value="atrasadas">Atrasadas</option>' +
            '<option value="concluidas">Concluídas</option>' +
            '<option value="materiais">Materiais para baixa no estoque</option>' +
        '</select></label>' +
        '<label class="campo"><span>Técnico</span><select id="rTec">' + optsTec + '</select></label>' +
        '<div class="linha2">' +
            '<label class="campo"><span>De</span><input type="date" id="rDe"></label>' +
            '<label class="campo"><span>Até</span><input type="date" id="rAte"></label>' +
        '</div>' +
        '<label class="check"><input type="checkbox" id="rDet"> Detalhado (descrição, materiais e fotos de cada OS)</label>' +
        '<p class="dica">O período usa a data de abertura (geral), de conclusão (concluídas e materiais) ou o prazo (atrasadas). Em branco = todo o período.</p>' +
        '<div class="sheet-acoes">' +
            '<button class="btn-sec" onclick="fecharOS()">Cancelar</button>' +
            '<button class="btn-pri" onclick="gerarRelatorio()"><i class="fa-solid fa-file-lines"></i> Gerar</button>' +
        '</div>';

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
}

function dataRef(o, tipo) {
    if (tipo === "concluidas") return o.concluida || o.data || o.criada || "";
    if (tipo === "atrasadas")  return o.data || "";
    if (tipo === "materiais")  return o.concluida || o.criada || "";
    return o.criada || "";
}

function fmtDataHora(d) {
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function gerarRelatorio() {
    var tipo = $("rTipo").value;
    var tec = Number($("rTec").value) || 0;
    var de = $("rDe").value, ate = $("rAte").value;
    var det = $("rDet").checked && tipo !== "materiais";

    if (de && ate && de > ate) { toast("A data inicial é maior que a final"); return; }

    var lista = ordens.filter(function (o) {
        if (tec && o.tecId !== tec) return false;
        if (tipo === "atrasadas" && !atrasada(o)) return false;
        if (tipo === "concluidas" && o.status !== "final") return false;
        if (tipo === "materiais" && !(o.itens && o.itens.length)) return false;
        var r = dataRef(o, tipo);
        if ((de || ate) && !r) return false;
        if (de && r < de) return false;
        if (ate && r > ate) return false;
        return true;
    }).sort(function (a, b) {
        var ra = dataRef(a, tipo), rb = dataRef(b, tipo);
        return ra === rb ? a.id - b.id : (ra < rb ? -1 : 1);
    });

    if (!lista.length) { toast("Nenhuma OS encontrada com esses filtros"); return; }

    relUlt = { tipo: tipo, lista: lista };

    var periodo = (de || ate) ? (de ? fmtData(de) : "início") + " a " + (ate ? fmtData(ate) : "hoje") : "Todo o período";
    var quem = tec ? nomeDe(tec) : "Todos os técnicos";
    var u = user();

    var h = '<div class="rel-cab">' +
        (empresa.logo ? '<img class="rel-logo" src="' + empresa.logo + '" alt="">' : "") +
        '<div class="rel-cab-tx"><h1>' + esc(empresa.nome || "Controle de Manutenção") + '</h1><h2>' + REL_TIPOS[tipo] + '</h2></div>' +
        '<div class="rel-meta">Emitido em ' + fmtDataHora(new Date()) + '<br>Por ' + esc(u.nome) + '</div>' +
    '</div>' +
    '<div class="rel-filtros"><span><b>Técnico:</b> ' + esc(quem) + '</span><span><b>Período:</b> ' + esc(periodo) + '</span></div>';

    h += relResumo(tipo, lista);
    h += tipo === "materiais" ? relTabelaMateriais(lista) : relTabelaOS(lista, tipo);
    if (det) h += relDetalhes(lista);

    h += '<div class="rel-assina"><div></div><span>' + esc(u.nome) + ' — ' + esc(u.funcao) + '</span></div>';

    $("relFolha").innerHTML = h;
    $("relCsv").style.display = tipo === "materiais" ? "" : "none";
    fecharOS();
    $("relTela").classList.add("on");
    $("relTela").scrollTop = 0;
}

function kpi(n, rot, cls) {
    return '<div class="rel-kpi ' + (cls || "") + '"><b>' + n + '</b><small>' + rot + '</small></div>';
}

function relResumo(tipo, lista) {
    var f = lista.filter(function (o) { return o.status === "final"; }).length;
    if (tipo === "materiais") {
        var nomes = {};
        var total = 0;
        lista.forEach(function (o) { o.itens.forEach(function (i) { nomes[chaveItem(i)] = 1; total++; }); });
        var pend = lista.filter(function (o) { return !o.baixa; }).length;
        return '<div class="rel-kpis">' + kpi(lista.length, "OS com materiais") + kpi(Object.keys(nomes).length, "Itens diferentes") +
               kpi(pend, "Baixas pendentes", pend ? "alerta" : "") + kpi(lista.length - pend, "Baixas feitas", "ok") + '</div>';
    }
    var and = lista.filter(function (o) { return o.status === "andamento"; }).length;
    var ag = lista.filter(function (o) { return o.status === "aguardando"; }).length;
    var at = lista.filter(atrasada).length;
    return '<div class="rel-kpis">' + kpi(lista.length, "Total de OS") + kpi(f, "Finalizadas", "ok") +
           kpi(and, "Em andamento") + kpi(ag, "Aguardando aceite") + kpi(at, "Atrasadas", at ? "alerta" : "") + '</div>';
}

function relTabelaOS(lista, tipo) {
    var h = '<div class="rel-rolagem"><table class="rel-tab"><thead><tr>' +
        '<th>OS</th><th>Equipamento</th><th>Setor</th><th>Técnico</th><th>Tipo</th><th>Prior.</th><th>Aberta</th><th>Prazo</th><th>Concluída</th><th>Situação</th></tr></thead><tbody>';
    lista.forEach(function (o) {
        var atr = atrasada(o);
        h += '<tr' + (atr ? ' class="atr"' : "") + '>' +
            '<td>' + num(o.id) + '</td><td>' + esc(o.titulo) + '</td><td>' + esc(o.setor) + '</td><td>' + esc(nomeDe(o.tecId)) + '</td>' +
            '<td>' + esc(o.tipo) + '</td><td>' + PRIOR[o.prior].t + '</td><td>' + fmtData(o.criada) + '</td><td>' + fmtData(o.data) + '</td>' +
            '<td>' + fmtData(o.concluida) + '</td><td>' + (atr ? "Atrasada" : STAT[o.status].t) + '</td></tr>';
    });
    return h + '</tbody></table></div>';
}

function relTabelaMateriais(lista) {
    var h = '<h3 class="rel-sub">Itens por ordem de serviço</h3><div class="rel-rolagem"><table class="rel-tab"><thead><tr>' +
        '<th>OS</th><th>Equipamento</th><th>Técnico</th><th>Data</th><th>Produto</th><th>Caixa</th><th class="d">Qtd.</th><th>Un.</th><th>Baixa no estoque</th></tr></thead><tbody>';
    var tot = {};
    lista.forEach(function (o) {
        o.itens.forEach(function (i) {
            h += '<tr><td>' + num(o.id) + '</td><td>' + esc(o.titulo) + '</td><td>' + esc(nomeDe(o.tecId)) + '</td><td>' + fmtData(dataRef(o, "materiais")) + '</td>' +
                 '<td>' + esc(i.nome || "—") + '</td><td>' + esc(i.caixa || "—") + '</td><td class="d">' + fmtQtd(i.qtd) + '</td><td>' + esc(i.un) + '</td>' +
                 '<td>' + (o.baixa ? "✔ " + fmtData(o.baixaEm) : "Pendente") + '</td></tr>';
            var k = chaveItem(i);
            if (!tot[k]) tot[k] = { nome: i.nome, caixa: i.caixa, un: i.un, qtd: 0 };
            tot[k].qtd += i.qtd;
        });
    });
    h += '</tbody></table></div>';

    var ordem = Object.keys(tot).map(function (k) { return tot[k]; })
        .sort(function (a, b) { return nomeItem(a).localeCompare(nomeItem(b), "pt-BR"); });
    h += '<h3 class="rel-sub">Total consolidado por item</h3><div class="rel-rolagem"><table class="rel-tab rel-tot"><thead><tr><th>Produto</th><th>Caixa</th><th class="d">Quantidade</th><th>Un.</th></tr></thead><tbody>' +
        ordem.map(function (t) { return '<tr><td>' + esc(t.nome || "—") + '</td><td>' + esc(t.caixa || "—") + '</td><td class="d">' + fmtQtd(t.qtd) + '</td><td>' + esc(t.un) + '</td></tr>'; }).join("") +
        '</tbody></table></div>';
    return h;
}

function relDetalhes(lista) {
    var h = '<h3 class="rel-sub">Detalhamento</h3>';
    lista.forEach(function (o) {
        var fotos = function (arr) {
            return arr.length ? '<div class="rel-fotos">' + arr.map(function (f) { return '<img src="' + f + '" alt="">'; }).join("") + '</div>' : "";
        };
        h += '<div class="rel-os"><div class="rel-os-cab"><b>OS ' + num(o.id) + ' · ' + esc(o.titulo) + '</b><span>' +
            (atrasada(o) ? "Atrasada" : STAT[o.status].t) + '</span></div>' +
            '<div class="rel-os-info">' + esc(nomeDe(o.tecId)) + ' · ' + esc(o.setor) + ' · ' + esc(o.tipo) + ' · Aberta em ' + fmtData(o.criada) +
            (o.concluida ? ' · Concluída em ' + fmtData(o.concluida) : "") + '</div>' +
            (o.desc ? '<p><b>Descrição:</b> ' + esc(o.desc) + '</p>' : "") +
            (o.rel ? '<p><b>Relatório do técnico:</b> ' + esc(o.rel) + '</p>' : "") +
            (o.itens.length ? '<p><b>Materiais:</b> ' + o.itens.map(function (i) { return esc(nomeItem(i)) + (i.nome && i.caixa ? ' [caixa ' + esc(i.caixa) + ']' : '') + ' (' + fmtQtd(i.qtd) + ' ' + esc(i.un) + ')'; }).join(", ") + '</p>' : "") +
            (o.fotos.antes.length ? '<p class="rel-fr">Antes</p>' + fotos(o.fotos.antes) : "") +
            (o.fotos.depois.length ? '<p class="rel-fr">Depois</p>' + fotos(o.fotos.depois) : "") +
        '</div>';
    });
    return h;
}

function fecharRelatorio() { $("relTela").classList.remove("on"); }

function imprimirRelatorio() {
    var antes = document.title;
    document.title = "Relatorio-" + (relUlt ? relUlt.tipo : "os") + "-" + hoje();
    window.print();
    setTimeout(function () { document.title = antes; }, 800);
}

function baixarCSV() {
    if (!relUlt) return;
    var cel = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
    var linhas = [["OS", "Equipamento", "Setor", "Técnico", "Data", "Produto", "Nº da caixa", "Quantidade", "Unidade", "Baixa no estoque"].map(cel).join(";")];
    relUlt.lista.forEach(function (o) {
        o.itens.forEach(function (i) {
            linhas.push([num(o.id), o.titulo, o.setor, nomeDe(o.tecId), fmtData(dataRef(o, "materiais")), i.nome || "", i.caixa || "",
                String(i.qtd).replace(".", ","), i.un, o.baixa ? "Feita em " + fmtData(o.baixaEm) : "Pendente"].map(cel).join(";"));
        });
    });
    try {
        var blob = new Blob(["\ufeff" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "materiais-" + hoje() + ".csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (e) { toast("Não foi possível gerar a planilha aqui"); }
}

/* ==========================================
   INICIALIZAÇÃO
========================================== */
document.querySelectorAll("#segPrior button").forEach(function (b) {
    b.addEventListener("click", function () { setPrior(b.getAttribute("data-p")); });
});

$("fTitulo").addEventListener("input", function () { $("cTitulo").classList.remove("invalido"); });
$("fileFoto").addEventListener("change", aoEscolherFotos);
$("fileAvatar").addEventListener("change", aoEscolherAvatar);
$("fileLogo").addEventListener("change", aoEscolherLogo);
$("pinInput").addEventListener("keydown", function (e) { if (e.key === "Enter") entrar(); });

// Reavalia os avisos a cada minuto (e ao voltar para o app)
setInterval(function () {
    if (user()) { atualizarSino(); notificarSistema(); }
}, 60000);

document.addEventListener("visibilitychange", function () {
    if (!document.hidden && user()) { renderTudo(); notificarSistema(); }
});

abrirDB().then(function () {
    return sbCarregar();
}).then(function (r) {
    ordens = r[0] || null;
    usuarios = r[1] || null;
    setores = r[2] || null;
    eventos = r[3] || null;
    avisos = r[4] || [];
    empresa = r[5] || { nome: "", logo: "" };

    if (!ordens || !usuarios) {
        dadosIniciais();
    }
    normalizar();
    salvar();

    var s = 0;
    try { s = Number(localStorage.getItem("mc_sessao")); } catch (e) {}

    if (s && userPorId(s)) {
        iniciarSessao(s);
    } else {
        mostrarLogin();
    }
});
