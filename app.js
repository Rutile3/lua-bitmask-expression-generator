'use strict';

// すべてIIFE内に閉じてグローバル漏れを防止
(() => {
    const OUTPUT_EMPTY = '—';

    // ------- DOMヘルパ
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ------- DOMキャッシュ
    const els = {
        set: $('#set'),
        useRange: $('#useRange'),
        rangeRow: $('#rangeRow'),
        minX: $('#minX'),
        maxX: $('#maxX'),
        gen: $('#gen'),
        clear: $('#clear'),
        msg: $('#msg'),
        out: {
            constDec: $('#constDec'),
            constBin: $('#constBin'),
            offset: $('#offset'),
            luaReadable: $('#luaReadable'),
            luaCompact: $('#luaCompact'),
        }
    };

    // ===== 変換・計算ロジック =====
    function autosize(el) {
        if (!(el instanceof HTMLTextAreaElement)) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }

    /** 入力文字列を整数集合（昇順、重複除去）に変換 */
    function parseSet(input) {
        if (!input) return [];
        const nums = String(input)
            .split(/[^-0-9]+/g)       // 数字とマイナス以外で分割
            .filter(Boolean)          // 空要素を除去
            .map(Number)              // 数値化
            .filter(Number.isInteger);// 整数のみ
        return Array.from(new Set(nums)).sort((a, b) => a - b);
    }

    /** 集合からビットマスク等を構築（範囲min/maxは任意。未指定なら集合のmin/max） */
    function buildFromSet(xSet, opts = {}) {
        if (!Array.isArray(xSet) || xSet.length === 0) {
            throw new Error('整数の集合が空です。');
        }

        const sorted = [...xSet].sort((a, b) => a - b);
        const autoMin = sorted[0];
        const autoMax = sorted[sorted.length - 1];

        const min = Number.isFinite(opts.minX) ? Number(opts.minX) : autoMin;
        const max = Number.isFinite(opts.maxX) ? Number(opts.maxX) : autoMax;
        if (min > max) throw new Error('minX は maxX 以下である必要があります。');

        // 範囲外は無視（メッセージ用に記録）
        const outOfRange = sorted.filter(v => v < min || v > max);

        // BigIntでマスク化：bitIndex = v - min
        let mask = 0n;
        for (const v of sorted) {
            if (v < min || v > max) continue;
            mask |= (1n << BigInt(v - min));
        }

        const width = max - min + 1;
        const offset = -min; // x + offset で 0..width-1
        const constDec = mask.toString(10);                     // 10進
        const constBin = mask.toString(2).padStart(width, '0'); // 2進（幅合わせ）

        // luaReadableは可読性のために括弧を付ける
        const xTerm = offset === 0 ? 'x' : `x+${offset}`;
        const luaReadable = `(${constDec} >> (${xTerm})) & 1 == 1`;
        const luaCompact = `${constDec} >> ${xTerm} & 1 == 1`;

        return { constDec, constBin, offset, luaReadable, luaCompact, min, max, outOfRange };
    }

    // ===== 描画関連 =====

    function setText(id, text) {
        const v = (text ?? OUTPUT_EMPTY);
        const el = document.getElementById(id);
        if (!el) return;

        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            el.value = v;
            autosize(el); // ←自動リサイズ
        } else {
            el.textContent = v;
        }

        const btn = document.querySelector(`.copy[data-copy="${id}"]`);
        if (btn) btn.disabled = (v === OUTPUT_EMPTY);
    }

    function renderOutput(r) {
        setText('constDec', r.constDec);
        setText('constBin', r.constBin);
        setText('offset', String(r.offset));
        setText('luaReadable', r.luaReadable);
        setText('luaCompact', r.luaCompact);

        if (r.outOfRange && r.outOfRange.length) {
            els.msg.style.display = 'block';
            els.msg.textContent = `範囲外の値を無視: ${r.outOfRange.join(', ')}`;
        } else {
            els.msg.style.display = 'none';
            els.msg.textContent = '';
        }
    }

    async function copyFrom(id) {
        const el = document.getElementById(id);
        if (!el) return;
        const t = (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
            ? el.value
            : el.textContent;

        if (!t || t === OUTPUT_EMPTY) return;
        try { await navigator.clipboard.writeText(t); } catch { }
    }

    // ===== イベント類 =====

    // 範囲固定のON/OFF
    els.useRange.addEventListener('change', () => {
        els.rangeRow.style.display = els.useRange.checked ? 'grid' : 'none';
        if (els.useRange.checked) {
            const xs = parseSet(els.set.value);
            if (xs.length) {
                els.minX.value = xs[0];
                els.maxX.value = xs[xs.length - 1];
            }
        } else {
            els.minX.value = '';
            els.maxX.value = '';
        }
    });

    // 生成
    els.gen.addEventListener('click', () => {
        try {
            const xs = parseSet(els.set.value);
            const opts = {};
            if (els.useRange.checked) {
                if (els.minX.value === '' || els.maxX.value === '') {
                    throw new Error('minX / maxX を指定してください。');
                }
                opts.minX = Number(els.minX.value);
                opts.maxX = Number(els.maxX.value);
            }
            const r = buildFromSet(xs, opts);
            renderOutput(r);
        } catch (e) {
            els.msg.style.display = 'block';
            els.msg.textContent = e.message;
        }
    });

    // クリア
    els.clear.addEventListener('click', () => {
        els.set.value = '';
        els.useRange.checked = false;
        els.rangeRow.style.display = 'none';
        els.minX.value = els.maxX.value = '';
        els.msg.style.display = 'none';
        els.msg.textContent = '';
        ['constDec', 'constBin', 'offset', 'luaReadable', 'luaCompact']
            .forEach(id => setText(id, OUTPUT_EMPTY));
    });

    // コピー
    $$('.copy').forEach(
        b => b.addEventListener('click', e => copyFrom(e.currentTarget.dataset.copy))
    );

    // デモ初期値
    els.set.value = '-4, -2, 1, 3, 5';
    els.gen.click();
})();
