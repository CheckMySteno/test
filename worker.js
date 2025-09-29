const numberWordsMap = { 'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90, 'hundred': 100, 'thousand': 1000, 'million': 1000000, 'billion': 1000000000 };

const replacements = {
    ' & ': ' and ',
    ' % ': ' percent ',
    ' per cent ': ' percent ',
    ' honourable ': ' hon ',
    ' honble ': ' hon ',
    ' hon\'ble ': ' hon ',
    ' doctor ': ' dr ',
    ' mister ': ' mr ',
    ' misses ': ' mrs ',
    ' governments ': ' govts ',
    ' government ': ' govt ',
    ' special ': ' spl ',
    ' through ': ' thru ',
    ' department ': ' dept ',
    ' association ': ' assoc ',
    ' first ': ' 1st ',
    ' second ': ' 2nd ',
    ' third ': ' 3rd ',
    ' rupees ': ' rs ',
    ' rupee ': ' re ',
    ' advertisement ': ' advt ',
    ' additional ': ' addl ',
    ' secretary ': ' secy ',
    ' versus ': ' vs ',
    ' limited ': ' ltd ',
    ' private ': ' pvt ',
    ' number ': ' no ',
    ' ma\'am ': ' madam '
};

function normalizeTextForComparison(text) {
    if (!text) return "";
    let normalized = " " + text.toLowerCase() + " ";
    for (const [key, val] of Object.entries(replacements)) {
        normalized = normalized.replace(new RegExp(key, 'g'), val);
    }
    return normalized.replace(/\s+/g, ' ').trim();
}

// ---- Improved: strip outer punctuation (but keep hyphens) BEFORE normalization ----
function getNormalizedWord(word) {
    if (!word) return '';
    // remove leading/trailing characters that are not A-Za-z0-9 or hyphen
    const stripped = word.replace(/^[^A-Za-z0-9\-]+|[^A-Za-z0-9\-]+$/g, '');
    return normalizeTextForComparison(stripped).toLowerCase();
}

function wordToNumberNormalized(word) {
    if (!word) return null;
    let w = word.toLowerCase().replace(/[.,!?;:'"]+$/, '');
    if (numberWordsMap[w] !== undefined) return numberWordsMap[w];
    if (!isNaN(parseFloat(w)) && isFinite(w)) return parseFloat(w);
    return null;
}

// 🔥 Cache for levenshtein results (keeps logic same, huge speedup)
const levenshteinCache = {};

function levenshtein(a, b) {
    const key = a + "|" + b;
    if (levenshteinCache[key] !== undefined) {
        return levenshteinCache[key];
    }

    if (!a || !b) {
        return levenshteinCache[key] = (a || "").length + (b || "").length;
    }

    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }

    return levenshteinCache[key] = dp[a.length][b.length];
}

// ✅ Hyphen-safe + normalized substitution (same logic, unchanged)
function getSubstitutionCost(o, t, o_orig, t_orig) {
    const o_norm = getNormalizedWord(o_orig);
    const t_norm = getNormalizedWord(t_orig);

    const num_o = wordToNumberNormalized(o_orig);
    const num_t = wordToNumberNormalized(t_orig);
    if (num_o !== null && num_t !== null && num_o === num_t) return 0;

    // Hyphen mismatch forces omission + extra
    const origHasHyphen = o_norm.includes('-');
    const typedHasHyphen = t_norm.includes('-');
    if (origHasHyphen !== typedHasHyphen) return Infinity;

    if (o_norm === t_norm) return 0;
    if (levenshtein(o_norm, t_norm) <= 3) return 0.5;
    return 100;
}

function analyzeText(originalText, typedText, timeTakenSeconds, options = {}) {
    const originalWords = originalText.trim().split(/\s+/).filter(Boolean);
    const typedWords = typedText.trim().split(/\s+/).filter(Boolean);

    const normOriginalWords = originalWords.map(getNormalizedWord);
    const normTypedWords = typedWords.map(getNormalizedWord);

    let alignment = [];
    const dp = Array.from({ length: normOriginalWords.length + 1 }, () => Array(normTypedWords.length + 1).fill(0));
    const trace = Array.from({ length: normOriginalWords.length + 1 }, () => Array(normTypedWords.length + 1).fill(""));

    for (let i = 0; i <= normOriginalWords.length; i++) { dp[i][0] = i; trace[i][0] = 'del'; }
    for (let j = 0; j <= normTypedWords.length; j++) { dp[0][j] = j; trace[0][j] = 'ins'; }

    for (let i = 1; i <= normOriginalWords.length; i++) {
        for (let j = 1; j <= normTypedWords.length; j++) {
            const cost = getSubstitutionCost(normOriginalWords[i - 1], normTypedWords[j - 1], originalWords[i - 1], typedWords[j - 1]);
            const subCost = dp[i - 1][j - 1] + cost;
            const insCost = dp[i][j - 1] + 1;
            const delCost = dp[i - 1][j] + 1;

            let minCost = Math.min(insCost, delCost, (cost === Infinity ? Infinity : subCost));
            dp[i][j] = minCost;

            if (cost !== Infinity && minCost === subCost) {
                trace[i][j] = (cost === 0) ? "match" : "sub";
            } else if (minCost === insCost) {
                trace[i][j] = "ins";
            } else {
                trace[i][j] = "del";
            }
        }
    }

    let minCost = Infinity, bestEndRow = 0;
    if (normTypedWords.length > 0 && normTypedWords[0] !== "") {
        bestEndRow = normOriginalWords.length;
        for (let i = 0; i <= normOriginalWords.length; i++) {
            if (dp[i][normTypedWords.length] < minCost) {
                minCost = dp[i][normTypedWords.length];
                bestEndRow = i;
            }
        }
    } else { minCost = normOriginalWords.length; bestEndRow = 0; }

    for (let k = normOriginalWords.length - 1; k >= bestEndRow; k--) {
        alignment.unshift({ type: "del", o: originalWords[k] });
    }
    
    let i = bestEndRow, j = normTypedWords.length;
    while (i > 0 || j > 0) {
        const action = trace[i]?.[j] || (i > 0 ? 'del' : 'ins');
        if ((action === "match" || action === "sub") && i > 0 && j > 0) {
            alignment.unshift({ type: action, o: originalWords[i - 1], t: typedWords[j - 1] });
            i--; j--;
        } 
        else if ((action === "ins" || i === 0) && j > 0) {
            alignment.unshift({ type: "ins", t: typedWords[j - 1] });
            j--;
        } 
        else if ((action === "del" || j === 0) && i > 0) {
            alignment.unshift({ type: "del", o: originalWords[i - 1] });
            i--;
        } 
        else { break; }
    }

    let fullMistakes = 0;
    let halfMistakes = 0;
    
    alignment.forEach(entry => {
        if (entry.type === "match") {
            const o = entry.o, t = entry.t;
            // ---- Use the same outer-trim logic for capitalization/punctuation checks ----
            const oBase = o.replace(/^[^A-Za-z0-9\-]+|[^A-Za-z0-9\-]+$/g, '');
            const tBase = t.replace(/^[^A-Za-z0-9\-]+|[^A-Za-z0-9\-]+$/g, '');
            let mistakeHandled = false;
            if (oBase.toLowerCase() === tBase.toLowerCase()) {
                if (oBase !== tBase) { 
                    entry.mistakeType = 'capitalization';
                    halfMistakes++; 
                    mistakeHandled = true;
                }
                if (!mistakeHandled) {
                    const dotMismatch = o.endsWith('.') !== t.endsWith('.');
                    const commaMismatch = options.countCommaMistakes && (o.endsWith(',') !== t.endsWith(','));
                    if (dotMismatch || commaMismatch) {
                        entry.mistakeType = 'punctuation';
                        halfMistakes++;
                        mistakeHandled = true;
                    }
                }
            }
            if (!mistakeHandled) {
                entry.mistakeType = 'correct';
            }
        } else if (entry.type === "del") {
            entry.mistakeType = 'omission';
            fullMistakes++;
        } else if (entry.type === "ins") {
            entry.mistakeType = 'extra';
            fullMistakes++;
        } else if (entry.type === "sub") {
            entry.mistakeType = 'spelling';
            halfMistakes++;
        }
    });

    const totalWords = originalWords.length;
    const typedWordCount = typedWords.length;
    const mistakeScore = fullMistakes + (halfMistakes * 0.5);
    const accuracy = totalWords > 0 ? Math.max(0, (((totalWords - mistakeScore) / totalWords) * 100)) : 0;
    const typingSpeed = timeTakenSeconds > 0 ? (typedWordCount / (timeTakenSeconds / 60)) : 0;

    return {
        alignment: alignment,
        fullMistakes: fullMistakes,
        halfMistakes: halfMistakes,
        accuracy: accuracy.toFixed(2),
        mistakeScore: mistakeScore,
        mistakePercent: (totalWords > 0 ? (mistakeScore / totalWords * 100) : 0).toFixed(2),
        totalWords: totalWords,
        typedWords: typedWordCount,
        typingSpeed: typingSpeed.toFixed(2),
        typedKeystrokes: typedText.length,
    };
}
// This is the worker's "ear". It waits for a job from the main HTML file.
self.onmessage = function(event) {
    // 1. Get the data sent from the main script
    const { originalText, typedText, timeTakenSeconds, options } = event.data;
    
    // 2. Run the heavy, slow calculation
    const results = analyzeText(originalText, typedText, timeTakenSeconds, options);
    
    // 3. Send the finished result back to the main script
    self.postMessage(results);
};
