/**
 * chowonjeong.org — 메인 Apps Script (스프레드시트 바인딩 프로젝트용)
 *
 * ┌─ GitHub data/*.json ─────────────────────────────────────────┐
 * │ works + main + tags  ← SHEET_ID (works 연도탭·영상·태그)     │
 * │ about + text + exhibition ← TEXT_SHEET_ID (CV·전시전경 등)   │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 설치: 이 파일 내용으로 Apps Script Code.gs 전체 교체 (HTML 템플릿 프로젝트)
 * 토큰: 프로젝트 설정 → 스크립트 속성 GITHUB_TOKEN (Classic PAT, repo)
 * 트리거: setAllAutoTriggers() 한 번 실행
 */

// ════════════════════════════════════════════════════════
//  설정
// ════════════════════════════════════════════════════════
var SHEET_ID       = '1oZ6seTWnJNhOC5q35ThI72vGA9h7e9XLruRL4TL0inQ';
var TEXT_SHEET_ID  = '1sZGZRGKpZ9TybtyfH_0x7k4QVVqim49h_w20jLfDBMc';
var SCRIPT_URL     = 'https://script.google.com/macros/s/AKfycbzhUGRzborLzSa5lZSnKHaLIVlUeE5NznnQxSlitbEt-WrAlSPY293cckX89FMntqAnDA/exec';
var EXCLUDE_SHEETS = ['html코드받기', '설정', 'README', 'CV', 'Writing', 'Papers', 'About', '태그', '영상'];
var CACHE_TTL      = 21600;
var CACHE_KEY_ROWS = 'CTX_ALL_ROWS_V1';

var GITHUB_REPO   = 'wonjeong0414-hue/wonjeongcho';
var GITHUB_BRANCH = 'main';

function getGitHubToken_() {
  var t = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!t || !String(t).trim()) {
    throw new Error('스크립트 속성 GITHUB_TOKEN 이 없습니다. Classic PAT(repo) 넣으세요.');
  }
  return String(t).trim();
}

// ════════════════════════════════════════════════════════
//  GitHub push
// ════════════════════════════════════════════════════════
function pushToGitHub(filename, content) {
  var url = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/data/' + filename;
  var encoded = Utilities.base64Encode(content, Utilities.Charset.UTF_8);
  var authHeaders = {
    Authorization: 'Bearer ' + getGitHubToken_(),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  var getResp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: authHeaders,
    muteHttpExceptions: true
  });
  var sha = '';
  if (getResp.getResponseCode() === 200) {
    sha = JSON.parse(getResp.getContentText()).sha;
  }

  var body = {
    message: 'Auto update ' + filename,
    content: encoded,
    branch: GITHUB_BRANCH
  };
  if (sha) body.sha = sha;

  var resp = UrlFetchApp.fetch(url, {
    method: 'put',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders),
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  if (code !== 200 && code !== 201) {
    Logger.log('pushToGitHub FAIL ' + filename + ' HTTP ' + code);
    Logger.log(resp.getContentText().substring(0, 500));
    throw new Error('GitHub push failed: ' + filename + ' HTTP ' + code);
  }
  Logger.log('pushToGitHub OK ' + filename + ' HTTP ' + code);
}

// ════════════════════════════════════════════════════════
//  유틸
// ════════════════════════════════════════════════════════
function jsonOut(data) {
  var out = ContentService.createTextOutput(JSON.stringify(data));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
function textOut(str) {
  var out = ContentService.createTextOutput(str);
  out.setMimeType(ContentService.MimeType.TEXT);
  return out;
}
function toB64(obj) {
  return Utilities.base64Encode(Utilities.newBlob(JSON.stringify(obj), 'UTF-8').getBytes());
}
function buildColMap(headerRow) {
  var col = {};
  headerRow.forEach(function(h, i) { if (h) col[h.toString().trim()] = i; });
  return col;
}
function safeGet(row, col, key) {
  var i = col[key];
  if (i === undefined || i === null) return '';
  var v = row[i];
  return (v !== undefined && v !== null) ? v.toString() : '';
}
/** 헤더 이름이 Title/제목/title 등 달라도 같은 열을 찾음 */
function safeGetAny(row, col, keys) {
  var k, i, h, want, v;
  for (k = 0; k < keys.length; k++) {
    v = safeGet(row, col, keys[k]);
    if (v && String(v).trim()) return String(v).trim();
  }
  for (k = 0; k < keys.length; k++) {
    want = String(keys[k]).toLowerCase().replace(/\s+/g, '');
    for (h in col) {
      if (!col.hasOwnProperty(h)) continue;
      if (String(h).toLowerCase().replace(/\s+/g, '') !== want) continue;
      i = col[h];
      v = row[i];
      if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
    }
  }
  return '';
}
function pickWorkTitle_(row, col) {
  return safeGetAny(row, col, ['Title', 'title', '제목', '작품명', '파일명', 'filename', 'Filename']);
}
function pickWorkYear_(row, col, sheetName) {
  var y = safeGetAny(row, col, ['Year', 'year', '연도', '년', '년도']);
  if (y) return y;
  if (sheetName && /^\d{4}$/.test(String(sheetName))) return String(sheetName);
  return '';
}
function parseTags(str) {
  if (!str) return [];
  return String(str).split(',').map(function(t) { return t.trim(); }).filter(Boolean);
}
function shuffleArray(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function driveToThumb(url, sz) {
  if (!url) return '';
  var id = '';
  var m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) id = m[1];
  else {
    var m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (m2) id = m2[1];
  }
  if (id) {
    var s = sz || 'w1200';
    if (String(s).indexOf('w') === 0) {
      return 'https://drive.google.com/thumbnail?id=' + id + '&sz=' + s;
    }
    return 'https://drive.google.com/uc?export=view&id=' + id;
  }
  return url;
}
function isSubPageLabel_(v) {
  v = (v || '').toString().trim().toLowerCase();
  return v === '서브' || v === 'sub' || /^서브\d+$/.test(v) || /^sub\d+$/.test(v);
}
function isMainPageLabel_(v) {
  v = (v || '').toString().toLowerCase();
  return v.indexOf('메인') >= 0 || v.indexOf('main') >= 0;
}
function getYearSheetNames(ss) {
  return ss.getSheets()
    .map(function(s) { return s.getName(); })
    .filter(function(n) { return /^\d{4}$/.test(n); })
    .sort(function(a, b) { return parseInt(b, 10) - parseInt(a, 10); });
}

// ════════════════════════════════════════════════════════
//  Works 캐시
// ════════════════════════════════════════════════════════
function clearWorksCache_() {
  var cache = CacheService.getScriptCache();
  cache.remove(CACHE_KEY_ROWS + '_meta');
  for (var i = 0; i < 50; i++) cache.remove(CACHE_KEY_ROWS + '_' + i);
}

function getAllRowsCached() {
  var cache = CacheService.getScriptCache();
  var meta  = cache.get(CACHE_KEY_ROWS + '_meta');
  if (meta) {
    try {
      var m = JSON.parse(meta), chunks = [], ok = true;
      for (var i = 0; i < m.chunks; i++) {
        var c = cache.get(CACHE_KEY_ROWS + '_' + i);
        if (!c) { ok = false; break; }
        chunks.push(c);
      }
      if (ok) return JSON.parse(chunks.join(''));
    } catch (e) {}
  }
  var rows = loadAllWorksFromSheet();
  try {
    var json = JSON.stringify(rows), size = 90000, parts = [];
    for (var j = 0; j < json.length; j += size) parts.push(json.substring(j, j + size));
    var entries = {};
    entries[CACHE_KEY_ROWS + '_meta'] = JSON.stringify({ chunks: parts.length });
    parts.forEach(function(c, idx) { entries[CACHE_KEY_ROWS + '_' + idx] = c; });
    cache.putAll(entries, CACHE_TTL);
  } catch (e) {}
  return rows;
}

function clearAllCache() {
  clearWorksCache_();
  return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:40px;">Cache cleared. <a href="' + SCRIPT_URL + '">Home</a></p>');
}

function loadVideoSheet() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('영상');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var col = buildColMap(data[0]);
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!pickWorkTitle_(r, col) && !safeGetAny(r, col, ['드라이브링크', '드라이브 링크', 'link'])) continue;
    var pub = safeGet(r, col, '공개여부').toLowerCase().trim();
    if (pub && pub !== 'y') continue;
    var link = safeGet(r, col, '드라이브링크');
    var fid  = '';
    var m    = link.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    if (m) fid = m[1];
    var filename = safeGet(r, col, '파일명').toLowerCase();
    var isGif    = filename.indexOf('.gif') >= 0;
    rows.push({
      title  : pickWorkTitle_(r, col),
      year   : pickWorkYear_(r, col, ''),
      medium : isGif ? 'gif' : '영상',
      desc   : safeGet(r, col, 'Description'),
      pub    : 'y',
      fileId : fid,
      isVideo: !isGif,
      isGif  : isGif,
      thumb  : fid ? 'https://drive.google.com/file/d/' + fid + '/preview' : '',
      full   : fid ? 'https://drive.google.com/file/d/' + fid + '/preview' : link,
      NAR    : safeGet(r, col, 'Narratives: Philosophy & Series'),
      TEC    : safeGet(r, col, 'Technique: Material & Process'),
      SEN    : safeGet(r, col, 'Sensory: Atmosphere & Emotion'),
      page   : safeGet(r, col, '페이지')
    });
  }
  return rows;
}

function loadAllWorksFromSheet() {
  var ss   = SpreadsheetApp.openById(SHEET_ID);
  var EXCL = EXCLUDE_SHEETS.concat(['태그']);
  var rows = [];
  ss.getSheets().forEach(function(sheet) {
    var name = sheet.getName();
    if (EXCL.indexOf(name) !== -1) return;
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    var col = buildColMap(data[0]);
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      var drive = safeGet(row, col, '드라이브링크');
      var pub = (safeGet(row, col, '공개여부').toLowerCase().trim()) || 'y';
      if (pub !== 'y') continue;
      rows.push({
        title  : pickWorkTitle_(row, col),
        year   : pickWorkYear_(row, col, name),
        medium : safeGetAny(row, col, ['Medium', 'medium', '재료', '매체']),
        dimensions : safeGetAny(row, col, ['Dimensions', 'dimensions', '규격', '크기']),
        desc   : safeGetAny(row, col, ['Description', 'description', 'desc', '설명', '작품설명']),
        pub    : 'y',
        thumb  : driveToThumb(drive, 'w400'),
        full   : driveToThumb(drive, 'w1200'),
        NAR    : safeGet(row, col, 'Narratives: Philosophy & Series'),
        TEC    : safeGet(row, col, 'Technique: Material & Process'),
        SEN    : safeGet(row, col, 'Sensory: Atmosphere & Emotion'),
        page   : safeGet(row, col, '페이지')
      });
    }
  });
  loadVideoSheet().forEach(function(v) { rows.push(v); });
  return rows;
}

// ════════════════════════════════════════════════════════
//  main.json / 서브
// ════════════════════════════════════════════════════════
function buildMainData() {
  var ss        = SpreadsheetApp.openById(SHEET_ID);
  var yearNames = getYearSheetNames(ss);
  var mainWork  = null;
  var subImgs   = [];

  for (var i = 0; i < yearNames.length; i++) {
    var sheet = ss.getSheetByName(yearNames[i]);
    if (!sheet) continue;
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) continue;
    var col     = buildColMap(data[0]);
    var pageCol = col['페이지'];
    if (pageCol === undefined) continue;

    for (var r = 1; r < data.length; r++) {
      var vs    = (data[r][pageCol] || '').toString().trim();
      var drive = safeGet(data[r], col, '드라이브링크');

      if (!mainWork && isMainPageLabel_(vs)) {
        mainWork = {
          title  : pickWorkTitle_(data[r], col),
          year   : pickWorkYear_(data[r], col, yearNames[i]),
          medium : safeGetAny(data[r], col, ['Medium', 'medium', '재료', '매체']),
          dim    : safeGetAny(data[r], col, ['Dimensions', 'dimensions', '규격', '크기']),
          desc   : safeGet(data[r], col, 'Description'),
          imgUrl : driveToThumb(drive, 'w1200'),
          thumb  : driveToThumb(drive, 'w400')
        };
      }
      if (subImgs.length < 3 && isSubPageLabel_(vs)) {
        var url = driveToThumb(drive, 'w400');
        if (url) subImgs.push(url);
      }
    }
    if (mainWork && subImgs.length >= 3) break;
  }
  return { main: mainWork, subImgs: subImgs };
}

// ════════════════════════════════════════════════════════
//  Text / About / Exhibition
// ════════════════════════════════════════════════════════
function parseTextSheet(rows, sheetName, statement) {
  var items = [];
  for (var i = 1; i < rows.length; i++) {
    var r           = rows[i];
    var num         = (r[0] || '').toString().trim();
    var year        = (r[1] || '').toString().trim();
    var category    = (r[2] || '').toString().trim();
    var title       = (r[3] || '').toString().trim();
    var place       = (r[4] || '').toString().trim();
    var link        = (r[5] || '').toString().trim();
    var descKo      = (r[6] || '').toString().trim();
    var descEn      = (r[7] || '').toString().trim();
    var isStatement = !num || title.toLowerCase().indexOf('statement') >= 0;
    if (isStatement) {
      if (sheetName === '작가노트' && (descKo || descEn)) {
        statement.ko   = descKo || '';
        statement.en   = descEn || descKo;
        statement.link = link || '';
      }
      continue;
    }
    if (!title && !link) continue;
    items.push({
      year    : year,
      category: category,
      title   : title,
      filename: title,
      place   : place,
      link    : link,
      desc    : descKo,
      desc_ko : descKo,
      desc_en : descEn || descKo,
      img     : (r[8] || '').toString().trim(),
      venue   : (r[9] || '').toString().trim()
    });
  }
  return items;
}

function buildTextData() {
  var TEXT_SHEETS = ['작가노트', '평론'];
  var ss          = SpreadsheetApp.openById(TEXT_SHEET_ID);
  var data        = {};
  var tabNames    = [];
  var statement   = { ko: '', en: '', link: '' };
  TEXT_SHEETS.forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    tabNames.push(name);
    var rows = sheet.getDataRange().getValues();
    data[name] = (rows.length < 2) ? [] : parseTextSheet(rows, name, statement);
  });
  return { data: data, tabs: tabNames, statement: statement };
}

function getAboutData() {
  var ss = SpreadsheetApp.openById(TEXT_SHEET_ID);
  var d  = {
    bioKo:'', bioEn:'', cvKo:'', cvEn:'', pdfUrl:'', collKo:'', collEn:'',
    statementKo:'', statementEn:'', statementLink:'',
    solo:[], group:[], fair:[], aboutImg:''
  };

  var aboutSheet = ss.getSheetByName('About');
  if (aboutSheet) {
    var rows = aboutSheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var cat  = (rows[i][2] || '').toString().trim().toLowerCase();
      var link = (rows[i][3] || '').toString().trim();
      var txt  = (rows[i][4] || '').toString().trim();
      if (cat === 'bio-ko')  d.bioKo  = txt;
      if (cat === 'bio-en')  d.bioEn  = txt;
      if (cat === 'cv-ko')   { d.cvKo = txt; if (link) d.pdfUrl = link; }
      if (cat === 'cv-en')   d.cvEn   = txt;
      if (cat === 'about-img') d.aboutImg = link;
    }
  }

  var collSheet = ss.getSheetByName('소장처');
  if (collSheet) {
    var collRows = collSheet.getDataRange().getValues();
    var collKoArr = [], collEnArr = [];
    for (var c = 1; c < collRows.length; c++) {
      var ko = (collRows[c][2] || '').toString().trim();
      var en = (collRows[c][3] || '').toString().trim();
      if (ko) collKoArr.push(ko);
      if (en) collEnArr.push(en);
    }
    if (collKoArr.length) d.collKo = collKoArr.join('\n');
    if (collEnArr.length) d.collEn = collEnArr.join('\n');
  }

  var cvSheet = ss.getSheetByName('CV');
  if (cvSheet) {
    var cvRows = cvSheet.getDataRange().getValues();
    for (var j = 1; j < cvRows.length; j++) {
      var r      = cvRows[j];
      var year   = (r[1]  || '').toString().trim();
      var cat    = (r[2]  || '').toString().trim();
      var titleKo= (r[3]  || '').toString().trim();
      var placeKo= (r[4]  || '').toString().trim();
      var cityKo = (r[5]  || '').toString().trim();
      var titleEn= (r[6]  || '').toString().trim();
      var placeEn= (r[7]  || '').toString().trim();
      var cityEn = (r[8]  || '').toString().trim();
      var pub    = (r[11] || '').toString().trim().toLowerCase();
      if (pub && pub !== 'y') continue;
      if (!titleKo && !titleEn) continue;
      var catL = cat.toLowerCase();
      var isSolo  = catL.indexOf('개인') >= 0 || catL.indexOf('초대') >= 0 || catL.charAt(0) === 's';
      var isGroup = catL.indexOf('단체') >= 0 || catL.charAt(0) === 'g';
      var isFair  = catL.indexOf('페어') >= 0 || catL.indexOf('fair') >= 0 || catL.charAt(0) === 'a';
      var item = {
        year   : year,
        ko     : titleKo,
        placeKo: placeKo,
        cityKo : cityKo,
        en     : titleEn || titleKo,
        placeEn: placeEn || placeKo,
        cityEn : cityEn  || cityKo,
        date   : (r[9] || '').toString().trim(),
        cvKey  : (r[0] || '').toString().trim()
      };
      if (isSolo)  d.solo.push(item);
      if (isGroup) d.group.push(item);
      if (isFair)  d.fair.push(item);
    }
  }
  return d;
}

function loadExhibitionSheet() {
  var ss = SpreadsheetApp.openById(TEXT_SHEET_ID);
  var sheet = ss.getSheetByName('전시전경');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var col = buildColMap(data[0]);
  var rows = [];

  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r || String(r.join('')).trim() === '') continue;
    var pub = (
      safeGet(r, col, '공개여부') ||
      safeGet(r, col, '노출여부') ||
      safeGet(r, col, 'pub') ||
      ''
    ).toLowerCase().trim();
    if (pub && pub !== 'y') continue;

    var year = safeGet(r, col, 'Year') || safeGet(r, col, '연도') || String(r[0] || '').trim();
    var filename = safeGet(r, col, '파일명') || safeGet(r, col, 'filename') || String(r[1] || '').trim();
    var keyword = (
      safeGet(r, col, 'Keyword') ||
      safeGet(r, col, 'keyword') ||
      safeGet(r, col, '키워드') ||
      String(r[2] || '')
    ).replace(/\s+/g, '');
    var category = safeGet(r, col, '구분') || safeGet(r, col, 'category') || String(r[3] || '').trim();
    var venue = safeGet(r, col, '전시장소') || safeGet(r, col, '장소') || safeGet(r, col, 'venue') || String(r[4] || '').trim();
    var link = safeGet(r, col, '드라이브링크') || safeGet(r, col, '링크') || safeGet(r, col, 'link') || String(r[5] || '').trim();
    if (!keyword && !link) continue;

    rows.push({
      year: year,
      filename: filename,
      keyword: keyword,
      category: category,
      venue: venue,
      link: link,
      thumb: driveToThumb(link, 'w400'),
      full: driveToThumb(link, 'w1200'),
      pub: 'y'
    });
  }
  return rows;
}

// ════════════════════════════════════════════════════════
//  Year / Tags / Preview
// ════════════════════════════════════════════════════════
function buildYearData(e) {
  var params = e && e.parameter ? e.parameter : {};
  var years  = [];
  if (e && e.parameters && e.parameters.year) {
    years = e.parameters.year.map(function(y) { return y.trim(); }).filter(Boolean);
  } else if (params.year) {
    years = [params.year];
  }
  if (!years.length) years = getYearSheetNames(SpreadsheetApp.openById(SHEET_ID));

  var ss     = SpreadsheetApp.openById(SHEET_ID);
  var result = {};
  years.forEach(function(yr) {
    var sheet = ss.getSheetByName(yr);
    if (!sheet) { result[yr] = []; return; }
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) { result[yr] = []; return; }
    var col = buildColMap(data[0]), rows = [];
    for (var i = data.length - 1; i >= 1; i--) {
      var row = data[i];
      if (!row[0]) continue;
      var pub = col['공개여부'] !== undefined
        ? (row[col['공개여부']] || '').toString().toLowerCase().trim()
        : 'y';
      if (pub !== 'y') continue;
      var drive = safeGet(row, col, '드라이브링크');
      rows.push({
        Title      : safeGet(row, col, 'Title'),
        Year       : safeGet(row, col, 'Year'),
        Medium     : safeGet(row, col, 'Medium'),
        Dimensions : safeGet(row, col, 'Dimensions'),
        Description: safeGet(row, col, 'Description'),
        thumb      : driveToThumb(drive, 'w400'),
        full       : driveToThumb(drive, 'w1200'),
        'Themes & Philosophy' : safeGet(row, col, 'Themes & Philosophy'),
        'Series & Narratives' : safeGet(row, col, 'Series & Narratives'),
        'Materiality & Process': safeGet(row, col, 'Materiality & Process'),
        'Senses & Emotions'   : safeGet(row, col, 'Senses & Emotions')
      });
    }
    result[yr] = rows;
  });
  return result;
}

function readTagMenus() {
  var tagSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('태그');
  if (!tagSheet) return {};
  var data = tagSheet.getDataRange().getValues();
  var keys = ['NAR','TEC','SEN'];
  var colSets = [[0,1,2],[3,4,5],[6,7,8]];
  var result = {};
  colSets.forEach(function(cols, ki) {
    var key = keys[ki];
    var catName = (data[0][cols[0]]||'').toString().trim();
    result[key] = { name: catName, subs: [] };
    for (var ri = 1; ri < data.length; ri++) {
      var subRaw = (data[ri][cols[0]]||'').toString().trim();
      if (!subRaw) continue;
      var subParts = subRaw.split('/');
      var subKr = subParts[0].trim();
      var subEn = subParts.length > 1 ? subParts[1].trim() : '';
      var desc = (data[ri][cols[1]]||'').toString().trim();
      var tagsRaw = (data[ri][cols[2]]||'').toString().trim();
      var tags = tagsRaw.split(/[,\n]+/).map(function(t) {
        t = t.trim();
        if (!t) return null;
        var tp = t.split('/');
        return { kr: tp[0].trim(), en: tp.length > 1 ? tp[1].trim() : '' };
      }).filter(Boolean);
      result[key].subs.push({ name: subKr, nameEn: subEn, desc: desc, tags: tags });
    }
  });
  return result;
}

function searchPageTagInSheet(sheet, pageTag) {
  if (!sheet) return { url:'', title:'', sen:'' };
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { url:'', title:'', sen:'' };
  var col     = buildColMap(data[0]);
  var pageCol = col['페이지'];
  if (pageCol === undefined) return { url:'', title:'', sen:'' };
  for (var r = 1; r < data.length; r++) {
    if ((data[r][pageCol] || '').toString().trim() === pageTag) {
      var url = driveToThumb(safeGet(data[r], col, '드라이브링크'), 'w1200');
      if (url) return {
        url  : url,
        title: safeGet(data[r], col, 'Title'),
        sen  : safeGet(data[r], col, 'Sensory: Atmosphere & Emotion')
      };
    }
  }
  return { url:'', title:'', sen:'' };
}

function findPreviewImageFromWorks(pageTag) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var yearSheets = getYearSheetNames(ss);
  for (var i = 0; i < yearSheets.length; i++) {
    var res = searchPageTagInSheet(ss.getSheetByName(yearSheets[i]), pageTag);
    if (res.url) return res;
  }
  return { url: '', title: '', sen: '' };
}

function readSubImages() {
  var ss        = SpreadsheetApp.openById(SHEET_ID);
  var yearNames = getYearSheetNames(ss);
  for (var i = 0; i < yearNames.length; i++) {
    var sheet = ss.getSheetByName(yearNames[i]);
    if (!sheet) continue;
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) continue;
    var col     = buildColMap(data[0]);
    var pageCol = col['페이지'];
    if (pageCol === undefined) continue;
    var urls = [];
    for (var r = 1; r < data.length; r++) {
      var v = (data[r][pageCol] || '').toString().trim();
      if (isSubPageLabel_(v)) {
        var url = driveToThumb(safeGet(data[r], col, '드라이브링크'), 'w800');
        if (url) urls.push(url);
      }
    }
    if (urls.length > 0) return shuffleArray(urls).slice(0, 3);
  }
  return [];
}

// ════════════════════════════════════════════════════════
//  doGet / HTML 서빙
// ════════════════════════════════════════════════════════
function doGet(e) {
  var p = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'main';
  if (p === 'cors')        return textOut('ok');
  if (p === 'clearcache')  return clearAllCache();
  if (p === 'api_works')   return jsonOut(getAllRowsCached());
  if (p === 'api_tags')    return jsonOut(readTagMenus());
  if (p === 'api_about')   return jsonOut(getAboutData());
  if (p === 'api_text')    return jsonOut(buildTextData());
  if (p === 'api_main')    return jsonOut(buildMainData());
  if (p === 'api_exhibition') return jsonOut(loadExhibitionSheet());
  if (p === 'api_year')    return jsonOut(buildYearData(e));
  if (p === 'api_preview') return jsonOut(findPreviewImageFromWorks('py'));
  if (p === 'context')     return serveContext();
  if (p === 'ctxfilter')   return serveContextFilter(e);
  if (p === 'year')        return serveYear();
  if (p === 'yearfilter')  return serveYearFilter(e);
  if (p === 'text')        return serveText();
  if (p === 'about')       return serveAbout();
  if (p === 'aboutdata')   return jsonOut(getAboutData());
  return serveMain();
}

function serveMain() {
  var d    = buildMainData();
  var main = d.main || {};
  var tpl  = HtmlService.createTemplateFromFile('index');
  tpl.scriptUrl   = SCRIPT_URL;
  tpl.imgUrl      = main.imgUrl  || '';
  tpl.title       = main.title   || '';
  tpl.year        = main.year    || '';
  tpl.medium      = main.medium  || '';
  tpl.description = main.desc    || '';
  tpl.subImg1     = (d.subImgs && d.subImgs[0]) || '';
  tpl.subImg2     = (d.subImgs && d.subImgs[1]) || '';
  tpl.subImg3     = (d.subImgs && d.subImgs[2]) || '';
  return tpl.evaluate()
    .setTitle('Won Jeong Cho')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function serveText() {
  var td  = buildTextData();
  var tpl = HtmlService.createTemplateFromFile('text');
  tpl.scriptUrl    = SCRIPT_URL;
  tpl.textDataB64  = toB64(td.data);
  tpl.tabNamesB64  = toB64(td.tabs);
  tpl.statementB64 = toB64(td.statement);
  tpl.previewImg   = findPreviewImageFromText();
  return tpl.evaluate()
    .setTitle('Text - WON JEONG CHO')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function findPreviewImageFromText() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('eDrawing');
  if (!sheet) return '';
  return searchPageTagInSheet(sheet, 'pt').url;
}

function serveContext() {
  var menus   = readTagMenus();
  var subUrls = readSubImages();
  var tpl     = HtmlService.createTemplateFromFile('context');
  tpl.scriptUrl   = SCRIPT_URL;
  tpl.subImg1     = subUrls[0] || '';
  tpl.subImg2     = subUrls[1] || '';
  tpl.subImg3     = subUrls[2] || '';
  tpl.menuTagsTHE = menus.THE;
  tpl.menuTagsSER = menus.SER;
  tpl.menuTagsMAT = menus.MAT;
  tpl.menuTagsSEN = menus.SEN;
  return tpl.evaluate()
    .setTitle('Context - WON JEONG CHO')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function serveContextFilter(e) {
  var params     = e && e.parameter ? e.parameter : {};
  var activeCats = [];
  ['THE','SER','MAT','SEN'].forEach(function(k) {
    var tags = params[k] ? params[k].split(',').filter(Boolean) : [];
    if (tags.length) activeCats.push({ tags: tags, col: k });
  });
  var rowField = { THE: 'NAR', SER: 'NAR', MAT: 'TEC', SEN: 'SEN' };
  var results = getAllRowsCached().filter(function(row) {
    if (row.pub !== 'y') return false;
    if (!activeCats.length) return true;
    return activeCats.every(function(ac) {
      var field = rowField[ac.col] || ac.col;
      var ct = parseTags(row[field]);
      return ac.tags.some(function(t) { return ct.indexOf(t) >= 0; });
    });
  }).map(function(row) {
    return {
      Title: row.title, Year: row.year, Medium: row.medium, Dimensions: row.dimensions, Description: row.desc,
      thumb: row.thumb, full: row.full,
      'Themes & Philosophy' : row.NAR, 'Series & Narratives': row.NAR,
      'Materiality & Process': row.TEC, 'Senses & Emotions': row.SEN
    };
  });
  return jsonOut(results);
}

function serveYear() {
  var preview = findPreviewImageFromWorks('py');
  var tpl     = HtmlService.createTemplateFromFile('year');
  tpl.scriptUrl    = SCRIPT_URL;
  tpl.allYears     = JSON.stringify(getYearSheetNames(SpreadsheetApp.openById(SHEET_ID)).map(Number));
  tpl.previewImg   = preview.url   || '';
  tpl.previewTitle = preview.title || '';
  tpl.previewSen   = preview.sen   || '';
  return tpl.evaluate()
    .setTitle('Year - WON JEONG CHO')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function serveYearFilter(e) {
  return jsonOut(buildYearData(e));
}

function serveAbout() {
  var tpl = HtmlService.createTemplateFromFile('about');
  tpl.aboutDataB64 = toB64(getAboutData());
  return tpl.evaluate()
    .setTitle('About - WON JEONG CHO')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ════════════════════════════════════════════════════════
//  수동 export
// ════════════════════════════════════════════════════════
function exportAll() {
  clearWorksCache_();
  export1_works();
  export2_tags();
  export3_about();
  export4_text();
  export5_main();
  export6_exhibition();
  Logger.log('전체 내보내기 완료');
}

function export1_works() {
  clearWorksCache_();
  pushToGitHub('works.json', JSON.stringify(loadAllWorksFromSheet()));
  Logger.log('works.json 완료');
}
function export2_tags() {
  pushToGitHub('tags.json', JSON.stringify(readTagMenus()));
  Logger.log('tags.json 완료');
}
function export3_about() {
  pushToGitHub('about.json', JSON.stringify(getAboutData()));
  Logger.log('about.json 완료');
}
function export4_text() {
  pushToGitHub('text.json', JSON.stringify(buildTextData()));
  Logger.log('text.json 완료');
}
function export5_main() {
  clearWorksCache_();
  pushToGitHub('main.json', JSON.stringify(buildMainData()));
  Logger.log('main.json 완료');
}
function export6_exhibition() {
  var rows = loadExhibitionSheet();
  pushToGitHub('exhibition.json', JSON.stringify(rows));
  Logger.log('exhibition.json 완료 - ' + rows.length + '개');
}

// ════════════════════════════════════════════════════════
//  자동 export (트리거) — 스프레드시트당 1개만 등록
// ════════════════════════════════════════════════════════

/** works 스프레드시트(SHEET_ID) 변경 → works + main + tags */
function autoExportWorksSpreadsheetOnChange() {
  clearWorksCache_();
  pushToGitHub('works.json', JSON.stringify(loadAllWorksFromSheet()));
  pushToGitHub('main.json', JSON.stringify(buildMainData()));
  pushToGitHub('tags.json', JSON.stringify(readTagMenus()));
  Logger.log('auto: works + main + tags');
}

/** text 스프레드시트(TEXT_SHEET_ID) 변경 → about + text + exhibition */
function autoExportTextSpreadsheetOnChange() {
  pushToGitHub('about.json', JSON.stringify(getAboutData()));
  pushToGitHub('text.json', JSON.stringify(buildTextData()));
  pushToGitHub('exhibition.json', JSON.stringify(loadExhibitionSheet()));
  Logger.log('auto: about + text + exhibition');
}

/** 이전 함수명 호환 (트리거가 옛 이름을 가리킬 때) */
function autoExportOnEdit() { autoExportWorksSpreadsheetOnChange(); }
function autoExportAboutOnEdit() { autoExportTextSpreadsheetOnChange(); }
function autoExportTextOnEdit() { autoExportTextSpreadsheetOnChange(); }
function autoExportExhibitionOnEdit() { autoExportTextSpreadsheetOnChange(); }

function deleteTriggersForHandlers_(names) {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (names.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
}

function setTrigger_(fnName, sheetId) {
  deleteTriggersForHandlers_([fnName]);
  ScriptApp.newTrigger(fnName)
    .forSpreadsheet(SpreadsheetApp.openById(sheetId))
    .onChange()
    .create();
}

/** ★ 한 번만 실행: 옛 트리거 정리 후 2개만 등록 */
function setAllAutoTriggers() {
  deleteTriggersForHandlers_([
    'autoExportOnEdit',
    'autoExportWorksSpreadsheetOnChange',
    'autoExportAboutOnEdit',
    'autoExportTextOnEdit',
    'autoExportExhibitionOnEdit',
    'autoExportTextSpreadsheetOnChange'
  ]);
  setTrigger_('autoExportWorksSpreadsheetOnChange', SHEET_ID);
  setTrigger_('autoExportTextSpreadsheetOnChange', TEXT_SHEET_ID);
  Logger.log('트리거 2개 등록 완료 (Works + Text 스프레드시트)');
}

function setAutoTrigger() { setAllAutoTriggers(); }
function setAboutAutoTrigger() { setAllAutoTriggers(); }
function setTextAutoTrigger() { setAllAutoTriggers(); }
function setExhibitionAutoTrigger() { setAllAutoTriggers(); }

// ════════════════════════════════════════════════════════
//  테스트
// ════════════════════════════════════════════════════════
function testGitHubToken() {
  var url = 'https://api.github.com/repos/' + GITHUB_REPO;
  var resp = UrlFetchApp.fetch(url, {
    headers: {
      Authorization: 'Bearer ' + getGitHubToken_(),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    muteHttpExceptions: true
  });
  Logger.log('HTTP ' + resp.getResponseCode());
  Logger.log(resp.getContentText().substring(0, 300));
}

function testMainFromSheet() {
  clearWorksCache_();
  Logger.log(JSON.stringify(buildMainData().main, null, 2));
}

function listProjectTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    Logger.log(t.getHandlerFunction() + ' | ' + t.getEventType());
  });
}
