/**
 * APP DE DESCARGAS POR CLIENTE | GRUPO LOS
 * ---------------------------------------------
 * Um único projeto com duas telas:
 *   .../exec                 -> App da equipe (busca + edição, protegido por senha)
 *   .../exec?p=motorista     -> Consulta dos motoristas (somente leitura)
 *
 * Arquivos do projeto: Code.gs, Index.html, Motorista.html
 * Toda alteração fica registrada na aba HISTORICO.
 */

const CONFIG = {
  // Deixe vazio se o script estiver criado DENTRO da planilha (Extensões > Apps Script).
  // Se o script for separado, cole aqui o ID da planilha (trecho da URL entre /d/ e /edit).
  SPREADSHEET_ID: '',
  SHEET_NAME: 'TB_DESCARGAS',
  LOG_SHEET: 'HISTORICO',
  APP_TITLE: 'Descargas por Cliente | Grupo LOS',
  DRIVER_TITLE: 'Consulta de Descargas | Grupo LOS',
  DATE_COL: 'DATA_ATUALICAO',
  KEY_COL: 'CNPJ',
  NUMBER_COLS: ['CNPJ', 'CEP', 'VOLUME', 'TONELADA', 'PALLET', 'PALLET_REMONTADO'],

  // ===== QUEM PODE EDITAR =====
  // Cada pessoa da equipe com a sua senha. O nome aparece no HISTORICO.
  // TROQUE as senhas abaixo antes de implantar (o app não abre com a senha padrão).
  USUARIOS: [
    { nome: 'Administrador', senha: 'TROQUE-ESTA-SENHA' }
    // , { nome: 'Ana', senha: 'outra-senha' }
  ],

  // ===== CONSULTA DOS MOTORISTAS =====
  // Código que o motorista digita uma vez no celular. Deixe '' para não pedir código.
  PIN_MOTORISTA: '',
  MAX_RESULTS: 20,   // máximo de clientes por pesquisa do motorista
  MIN_CHARS: 3,      // mínimo de letras/números para pesquisar
  // Se existir uma coluna com este nome, o motorista vê ELA no lugar da OBSERVAÇÃO interna.
  OBS_MOTORISTA_COL: 'OBS_MOTORISTA',

  // Avisos que aparecem para o motorista (pode editar, incluir ou apagar linhas)
  AVISOS_MOTORISTA: [
    'Mesmo que o valor confira com o app, envie a descarga para o financeiro: Adya – (81) 98637-7889.',
    'Cargas de varejo devem rodar com 2 ajudantes. O 3º ajudante só é validado se já houver os 2, a carga tiver mais de 500 volumes e houver escada.',
    'Se o cliente pedir um 3º ajudante, valide com o financeiro antes de pagar.'
  ],
  // Contato do financeiro (WhatsApp com DDI 55 + DDD, só números)
  FINANCEIRO: { nome: 'Adya', whatsapp: '5581986377889', telefone: '(81) 98637-7889' }
};

const DEFAULT_PASS = 'TROQUE-ESTA-SENHA';

/* ============ WEB APP ============ */

function doGet(e) {
  const motorista = e && e.parameter && String(e.parameter.p || '').toLowerCase() === 'motorista';
  return HtmlService.createHtmlOutputFromFile(motorista ? 'Motorista' : 'Index')
    .setTitle(motorista ? CONFIG.DRIVER_TITLE : CONFIG.APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Menu dentro da planilha. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚚 Descargas LOS')
    .addItem('Abrir buscador', 'abrirNaPlanilha')
    .addToUi();
}

function abrirNaPlanilha() {
  const html = HtmlService.createHtmlOutputFromFile('Index').setWidth(1200).setHeight(780);
  SpreadsheetApp.getUi().showModalDialog(html, CONFIG.APP_TITLE);
}

/* ============ ACESSO DA EQUIPE ============ */

/** Confere a senha e devolve o nome do usuário. Usada por TODAS as funções de edição. */
function auth_(senha) {
  if (CONFIG.USUARIOS.some(u => u.senha === DEFAULT_PASS)) {
    throw new Error('Troque a senha padrão em CONFIG.USUARIOS no Code.gs e reimplante o app.');
  }
  const s = String(senha || '');
  const u = s && CONFIG.USUARIOS.find(x => x.senha === s);
  if (!u) {
    Utilities.sleep(1200); // atrasa tentativas de adivinhar a senha
    throw new Error('SENHA');
  }
  return u.nome;
}

function login(senha) {
  try {
    return JSON.stringify({ ok: true, nome: auth_(senha) });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e.message === 'SENHA' ? 'Senha incorreta.' : e.message });
  }
}

/** Link e código da consulta dos motoristas, para copiar / mandar no WhatsApp. */
function getLinkMotorista(senha) {
  auth_(senha);
  const base = ScriptApp.getService().getUrl() || '';
  return JSON.stringify({ url: base ? base + '?p=motorista' : '', pin: CONFIG.PIN_MOTORISTA });
}

/* ============ LEITURA (EQUIPE) ============ */

function getData(senha) {
  const user = auth_(senha);
  const sh = getSheet_();
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r.every(v => v === '' || v === null)) continue;
    rows.push({ row: i + 1, data: rowToObj_(headers, r) });
  }
  // Devolve como texto JSON: evita o Apps Script entregar "null" quando há tipos que ele não consegue enviar
  return JSON.stringify({ headers: headers, rows: rows, user: user });
}

/** Rode esta função no editor (botão Executar) para testar a leitura da planilha. */
function testar() {
  const sh = getSheet_();
  Logger.log('Aba lida: ' + sh.getName());
  Logger.log('Clientes encontrados: ' + (sh.getDataRange().getValues().length - 1) + ' linhas');
  Logger.log('Teste motorista (queiroz): ' + JSON.parse(buscarMotorista('queiroz', CONFIG.PIN_MOTORISTA)).total + ' clientes');
  Logger.log('Link do app: ' + (ScriptApp.getService().getUrl() || '(ainda não implantado)'));
}

/* ============ EDIÇÃO (EQUIPE) ============ */

/** payload = { row: 12, original: {...valores quando abriu}, changes: {CAMPO: novoValor} } */
function saveRecord(senha, payload) {
  const user = auth_(senha);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet_();
    const headers = getHeaders_(sh);
    const rowNum = locateRow_(sh, headers, payload.row, payload.original);
    const range = sh.getRange(rowNum, 1, 1, headers.length);
    const raw = range.getValues()[0];
    const current = rowToObj_(headers, raw);

    // Conflito: alguém alterou o mesmo campo depois que você abriu o registro
    const conflicts = [];
    Object.keys(payload.changes).forEach(k => {
      if (!(k in payload.original)) return;
      const before = str_(payload.original[k]);
      const now = str_(current[k]);
      if (before !== now && now !== str_(payload.changes[k])) {
        conflicts.push({ field: k, now: current[k] });
      }
    });
    if (conflicts.length) {
      return JSON.stringify({ ok: false, conflicts: conflicts, record: { row: rowNum, data: current } });
    }

    const stamp = new Date();
    const log = [];
    Object.keys(payload.changes).forEach(k => {
      const col = headers.indexOf(k);
      if (col < 0 || k === CONFIG.DATE_COL) return;
      const newVal = toCell_(k, payload.changes[k]);
      if (str_(serialize_(raw[col])) === str_(serialize_(newVal))) return;
      log.push([stamp, user, rowNum, cnpjFmt_(current[CONFIG.KEY_COL]), current['Razão'] || '', k, serialize_(raw[col]), serialize_(newVal)]);
      raw[col] = newVal;
    });

    if (!log.length) return JSON.stringify({ ok: true, record: { row: rowNum, data: current }, changed: 0 });

    const dCol = headers.indexOf(CONFIG.DATE_COL);
    if (dCol >= 0) raw[dCol] = stamp;
    range.setValues([raw]);
    if (dCol >= 0) sh.getRange(rowNum, dCol + 1).setNumberFormat('dd/MM/yyyy HH:mm');
    writeLog_(log);
    SpreadsheetApp.flush();

    return JSON.stringify({ ok: true, record: { row: rowNum, data: rowToObj_(headers, raw) }, changed: log.length });
  } finally {
    lock.releaseLock();
  }
}

/** Cadastra um novo cliente no fim da tabela. */
function addRecord(senha, data) {
  const user = auth_(senha);
  if (!data || !String(data[CONFIG.KEY_COL] || '').trim() || !String(data['Razão'] || '').trim()) {
    throw new Error('CNPJ e Razão social são obrigatórios.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet_();
    const headers = getHeaders_(sh);
    const stamp = new Date();
    const row = headers.map(h => {
      if (h === CONFIG.DATE_COL) return stamp;
      return h in data ? toCell_(h, data[h]) : '';
    });
    const rowNum = lastDataRow_(sh) + 1;
    sh.getRange(rowNum, 1, 1, headers.length).setValues([row]);
    const dCol = headers.indexOf(CONFIG.DATE_COL);
    if (dCol >= 0) sh.getRange(rowNum, dCol + 1).setNumberFormat('dd/MM/yyyy HH:mm');
    writeLog_([[stamp, user, rowNum, cnpjFmt_(data[CONFIG.KEY_COL]), data['Razão'], '(NOVO CADASTRO)', '', '']]);
    SpreadsheetApp.flush();
    return JSON.stringify({ ok: true, record: { row: rowNum, data: rowToObj_(headers, row) } });
  } finally {
    lock.releaseLock();
  }
}

/** Últimas alterações de um cliente (para mostrar no app). */
function getHistory(senha, cnpj) {
  auth_(senha);
  const sh = getSpreadsheet_().getSheetByName(CONFIG.LOG_SHEET);
  if (!sh || sh.getLastRow() < 2) return '[]';
  const key = cnpjFmt_(cnpj);
  return JSON.stringify(sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues()
    .filter(r => r[3] === key)
    .slice(-30)
    .reverse()
    .map(r => ({ when: serialize_(r[0]), user: r[1], field: r[5], before: serialize_(r[6]), after: serialize_(r[7]) })));
}

/* ============ CONSULTA DOS MOTORISTAS (somente leitura) ============ */

function motoristaConfig() {
  return JSON.stringify({ needPin: !!CONFIG.PIN_MOTORISTA, minChars: CONFIG.MIN_CHARS,
    avisos: CONFIG.AVISOS_MOTORISTA || [], financeiro: CONFIG.FINANCEIRO || null });
}

function pinOk_(pin) {
  return !CONFIG.PIN_MOTORISTA ||
    String(pin || '').trim().toUpperCase() === String(CONFIG.PIN_MOTORISTA).trim().toUpperCase();
}

function checarPin(pin) {
  const ok = pinOk_(pin);
  if (!ok) Utilities.sleep(1000);
  return JSON.stringify({ ok: ok });
}

/** Pesquisa por nome, CNPJ, cidade, bairro ou rede. Devolve só o que o motorista precisa. */
function buscarMotorista(query, pin) {
  if (!pinOk_(pin)) return JSON.stringify({ error: 'pin' });
  const q = String(query || '').trim();
  const qDigits = q.replace(/\D/g, '');
  const tokens = q.split(/\s+/).map(norm_).filter(Boolean);
  if (norm_(q).replace(/\s/g, '').length < CONFIG.MIN_CHARS) return JSON.stringify({ results: [], total: 0 });
  const isCnpj = qDigits.length >= 4 && qDigits.length === q.replace(/[\s.\-\/]/g, '').length;

  const values = getSheet_().getDataRange().getValues();
  const H = values[0].map(h => String(h).trim());
  const c = name => H.indexOf(name);
  const obsCol = c(CONFIG.OBS_MOTORISTA_COL) >= 0 ? c(CONFIG.OBS_MOTORISTA_COL) : c('OBSERVAÇÃO');
  const col = {
    cnpj: c('CNPJ'), razao: c('Razão'), end: c('Endereço'), bairro: c('Bairro/Distrito'), cidade: c('Cidade'),
    volume: c('VOLUME'), ton: c('TONELADA'), pallet: c('PALLET'), rem: c('PALLET_REMONTADO'),
    quem: c('REALIZADOR'), tipo: c('TIPO_PRODUTO'), escada: c('ESCADA'), ajud: c('ACEITA_AJUDANTE'),
    obs: obsCol, data: c(CONFIG.DATE_COL), rede: c('Rede')
  };
  const get = (r, k) => col[k] >= 0 ? r[col[k]] : '';

  const hits = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!get(r, 'razao') && !get(r, 'cnpj')) continue;
    let ok;
    if (isCnpj) {
      ok = String(get(r, 'cnpj')).replace(/\D/g, '').padStart(14, '0').indexOf(qDigits) >= 0;
    } else {
      const text = norm_([get(r, 'razao'), get(r, 'cidade'), get(r, 'bairro'), get(r, 'rede')].join(' '));
      ok = tokens.every(t => text.indexOf(t) >= 0);
    }
    if (ok) hits.push(r);
  }

  // Ordem: nome que bate com a pesquisa primeiro, depois quem tem valor cadastrado, depois A-Z
  const qn = norm_(q);
  const hasVal = r => ['volume', 'ton', 'pallet', 'rem'].some(k => get(r, k) !== '' && get(r, k) !== null);
  const score = r => (isCnpj || norm_(get(r, 'razao')).indexOf(qn) >= 0 ? 2 : 0) + (hasVal(r) ? 1 : 0);
  hits.sort((a, b) => score(b) - score(a) || String(get(a, 'razao')).localeCompare(String(get(b, 'razao')), 'pt'));

  const money = v => (v === '' || v === null || isNaN(Number(v))) ? '' : Number(v);
  const txt = v => (v instanceof Date) ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy') : String(v === null ? '' : v).trim();

  const results = hits.slice(0, CONFIG.MAX_RESULTS).map(r => ({
    razao: txt(get(r, 'razao')), cnpj: cnpjFmt_(get(r, 'cnpj')),
    endereco: txt(get(r, 'end')), bairro: txt(get(r, 'bairro')), cidade: txt(get(r, 'cidade')),
    volume: money(get(r, 'volume')), tonelada: money(get(r, 'ton')),
    pallet: money(get(r, 'pallet')), remontado: money(get(r, 'rem')),
    quem: txt(get(r, 'quem')), tipo: txt(get(r, 'tipo')), escada: txt(get(r, 'escada')),
    ajudante: txt(get(r, 'ajud')), obs: txt(get(r, 'obs')), atualizado: txt(get(r, 'data'))
  }));
  return JSON.stringify({ results: results, total: hits.length });
}

/* ============ AUXILIARES ============ */

function getSpreadsheet_() {
  return CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_() {
  const ss = getSpreadsheet_();
  if (!ss) throw new Error('Planilha não encontrada. Crie o script pela planilha (Extensões > Apps Script) ou preencha SPREADSHEET_ID no Code.gs.');
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    // Aceita a aba mesmo com nome diferente, desde que a 1ª coluna seja CNPJ
    sh = ss.getSheets().find(s => String(s.getRange(1, 1).getValue()).trim().toUpperCase() === 'CNPJ');
  }
  if (!sh) throw new Error('Aba "' + CONFIG.SHEET_NAME + '" não encontrada. Abas existentes: ' + ss.getSheets().map(s => s.getName()).join(', '));
  return sh;
}

function getHeaders_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
}

function lastDataRow_(sh) {
  const col = sh.getRange(1, 1, sh.getMaxRows(), 2).getValues();
  for (let i = col.length - 1; i >= 0; i--) {
    if (col[i][0] !== '' || col[i][1] !== '') return i + 1;
  }
  return 1;
}

/** Confere se a linha ainda é o mesmo cliente (a planilha pode ter sido reordenada). */
function locateRow_(sh, headers, rowNum, original) {
  const keyCol = headers.indexOf(CONFIG.KEY_COL);
  const nameCol = headers.indexOf('Razão');
  const same = r => str_(serialize_(r[keyCol])) === str_(original[CONFIG.KEY_COL]) &&
                    str_(serialize_(r[nameCol])) === str_(original['Razão']);

  if (rowNum >= 2 && rowNum <= sh.getLastRow()) {
    const r = sh.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    if (same(r)) return rowNum;
  }
  const all = sh.getDataRange().getValues();
  const hits = [];
  for (let i = 1; i < all.length; i++) if (same(all[i])) hits.push(i + 1);
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new Error('Registro não encontrado (pode ter sido apagado). Clique em Atualizar.');
  throw new Error('A planilha foi reordenada e há registros repetidos deste cliente. Clique em Atualizar e tente de novo.');
}

function rowToObj_(headers, r) {
  const o = {};
  headers.forEach((h, j) => { if (h) o[h] = serialize_(r[j]); });
  return o;
}

function serialize_(v) {
  if (v instanceof Date) {
    const tz = Session.getScriptTimeZone();
    const hasTime = v.getHours() || v.getMinutes();
    return Utilities.formatDate(v, tz, hasTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy');
  }
  if (v === null || v === undefined) return '';
  return v;
}

function str_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function norm_(s) {
  return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Converte o texto digitado no formato certo da célula. */
function toCell_(field, v) {
  if (v === null || v === undefined) return '';
  let s = String(v).trim();
  if (s === '') return '';
  if (CONFIG.NUMBER_COLS.indexOf(field) >= 0) {
    if (field === 'CNPJ' || field === 'CEP') {
      const d = s.replace(/\D/g, '');
      return d ? Number(d) : s;
    }
    s = s.replace(/R\$\s*/i, '').replace(/\s/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    if (isNaN(n)) throw new Error('Valor inválido em ' + field + ': "' + v + '"');
    return n;
  }
  return s;
}

function cnpjFmt_(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  return d.padStart(14, '0').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function writeLog_(rows) {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(CONFIG.LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.LOG_SHEET);
    sh.getRange(1, 1, 1, 8).setValues([['Data/Hora', 'Usuário', 'Linha', 'CNPJ', 'Razão', 'Campo', 'Valor anterior', 'Valor novo']])
      .setFontWeight('bold').setBackground('#103F69').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
}
