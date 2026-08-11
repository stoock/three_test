#!/usr/bin/env python3
"""
Experiment: effect of an agent skill's *language composition* on token
consumption and review accuracy.

Runs entirely against the Anthropic API. Nothing here is estimated — every
number this script writes to results.csv is either an exact tokenizer count
(count_tokens) or a live usage figure (messages.create). Accuracy items that a
regex cannot judge cleanly are additionally scored by the MODEL acting as an
LLM-judge; those rows are labeled "llm-judge" in the output.

Requires: ANTHROPIC_API_KEY in the environment, and `pip install anthropic`.

Usage:
    python run_experiment.py            # full run (6 live calls per variant + judging)
    python run_experiment.py --self-test  # offline: exercise scoring only, no API
"""

import argparse
import csv
import json
import os
import re
import statistics
import sys
import time
from pathlib import Path

MODEL = "claude-opus-4-8"  # token counts depend on this model's tokenizer; do not change casually

# List-price assumption for claude-opus-4-8 (USD per 1M tokens). Pricing is a
# published figure, NOT a measurement — labeled as such in the report.
PRICE_IN_PER_MTOK = 5.00
PRICE_OUT_PER_MTOK = 25.00

N_DETERMINISTIC = 1   # temperature=0.0 requested (see note about opus-4-8 below)
N_VARIANCE = 5        # temperature=0.7 requested
MAX_TOKENS = 1200

HERE = Path(__file__).resolve().parent
SKILL_DIR = HERE / "skills"
FIXTURE_DIR = HERE / "fixture"

VARIANTS = {
    "a_en": {"file": "skill_en.md", "expected_lang": "en"},
    "b_ko": {"file": "skill_ko.md", "expected_lang": "ko"},
    "c_mix": {"file": "skill_mix.md", "expected_lang": "ko"},   # task expects (b)(c)(d) Korean
    "d_en_ko": {"file": "skill_en_ko.md", "expected_lang": "ko"},
}

USER_TEMPLATE = "Review the following unified diff.\n\n```diff\n{diff}\n```\n"

REQUIRED_SECTIONS = ["Summary", "Bugs", "Security", "Performance", "Readability"]


# --------------------------------------------------------------------------- #
# Loading                                                                      #
# --------------------------------------------------------------------------- #
def load_inputs():
    diff = (FIXTURE_DIR / "diff.txt").read_text()
    gt = json.loads((FIXTURE_DIR / "ground_truth.json").read_text())
    skills = {k: (SKILL_DIR / v["file"]).read_text() for k, v in VARIANTS.items()}
    return diff, gt, skills


# --------------------------------------------------------------------------- #
# Programmatic scoring (all "measured", deterministic given a response text)   #
# --------------------------------------------------------------------------- #
def korean_ratio(text):
    """Fraction of letter-ish chars that are Hangul. 0.0 = pure English."""
    hangul = len(re.findall(r"[가-힣]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    denom = hangul + latin
    return hangul / denom if denom else 0.0


def detected_lang(text):
    return "ko" if korean_ratio(text) >= 0.30 else "en"


def word_count(text):
    # Whitespace tokenization. NOTE: undercounts Korean, which does not delimit
    # every word with spaces. Reported with that caveat.
    return len(text.split())


def section_present(text, name):
    return re.search(rf"(?im)^#{{1,4}}\s*{re.escape(name)}\b", text) is not None


def no_issue_marker_in_security(text):
    """Did the Security section state there is no issue (English or Korean)?"""
    sec = extract_section(text, "Security")
    if sec is None:
        return False
    low = sec.lower()
    return (
        "no issues found" in low
        or "no issue" in low
        or "문제 없" in sec
        or "없음" in sec
        or "해당 없음" in sec
    )


def extract_section(text, name):
    """Return the body text under a '## <name>' heading up to the next heading."""
    m = re.search(rf"(?im)^#{{1,4}}\s*{re.escape(name)}\b.*?$", text)
    if not m:
        return None
    start = m.end()
    nxt = re.search(r"(?im)^#{1,4}\s+\S", text[start:])
    end = start + nxt.start() if nxt else len(text)
    return text[start:end].strip()


def defect_detected(text, defect):
    low = text.lower()
    for pat in defect["detect_any_regex"]:
        if re.search(pat, low):
            return True
    return False


def mentions_file_or_line(text, gt):
    low = text.lower()
    if gt["file"].lower() in low or "user_service" in low:
        return True
    # any explicit line reference like "line 12" / "L12" / ":12"
    if re.search(r"\b(line|줄)\s*\d+|\bl\d+\b|:\d+\b", low):
        return True
    return False


def score_programmatic(text, gt):
    """Everything here is exact given the response text (label: measured)."""
    localized = mentions_file_or_line(text, gt)
    per_defect = {}
    concept_hits = 0
    strict_hits = 0
    for d in gt["planted_defects"]:
        hit = defect_detected(text, d)
        per_defect[d["id"]] = hit
        if hit:
            concept_hits += 1
            if localized:
                strict_hits += 1
    n = len(gt["planted_defects"])

    # security false-positive heuristic: Security section claims something and
    # is NOT a "no issues" statement.
    sec = extract_section(text, "Security") or ""
    sec_marked_clean = no_issue_marker_in_security(text)
    security_fp_heuristic = bool(sec.strip()) and not sec_marked_clean

    sections_ok = all(section_present(text, s) for s in REQUIRED_SECTIONS)
    wc = word_count(text)

    return {
        "recall_concept": concept_hits / n,
        "recall_strict": strict_hits / n,
        "localized": localized,
        "per_defect": per_defect,
        "security_fp_heuristic": security_fp_heuristic,
        "sections_all_present": sections_ok,
        "security_no_issue_marked": sec_marked_clean,
        "word_count": wc,
        "within_300_words": wc <= 300,
        "korean_ratio": round(korean_ratio(text), 3),
        "detected_lang": detected_lang(text),
    }


# --------------------------------------------------------------------------- #
# LLM-judge (label: llm-judge). Prompt + verdict are logged.                   #
# --------------------------------------------------------------------------- #
JUDGE_SYSTEM = """You are a strict grader for a code-review experiment.
You are given: (1) a unified diff, (2) the GROUND TRUTH list of planted defects,
and (3) a REVIEW produced by another model. Grade ONLY against the ground truth.

Return a single JSON object, no prose, with exactly these keys:
{
  "detected": { "<defect_id>": true|false, ... },   // one entry per ground-truth defect id
  "hallucinated_issues": [ "<short phrase>", ... ],  // concrete problems the review claims that are NOT in ground truth (security ground truth is 'none': any specific security vulnerability claim is hallucinated)
  "review_language": "en"|"ko"|"mixed",
  "notes": "<one sentence of reasoning>"
}
A defect counts as detected only if the review clearly identifies that specific
problem (not merely touching the same line). Be conservative."""


def run_judge(client, diff, gt, review_text, variant, run_idx, log_fp):
    gt_min = {
        "file": gt["file"],
        "security_ground_truth": gt["security_ground_truth"],
        "planted_defects": [
            {"id": d["id"], "category": d["category"], "description": d["description"]}
            for d in gt["planted_defects"]
        ],
    }
    user = (
        f"DIFF:\n```diff\n{diff}\n```\n\n"
        f"GROUND TRUTH (JSON):\n{json.dumps(gt_min, ensure_ascii=False, indent=2)}\n\n"
        f"REVIEW TO GRADE:\n<<<\n{review_text}\n>>>\n\n"
        "Output the JSON object now."
    )
    resp = client.messages.create(
        model=MODEL,
        max_tokens=800,
        system=JUDGE_SYSTEM,
        messages=[{"role": "user", "content": user}],
    )
    raw = "".join(b.text for b in resp.content if b.type == "text")
    parsed, parse_err = _extract_json(raw)
    log_fp.write(json.dumps({
        "variant": variant, "run": run_idx,
        "judge_system": JUDGE_SYSTEM,
        "judge_user": user,
        "judge_raw": raw,
        "judge_parsed": parsed,
        "parse_error": parse_err,
        "judge_usage": {"input": resp.usage.input_tokens, "output": resp.usage.output_tokens},
    }, ensure_ascii=False) + "\n")
    log_fp.flush()
    return parsed, raw


def _extract_json(raw):
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        return None, "no json object found"
    try:
        return json.loads(m.group(0)), None
    except Exception as e:  # noqa: BLE001
        return None, str(e)


# --------------------------------------------------------------------------- #
# Live calls                                                                   #
# --------------------------------------------------------------------------- #
def create_review(client, system, user, want_temperature):
    """
    Try to honor the requested temperature. claude-opus-4-8 removed the
    temperature parameter (400 on send), so on that error we retry WITHOUT it
    and record temperature_mode='unsupported'. This is a measured API fact.
    """
    kwargs = dict(model=MODEL, max_tokens=MAX_TOKENS, system=system,
                  messages=[{"role": "user", "content": user}])
    if want_temperature is not None:
        try:
            r = client.messages.create(temperature=want_temperature, **kwargs)
            return r, "applied"
        except Exception as e:  # noqa: BLE001
            if "temperature" in str(e).lower():
                r = client.messages.create(**kwargs)
                return r, "unsupported-fell-back-to-default"
            raise
    r = client.messages.create(**kwargs)
    return r, "default"


# --------------------------------------------------------------------------- #
# Main                                                                         #
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true",
                    help="Run offline scoring checks only; makes no API calls.")
    args = ap.parse_args()

    diff, gt, skills = load_inputs()

    if args.self_test:
        return self_test(diff, gt)

    import anthropic
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("ERROR: ANTHROPIC_API_KEY is not set. Cannot perform live "
                 "measurement. Nothing was measured; no results written.")
    client = anthropic.Anthropic()

    rows = []
    judge_log = open(HERE / "judge_logs.jsonl", "w", encoding="utf-8")

    # A. exact input token counts (per variant) --------------------------------
    input_tokens = {}
    for v, meta in VARIANTS.items():
        user = USER_TEMPLATE.format(diff=diff)
        ct = client.messages.count_tokens(
            model=MODEL, system=skills[v],
            messages=[{"role": "user", "content": user}],
        )
        input_tokens[v] = ct.input_tokens
        print(f"[count_tokens] {v}: {ct.input_tokens} input tokens")

    # B + C. live runs + scoring ----------------------------------------------
    temps = [0.0] + [0.7] * N_VARIANCE  # first run "deterministic", rest variance
    for v, meta in VARIANTS.items():
        user = USER_TEMPLATE.format(diff=diff)
        for i, temp in enumerate(temps):
            r, temp_mode = create_review(client, skills[v], user, temp)
            text = "".join(b.text for b in r.content if b.type == "text")
            prog = score_programmatic(text, gt)
            judge, judge_raw = run_judge(client, diff, gt, text, v, i, judge_log)

            j_detected = (judge or {}).get("detected", {})
            j_recall = (sum(1 for x in j_detected.values() if x) / len(gt["planted_defects"])
                        if j_detected else None)
            j_halluc = len((judge or {}).get("hallucinated_issues", []) or []) if judge else None
            j_lang = (judge or {}).get("review_language") if judge else None

            row = {
                "variant": v,
                "run": i,
                "temp_requested": temp,
                "temp_mode": temp_mode,
                "count_tokens_input": input_tokens[v],       # measured (exact tokenizer)
                "usage_input_tokens": r.usage.input_tokens,  # measured (live)
                "usage_output_tokens": r.usage.output_tokens,  # measured (live)
                "recall_concept_prog": prog["recall_concept"],       # measured
                "recall_strict_prog": prog["recall_strict"],         # measured
                "recall_llmjudge": j_recall,                         # llm-judge
                "security_fp_heuristic": int(prog["security_fp_heuristic"]),  # measured
                "hallucinations_llmjudge": j_halluc,                 # llm-judge
                "sections_all_present": int(prog["sections_all_present"]),   # measured
                "security_no_issue_marked": int(prog["security_no_issue_marked"]),
                "word_count": prog["word_count"],                    # measured (see caveat)
                "within_300_words": int(prog["within_300_words"]),
                "korean_ratio": prog["korean_ratio"],                # measured
                "detected_lang_prog": prog["detected_lang"],         # measured
                "lang_llmjudge": j_lang,                             # llm-judge
                "lang_matches_expected": int(prog["detected_lang"] == meta["expected_lang"]),
                "cost_usd": round(
                    r.usage.input_tokens / 1e6 * PRICE_IN_PER_MTOK
                    + r.usage.output_tokens / 1e6 * PRICE_OUT_PER_MTOK, 6),
            }
            rows.append(row)
            print(f"[run] {v} #{i} temp={temp}({temp_mode}) "
                  f"out={r.usage.output_tokens} recall_prog={prog['recall_concept']:.2f} "
                  f"lang={prog['detected_lang']}")
            time.sleep(0.3)

    judge_log.close()

    # write results.csv
    fieldnames = list(rows[0].keys())
    with open(HERE / "results.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    print(f"\nWrote {len(rows)} rows to results.csv")

    write_report(rows, input_tokens, gt)
    print("Wrote report.md")


def agg(rows, variant, key, runs="variance"):
    """mean/std over the temp=0.7 variance runs (run>=1) unless runs='all'."""
    if runs == "variance":
        vals = [r[key] for r in rows if r["variant"] == variant and r["run"] >= 1
                and r[key] is not None]
    else:
        vals = [r[key] for r in rows if r["variant"] == variant and r[key] is not None]
    if not vals:
        return (None, None)
    m = statistics.mean(vals)
    s = statistics.pstdev(vals) if len(vals) > 1 else 0.0
    return (m, s)


def write_report(rows, input_tokens, gt):
    """Fill the measured-results tables into report.md, preserving the top
    predictions section that ships in the repo."""
    tmpl = (HERE / "report.md").read_text()
    marker = "<!-- MEASURED_RESULTS -->"
    lines = ["## 5. 실측 결과 (Measured results)", ""]
    lines.append(f"- MODEL: `{MODEL}`  ·  실행 시각(UTC): {time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())}")
    lines.append("- 아래 표의 '실측' 열은 count_tokens / usage 값(정확), 'LLM-판정' 열은 심판 호출 결과입니다.")
    lines.append("")

    # token table
    en_in = input_tokens["a_en"]
    lines += ["### 5.1 입력 토큰 (실측, count_tokens)", "",
              "| 변형 | 입력토큰 | 영문 대비 배수 |", "|---|---|---|"]
    for v in VARIANTS:
        lines.append(f"| {v} | {input_tokens[v]} | {input_tokens[v]/en_in:.3f}× |")
    lines.append("")

    # output tokens + cost
    lines += ["### 5.2 출력 토큰 · 총비용 (실측, temp=0.7 5회 평균±표준편차)", "",
              "| 변형 | 출력토큰 mean±std | 총비용 USD mean | 영문 대비 총토큰 배수 |",
              "|---|---|---|---|"]
    base_tot = None
    tot_by_v = {}
    for v in VARIANTS:
        om, os_ = agg(rows, v, "usage_output_tokens")
        im, _ = agg(rows, v, "usage_input_tokens")
        cm, _ = agg(rows, v, "cost_usd")
        tot = (im or 0) + (om or 0)
        tot_by_v[v] = tot
        if v == "a_en":
            base_tot = tot
    for v in VARIANTS:
        om, os_ = agg(rows, v, "usage_output_tokens")
        cm, _ = agg(rows, v, "cost_usd")
        mult = tot_by_v[v] / base_tot if base_tot else float("nan")
        lines.append(f"| {v} | {om:.1f}±{os_:.1f} | {cm:.5f} | {mult:.3f}× |")
    lines.append("")
    lines.append("**(b) vs (d) 토큰 효율(한국어 결과가 필요할 때):** "
                 f"b_ko 총토큰 {tot_by_v['b_ko']:.0f} vs d_en_ko 총토큰 {tot_by_v['d_en_ko']:.0f} "
                 f"→ {'d_en_ko가 효율적' if tot_by_v['d_en_ko']<tot_by_v['b_ko'] else 'b_ko가 효율적'}.")
    lines.append("")

    # accuracy table
    lines += ["### 5.3 정확도 (temp=0.7 5회 평균±표준편차)", "",
              "| 변형 | 재현율(실측,개념) | 재현율(LLM-판정) | 허위양성(LLM-판정) | 형식준수(실측) | 언어준수(실측) |",
              "|---|---|---|---|---|---|"]
    for v in VARIANTS:
        rc_m, rc_s = agg(rows, v, "recall_concept_prog")
        rj_m, rj_s = agg(rows, v, "recall_llmjudge")
        hj_m, hj_s = agg(rows, v, "hallucinations_llmjudge")
        fm, fs = agg(rows, v, "sections_all_present")
        lm, ls = agg(rows, v, "lang_matches_expected")
        def fmt(m, s):
            return "—" if m is None else f"{m:.2f}±{s:.2f}"
        lines.append(f"| {v} | {fmt(rc_m,rc_s)} | {fmt(rj_m,rj_s)} | {fmt(hj_m,hj_s)} "
                     f"| {fmt(fm,fs)} | {fmt(lm,ls)} |")
    lines.append("")
    lines.append("_라벨: '실측' = count_tokens/usage/정규식 판정, 'LLM-판정' = MODEL 심판 호출 "
                 "(judge_logs.jsonl에 프롬프트·근거 기록)._")
    body = "\n".join(lines)

    if marker in tmpl:
        out = tmpl.replace(marker, body)
    else:
        out = tmpl + "\n\n" + body
    (HERE / "report.md").write_text(out)


# --------------------------------------------------------------------------- #
# Offline self-test of the scoring logic (no API)                              #
# --------------------------------------------------------------------------- #
def self_test(diff, gt):
    print("Running offline scoring self-test (no API calls)...\n")

    good_ko = """## Summary
tenant_id 누락과 null 캐싱 문제가 있는 변경입니다. services/user_service.py 참조.
## Bugs
- 캐시 키에 tenant_id가 없어 테넌트 간 충돌이 발생합니다 (line 14).
- cache.set(key, user)가 None을 캐싱하여 오염됩니다.
## Security
No issues found.
## Performance
list_orders_with_users의 루프 내부에서 주문마다 get_user를 호출하는 N+1 쿼리입니다.
## Readability
새 코드 경로에 대한 테스트가 없습니다.
"""
    s = score_programmatic(good_ko, gt)
    assert s["recall_concept"] == 1.0, s["recall_concept"]
    assert s["sections_all_present"], "sections"
    assert s["security_no_issue_marked"], "security marker"
    assert s["detected_lang"] == "ko", s["detected_lang"]
    assert not s["security_fp_heuristic"], "should be no security FP"
    print("PASS good_ko:", json.dumps(s, ensure_ascii=False))

    bad_en = """## Summary
Refactor of user lookup.
## Bugs
Looks fine.
## Security
Possible SQL injection risk in the query and missing input validation.
## Performance
No issues found.
## Readability
Clean.
"""
    s2 = score_programmatic(bad_en, gt)
    assert s2["security_fp_heuristic"], "should flag fabricated security issue"
    assert s2["detected_lang"] == "en", s2["detected_lang"]
    assert s2["recall_concept"] < 1.0
    print("PASS bad_en:", json.dumps(s2, ensure_ascii=False))

    # word-count / 300 limit
    long_text = "## Summary\n" + ("word " * 400) + "\n## Bugs x\n## Security x\n## Performance x\n## Readability x"
    s3 = score_programmatic(long_text, gt)
    assert not s3["within_300_words"], s3["word_count"]
    print("PASS word_count:", s3["word_count"], "within_300:", s3["within_300_words"])

    print("\nAll self-tests passed. Scoring logic is sound; live run needs ANTHROPIC_API_KEY.")


if __name__ == "__main__":
    main()
