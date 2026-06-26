# AUDIT GABUNGAN MERIDIAN — T6 SINTESIS
Tanggal: 2026-06-14
Cakupan: T1 (screening pipeline) + T2 (cooldown/reject) + T3 (close lifecycle) + T4 (657 trade analysis) + T5 (auto-evolve & config)
Status: 0 P0 ditemukan. Beberapa P1 yang masih live (belum patched atau post-restart status).

Catatan metodologi: Temuan diverifikasi dengan `grep` + `read_file` terhadap source code live sebelum masuk laporan. Tidak ada rekaan. PM2 restart `meridian` tercatat 2026-06-14 23:39:12, setelah patch T3 (3007 fix di tools/dlmm.js) ditulis 23:17 → patch T3 SUDAH LIVE.

---

## P1 — CRITICAL (harus patch / disetujui sebelum aktivitas)

### P1-A. Auto-evolve adalah no-op struktural selama 5 hari (T5)
**Bukti:** lessons.js:372-485. Reproduced live oleh T5: 52 close sejak 2026-06-09, `evolveThresholds()` mengembalikan `{changes:{}}` setiap kali.

Tiga pengunci kode:
1. `lessons.js:406` — `else if (... && losers.length === 0)`. Karena `losers` dan `winners` (line 375-376) memfilter SELURUH `perfData` (657+ records, back to 2026-04-08), `losers.length` monoton naik dan pernah menyentuh 33. Gate `=== 0` secara struktural mustahil tercapai lagi. **Loosen branch adalah dead code selamanya.**
2. `lessons.js:396-404` — Tighten branch: `loserP25 * 1.15` lalu round-to-1dp, dan `rounded < current`. Live: loserP25=1.81, current=2.0, target=2.08 → rounded 2.1 → tidak < 2.0 → skip. Setelah cap dilewati (saat ini 2.0 = 1.81 × 1.105), tighten macet.
3. `lessons.js:430` — `Math.min(...winnerFees)`. Live: 1 winner dengan fee_tvl=0.0002 (kemungkinan kontaminasi data) memveto seluruh raise. Floor macet.

Tambahan: `lessons.js:372-485` tidak punya time window — rekor 2 bulan lalu bobotnya sama dengan 5 menit lalu. `minOrganic` (line 477) monotonically naik saja, tidak pernah turun. Funnel gates `minTvl/maxTvl/minMcap/maxMcap/minVolume/minHolders` **tidak pernah di-learn** — konsisten dengan diagnosa "starved funnel" Andy's. Learner buta terhadap sinyal intake.

**Dampak:** System tidak belajar. Thresholds beku. Setiap tuning manual Andy's dari `/reasoning hide` adalah intervensi manual murni, bukan hasil auto-evolve.

**Rekomendasi struktural konkret:**
- `lessons.js:375-376` — tambahkan windowing: `const windowData = perfData.slice(-EVOLVE_WINDOW)` (default 150, configurable via `user-config.json` → `evolveWindow`). `winners`/`losers` dari window.
- `lessons.js:406` — ubah gate ke `losers.length === 0` PADA WINDOW (bukan full history), ATAU rancang ulang loosen dengan logika berbeda (mis. `windowedP25 > current * 1.3`).
- `lessons.js:430` — ganti `Math.min(...winnerFees)` dengan `percentile(winnerFees, 10)` untuk robust terhadap outlier.
- `lessons.js:477` — izinkan `minOrganic` turun ketika windowed avg-loser-organic > current.
- **Tambah** learning untuk `minTvl`, `maxTvl`, `minMcap`, `maxMcap`, `minVolume` jika funnel starve.
- Hapus entri "Known issue: minFeeTvlRatio mismatch" dari `CLAUDE.md` (line bawah "Lessons System") — STALE, T5 konfirmasi 0 hit di code.

Butuh approval: "oke patch ya" sebelum eksekusi.

---

### P1-B. Null fee/TVL diam-diam bypass absolute floor + trap cap (T1)
**Bukti:** hardcoded-entry.js:213-238. Live, belum dipatch.

Kode saat ini:
```js
if (
  Number.isFinite(absoluteMinFeeActiveTvlRatio) &&
  ... &&
  Number.isFinite(feeActiveTvlRatio) && feeActiveTvlRatio < absoluteMinFeeActiveTvlRatio
)
```
- Line 217: `Number.isFinite(feeActiveTvlRatio) && feeActiveTvlRatio < ...` — kalau field null/NaN (API glitch atau token baru), `&&` short-circuit → kondisi FALSE → pool **lolos floor** (RULE 0).
- Line 232: pola identik di RULE 0b (trap cap) — null/NaN juga lolos.

`normalizeFeeTvlPct` di atasnya (line 212) bisa return null. Pool dengan fee/TVL unknown diperlakukan seolah lulus semua fee-quality gate dan langsung dikirim ke LLM tanpa downgrade scout-tier (RULE 0B-TAG).

**Dampak:** Pool dengan data fee/TVL corrupted/unknown di-deploy. Bisa langsung rugi modal.

**Rekomendasi konkret (1 dari 2, pilih satu):**
- Opsi A (fail-closed, prefer): Tambah guard eksplisit di awal RULE 0, sebelum min/max:
  ```js
  if (!Number.isFinite(feeActiveTvlRatio)) {
    const result = { pass: false, reason: `fee/TVL unknown (null/NaN) — hard reject until data valid` };
    recordHardcodedReject(baseMint, result.reason, s);
    return result;
  }
  ```
- Opsi B (scout-tier downgrade): biarkan null lewat tapi paksa tag `data_quality=unknown` dan turunkan prioritas di prompt LLM.

Opsi A lebih aman; Opsi B lebih permissive tapi mempertahankan throughput.

---

## P2 — HIGH (perlu patch minggu ini)

### P2-A. maxFeeActiveTvlRatio cap tidak diskalakan ke timeframe (T1)
**Bukti:** hardcoded-entry.js:228-238. Cap `0.50%` (atau `1.50%` untuk watchlist) di-bandingkan langsung ke fee/TVL timeframe. Default config `timeframe=5m`. Kalau Andy's flip ke 24h:
- Pool DLMM yang fee/TVL 24h-nya 3% (produktif per prompt.js reference) akan ditolak sebagai "trap" padahal sehat.
- Cap yang dimaksud (audit note 649 trade: BigLoss avg 67% = 0.67% on 5m) **aslinya 0.67%/5m × 1440m = ~3.2% per hari**. 0.50% on 5m ≈ 0.10% on 24h — sangat ketat.

**Rekomendasi:** Kalibrasi cap ke daily-equivalent:
```js
const tfMin = timeframeToMinutes(s.timeframe ?? '5m');  // helper
const dailyEq = maxFeeActiveTvlRatio * (1440 / tfMin);
if (Number.isFinite(feeActiveTvlRatio) && feeActiveTvlRatio > dailyEq) { ... }
```
Atau lebih sederhana: nyatakan cap dalam daily-equivalent di `user-config.json` dan bagi di runtime.

### P2-B. enrichPvpRisk default-false bocor ke LLM saat fetch gagal (T1)
**Bukti:** tools/screening.js, area `enrichPvpRisk`. T1 menemukan: kalau fetch DexScreener timeout/429, default `is_pvp=false`. Jika `blockPvpSymbols` aktif, ini bypass diam-diam.

**Rekomendasi:** Pilih satu:
- Fail-closed: error → `is_pvp_risk=true` (atau `unknown` + treat as suspected) saat `blockPvpSymbols` on.
- Atau explicit tri-state `is_pvp_risk ∈ {true, false, unknown}`, dan logic downstream hanya percaya `true`/`false`, reject `unknown` di funnel.

### P2-C. 657 trade analysis: edge ada, tapi learner tidak capture (T4)
**Bukti:** T4 menemukan:
- Winrate 60.6%, +$52.84 sum PnL (modal kecil per trade).
- Winning params teridentifikasi: fee/TVL 0.10-0.80, volatility 1-3.5, bin_step 100, bins_below 50-60, hold >60m.
- 240m+ hold bucket 82.6% winrate; <30m 52.6% — **hold-time adalah sinyal terkuat**.
- Semua Pearson correlation lemah (|r|<0.13) untuk field single — edge dari kombinasi + hold-time, bukan threshold tunggal.
- Field entry-quality (bots/top10/bundle/mcap/tvl/volume/smart/holders) **terlalu sparse di lessons.json (n<30)** untuk statistical tuning.

**Rekomendasi:**
- Tambah field wajib `hold_minutes` ke setiap perf record di lessons.js (lihat apakah sudah ada — kalau belum, tambahkan saat `recordClose` di tools/dlmm.js:1891/2179). Tanpa ini, hold-time edge tidak bisa di-learn.
- Instrumentasi deploy snapshot: tambah field entry-quality (bots%, top10%, bundle%, mcap, tvl, volume24h, smart_count, holders) ke perf record saat close. Tanpa data ini, learner buta.
- Hold-time minimum bisa dijadikan hard signal: deploy config tambah `minHoldMinutes=60` di management section.

---

## P3 — MEDIUM (memperbaiki funnel visibility, bukan blocking)

### P3-A. Zombie cooldown meracuni post-restart funnel health visibility (T1)
**Bukti:** T1 live-reproduce: 15:42 cap naik 0.50% → 1.50% (PM2 restart pick up user-config), 15:46+ 7/8 kandidat ditolak oleh cooldown carryover dari konfigurasi lama, BUKAN oleh cap baru. Operator tidak bisa bedakan.

**Rekomendasi:** Saat startup, log:
```js
const rejects = loadRejects();
const oldestTs = Math.min(...rejects.map(r => r.ts));
const activeCooldowns = rejects.filter(r => now - r.ts < cooldownMs).length;
logger.info(`Loaded ${rejects.length} hardcoded reject records, oldest from ${oldestTs}, ${activeCooldowns} active cooldowns blocking pools this cycle`);
```
Tambah di index.js atau mana pun yang load memory layer saat boot. Tidak perlu patch memory persistence.

### P3-B. T2 patches terverifikasi (T2)
**Bukti:** T2 patched, verifikasi ulang:
- `hardcoded-entry-rejects.js` — clear stale cooldowns saat expiry. (mtime 22:52, post-restart cap pick up 23:39 → live.)
- `loser-cooldowns.js` — `badCount` baca dari stats langsung, tidak +1. (mtime 22:51 → live.)
- Regex fee/TVL handle 'unknown'.

T2 done, 13 tests pass per worker. Tidak ada follow-up.

### P3-C. CLAUDE.md doc rot (T5)
**Bukti:** CLAUDE.md bagian "Lessons System" masih menulis "Known issue: evolveThresholds references maxVolatility and minFeeTvlRatio..." — T5 konfirmasi 0 hit di code aktif, T2 regex sudah support 'unknown', dan field sudah standard `minFeeActiveTvlRatio` di semua file aktif. Dokumen误导.

**Rekomendasi:** Edit CLAUDE.md. Hapus baris "Known issue" atau update jadi: "evolveThresholds() saat ini structural no-op untuk loosening — see P1-A in AUDIT_SINTESIS_T6.md".

---

## P4 — LOW (nice-to-have, observability)

### P4-A. Funnel gate lain tidak auto-learn (T5)
**Bukti:** T5: `minTvl/maxTvl/minMcap/maxMcap/minVolume/minHolders` tidak disentuh oleh `evolveThresholds()`. Kalau funnel starve (kandidat <2/cycle) atau oversupply (terlalu banyak loser), learner tidak bisa widen intake.

**Rekomendasi:** Tambahkan blok di `lessons.js evolveThresholds`:
- Jika winrate window < 50% AND median-loser-mcap > current `minMcap` → turunkan `minMcap`.
- Jika funnel starve (close count tapi deploy count turun >50% week-on-week) → turunkan `minTvl` atau `minVolume`.

Ini butuh data deploy count tracking — tambah ke `recordClose` atau `recordPerformance` kalau belum ada.

### P4-B. enrichPvpRisk observability (T1)
Sama area dengan P2-B, tapi versi observability: log setiap kali fetch gagal, dengan status code + endpoint, supaya Andy's bisa lihat dari log kalau ini sering kejadian (mungkin perlu rate limit review di upstream).

---

## P5 — INFO / data-sparse flags

- Field `bots`, `top10`, `bundle`, `mcap`, `tvl`, `volume`, `smart`, `holders` di lessons.json: n<30 per T4. Tidak bisa di-learn sampai instrumentasi deploy snapshot masuk (lihat P2-C).
- `hold_minutes` — tidak yakin ada di perf record. Verifikasi: `python3 -c "import json; d=json.load(open('lessons.json')); print(d['performance'][-1].get('hold_minutes'))"`. Kalau undefined, P2-C blocker.
- T1 P2 unscaled cap tidak akan terasa sampai Andy's flip timeframe dari 5m ke 24h — low urgency kecuali ada rencana ganti.
- Pool-memory snapshots: tidak diaudit. Kemungkinan ada info yang bisa augment P4-A.

---

## STATUS AKTUAL (live, post-restart 23:39)

| Komponen | Status | Patch |
|---|---|---|
| T1 P1 null fee/TVL bypass | LIVE unpatched | perlu (P1-B) |
| T1 P2 unscaled maxFeeCap | LIVE unpatched | perlu (P2-A) |
| T1 P3 zombie cooldown | LIVE unpatched | perlu (P3-A) |
| T1 P4 enrichPvpRisk default-false | LIVE unpatched | perlu (P2-B) |
| T2 cooldown double-count + permanent stack | PATCHED + live | done |
| T3 3007 close-position AccountOwnedByWrongProgram | PATCHED + live (pm2 restart 23:39) | done |
| T5 evolveThresholds no-op | LIVE unpatched | perlu (P1-A) |
| T5 CLAUDE.md doc rot | LIVE | perlu (P3-C) |
| T4 entry-quality sparse | structural | perlu (P2-C) |

---

## RINGKASAN DECISION POINTS (perlu "oke patch ya" Andy)

1. **P1-A** (auto-evolve) — patch struktural di lessons.js. Risk: bisa over-adjust kalau windowing tidak kalibrasi. Default window 150, configurable.
2. **P1-B** (null fee/TVL) — patch 4 baris di hardcoded-entry.js. Opsi A (fail-closed) atau B (downgrade). Opsi A direkomendasikan.
3. **P2-A** (timeframe scaling) — patch 5-10 baris. Pilih: helper function atau inline.
4. **P2-B** (enrichPvpRisk) — patch 3-5 baris di screening.js. Pilih: fail-closed atau tri-state.
5. **P2-C** (hold-time + entry-quality instrumentasi) — patch di tools/dlmm.js (recordClose) + lessons.js (recordPerformance). Lebih besar.
6. **P3-A** (startup log) — patch 3-5 baris di index.js atau memory loader.
7. **P3-C** (CLAUDE.md doc) — edit text, no logic risk.

Tidak ada patch yang dilakukan oleh T6 sesuai Meridian rule ("tunggu oke patch ya"). Semua rekomendasi di atas punya path file + line spesifik dan siap di-grab oleh child task T7+.

---

## DELIVERABLE FILES
- Laporan ini: /home/ubuntu/meridian/AUDIT_SINTESIS_T6.md
- Parent tasks: t_68911c5e, t_a5d98067, t_d470e274, t_e1339f4f, t_ec6e9843 (semua done)
- T5 comment untuk detail auto-evolve: t_d470e274 comment thread
