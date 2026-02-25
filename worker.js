/*******************************************************************
 *
 *  worker.js — High-Performance Stenography Transcription Analysis
 *  - Includes Hardcoded Fallbacks for Shortforms
 *  - Includes Fix for Single-Word Numbers (e.g. "six" == "6")
 *  - Includes AI Icon Injection for Mistakes
 *
 *******************************************************************/

'use strict';

// 1. HARDCODED SHORT-FORMS
// Injected directly into the Flex Synonym Engine to guarantee they never fail.
const HARDCODED_SYNONYMS = [
    { group: 'AND', variants:['&', 'and'] },
    { group: 'PERCENT', variants:['%', 'percent', 'per cent'] },
    { group: 'HON', variants:['honourable', 'honble', "hon'ble", 'hon'] },
    { group: 'DR', variants:['doctor', 'dr', 'dr.'] },
    { group: 'MR', variants: ['mister', 'mr', 'mr.'] },
    { group: 'MRS', variants: ['misses', 'mrs', 'mrs.'] },
    { group: 'GOVTS', variants: ['governments', 'govts'] },
    { group: 'GOVT', variants: ['government', 'govt'] },
    { group: 'SPL', variants:['special', 'spl'] },
    { group: 'THRU', variants:['through', 'thru'] },
    { group: 'DEPT', variants: ['department', 'dept'] },
    { group: 'ASSOC', variants: ['association', 'assoc'] },
    { group: '1ST', variants:['first', '1st'] },
    { group: '2ND', variants:['second', '2nd'] },
    { group: '3RD', variants: ['third', '3rd'] },
    { group: 'RS', variants: ['rupees', 'rs', 'rs.'] },
    { group: 'RE', variants: ['rupee', 're', 're.'] },
    { group: 'ADVT', variants: ['advertisement', 'advt'] },
    { group: 'ADDL', variants:['additional', 'addl'] },
    { group: 'SECY', variants:['secretary', 'secy'] },
    { group: 'VS', variants: ['versus', 'vs', 'v/s'] },
    { group: 'LTD', variants: ['limited', 'ltd', 'ltd.'] },
    { group: 'PVT', variants: ['private', 'pvt', 'pvt.'] },
    { group: 'NO', variants: ['number', 'no', 'no.'] },
    { group: 'MADAM', variants: ["ma'am", 'madam'] }
];

const WorkerState = {
    synoIndex: null,
    synoFlatIndex: null,
    synoGroupToNum: Object.create(null),
    mistakeCounters: {},
    studentMistakes: {},
};

// ────────────────────────────────────────────────────────────────────────────
//  Levenshtein Distance
// ────────────────────────────────────────────────────────────────────────────
function levenshteinDistance(s1, s2) {
    const rows = s2.length + 1, cols = s1.length + 1;
    const dp = Array(rows).fill(null).map(() => Array(cols).fill(0));
    for (let i = 0; i < cols; i++) dp[0][i] = i;
    for (let j = 0; j < rows; j++) dp[j][0] = j;
    for (let j = 1; j < rows; j++) {
        for (let i = 1; i < cols; i++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            dp[j][i] = Math.min(dp[j][i - 1] + 1, dp[j - 1][i] + 1, dp[j - 1][i - 1] + cost);
        }
    }
    return dp[rows - 1][cols - 1];
}

// ────────────────────────────────────────────────────────────────────────────
//  Flex Synonym & Number Engine
// ────────────────────────────────────────────────────────────────────────────
function _normalizeCore(str) {
    return (str || '')
      .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
      .trim();
}

function normalizeNumberToken(tok) {
    if (!tok) return null;
    let s = _normalizeCore(tok).replace(/^\s*(?:rs\.?|₹)\s*/i, '');
    for (let k = 0; k < 2; k++) {
        s = s.replace(/^[("'`“”‘’\[\]()]+/, '').replace(/[^0-9]+$/, (tail) => tail).replace(/[)"'`“”‘’\]\)]+$/, '');
    }
    s = s.replace(/\s*\/[-–—]\s*$/, '').replace(/([0-9])(?:[,.;:!?…]+|-+)+\s*$/, '$1');
    let m = s.match(/^([+-]?(?:(?:\d{1,3}(?:[, ]\d{2,3})+)|(?:\d{1,3}(?:[, ]\d{3})+)|\d+))(?:\.(\d+))?(st|nd|rd|th)$/i);
    if (m) {
        const intPart = m[1].replace(/[,\s]/g, '');
        const frac = m[2] ? ('.' + m[2].replace(/0+$/,'')).replace(/\.$/,'') : '';
        return frac ? intPart + frac : intPart;
    }
    m = s.match(/^([+-]?(?:(?:\d{1,3}(?:[, ]\d{2,3})+)|(?:\d{1,3}(?:[, ]\d{3})+)|\d+))(?:\.(\d+))?$/);
    if (m) {
        const intPart = m[1].replace(/[,\s]/g, '');
        const frac = m[2] ? ('.' + m[2].replace(/0+$/,'')).replace(/\.$/,'') : '';
        return frac ? intPart + frac : intPart;
    }
    return null;
}

function normTokenForCompare(tok) {
    const num = normalizeNumberToken(tok);
    if (num !== null) return num;
    let core = _normalizeCore(tok).toLowerCase();
    core = core.replace(/[.\u2026;:!?\u203D'"“”‘’()[\]{}/\\|@#$%^&*_+=<>~`]+/g, '');
    if (/^\d+$/.test(core)) return core;
    return core;
}

function tokenize(text) {
    return (text || '').split(/\s+/).filter(Boolean);
}

const NUM_ONES = {zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19};
const NUM_TENS = {twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90, fourty:40};
const NUM_SCALES = {hundred:100, hundreds:100, thousand:1000, thousands:1000, lakh:100000, lakhs:100000, crore:10000000, crores:10000000, million:1000000, millions:1000000, billion:1000000000, billions:1000000000};
const NUM_WORD_SET = new Set([...Object.keys(NUM_ONES), ...Object.keys(NUM_TENS), ...Object.keys(NUM_SCALES), 'and']);
const _canonCache = new Map();

function canonNumWord(w) {
    if (!w) return null;
    if (_canonCache.has(w)) return _canonCache.get(w);
    if (NUM_WORD_SET.has(w)) { _canonCache.set(w, w); return w; }
    if (!/[a-z]/.test(w)) { _canonCache.set(w, null); return null; }
    let best = null, bestD = Infinity;
    for (const k of NUM_WORD_SET) {
        if (Math.abs(k.length - w.length) > 1) continue;
        const d = levenshteinDistance(w, k);
        if (d < bestD) { bestD = d; best = k; if (d === 0) break; }
    }
    const res = (bestD <= 1) ? best : null;
    _canonCache.set(w, res);
    return res;
}

const isDigitToken = (t) => /^\d+(?:\.\d+)?$/.test(t);
const splitParts = (tok) => tok.includes('-') ? tok.split('-') : [tok];
const isTeen = (w) => (w in NUM_ONES) && NUM_ONES[w] >= 10 && NUM_ONES[w] <= 19;

function parseYearAt(arr, pos) {
    const firstRaw = arr[pos];
    const firstCanon = canonNumWord(firstRaw) || firstRaw;
    if (firstCanon !== 'nineteen' && firstCanon !== 'twenty') return null;
    const base = (firstCanon === 'nineteen') ? 1900 : 2000;
    const t1raw = arr[pos + 1];
    if (!t1raw) return null;
    const t1parts = splitParts(t1raw).map(p => canonNumWord(p) || p);
    if (t1parts.length === 1 && isTeen(t1parts[0])) return { value: String(base + NUM_ONES[t1parts[0]]), len: 2 };
    if (t1parts.length === 2 && (t1parts[0] in NUM_TENS) && (t1parts[1] in NUM_ONES) && NUM_ONES[t1parts[1]] < 10) return { value: String(base + NUM_TENS[t1parts[0]] + NUM_ONES[t1parts[1]]), len: 2 };
    if (t1parts.length === 1 && (t1parts[0] in NUM_TENS)) {
        const t2raw = arr[pos + 2];
        if (t2raw) {
            const t2parts = splitParts(t2raw).map(p => canonNumWord(p) || p);
            if (t2parts.length === 1 && (t2parts[0] in NUM_ONES) && NUM_ONES[t2parts[0]] < 10) return { value: String(base + NUM_TENS[t1parts[0]] + NUM_ONES[t2parts[0]]), len: 3 };
        }
        return { value: String(base + NUM_TENS[t1parts[0]]), len: 2 };
    }
    return null;
}

function parseNumberWordsRun(arr, pos) {
    const yr = parseYearAt(arr, pos);
    if (yr) return yr;
    let j = pos, total = 0, current = 0, consumed = 0, touched = false, hadHyphen = false;
    while (j < arr.length) {
        const tok = arr[j];
        const parts = splitParts(tok);
        if (parts.length > 1) hadHyphen = true;
        let progressed = false;
        for (let p of parts) {
            p = canonNumWord(p) || p;
            if (p === 'and') { if (!touched) { progressed = false; break; } progressed = true; continue; }
            if (p in NUM_ONES) { current += NUM_ONES[p]; progressed = true; touched = true; continue; }
            if (p in NUM_TENS) { current += NUM_TENS[p]; progressed = true; touched = true; continue; }
            if (p in NUM_SCALES) {
                if (p === 'hundred' || p === 'hundreds') { if (current === 0) current = 1; current *= 100; }
                else { if (current === 0) current = 1; total += current * NUM_SCALES[p]; current = 0; }
                progressed = true; touched = true; continue;
            }
            progressed = false; break;
        }
        if (!progressed) break;
        consumed++; j++;
    }
    if (!touched) return null;
    
    // -> FIX: Removed isCompound restriction completely! 
    // Now single-word numbers like "six", "twelve", "ten" are successfully parsed into digits.
    return { value: String(total + current), len: consumed };
}

function numberValueFromTokens(tokens) {
    if (!tokens || !tokens.length) return null;
    if (tokens.length === 1 && isDigitToken(tokens[0])) return tokens[0];
    const yr = parseYearAt(tokens, 0);
    if (yr && yr.len === tokens.length) return yr.value;
    const gen = parseNumberWordsRun(tokens, 0);
    if (gen && gen.len === tokens.length) return gen.value;
    return null;
}

function buildSynoIndex(groups) {
    const idx = Object.create(null);
    const flatIdx = Object.create(null);
    const grpNum = Object.create(null);
    for (const g of groups ||[]) {
        const group = String(g.group || g.group_key || '').trim();
        if (!group) continue;
        let seenValue = null, conflict = false;
        for (const raw of g.variants || g.variant_list ||[]) {
            const tokens = tokenize(raw).map(normTokenForCompare);
            if (!tokens.length) continue;
            const key = tokens[0];
            (idx[key] ||=[]).push({ group, variantTokens: tokens, variantRaw: raw, len: tokens.length });
            const flat = tokens.join('');
            const firstChar = flat.charAt(0) || '';
            if (firstChar) (flatIdx[firstChar] ||=[]).push({ group, flat, len: tokens.length, variantRaw: raw });
            const val = numberValueFromTokens(tokens);
            if (val !== null) {
                if (seenValue === null) seenValue = val;
                else if (seenValue !== val) conflict = true;
            }
        }
        if (seenValue !== null && !conflict) grpNum[group] = String(seenValue);
    }
    for (const k of Object.keys(idx)) idx[k].sort((a, b) => b.len - a.len);
    for (const k of Object.keys(flatIdx)) flatIdx[k].sort((a, b) => b.len - a.len);
    WorkerState.synoGroupToNum = grpNum;
    WorkerState.synoFlatIndex = flatIdx;
    return idx;
}

function matchSynoAt(arr, pos) {
    const first = arr[pos];
    const bucket = WorkerState.synoIndex[first];
    if (bucket) {
        for (const cand of bucket) {
            const { len, variantTokens } = cand;
            if (pos + len > arr.length) continue;
            let ok = true;
            for (let i = 0; i < len; i++) { if (arr[pos + i] !== variantTokens[i]) { ok = false; break; } }
            if (ok) return { group: cand.group, len: cand.len, raw: cand.variantRaw };
            const uVal = numberValueFromTokens(arr.slice(pos, pos + len));
            const vVal = numberValueFromTokens(variantTokens);
            if (uVal !== null && vVal !== null && uVal === vVal) return { group: cand.group, len: cand.len, raw: cand.variantRaw };
        }
    }
    const firstChar = (arr[pos] || '').charAt(0);
    const flatBucket = WorkerState.synoFlatIndex?.[firstChar];
    if (flatBucket && flatBucket.length) {
        for (const cand of flatBucket) {
            const { len, flat } = cand;
            if (pos + len > arr.length) continue;
            const flatCandidate = arr.slice(pos, pos + len).join('');
            if (flatCandidate === flat) return { group: cand.group, len: cand.len, raw: cand.variantRaw };
        }
    }
    return null;
}

function collapseWithSynonyms(rawTokens) {
    const comp =[];
    const norm = rawTokens.map(normTokenForCompare);
    let i = 0;
    while (i < norm.length) {
        let match = matchSynoAt(norm, i);
        if (match) {
            const { group, len } = match;
            const displaySpan = rawTokens.slice(i, i + len).join(' ');
            const matchedNormSlice = norm.slice(i, i + len);
            const perVariantNum = numberValueFromTokens(matchedNormSlice);
            const groupNum = WorkerState.synoGroupToNum?.[group] ?? null;
            const numeric = perVariantNum ?? groupNum;
            comp.push({ comp: numeric ? `__NUM:${numeric}__` : `__GX:${group}__`, display: displaySpan, span:[i, i + len], isSyno: true });
            i += len; continue;
        }
        const tk = norm[i];
        if (/^\d+(?:\.\d+)?$/.test(tk)) {
            comp.push({ comp: `__NUM:${tk}__`, display: rawTokens[i], span: [i, i + 1], isSyno: false });
            i++; continue;
        }
        const nr = parseNumberWordsRun(norm, i);
        if (nr) {
            comp.push({ comp: `__NUM:${nr.value}__`, display: rawTokens.slice(i, i + nr.len).join(' '), span: [i, i + nr.len], isSyno: false });
            i += nr.len; continue;
        }
        comp.push({ comp: tk, display: rawTokens[i], span: [i, i + 1], isSyno: false });
        i++;
    }
    return comp;
}

// ────────────────────────────────────────────────────────────────────────────
//  Comparison & Scoring Helpers
// ────────────────────────────────────────────────────────────────────────────
const escapeHtml = (s) => (s || '').replace(/[&<>"']/g, (m) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'})[m]);
const getLastPunctuation = (word) => (word || '').match(/[.,;:!?]$/)?.[0] || '';
const stripPunc = (s) => (s || '').replace(/[.,\/#!$%\^&\*;:{}=\-_~()]/g, '');
const isSpellingDiff = (a, b) => { if ((a || '').length <= 3 && (b || '').length <= 3) return false; const d = levenshteinDistance((a || '').toLowerCase(), (b || '').toLowerCase()); return d === 1 || d === 2; };
const shouldCountPunctuation = (op, up, cfg) => { if (!cfg || (cfg.punctuation?.weight || 0) === 0) return false; if (cfg.punctuation.mode === 'fullstop-only') return (op === '.' && up !== '.') || (up === '.' && op !== '.'); return true; };
const compNumericValue = (compToken) => { if (!compToken) return null; const s = String(compToken); const mNum = s.match(/^__NUM:(.+)__$/); if (mNum) return mNum[1]; const mGrp = s.match(/^__GX:(.+)__$/); if (mGrp) { const v = WorkerState.synoGroupToNum?.[mGrp[1]]; return (v != null) ? String(v) : null; } return null; };

function computeScore(c, cfg) {
    let takenPunc = 0, halfBucketCount = 0;
    if (cfg.punctuation.weight > 0) {
        if (cfg.punctuation.mode === 'fullstop-only') takenPunc = c.punctuation.fullstop;
        else takenPunc = c.punctuation.fullstop + c.punctuation.other;
        if (cfg.punctuation.weight === 0.5) halfBucketCount += takenPunc;
    }
    if (cfg.spelling === 0.5) halfBucketCount += c.spelling;
    if (cfg.capitalization === 0.5) halfBucketCount += c.capitalization;
    const score = (c.addition * cfg.addition) + (c.omission * cfg.omission) + (c.spelling * cfg.spelling) + (c.capitalization * cfg.capitalization) + (takenPunc * cfg.punctuation.weight);
    return { score, halfBucketCount, takenPuncCount: takenPunc };
}

// ────────────────────────────────────────────────────────────────────────────
//  The Main Comparison Function (DP Algorithm) - UPDATED WITH AI ICON
// ────────────────────────────────────────────────────────────────────────────
function compareCollapsed(origComp, userComp, origItems, userItems, cfg, savedSpellings) {
    const m = origComp.length, n = userComp.length;
    const M = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) M[i][0] = i;
    for (let j = 0; j <= n; j++) M[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) M[i][j] = Math.min(M[i - 1][j] + 1, M[i][j - 1] + 1, M[i - 1][j - 1] + ((origComp[i - 1] === userComp[j - 1]) ? 0 : 1));

    let i = m, j = n;
    const out = [];
    const trace = [];

    // --- NEW: The Icon HTML ---
    const icon = `<span class="ai-icon" title="Ask AI Explanation">ⓘ</span>`;

    while (i > 0 || j > 0) {
        const oc = origComp[i - 1], uc = userComp[j - 1];
        const oi = origItems[i - 1], uj = userItems[j - 1];

        if (i > 0 && j > 0) {
            const on = compNumericValue(oc), un = compNumericValue(uc);
            if (on !== null && on === un) { out.unshift(escapeHtml(oi.display)); trace.unshift({ type: 'num-eq', ow: oi.display, uw: uj.display }); i--; j--; continue; }
        }

        if (i > 0 && j > 0 && oc === uc) {
            const oDisp = oi.display, uDisp = uj.display;
            if (oDisp !== uDisp && stripPunc(oDisp) === stripPunc(uDisp)) {
                const op = getLastPunctuation(oDisp), up = getLastPunctuation(uDisp);
                if (shouldCountPunctuation(op, up, cfg)) {
                    // UPDATED: Added ${icon} and class highlight
                    out.unshift(`<span class="punctuation mis highlight" data-mistake-type="punctuation" data-oi="${oi.span[0]}" data-ui="${uj.span[0]}"><s>${escapeHtml(uDisp)}</s> ${escapeHtml(oDisp)}${icon}</span>`);
                    if (cfg.punctuation.mode === 'fullstop-only') { if (op === '.' || up === '.') WorkerState.mistakeCounters.punctuation.fullstop++; }
                    else { if ((op === '.' && !up) || (up === '.' && !op)) WorkerState.mistakeCounters.punctuation.fullstop++; else WorkerState.mistakeCounters.punctuation.other++; }
                    trace.unshift({ type: 'punc', ow: oDisp, uw: uDisp }); i--; j--; continue;
                }
            }
            if (String(oc).startsWith('__NUM:')) { out.unshift(escapeHtml(oDisp)); trace.unshift({ type: 'num-eq', ow: oDisp, uw: uDisp }); i--; j--; continue; }
            if (oi?.isSyno || uj?.isSyno) {
                const oSpanLen = (oi?.span?.[1] ?? 0) - (oi?.span?.[0] ?? 0), uSpanLen = (uj?.span?.[1] ?? 0) - (uj?.span?.[0] ?? 0);
                const singleWordSyno = (oSpanLen === 1 && uSpanLen === 1 && !/\s/.test(oDisp) && !/\s/.test(uDisp));
                if (singleWordSyno && isSpellingDiff(oDisp, uDisp)) {
                    if ((cfg.spelling || 0) > 0) {
                        const isSaved = (savedSpellings || []).includes(oDisp.toLowerCase());
                        // UPDATED: Added ${icon} and class highlight
                        out.unshift(`<span class="spelling mis highlight" data-mistake-type="spelling" data-correct="${escapeHtml(oDisp)}" data-wrong="${escapeHtml(uDisp)}" data-oi="${oi?.span?.[0] ?? -1}" data-ui="${uj?.span?.[0] ?? -1}"><s>${escapeHtml(uDisp)}</s> ${escapeHtml(oDisp)}${icon}</span>`);
                        WorkerState.mistakeCounters.spelling++; WorkerState.studentMistakes.spelling.push({ correct: oDisp, wrong: uDisp });
                        trace.unshift({ type: 'spell', ow: oDisp, uw: uDisp });
                    } else { out.unshift(escapeHtml(oDisp)); trace.unshift({ type: 'eq', ow: oDisp, uw: uDisp }); }
                    i--; j--; continue;
                }
                if (!singleWordSyno) { out.unshift(escapeHtml(oDisp)); trace.unshift({ type: 'syn-eq', ow: oDisp, uw: uDisp }); i--; j--; continue; }
            }
            if (oDisp.toLowerCase() === uDisp.toLowerCase() && oDisp !== uDisp) {
                if ((cfg.capitalization || 0) > 0) {
                    // UPDATED: Added ${icon} and class highlight
                    out.unshift(`<span class="capitalization mis highlight" data-mistake-type="capitalization" data-oi="${oi.span[0]}" data-ui="${uj.span[0]}"><s>${escapeHtml(uDisp)}</s> ${escapeHtml(oDisp)}${icon}</span>`);
                    WorkerState.mistakeCounters.capitalization++; WorkerState.studentMistakes.capitalisation.push({ correct: oDisp, wrong: uDisp });
                    trace.unshift({ type: 'cap', ow: oDisp, uw: uDisp });
                } else { out.unshift(escapeHtml(oDisp)); trace.unshift({ type: 'eq', ow: oDisp, uw: uDisp }); }
                i--; j--; continue;
            }
            out.unshift(escapeHtml(oDisp)); trace.unshift({ type: 'eq', ow: oDisp, uw: uDisp }); i--; j--; continue;
        }

        if (i > 0 && j > 0) {
            const oiObj = oi, ujObj = uj;
            const oDisp = oiObj?.display || '', uDisp = ujObj?.display || '';
            const oSpanLen = (oiObj?.span?.[1] ?? 0) - (oiObj?.span?.[0] ?? 0), uSpanLen = (ujObj?.span?.[1] ?? 0) - (ujObj?.span?.[0] ?? 0);
            const allowLocalChecks = (!oiObj?.isSyno && !ujObj?.isSyno) || (oSpanLen === 1 && uSpanLen === 1 && !/\s/.test(oDisp) && !/\s/.test(uDisp));
            if (allowLocalChecks) {
                if (origComp[i - 1] !== userComp[j - 1] && stripPunc(oDisp) === stripPunc(uDisp) && oDisp !== uDisp) {
                    const op = getLastPunctuation(oDisp), up = getLastPunctuation(uDisp);
                    if (shouldCountPunctuation(op, up, cfg)) {
                        // UPDATED: Added ${icon} and class highlight
                        out.unshift(`<span class="punctuation mis highlight" data-mistake-type="punctuation" data-oi="${oiObj?.span?.[0] ?? -1}" data-ui="${ujObj?.span?.[0] ?? -1}"><s>${escapeHtml(uDisp)}</s> ${escapeHtml(oDisp)}${icon}</span>`);
                        if (cfg.punctuation.mode === 'fullstop-only') { if (op === '.' || up === '.') WorkerState.mistakeCounters.punctuation.fullstop++; }
                        else { if ((op === '.' && !up) || (up === '.' && !op)) WorkerState.mistakeCounters.punctuation.fullstop++; else WorkerState.mistakeCounters.punctuation.other++; }
                        trace.unshift({ type: 'punc', ow: oDisp, uw: uDisp });
                    } else { out.unshift(escapeHtml(oDisp)); trace.unshift({ type: 'eq', ow: oDisp, uw: uDisp }); }
                    i--; j--; continue;
                }
                if (isSpellingDiff(oDisp, uDisp)) {
                    if ((cfg.spelling || 0) > 0) {
                        // UPDATED: Added ${icon} and class highlight
                        out.unshift(`<span class="spelling mis highlight" data-mistake-type="spelling" data-correct="${escapeHtml(oDisp)}" data-wrong="${escapeHtml(uDisp)}" data-oi="${oiObj?.span?.[0] ?? -1}" data-ui="${ujObj?.span?.[0] ?? -1}"><s>${escapeHtml(uDisp)}</s> ${escapeHtml(oDisp)}${icon}</span>`);
                        WorkerState.mistakeCounters.spelling++; WorkerState.studentMistakes.spelling.push({ correct: oDisp, wrong: uDisp });
                        trace.unshift({ type: 'spell', ow: oDisp, uw: uDisp });
                    } else { out.unshift(escapeHtml(oDisp)); trace.unshift({ type: 'eq', ow: oDisp, uw: uDisp }); }
                    i--; j--; continue;
                }
            }
        }

        if (j > 0 && (i === 0 || M[i][j - 1] <= M[i - 1][j])) {
            const disp = uj?.display || '';
            // No icon for addition, but added highlight class for consistency
            out.unshift(`<span class="addition mis highlight" data-mistake-type="extra" data-oi="-1" data-ui="${uj?.span[0] ?? -1}">${escapeHtml(disp)}</span>`);
            WorkerState.mistakeCounters.addition++; trace.unshift({ type: 'add', ow: null, uw: disp }); j--; continue;
        }

        const disp = oi?.display || '';
        // No icon for omission, but added highlight class for consistency
        out.unshift(`<span class="omission mis highlight" data-mistake-type="omission" data-oi="${oi?.span[0] ?? -1}" data-ui="-1">${escapeHtml(disp)}</span>`);
        WorkerState.mistakeCounters.omission++; trace.unshift({ type: 'omit', ow: disp, uw: null }); i--;
    }
    for (let k = 0; k < trace.length - 1; k++) {
        const a = trace[k], b = trace[k + 1];
        if (a.type === 'omit' && b.type === 'add' && a.ow && b.uw) { WorkerState.studentMistakes.replacements.push({ omitted: a.ow, added: b.uw }); k++; }
        else if (a.type === 'add' && b.type === 'omit' && a.uw && b.ow) { WorkerState.studentMistakes.replacements.push({ omitted: b.ow, added: a.uw }); k++; }
    }
    return out.join(' ');
}

// ────────────────────────────────────────────────────────────────────────────
//  Main Analysis Function
// ────────────────────────────────────────────────────────────────────────────
function performAnalysis(originalText, userText, config, savedSpellings) {
    // Reset counters
    WorkerState.mistakeCounters = { addition: 0, omission: 0, spelling: 0, capitalization: 0, punctuation: { fullstop: 0, other: 0 } };
    WorkerState.studentMistakes = { spelling: [], capitalisation:[], replacements:[] };

    // Hyphen splitting and percent formatting
    let safeOriginal = (originalText || '').replace(/per\s+cent/gi, 'percent').replace(/[\u2013\u2014-]/g, ' ');
    let safeUser = (userText || '').replace(/per\s+cent/gi, 'percent').replace(/[\u2013\u2014-]/g, ' ');

    const originalWordsRaw = tokenize(safeOriginal);
    const userWordsRaw     = tokenize(safeUser);

    const origItems = collapseWithSynonyms(originalWordsRaw);
    const userItems = collapseWithSynonyms(userWordsRaw);

    const originalComp = origItems.map(x => x.comp);
    const userComp     = userItems.map(x => x.comp);
    
    const resultHTML = compareCollapsed(originalComp, userComp, origItems, userItems, config, savedSpellings);

    const totalWordsP1 = originalWordsRaw.length;
    const { score, halfBucketCount, takenPuncCount } = computeScore(WorkerState.mistakeCounters, config);
    const percentageDiff = Math.min(100, (score / Math.max(1, totalWordsP1)) * 100);
    const accuracy = 100 - percentageDiff;
    
    return {
      resultHTML,
      originalWords: originalWordsRaw,
      userWords: userWordsRaw,
      totalWordsP1,
      totalWordsP2: userWordsRaw.length,
      halfBucketCount,
      takenPuncCount,
      percentageDiff,
      accuracy,
      mistakeCounters: WorkerState.mistakeCounters,
      studentMistakes: WorkerState.studentMistakes
    };
}

// ────────────────────────────────────────────────────────────────────────────
//  Worker Entry Point
// ────────────────────────────────────────────────────────────────────────────
self.onmessage = function(event) {
    const { originalText, userText, config, synonymData, savedSpellings } = event.data;

    // COMBINE the API data with the HARDCODED fallbacks
    const combinedSynonyms = [...HARDCODED_SYNONYMS, ...(synonymData || [])];
    WorkerState.synoIndex = buildSynoIndex(combinedSynonyms);

    const results = performAnalysis(originalText, userText, config, savedSpellings);

    self.postMessage(results);
};
